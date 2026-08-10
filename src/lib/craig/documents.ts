import "server-only";

/* Static rather than dynamic. Both parsers were behind `await import(...)` to
   keep them out of the bundle unless a file needed them — which read as
   prudent and cost an afternoon: inside the server bundle the dynamic
   specifiers did not resolve at runtime, the import threw, the `catch` below
   turned it into `null`, and every PDF and .docx indexed nothing while
   reporting success. This module is `server-only` and both packages are
   dependency-free, so there was nothing to win. */
import { extractText as pdfText } from "unpdf";
import { ZipReader, Uint8ArrayReader, TextWriter } from "@zip.js/zip.js";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/types";
import type { Joiner } from "@/lib/craig/contract";

/**
 * Documents, and the single place that decides who may read one.
 *
 * There has never been any document storage in this product. The composer takes
 * attachments and sends **filenames only**, and Craig's discovery keeps circling
 * documents because that is where the gaps are — a handbook two years out of
 * date, a policy nobody wrote down — and then has nowhere to put one. This is
 * the foundation under that, and the order it was built in is the point.
 *
 * ## The access rule came before the bucket, deliberately
 *
 * The moment a file is stored, "who can read this" is a live question and a
 * retroactive one. Getting it wrong is not a bug in a feature, it is a leak
 * between an employer and somebody they have just hired — the account holds
 * other joiners' progress, seat counts, billing, and a discovery transcript in
 * which somebody described their own company's problems candidly.
 *
 * So the rule is one column, `visibility`, and it defaults to `private`. A
 * document that arrives while nobody is thinking about this is invisible to new
 * starters. The unsafe state has to be chosen; it is never arrived at.
 *
 * ## The shape of the boundary
 *
 * This is the same argument `joiner-agent.ts` makes, in a different medium. The
 * joiner-facing functions here take a **`Joiner`**, never an account id and
 * never a document id on its own. A caller therefore cannot ask "give me
 * document X" and have this module work out whether that was allowed — it can
 * only ask "what may *this person* read", which is a question with one answer.
 *
 * Every read is filtered in the database by both `account_id` *and*
 * `visibility`, in the same query, rather than fetched and then checked in TS.
 * A filter that runs in the query cannot be skipped by an early return.
 *
 * ## Storage
 *
 * The bucket is private. Nothing here ever returns a public URL, because there
 * is no such thing as an unlisted URL for somebody's employment paperwork — a
 * link that works without a session is a link that works when forwarded. Reads
 * hand back a **short-lived signed URL** minted after the check above.
 *
 * The object path is always `{account_id}/{document_id}`, account first, so a
 * path prefix is an access boundary that can be reasoned about and no listing
 * can span two accounts. The uploaded filename never goes near it: a filename
 * is user input, and a storage path is a bad place to discover that.
 */

const BUCKET = "documents";

/** Long enough to click and download, short enough that a forwarded link is
    worthless by the time it arrives. */
const SIGNED_URL_TTL_SECONDS = 60;

type DocumentRow = Tables<"documents">;

export type DocumentVisibility = "private" | "shared";

export interface StoredDocument {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  visibility: DocumentVisibility;
  uploadedAt: string;
}

const db = () => supabaseAdmin();

function toDocument(row: DocumentRow): StoredDocument {
  return {
    id: row.id,
    name: row.name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    /* The column is text with a check constraint, so the database guarantees
       one of two values and this narrowing cannot be wrong. Anything else would
       mean the constraint was dropped, which is not a case to write code for. */
    visibility: row.visibility as DocumentVisibility,
    uploadedAt: new Date(row.uploaded_at).toISOString(),
  };
}

/** The account's row id, or null because there isn't one. */
async function accountIdFor(email: string): Promise<string | null> {
  const { data, error } = await db()
    .from("accounts")
    .select("id")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`Looking up the account failed: ${error.message}`);
  return data?.id ?? null;
}

/* --- The employer's view -------------------------------------------------- */

/**
 * Everything this account has uploaded, newest first.
 *
 * The admin sees all of it, private and shared alike, because they are the
 * person who decides which is which — a list that hid documents from the only
 * person who can change their visibility would be a list you cannot act on.
 */
export async function listDocuments(
  accountEmail: string,
): Promise<StoredDocument[]> {
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) return [];

  const { data, error } = await db()
    .from("documents")
    .select("*")
    .eq("account_id", accountId)
    .order("uploaded_at", { ascending: false });

  if (error) throw new Error(`Reading documents failed: ${error.message}`);
  return (data ?? []).map(toDocument);
}

