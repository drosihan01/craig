import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/types";
import { CONTRACT_CONSENT, type Joiner, type JoinerStep } from "./contract";
import { signingKey } from "./session";
import {
  extractPage,
  readSource,
  sha256,
  stampSignedCopy,
  type CertificateFacts,
} from "./contract-pdf";

/**
 * Signing a contract in Craig, and the evidence that it happened.
 *
 * ## What this is actually for
 *
 * Capturing a signature is the trivial ten per cent. A name in a nice font and a
 * `completed_at` would have taken an afternoon and would be worth nothing on the
 * one day any of this matters — the day somebody says *"I never signed that"*.
 * What a signing product sells is the answer to that sentence: who they were,
 * what exact bytes were put in front of them, that all of it was, that they said
 * out loud they were content to sign electronically, when, and from where. This
 * module is that answer. The stamped PDF is a rendering of it.
 *
 * So the ordering throughout is: **record first, artefact second**. The row in
 * `contract_signings` exists from the moment somebody opens the document, is
 * added to as the pages are served, and is closed exactly once. The PDF is
 * produced from it at the end. Nothing is ever derived the other way round.
 *
 * ## Which obligations this design discharges
 *
 * Australia's Electronic Transactions Act 1999 s10 asks four things of an
 * electronic signature, and employment contracts are not among the excluded
 * classes. Section 127 electronic execution for companies has been permanent
 * since 2022. Taking them one at a time, because each maps onto something real
 * in here rather than onto a claim:
 *
 * 1. **A method that identifies the person and indicates their intention.**
 *    Identification is the joiner session, and it is the single strongest part
 *    of this design. Their credential is an HMAC-signed, per-person token
 *    (`joiner-session.ts`) which this server minted and delivered to exactly one
 *    verified address, and which nothing in any request can name or substitute:
 *    the signer is whoever the cookie resolves to, server-side, full stop. That
 *    is a materially better anchor than the ordinary DIY flow, where a link is
 *    emailed to an address typed into a form by whoever was signing. Intention
 *    is the consent tick and the typed or drawn mark, both recorded as separate
 *    facts.
 * 2. **As reliable as appropriate for the purpose.** This is a proportionality
 *    test, not a brand test — the section says so in terms. The purpose here is
 *    an ordinary employment contract between an employer who invited somebody
 *    and the person who accepted; against that, a per-person server-issued
 *    credential, a hash of the delivered bytes, a server-side record of every
 *    page served, an explicit consent and an append-once row clear it
 *    comfortably. They would not clear the bar for a land transfer, and nothing
 *    in this product should ever be pointed at one.
 * 3. **The recipient consents to the method.** `CONTRACT_CONSENT` is shown
 *    before the control unlocks, ticked separately from signing, and written to
 *    the row verbatim from the server's own copy — never from the request.
 * 4. **Retention of the document in the form it was in.** The source bytes stay
 *    in storage untouched, their SHA-256 is on the record and printed on the
 *    certificate, and the signed copy carries every original page unaltered.
 *
 * ## What it does not do, said plainly
 *
 * There is **no trusted timestamp**. Nothing here is countersigned by an AATL or
 * eIDAS certificate authority, and the PDF carries no PAdES signature — so the
 * seals below prove the record has not been altered by anybody *without this
 * server's key*, and prove nothing at all against whoever holds it. That is a
 * real gap and it is the honest one: it is not required for an ordinary
 * Australian employment contract, and closing it is a commercial relationship
 * with a CA rather than a piece of code. If this product ever signs something
 * where the operator is a plausible adversary, that is the day it is needed.
 *
 * There is also no countersignature, no identity verification beyond controlling
 * the invited mailbox, and no independent witness. Each of those is a real thing
 * some contracts want and none of them is what an employment agreement between
 * two willing parties turns on.
 *
 * **None of the above is legal advice and none of it appears in the product.**
 * The screens say what happened; this comment is where the reasoning lives.
 *
 * ## Why nothing here is encrypted
 *
 * Every other sensitive thing this product stores is sealed with AES-256-GCM
 * (`sealed-answer.ts`) on one argument: anybody who can read the table — a
 * leaked key, an old backup — must find something useless. That argument was
 * examined for this and deliberately rejected, in both halves.
 *
 * **The audit row must stay readable**, because its entire value is being
 * checkable. Evidence whose legibility depends on an environment variable that
 * can be rotated is evidence that quietly stops existing; `sealed-answer.ts`
 * says as much about its own key, where the consequence is an answer that has to
 * be asked for again. Here the consequence would be a signature nobody can
 * account for. And confidentiality is not the threat: an IP address, a user
 * agent, a hash and a timestamp are not an identity bundle, and the one genuinely
 * personal field — the address the invitation went to — is already sitting in
 * plaintext one table away in `joiners.email`. Encrypting a copy of it here
 * would be theatre.
 *
 * **The signed PDF must stay a PDF.** It is the artefact somebody hands a
 * lawyer, and a file that only Craig can open is not that. It lives in a private
 * bucket, reachable only through a check in this module and then a sixty-second
 * signed URL, which is the same posture `documents.ts` argues for and is the
 * right one: the boundary is the check, not the cipher.
 *
 * What the threat model actually wants here is **integrity, not
 * confidentiality**, so that is what is built. Two HMACs under `SESSION_SECRET`,
 * domain-separated, over a canonical form of the record — see `sealRecord`.
 * Reaching for GCM would have encrypted evidence against the wrong adversary and
 * left tampering just as undetectable as before.
 */

