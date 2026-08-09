import "server-only";

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