/**
 * Store a file and record it.
 *
 * The row is written **after** the object lands, and that order is deliberate:
 * a row pointing at an object that does not exist is a broken download with no
 * way to tell it from a permissions problem, whereas an object with no row is
 * invisible and costs only storage. If the insert fails the object is removed
 * again, so the usual case leaves neither behind.
 *
 * `visibility` is not a parameter. Every upload starts private and is shared by
 * a separate, deliberate act — see `setVisibility`. An upload form with a
 * "share with new starters" checkbox on it is one mis-click away from the leak
 * this whole module is arranged to prevent, and the cost of the extra step is
 * one click by the only person who should be making that call.
 */
export async function uploadDocument(
  accountEmail: string,
  file: { name: string; contentType: string; bytes: ArrayBuffer },
): Promise<StoredDocument> {
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) throw new Error("No account to upload against.");

  const extracted = await extractText(file.contentType, file.bytes);

  const id = crypto.randomUUID();
  const storagePath = `${accountId}/${id}`;

  const { error: uploadError } = await db()
    .storage.from(BUCKET)
    .upload(storagePath, file.bytes, {
      contentType: file.contentType,
      /* Never overwrite. The path contains a fresh uuid, so a collision here
         would mean something has gone wrong that silently replacing somebody's
         file would hide. */
      upsert: false,
    });

  if (uploadError) throw new Error(`Storing the file failed: ${uploadError.message}`);

  const { data, error } = await db()
    .from("documents")
    .insert({
      account_id: accountId,
      storage_path: storagePath,
      name: file.name,
      content_type: file.contentType,
      size_bytes: file.bytes.byteLength,
      extracted_text: extracted,
    })
    .select("*")
    .single();

  if (error || !data) {
    /* Leave nothing behind. This is best-effort by necessity — if it also fails
       the object is orphaned, which is invisible and cheap, and the error the
       caller sees is still the one that actually stopped them. */
    await db().storage.from(BUCKET).remove([storagePath]);
    throw new Error(`Recording the document failed: ${error?.message}`);
  }

  return toDocument(data);
}

/**
 * Share a document with the account's new starters, or stop.
 *
 * Scoped by `account_id` in the same statement rather than checked first: an
 * id from a request body naming another account's document updates no rows
 * here, and reports the same "not found" as an id that never existed.
 */
export async function setVisibility(
  accountEmail: string,
  documentId: string,
  visibility: DocumentVisibility,
): Promise<StoredDocument | null> {
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) return null;

  const { data, error } = await db()
    .from("documents")
    .update({ visibility })
    .eq("id", documentId)
    .eq("account_id", accountId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`Updating the document failed: ${error.message}`);
  return data ? toDocument(data) : null;
}

/**
 * Remove a document, object and row.
 *
 * The row goes last. While it exists the document is listable and downloadable,
 * so deleting it first would leave a window where the Resources tab offers a
 * file that has already gone — the same asymmetry `uploadDocument` argues for,
 * pointing the other way.
 */
export async function deleteDocument(
  accountEmail: string,
  documentId: string,
): Promise<boolean> {
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) return false;

  const { data: row, error: readError } = await db()
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .eq("account_id", accountId)
    .maybeSingle();

  if (readError) throw new Error(`Reading the document failed: ${readError.message}`);
  if (!row) return false;

  const { error: removeError } = await db()
    .storage.from(BUCKET)
    .remove([row.storage_path]);
  if (removeError) throw new Error(`Removing the file failed: ${removeError.message}`);

  const { error } = await db()
    .from("documents")
    .delete()
    .eq("id", documentId)
    .eq("account_id", accountId);

  if (error) throw new Error(`Deleting the document failed: ${error.message}`);
  return true;
}

/**
 * The words in a file.
 *
 * Capped, because the column is searched rather than displayed and a 25 MB text
 * file would put 25 MB through `to_tsvector` on every write. Two hundred
 * thousand characters is a long handbook.
 */
const MAX_EXTRACTED_CHARS = 200_000;

/**
 * Get the text out of an upload, or say honestly that there isn't any.
 *
 * **PDFs used to come back `null`, and that was the single largest hole in
 * "ask Craig about the handbook".** Every company policy anybody actually
 * uploads is a PDF; the search vector carried only the *filename*, so a
 * handbook called "Handbook.pdf" answered questions about the word "handbook"
 * and nothing else. Craig then said he couldn't find anything, which is
 * indistinguishable — from the outside — from the document not being shared.
 *
 * `unpdf` does the parsing. Chosen over `pdf-parse`, which pulls in
 * `@napi-rs/canvas`, a native binary this would then be shipping into a
 * serverless function to extract text it never renders. `unpdf` has **zero
 * dependencies** and is built for exactly this runtime.
 *
 * Async now, where the old one was synchronous, and that is the only reason
 * this signature changed. Parsing a PDF is real work and pretending otherwise
 * would mean either blocking the request or lying about it.
 */