type SigningRow = Tables<"contract_signings">;
type DocumentRow = Tables<"documents">;

const db = () => supabaseAdmin();

/** The signed copies live apart from Resources. See `signedPath`. */
const BUCKET = "signed-contracts";

/** The same minute `documents.ts` argues for, for the same reason. */
const SIGNED_URL_TTL_SECONDS = 60;

/** A drawn signature is a few strokes. Anything larger is not a signature. */
const MAX_DRAWN_BYTES = 512 * 1024;

/** Longer than any legal name, shorter than a paragraph. */
const MAX_TYPED_NAME = 120;

/**
 * Where a signed copy lives: `{account_id}/{signing_id}.pdf`.
 *
 * Its own bucket rather than a prefix inside `documents`, and that is a boundary
 * rather than tidiness. Everything in the `documents` bucket has a row in
 * `documents`, and every such row can be flipped to `shared` from a switch on
 * the Resources screen — which for a signed employment contract would mean one
 * click publishing somebody's salary to every new starter at the company. There
 * is no path from that switch to this bucket, and there never will be, because
 * nothing in `documents.ts` names it.
 *
 * The account id leads for the reason it leads there: a path prefix is then an
 * access boundary you can reason about, and no listing can span two accounts.
 * The signing id follows, not the joiner's — one file per signing, and a signing
 * is already unique per person per step.
 */
const signedPath = (accountId: string, signingId: string) =>
  `${accountId}/${signingId}.pdf`;

/* --- Resolving what somebody may sign --------------------------------------- */

/**
 * The contract step on this person's own plan, or nothing.
 *
 * Takes the `Joiner` and looks the step up in *their* snapshot, which is the
 * same rule `/api/showcase/step` states at length: a step id from somebody
 * else's workflow finds nothing here, so there is no reachable request that
 * names another person's contract. The field test is what stops a middle-name
 * step being driven through the signing routes.
 */
export function contractStepOf(
  joiner: Joiner,
  stepId: string,
): JoinerStep | null {
  const step = joiner.steps.find((s) => s.id === stepId);
  if (!step || step.actor !== "joiner" || step.field !== "contract") return null;
  return step;
}

/**
 * Why a contract step cannot be signed, when it cannot.
 *
 * Each of these is an ordinary thing to happen to a real account rather than an
 * error, which is why they are a union and not a throw. Every one of them has to
 * become a different sentence: two of them are the employer's to fix, one is a
 * different employer's problem entirely, and none of them is the new starter's
 * fault or within their power.
 */
export type ContractProblem =
  /** The block was published with no template picked, or with a stale id. */
  | "no-document"
  /** They attached a .docx, a scan of a photo, something not a PDF. */
  | "not-a-pdf"
  /** Password-protected. Real, and fixable by re-uploading an open copy. */
  | "encrypted"
  /** Corrupt, truncated, or not really a PDF whatever the type says. */
  | "unreadable"
  /** The bytes in storage no longer hash to what this signing was opened on. */
  | "changed";

export interface ContractDocument {
  document: DocumentRow;
  bytes: ArrayBuffer;
}

/**
 * The template behind a contract step, fetched and proven to be theirs.
 *
 * **The boundary is written into the statement rather than checked afterwards**,
 * which is the rule `documents.ts` sets and this follows: `account_id` is
 * matched against the account on the joiner's *own* row, in the same query as
 * the document id. An id naming another employer's document selects nothing,
 * and reads identically to an id that was never real.
 *
 * Note what this deliberately does **not** require: `visibility = 'shared'`. A
 * contract is not a resource — sharing it would put somebody's employment terms
 * in every new starter's "Things to read" — so the authority to read it comes
 * from somewhere else entirely: *their own step names it*. That is a narrower
 * grant than sharing, not a wider one, and it is why this query lives here and
 * not in `documents.ts`, whose every joiner-facing function is built around the
 * shared rule. It reads through the same admin client and repeats the same
 * account scoping; what it does not do is borrow a function whose contract is
 * "things the employer published".
 */
async function loadTemplate(
  joiner: Joiner,
  step: JoinerStep,
): Promise<{ ok: true; contract: ContractDocument } | { ok: false; problem: ContractProblem }> {
  if (!step.contractDocumentId) return { ok: false, problem: "no-document" };

  /* The account id comes off the joiner's own row rather than being passed in,
     so no caller is in a position to supply a different one. Selected as a
     sub-read rather than joined because `Joiner` carries the employer's email
     and not its row id — the same conversion `documents.ts` does, for the same
     reason. */
  const { data: account, error: accountError } = await db()
    .from("joiners")
    .select("account_id")
    .eq("id", joiner.id)
    .maybeSingle();
  if (accountError) {
    throw new Error(`Looking up the account failed: ${accountError.message}`);
  }
  if (!account) return { ok: false, problem: "no-document" };

  const { data: document, error } = await db()
    .from("documents")
    .select("*")
    .eq("id", step.contractDocumentId)
    .eq("account_id", account.account_id)
    .maybeSingle();

  /* A malformed id reaches Postgres as a bad uuid and is a loud error rather
     than a miss. It is a miss: `contract_document_id` is copied off a block's
     config without being parsed, deliberately (see `stepsFromBlocks`), so
     "not a uuid" and "no such document" are the same fact from here. */
  if (error && error.code !== "22P02") {
    throw new Error(`Reading the contract failed: ${error.message}`);
  }
  if (!document) return { ok: false, problem: "no-document" };

  if (document.content_type !== "application/pdf") {
    return { ok: false, problem: "not-a-pdf" };
  }

  const { data: file, error: downloadError } = await db()
    .storage.from("documents")
    .download(document.storage_path);
  if (downloadError || !file) return { ok: false, problem: "unreadable" };

  return { ok: true, contract: { document, bytes: await file.arrayBuffer() } };
}

/* --- Opening it ------------------------------------------------------------- */

/** Where a request came from, as much of it as is worth keeping. */
export interface RequestOrigin {
  ip: string | null;
  userAgent: string | null;
}

/**
 * The address and the device, off the headers, for the record.
 *
 * The first hop of `x-forwarded-for` is the client as far as the nearest proxy
 * is concerned, and behind nothing at all it is whatever the caller typed —
 * `rate-limit.ts` says the same about the same header. That weakness is worth
 * naming precisely because this value ends up on a certificate: it is
 * corroborating detail, not identification. **Identification is the session**,
 * which is unforgeable without this server's key. An IP that turns out to be a
 * VPN endpoint costs the evidence nothing; an IP treated as proof of who
 * somebody was would be a lie printed in a nice font.
 *
 * The user agent is capped rather than trusted: it is an arbitrary header, it is
 * printed on a page, and nothing downstream should be able to be handed four
 * kilobytes of it.
 */
export function originOf(headers: Headers): RequestOrigin {
  const forwarded = headers.get("x-forwarded-for");
  return {
    ip: forwarded?.split(",")[0]?.trim().slice(0, 64) || null,
    userAgent: headers.get("user-agent")?.slice(0, 400) || null,
  };
}

export type OpenResult =
  | { ok: true; signing: SigningRow; document: ContractDocument }
  | { ok: false; problem: ContractProblem };

/**
 * Somebody opening their contract, and the moment the record starts.
 *
 * The first open is what creates the signing row, and it does the expensive work
 * exactly once: download, hash, count the pages. Everything after that reads the
 * row. That ordering is why `opened_at` means what it says — it is the first
 * time this server put the document in front of this person, not the first time
 * a page happened to be requested.
 *
 * **Re-opening never restarts anything.** `opened_at`, `open_ip` and
 * `open_user_agent` are written once, on insert, and a second visit is an
 * ordinary read. Somebody who reads their contract on Tuesday and signs it on
 * Thursday has one story on their record, which is the true one.
 *
 * **The hash is re-checked on every open, not only the first.** If the bytes
 * behind the template ever stop matching what this signing was opened on, that
 * is the single most alarming thing that can happen to this feature and it must
 * stop the signing rather than be papered over. It should be impossible — the
 * uploader never overwrites and the path holds a uuid — which is exactly why it
 * is worth checking: an impossible condition that is checked is a fact, and one
 * that is assumed is a hope.
 */
export async function openContract(
  joiner: Joiner,
  step: JoinerStep,
  origin: RequestOrigin,
): Promise<OpenResult> {
  const template = await loadTemplate(joiner, step);
  if (!template.ok) return { ok: false, problem: template.problem };

  const { document, bytes } = template.contract;

  /* Before anything parses it. The evidence is a hash of what came out of
     storage, not of what a parser made of it. */
  const digest = await sha256(bytes);

  const existing = await signingFor(joiner.id, step.id);
  if (existing) {
    if (existing.document_sha256 !== digest) {
      console.error(
        `[contract] the template behind signing ${existing.id} no longer matches its recorded hash`,
      );
      return { ok: false, problem: "changed" };
    }
    return { ok: true, signing: existing, document: template.contract };
  }

  const source = await readSource(bytes);
  if (!source.ok) {
    return {
      ok: false,
      problem: source.reason === "empty" ? "unreadable" : source.reason,
    };
  }

  const { data: account, error: accountError } = await db()
    .from("joiners")
    .select("account_id")
    .eq("id", joiner.id)
    .maybeSingle();
  if (accountError || !account) {
    throw new Error(
      `Looking up the account failed: ${accountError?.message ?? "no row"}`,
    );
  }

  const { data, error } = await db()
    .from("contract_signings")
    .insert({
      account_id: account.account_id,
      joiner_id: joiner.id,
      step_id: step.id,
      document_id: document.id,
      /* Copied, not joined. The point of this row is to survive the template
         being deleted out of Resources, which is a button an admin has. */
      document_name: document.name,
      document_sha256: digest,
      document_bytes: bytes.byteLength,
      page_count: source.source.pageCount,
      signer_name: joiner.name,
      /* The address the invitation went to, off their own record. This is the
         identity anchor the whole design rests on, so it is written down at the
         moment of opening rather than looked up later — an employer can change
         the address on a seat, and the evidence has to say where the credential
         that signed this was actually delivered. */
      signer_email: joiner.email,
      open_ip: origin.ip,
      open_user_agent: origin.userAgent,
    })
    .select("*")
    .single();

  /* 23505 is the unique index on (joiner_id, step_id): two tabs opened the
     contract at the same moment. Not a fault — read back whichever row won. */
  if (error?.code === "23505") {
    const raced = await signingFor(joiner.id, step.id);
    if (raced) return { ok: true, signing: raced, document: template.contract };
  }
  if (error || !data) {
    throw new Error(`Starting the signing failed: ${error?.message}`);
  }

  return { ok: true, signing: data, document: template.contract };
}