async function extractText(
  contentType: string,
  bytes: ArrayBuffer,
): Promise<string | null> {
  if (contentType === "text/plain" || contentType === "text/markdown") {
    try {
      /* `fatal` so that a file mislabelled as text fails here rather than
         producing a column full of replacement characters that match nothing
         and look, in the database, exactly like a successful extraction. */
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return text.slice(0, MAX_EXTRACTED_CHARS).trim() || null;
    } catch {
      return null;
    }
  }

  if (contentType === "application/pdf") return extractPdf(bytes);
  if (contentType === DOCX_TYPE) return extractDocx(bytes);

  /* Still honest about the rest, and the notable one is **legacy `.doc`**.
     A `.docx` is a zip of XML and yields to a zip reader; a `.doc` is a binary
     OLE compound file from the 1990s, and reading it means either a large
     dependency or a converter this runtime cannot host. It is accepted for
     *upload* — somebody's contract template really is a `.doc` sometimes, and
     refusing the file would be worse than not indexing it — but its words stay
     opaque, and the filename is what carries it into search. */
  return null;
}

const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * The text of a `.docx`.
 *
 * A `.docx` is a zip archive, and the words live in one entry inside it:
 * `word/document.xml`. So this opens the archive, reads that one file, and
 * strips the tags — no rendering, no styles, no images, because the consumer
 * is a Postgres search vector rather than a screen.
 *
 * `@zip.js/zip.js` over `mammoth`, which is the obvious choice and the wrong
 * one here. Mammoth converts a document to *HTML*, which is a much larger job
 * than this needs, and it arrives with ten transitive dependencies including
 * `bluebird` — a promise library predating native promises — all of it bundled
 * into a serverless function whose only question is "what words are in here".
 * `zip.js` has **zero dependencies**.
 *
 * The tag-stripping is deliberately crude and that is correct for the purpose.
 * `</w:p>` becoming a newline keeps paragraphs apart so that two unrelated
 * sentences do not fuse into one phrase that matches neither; beyond that,
 * formatting carries no meaning a search index can use.
 */
async function extractDocx(bytes: ArrayBuffer): Promise<string | null> {
  try {
    /* Copied for the same reason the PDF path copies — see `extractPdf`. A
       reader that takes ownership of this buffer would leave the upload below
       storing an empty file, and nothing would say so. */
    const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(bytes.slice(0))));
    const entries = await reader.getEntries();
    /* `Entry` is a union of a file and a directory, and only the file half
       carries `getData`. Narrowed on `directory` because that is the
       discriminant the library actually declares — testing for the method
       instead does not narrow a union, which is what the first attempt here
       got wrong. */
    const doc = entries.find(
      (e) => !e.directory && e.filename === "word/document.xml",
    );

    if (!doc || doc.directory) {
      await reader.close();
      return null;
    }

    const xml = await doc.getData(new TextWriter());
    await reader.close();

    const text = xml
      /* Paragraph and line breaks become real breaks before anything else is
         thrown away, because after the tags are gone there is nothing left to
         tell one paragraph from the next. */
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:br\s*\/>/g, "\n")
      .replace(/<[^>]+>/g, "")
      /* Word writes these, and a search index should see the characters a
         reader sees rather than the entities the format stores them as. */
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n");

    return text.slice(0, MAX_EXTRACTED_CHARS).trim() || null;
  } catch (cause) {
    console.error("[documents] couldn't read that .docx:", cause);
    return null;
  }
}

/**
 * A PDF's text, when it has any.
 *
 * Two failure modes, deliberately collapsed to the same `null`, because the
 * rest of the system already treats "nothing extracted" correctly — the
 * document is still stored, still listed, still findable by name.
 *
 * The first is a **scan**. A photographed handbook is pictures of words, and
 * there is no text layer to find. That is not an error and must not be
 * recorded as one; it needs OCR, which is a different and much larger decision
 * than adding a parser.
 *
 * The second is a PDF this cannot read at all — encrypted, truncated, or
 * malformed. Caught rather than thrown, because the alternative is that a
 * corrupt file makes the whole upload fail. Somebody who uploads a broken PDF
 * should get a stored document they can see is wrong, not an error page that
 * loses their file and tells them nothing about which one it was.
 */