/** This person's signing record for this step, if one has been started. */
export async function signingFor(
  joinerId: string,
  stepId: string,
): Promise<SigningRow | null> {
  const { data, error } = await db()
    .from("contract_signings")
    .select("*")
    .eq("joiner_id", joinerId)
    .eq("step_id", stepId)
    .maybeSingle();
  if (error) throw new Error(`Reading the signing failed: ${error.message}`);
  return data;
}

/* --- Serving it, one page at a time ----------------------------------------- */

export type PageResult =
  | { ok: true; bytes: Uint8Array; page: number; pageCount: number }
  | { ok: false; problem: ContractProblem | "no-such-page" };

/**
 * One page of the contract, and the record that it was served.
 *
 * **The recording is the point, and it happens on the way out rather than on the
 * way in.** `pages_seen` is set to the highest page number this server has
 * actually extracted and handed over — so "they reached the end" is something
 * this side observed doing, not something the browser reported. The signing
 * route reads it and refuses while it is short of `page_count`, which makes the
 * disabled button on the screen a courtesy rather than the control.
 *
 * It is a high-water mark rather than a set, and that is a deliberate weakening.
 * A set would be able to say "page 4 was never fetched"; a high-water mark can
 * be reached by jumping. It is chosen anyway because the screen only offers
 * forward and back, because a set is a column that grows without bound on a
 * document nobody bounded, and because the claim being made is the modest one:
 * every page of this document was served to this session before it was signed.
 * Overclaiming here — "the signer read every page" — would be the kind of
 * sentence that gets a certificate laughed at.
 *
 * Not rate limited, deliberately, unlike every other route in this product that
 * costs something. The shared limiter allows twelve calls a minute and a
 * fifteen-page contract needs fifteen; a limiter that stops somebody reaching
 * the end of their own employment agreement does not protect anything, it
 * breaks the feature. What bounds this instead is that only a signed-in joiner
 * with a contract step can reach it, and the work is bounded by a document their
 * own employer uploaded.
 */
export async function contractPage(
  joiner: Joiner,
  step: JoinerStep,
  page: number,
  origin: RequestOrigin,
): Promise<PageResult> {
  const opened = await openContract(joiner, step, origin);
  if (!opened.ok) return { ok: false, problem: opened.problem };

  const { signing, document } = opened;
  if (!Number.isInteger(page) || page < 1 || page > signing.page_count) {
    return { ok: false, problem: "no-such-page" };
  }

  const bytes = await extractPage(document.bytes, page);
  if (!bytes) return { ok: false, problem: "unreadable" };

  /* After the extraction succeeded, so the record never claims a page that was
     never produced. Only ever forwards, and never once signed — the row is
     immutable then and the database would refuse anyway, which is the belt this
     `is null` is the braces for. */
  if (page > signing.pages_seen && !signing.signed_at) {
    const { error } = await db()
      .from("contract_signings")
      .update({
        pages_seen: page,
        read_at: page >= signing.page_count ? new Date().toISOString() : null,
      })
      .eq("id", signing.id)
      .is("signed_at", null)
      /* Two page requests in flight at once must not let the lower one win.
         The predicate is the concurrency control: whichever update runs second
         only lands if it is still raising the mark. */
      .lt("pages_seen", page);
    if (error) {
      /* Logged rather than raised. Failing to record a delivery is a gap in the
         evidence, not a reason to refuse somebody the page — and refusing would
         make the gap permanent by preventing the retry that closes it. */
      console.error(`[contract] couldn't record page ${page}:`, error.message);
    }
  }

  return { ok: true, bytes, page, pageCount: signing.page_count };
}

/* --- Signing it ------------------------------------------------------------- */

export interface SignatureInput {
  /** What they typed, if they typed. */
  typedName: string;
  /** A `data:image/png;base64,…` of what they drew, if they drew. */
  drawnSignature: string | null;
  /** That they ticked the box. The wording is never theirs to supply. */
  consented: boolean;
}

export type SignResult =
  | { ok: true; signing: SigningRow }
  | {
      ok: false;
      problem:
        | ContractProblem
        | "already-signed"
        | "unread"
        | "no-mark"
        | "no-consent"
        /**
         * The signature was good and the artefact could not be stored.
         *
         * Its own outcome rather than being folded into "already signed", and
         * the distinction is not pedantry. `upsert: false` on a deterministic
         * path means a *duplicate* is genuinely somebody signing twice — but
         * every other storage failure lands in the same branch, and telling
         * a person "you have already signed this" when they have not is the
         * one lie this feature cannot afford. They are told to try again,
         * which is true and which works.
         */
        | "storage";
    };

/**
 * The act itself.
 *
 * Ordered so that every way it can fail leaves something honest behind:
 *
 * 1. **Refuse anything that is not a complete, permitted signing** — already
 *    signed, not read to the end, no mark, no consent. Cheap checks first, and
 *    all of them before a byte is written.
 * 2. **Seal the record**, from values this server holds. The seal is computed
 *    before the PDF because it is printed inside it.
 * 3. **Produce the artefact**, then hash it.
 * 4. **Put the file in the bucket with `upsert: false`.** This is the
 *    serialisation point for two requests racing: the path is deterministic, so
 *    exactly one upload can win, and the loser stops here having written
 *    nothing.
 * 5. **Close the row**, conditional on it still being open. If that update
 *    matches nothing the file is removed again, so a bucket object never
 *    outlives the row that explains it.
 * 6. **Complete the step**, last, because it is the only thing either screen
 *    reads to say "signed" and it must never be true before the evidence is.
 *
 * The one thing this never does is overwrite. A second signing of the same step
 * is refused here, refused by the unique index underneath, and refused by the
 * trigger that rejects any update to a signed row. Three refusals is not
 * paranoia: this is the single write in the product where "it silently replaced
 * the old one" would be indistinguishable from fraud.
 */
export async function signContract(
  joiner: Joiner,
  step: JoinerStep,
  input: SignatureInput,
  origin: RequestOrigin,
): Promise<SignResult> {
  const opened = await openContract(joiner, step, origin);
  if (!opened.ok) return { ok: false, problem: opened.problem };

  const { signing, document } = opened;
  if (signing.signed_at) return { ok: false, problem: "already-signed" };

  /* The server's own record of how much of it was served, not a claim from the
     browser. This is the check the whole page-at-a-time delivery exists for. */
  if (signing.pages_seen < signing.page_count) {
    return { ok: false, problem: "unread" };
  }

  if (!input.consented) return { ok: false, problem: "no-consent" };

  const typedName = oneLine(input.typedName, MAX_TYPED_NAME);
  const drawn = decodeDrawnSignature(input.drawnSignature);
  if (!typedName && !drawn) return { ok: false, problem: "no-mark" };

  const signedAt = new Date().toISOString();

  const facts: Omit<CertificateFacts, "recordSeal"> = {
    signingId: signing.id,
    documentName: signing.document_name,
    documentSha256: signing.document_sha256,
    documentBytes: signing.document_bytes,
    pageCount: signing.page_count,
    signerName: signing.signer_name,
    signerEmail: signing.signer_email,
    company: joiner.company,
    openedAt: new Date(signing.opened_at).toISOString(),
    readAt: signing.read_at ? new Date(signing.read_at).toISOString() : null,
    signedAt,
    pagesSeen: signing.pages_seen,
    openIp: signing.open_ip,
    openUserAgent: signing.open_user_agent,
    signIp: origin.ip,
    signUserAgent: origin.userAgent,
    /* The server's copy of the wording, never the request's. A browser that
       could supply its own consent text could record somebody agreeing to
       something they never read. */
    consentText: CONTRACT_CONSENT,
    /* The same instant as the signature. They are one act — the tick is not
       submitted separately — and two timestamps a millisecond apart would imply
       a sequence that did not happen. */
    consentedAt: signedAt,
    typedName: typedName || null,
    drawnSignature: drawn,
  };

  const recordSeal = await sealRecord(facts);

  const signed = await stampSignedCopy(document.bytes, { ...facts, recordSeal });
  const signedSha256 = await sha256(signed);
  const artefactSeal = await sealArtefact(recordSeal, signedSha256, signed.byteLength);

  const path = signedPath(signing.account_id, signing.id);
  const { error: uploadError } = await db()
    .storage.from(BUCKET)
    .upload(path, signed, {
      contentType: "application/pdf",
      /* Never overwrite. The path is deterministic per signing, so a collision
         here means a second attempt at a contract that already has an artefact
         — which is the one thing this feature must not do quietly. */
      upsert: false,
    });
  if (uploadError) {
    console.error(`[contract] storing the signed copy failed:`, uploadError.message);
    /* A collision on this path can only be a second signing of the same
       record, because the path is `{account}/{signing}.pdf` and a signing is
       unique per person per step. Anything else is storage having a bad day,
       and the two get different sentences — see `SignResult`. Matched on the
       message because supabase-js gives a `StorageError` with no code on the
       upload path; the status is what carries it. */
    const duplicate =
      "statusCode" in uploadError && uploadError.statusCode === "409";
    return { ok: false, problem: duplicate ? "already-signed" : "storage" };
  }

  const { data, error } = await db()
    .from("contract_signings")
    .update({
      consent_text: facts.consentText,
      consented_at: facts.consentedAt,
      typed_name: facts.typedName,
      drew_signature: Boolean(drawn),
      sign_ip: origin.ip,
      sign_user_agent: origin.userAgent,
      signed_at: signedAt,
      signed_storage_path: path,
      signed_sha256: signedSha256,
      signed_bytes: signed.byteLength,
      record_seal: recordSeal,
      artefact_seal: artefactSeal,
    })
    .eq("id", signing.id)
    /* The row must still be open. Below this line the database's own trigger
       would refuse anyway; this is what turns that refusal into zero rows and a
       clean rollback rather than an exception. */
    .is("signed_at", null)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    /* Leave nothing behind. Best-effort by necessity — if this also fails the
       object is orphaned in a private bucket nothing lists, which is invisible
       and cheap next to a signed file with no record explaining it. */
    await db().storage.from(BUCKET).remove([path]);
    console.error(
      `[contract] closing signing ${signing.id} failed:`,
      error?.message ?? "already signed",
    );
    return { ok: false, problem: "already-signed" };
  }

  await completeContractStep(joiner.id, step.id, signedAt);

  return { ok: true, signing: data };
}