async function extractPdf(bytes: ArrayBuffer): Promise<string | null> {
  try {
    /* A **copy**, and this is not defensive tidiness — it is the difference
       between storing somebody's handbook and storing nothing.
       
       pdf.js takes ownership of the buffer it is handed and *detaches* it.
       After the call the original `ArrayBuffer` is still a live object with a
       `byteLength` of 0, so nothing throws, nothing warns, and every read of
       it afterwards quietly sees an empty file. In this function's only caller
       those reads are the upload to storage and the `size_bytes` column —
       which means extracting the text destroyed the document it extracted it
       from, and did it without a single error anywhere.
       
       Caught by uploading a real PDF and finding a 0-byte object behind a row
       that had 96 characters of correctly parsed text next to it. A unit test
       of the parser would have passed. */
    const { text, totalPages } = await pdfText(
      new Uint8Array(bytes.slice(0)),
      { mergePages: true },
    );
    const trimmed = text.slice(0, MAX_EXTRACTED_CHARS).trim();

    if (!trimmed) {
      /* Parsed fine and found no words. Said out loud, because this is the
         one outcome that is invisible everywhere else: the upload succeeds,
         the document lists, and Craig simply never finds anything in it. The
         page count is here to separate the two causes — pages with no text
         layer is a scan and needs OCR; **zero pages is a parser that did not
         really run**, which is what a bundler resolving the wrong PDF.js
         build looks like from the outside. */
      console.warn(
        `[documents] no text in that PDF (${totalPages} page(s)) — a scan, or nothing parsed`,
      );
      return null;
    }

    return trimmed;
  } catch (cause) {
    /* Logged, not raised. The upload succeeds either way, so without this line
       a handbook that silently indexes nothing looks exactly like a handbook
       with nothing in it. */
    console.error("[documents] couldn't read that PDF:", cause);
    return null;
  }
}

/* --- The new starter's view ----------------------------------------------- */

/**
 * What this joiner may read. Shared documents from their employer, and nothing
 * else.
 *
 * Takes the `Joiner` rather than an account id, so there is no argument a
 * caller could pass that would widen it. `accountId` comes off their own record
 * — the one the signed cookie resolved to — and `visibility` is filtered in the
 * same query, so neither half of the rule can be forgotten independently.
 */
export async function listDocumentsForJoiner(
  joiner: Joiner,
): Promise<StoredDocument[]> {
  /* Resolved from their own record rather than taken as an argument. `Joiner`
     carries the employer's email and not its row id, so this is the lookup that
     turns one into the other — and it is done here, from the joiner, so that
     no caller is ever in a position to supply a different account. */
  const accountId = await accountIdFor(joiner.accountEmail);
  if (!accountId) return [];

  const { data, error } = await db()
    .from("documents")
    .select("*")
    .eq("account_id", accountId)
    .eq("visibility", "shared")
    .order("uploaded_at", { ascending: false });

  if (error) throw new Error(`Reading documents failed: ${error.message}`);
  return (data ?? []).map(toDocument);
}

/**
 * A link to one document this joiner may read, good for a minute.
 *
 * The same two filters as the listing, in one statement, because this is the
 * function an id from a URL reaches. A document belonging to another employer,
 * or one their employer has not shared, is `null` here — indistinguishable from
 * an id that does not exist, which is the only answer that does not confirm
 * somebody else's document is real.
 */
export async function signedUrlForJoiner(
  joiner: Joiner,
  documentId: string,
): Promise<{ name: string; url: string } | null> {
  const accountId = await accountIdFor(joiner.accountEmail);
  if (!accountId) return null;

  const { data: row, error } = await db()
    .from("documents")
    .select("name, storage_path")
    .eq("id", documentId)
    .eq("account_id", accountId)
    .eq("visibility", "shared")
    .maybeSingle();

  if (error) throw new Error(`Reading the document failed: ${error.message}`);
  if (!row) return null;

  const { data: signed, error: signError } = await db()
    .storage.from(BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed) return null;
  return { name: row.name, url: signed.signedUrl };
}

export interface ResourceHit {
  id: string;
  name: string;
  /** A couple of fragments around the match, already trimmed for a prompt. */
  snippet: string;
}

/**
 * Search what this joiner may read, and hand back the relevant paragraphs.
 *
 * The scoping lives in `search_shared_documents`, in SQL, where
 * `visibility = 'shared'` is part of the function body rather than an argument.
 * That is deliberate and it is the same argument as everywhere else here: a
 * search helper that *accepted* a visibility would be one caller away from a new
 * starter reading the private half of the filing cabinet. This wrapper's only
 * job is to turn a `Joiner` into the account id the function needs, so there is
 * no widening a caller could ask for.
 *
 * Empty on no match rather than falling back to "here is everything". Craig
 * saying "I can't find anything about that in what they shared" is the honest
 * answer, and a fallback that returns unrelated documents would have him quote
 * the wrong policy confidently.
 */
export async function searchResourcesForJoiner(
  joiner: Joiner,
  query: string,
): Promise<ResourceHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const accountId = await accountIdFor(joiner.accountEmail);
  if (!accountId) return [];

  const { data, error } = await db().rpc("search_shared_documents", {
    p_account: accountId,
    p_query: trimmed,
    p_limit: 4,
  });

  if (error) throw new Error(`Searching documents failed: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    snippet: row.snippet.replace(/\s+/g, " ").trim(),
  }));
}