/**
 * The step, ticked, once and only because the evidence exists.
 *
 * A sibling of `completeStep` rather than a flag on it, for the reason
 * `completeSealedStep` is one: the two write different things and one of them
 * must never stand in for the other. `completeStep` refuses `field: 'contract'`
 * in its own statement, so there is no path from a typed value to a signed
 * contract — this is the only door, and it is behind everything above.
 *
 * `value` is left null. A contract step's answer is a signing record and a file;
 * putting anything in the plaintext column would be a summary that some screen
 * would eventually print as though it were the answer.
 */
async function completeContractStep(
  joinerId: string,
  stepId: string,
  at: string,
): Promise<void> {
  const { error } = await db()
    .from("joiner_steps")
    .update({ completed_at: at })
    .eq("joiner_id", joinerId)
    .eq("step_id", stepId)
    .eq("actor", "joiner")
    .eq("field", "contract");
  if (error) throw new Error(`Writing steps failed: ${error.message}`);
}

/* --- The seals -------------------------------------------------------------- */

/**
 * The canonical form of a record, as bytes to be signed.
 *
 * Every value is JSON-encoded before it is joined, which is the whole of the
 * care this needs: without it, a user agent containing a newline could shift a
 * field boundary and produce a record that seals identically to a different one.
 * Keys are written in a fixed order rather than sorted at runtime, so the
 * canonical form is something you can read off this function rather than
 * something you have to run to discover.
 *
 * The prefix is domain separation, the same idea as `sealed-answer.ts`'s AAD and
 * `google-watch.ts`'s channel tokens: `SESSION_SECRET` also signs joiner
 * sessions and OAuth state, and a signature that could be replayed between two
 * of those is a signature that means less than it looks like it does. The `.v1`
 * is there so a future change to what is sealed is distinguishable from a
 * corrupt seal instead of indistinguishable from one.
 */
function canonicalRecord(facts: Omit<CertificateFacts, "recordSeal">): string {
  const fields: [string, unknown][] = [
    ["signingId", facts.signingId],
    ["documentName", facts.documentName],
    ["documentSha256", facts.documentSha256],
    ["documentBytes", facts.documentBytes],
    ["pageCount", facts.pageCount],
    ["signerName", facts.signerName],
    ["signerEmail", facts.signerEmail],
    ["company", facts.company],
    ["openedAt", facts.openedAt],
    ["readAt", facts.readAt],
    ["signedAt", facts.signedAt],
    ["pagesSeen", facts.pagesSeen],
    ["openIp", facts.openIp],
    ["openUserAgent", facts.openUserAgent],
    ["signIp", facts.signIp],
    ["signUserAgent", facts.signUserAgent],
    ["consentText", facts.consentText],
    ["consentedAt", facts.consentedAt],
    ["typedName", facts.typedName],
    ["drewSignature", Boolean(facts.drawnSignature)],
  ];

  return `craig.contract-signing.v1\n${fields
    .map(([key, value]) => `${key}=${JSON.stringify(value ?? null)}`)
    .join("\n")}`;
}

async function hmac(message: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(),
    new TextEncoder().encode(message),
  );
  return [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * The seal printed on the certificate.
 *
 * It covers the audit record and nothing about the finished file, and that
 * boundary is forced rather than chosen: this value is *inside* the PDF, so it
 * cannot cover a hash of the PDF without covering itself. What it buys is that
 * the paper copy and the database row have to agree — change a timestamp in the
 * table and it no longer matches the certificate somebody printed; change the
 * certificate and it no longer matches the row.
 */
const sealRecord = (facts: Omit<CertificateFacts, "recordSeal">) =>
  hmac(canonicalRecord(facts));

/**
 * The seal over the artefact, which the certificate cannot carry.
 *
 * Chained onto the record seal deliberately: it covers both, so the two cannot
 * be pulled apart. Without it there is a real hole — somebody with database
 * access and no key could swap the stored `signed_sha256` to match a PDF they
 * had rewritten, and the record seal would still verify because it never knew
 * about the file. With it, the pair only checks out together.
 *
 * It is stored and never printed, for the same reason the record seal is
 * printed: this one is a statement about the bytes of the page it would have to
 * be printed on.
 */
const sealArtefact = (recordSeal: string, sha256Hex: string, bytes: number) =>
  hmac(`craig.contract-artefact.v1\n${recordSeal}\n${sha256Hex}\n${bytes}`);

/**
 * Whether a stored signing still says what it said when it was written.
 *
 * The reason all of the above is worth anything: the check is *runnable*. The
 * admin's screen calls it, so "this record has not been altered" is a thing
 * somebody sees rather than a claim in a comment. A row that fails this is not
 * necessarily fraud — a key rotation produces exactly the same answer — and the
 * screen says so rather than accusing anybody.
 */
export async function verifySeals(row: SigningRow): Promise<{
  record: boolean;
  artefact: boolean;
}> {
  if (!row.signed_at || !row.record_seal || !row.artefact_seal) {
    return { record: false, artefact: false };
  }

  const expectedRecord = await sealRecord({
    signingId: row.id,
    documentName: row.document_name,
    documentSha256: row.document_sha256,
    documentBytes: row.document_bytes,
    pageCount: row.page_count,
    signerName: row.signer_name,
    signerEmail: row.signer_email,
    company: await companyFor(row.joiner_id),
    openedAt: new Date(row.opened_at).toISOString(),
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
    signedAt: new Date(row.signed_at).toISOString(),
    pagesSeen: row.pages_seen,
    openIp: row.open_ip,
    openUserAgent: row.open_user_agent,
    signIp: row.sign_ip,
    signUserAgent: row.sign_user_agent,
    consentText: row.consent_text ?? "",
    consentedAt: row.consented_at
      ? new Date(row.consented_at).toISOString()
      : "",
    typedName: row.typed_name,
    /* Only whether there was one is sealed, and only that is reconstructable:
       the drawn image itself lives inside the PDF, whose hash the artefact seal
       covers. */
    drawnSignature: row.drew_signature ? new Uint8Array() : null,
  });

  const record = expectedRecord === row.record_seal;

  const expectedArtefact = await sealArtefact(
    row.record_seal,
    row.signed_sha256 ?? "",
    row.signed_bytes ?? 0,
  );

  return { record, artefact: expectedArtefact === row.artefact_seal };
}

/**
 * The company name as it was on the record.
 *
 * A wart, and named as one. `company` is sealed because it is printed on the
 * certificate, and it is not a column on `contract_signings` — it is copied onto
 * the joiner at invitation time. So verifying a seal has to go and fetch it,
 * and a company that renamed itself between signing and verifying will fail the
 * check for a reason that is not tampering. The fix is a `company` column on
 * this table; it is not here because adding one after rows exist means either a
 * backfill that rewrites sealed rows — which the trigger correctly refuses — or
 * a nullable column that means two things. Recorded rather than hidden.
 */
async function companyFor(joinerId: string): Promise<string> {
  const { data } = await db()
    .from("joiners")
    .select("company")
    .eq("id", joinerId)
    .maybeSingle();
  return data?.company ?? "";
}

/* --- Reading it back -------------------------------------------------------- */

/**
 * A link to the signed copy, good for a minute, for the person who signed it.
 *
 * Scoped by joiner id in the statement rather than checked after the fetch, the
 * same shape as everything else here. Somebody else's signing is `null`, which
 * reads identically to one that does not exist.
 */
export async function signedCopyForJoiner(
  joiner: Joiner,
  stepId: string,
): Promise<{ name: string; url: string } | null> {
  const { data, error } = await db()
    .from("contract_signings")
    .select("document_name, signed_storage_path")
    .eq("joiner_id", joiner.id)
    .eq("step_id", stepId)
    .not("signed_storage_path", "is", null)
    .maybeSingle();
  if (error) throw new Error(`Reading the signing failed: ${error.message}`);
  if (!data?.signed_storage_path) return null;

  return signedUrl(data.signed_storage_path, data.document_name);
}

/**
 * The same, for the employer.
 *
 * Keyed on the signing id *and* the account id in one statement, so an id from
 * another account's contract selects nothing. The account id is resolved from
 * the session's email here rather than taken as an argument, for the reason
 * every other function in this file resolves its own scope.
 */
export async function signedCopyForAccount(
  accountEmail: string,
  signingId: string,
): Promise<{ name: string; url: string } | null> {
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) return null;

  const { data, error } = await db()
    .from("contract_signings")
    .select("document_name, signed_storage_path")
    .eq("id", signingId)
    .eq("account_id", accountId)
    .not("signed_storage_path", "is", null)
    .maybeSingle();
  if (error && error.code !== "22P02") {
    throw new Error(`Reading the signing failed: ${error.message}`);
  }
  if (!data?.signed_storage_path) return null;

  return signedUrl(data.signed_storage_path, data.document_name);
}

async function signedUrl(path: string, name: string) {
  const { data, error } = await db()
    .storage.from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, {
      /* Named for the person downloading it rather than left as a uuid. The
         signed URL is opaque; this is what their Downloads folder says. */
      download: `${name.replace(/\.pdf$/i, "")} — signed.pdf`,
    });
  if (error || !data) return null;
  return { name, url: data.signedUrl };
}

/** Every signing on one person's onboarding, for their employer's screen. */
export async function signingsForJoiner(
  joinerId: string,
): Promise<SigningRow[]> {
  const { data, error } = await db()
    .from("contract_signings")
    .select("*")
    .eq("joiner_id", joinerId)
    .order("opened_at", { ascending: true });
  if (error) throw new Error(`Reading signings failed: ${error.message}`);
  return data ?? [];
}

async function accountIdFor(email: string): Promise<string | null> {
  const { data, error } = await db()
    .from("accounts")
    .select("id")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`Looking up the account failed: ${error.message}`);
  return data?.id ?? null;
}

/* --- Input ------------------------------------------------------------------ */

/**
 * A typed name as one harmless line.
 *
 * The same rule and the same order as `sealed-answer.ts`: control characters
 * first, whitespace second, because a naive trim leaves the unprintable ones
 * that surround a newline — and this string is drawn onto a PDF and shown to
 * both people.
 */
function oneLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * What they drew, as PNG bytes, or nothing.
 *
 * A data URL from a canvas, and every part of it is checked rather than
 * assumed. The prefix has to be exactly a base64 PNG — a browser can be asked
 * for `image/svg+xml`, and an SVG is a document that can carry script and
 * external references, which is not a thing to embed in a contract. The length
 * is capped before the decode rather than after, so a megabyte of base64 is
 * refused rather than expanded.
 *
 * Anything malformed is `null` rather than an error, and the caller then falls
 * back to whether a name was typed. A signature is refused for being absent, not
 * for being unparseable — and the difference matters, because a browser quirk
 * that produced a slightly wrong data URL would otherwise present to somebody as
 * "this website will not let me sign my contract".
 */
function decodeDrawnSignature(value: string | null): Uint8Array | null {
  if (!value) return null;

  const prefix = "data:image/png;base64,";
  if (!value.startsWith(prefix)) return null;

  const base64 = value.slice(prefix.length);
  /* Base64 is four characters per three bytes, so this bounds the decode. */
  if (base64.length > (MAX_DRAWN_BYTES * 4) / 3) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;

  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

    /* The PNG magic number. A `data:image/png` prefix is a claim by whoever
       built the string; these eight bytes are the file saying so itself. */
    const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (magic.some((byte, i) => bytes[i] !== byte)) return null;

    return bytes;
  } catch {
    return null;
  }
}

/* --- What a screen needs to know, cheaply ----------------------------------- */

export type ContractStatus =
  | { state: "signed"; documentName: string; signedAt: string }
  | { state: "ready"; documentName: string }
  | { state: "unavailable"; problem: ContractProblem };

/**
 * Where a contract step has got to, without opening the document.
 *
 * The plan on `/me` and the admin's person page both need one line about a
 * contract step, and neither needs the bytes — so this answers from rows only.
 * That matters: `openContract` downloads and hashes a PDF, and calling it to
 * render a list item would put a storage read on every render of somebody's
 * onboarding, for a sentence.
 *
 * The cost is that "unavailable" here is narrower than the real set of
 * problems. This can tell that no document is attached or that it is not a PDF;
 * it cannot tell that a PDF is encrypted or corrupt, because finding that out
 * *is* the expensive part. Those surface when somebody opens it, on the screen
 * built to explain them, which is the right place for them anyway.
 */
export async function contractStatus(
  joiner: Joiner,
  step: JoinerStep,
): Promise<ContractStatus> {
  const signing = await signingFor(joiner.id, step.id);
  if (signing?.signed_at) {
    return {
      state: "signed",
      documentName: signing.document_name,
      signedAt: new Date(signing.signed_at).toISOString(),
    };
  }

  if (!step.contractDocumentId) {
    return { state: "unavailable", problem: "no-document" };
  }

  const { data: account } = await db()
    .from("joiners")
    .select("account_id")
    .eq("id", joiner.id)
    .maybeSingle();
  if (!account) return { state: "unavailable", problem: "no-document" };

  const { data: document, error } = await db()
    .from("documents")
    .select("name, content_type")
    .eq("id", step.contractDocumentId)
    .eq("account_id", account.account_id)
    .maybeSingle();
  if (error && error.code !== "22P02") {
    throw new Error(`Reading the contract failed: ${error.message}`);
  }
  if (!document) return { state: "unavailable", problem: "no-document" };
  if (document.content_type !== "application/pdf") {
    return { state: "unavailable", problem: "not-a-pdf" };
  }

  return { state: "ready", documentName: document.name };
}
