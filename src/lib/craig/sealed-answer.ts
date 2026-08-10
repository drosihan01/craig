import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { JoinerField } from "./contract";

/**
 * The envelope a new starter's answer goes into, for every block that has one.
 *
 * **This was `personal-details.ts` and is now shared, which is the point.** The
 * identity block wrote AES-256-GCM, an AAD bound to the person and the step, and
 * a three-column envelope in `joiner_steps`. The payroll block wants exactly
 * that and nothing different — same key, same table, same threat model, the same
 * argument about a database dump being a column of hex. Writing it a second time
 * would have been a second place to get GCM wrong, and the two copies would have
 * been discovered to disagree on the day somebody rotated a key or fixed a bug
 * in one of them.
 *
 * So the crypto moved here and the *shapes* stayed where they belong.
 * `personal-details.ts` still owns what an address is, `payroll-details.ts` owns
 * what a BSB is, and neither owns a cipher. What passes between them and this
 * file is a plain JSON document in one direction and a plain JSON document back
 * in the other; this file has no opinion about what is inside one, which is what
 * keeps it small enough to be read in full by whoever adds the third block.
 *
 * **Why any of this exists**, restated because it is the load-bearing paragraph
 * and it now covers two blocks rather than one. A date of birth, a home address
 * and a mobile number held together with a legal name is the bundle somebody
 * opens a credit account with. A BSB, an account number and a tax file number is
 * the bundle somebody is paid with — and a TFN is regulated in its own right
 * (see `payroll-details.ts`, which says so at length). Two doors down, in
 * `connections`, an OAuth refresh token gets AES-256-GCM before it is allowed
 * near a row, on the argument that anybody who can read the table — a leaked
 * secret key, a misconfigured policy, an old backup — must find something
 * useless. Every word of that argument applies here and one word applies harder:
 * a stolen token can be revoked, and a stolen date of birth is a fact about a
 * person for the rest of their life.
 *
 * `joiner_steps.value` is plaintext and stays plaintext, because a middle name
 * is not this. The sealed columns are separate — `value_ciphertext`,
 * `value_iv`, `value_tag`, named after `token_ciphertext`/`token_iv`/
 * `token_tag` because they are the same idea in the same schema — and a step
 * that uses them leaves `value` null. Nothing that reads a `Joiner` therefore
 * carries this data around by accident: the admin's page, the joiner's own
 * Craig and anything anybody adds later all see an answered step with no answer
 * on it, and have to come here on purpose.
 *
 * **What this deliberately is not.** It is not protection from us. The server
 * holds the key and the admin can read every field — that is the product, and
 * with no payroll integration on this deployment it is the *only* way anybody
 * gets paid: somebody reads the account number off the screen and makes a bank
 * transfer. What it buys is that the database alone is not enough: a dump of
 * `joiner_steps` without `JOINER_PII_ENCRYPTION_KEY` is a column of hex.
 */

/* --- The key ---------------------------------------------------------------- */

/**
 * `JOINER_PII_ENCRYPTION_KEY`, 32 bytes, as 64 hex characters or as base64 that
 * decodes to 32. Generate one with:
 *
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Its own variable, and deliberately not `GOOGLE_TOKEN_ENCRYPTION_KEY` even
 * though the algorithm is identical. One key, one job — the same rule Slack and
 * Linear followed when they each took their own. It matters more here than
 * there: rotating a provider's key breaks connections that can be re-made by
 * pressing Connect, and rotating this one destroys answers that only exist
 * because somebody typed them once, and would have to be asked for again.
 *
 * **One key across both blocks, not one per block.** Tempting to give payroll
 * its own, and wrong: the two answers sit in the same three columns of the same
 * table, so a second key would not narrow what a database dump exposes by one
 * byte — it would only double the number of secrets a deployment can be
 * misconfigured with, and add a failure mode where half a person's onboarding
 * opens and half of it doesn't. Separation between the two blocks is done where
 * it actually buys something, in the AAD below.
 *
 * With it unset, nothing is collected. Not stored in the clear, not stored
 * half-way, not queued — the form is withheld from the new starter and the
 * route refuses. A deployment that quietly fell back to plaintext the day
 * somebody forgot a variable would be worse than one with no encryption at
 * all, because it would still be described as encrypted everywhere else.
 */
const KEY_VAR = "JOINER_PII_ENCRYPTION_KEY";
const KEY_BYTES = 32;
/** 96 bits, which is the size GCM is specified around. */
const IV_BYTES = 12;

type KeyResult = { ok: true; key: Buffer } | { ok: false; message: string };

function encryptionKey(): KeyResult {
  const raw = process.env[KEY_VAR]?.trim() ?? "";

  if (!raw) {
    return {
      ok: false,
      message: `Details can't be collected on this deployment yet: ${KEY_VAR} isn't set, and it is what the answers are encrypted with. Rather than write somebody's date of birth, home address or bank account down in the clear, nothing is stored at all. Generate 32 bytes — node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" — put it in the environment, and redeploy so the value is re-read.`,
    };
  }

  /* Hex first because that is what the command above prints, then base64,
     because somebody will paste `openssl rand -base64 32` and be entirely
     reasonable to expect it to work. Anything else fails the length check
     rather than being silently truncated into something weaker. */
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");

  if (key.length !== KEY_BYTES) {
    return {
      ok: false,
      message: `${KEY_VAR} has to be exactly 32 bytes — 64 hex characters, or base64 that decodes to 32 bytes. What's set decodes to ${key.length}, so it was rejected rather than padded into something weaker.`,
    };
  }

  return { ok: true, key };
}

/**
 * Whether this deployment can take a sealed answer at all.
 *
 * Asked by the screens *before* they draw a form, so a new starter never fills
 * in twelve boxes and then finds out the server won't take them. Cheap — it
 * reads an environment variable — so it costs nothing to ask on every render.
 */
export const canSealJoinerAnswers = (): boolean => encryptionKey().ok;

/** The sentence to show whoever can act, when it can't. Never shown to the
    joiner: it names an environment variable they have no access to. */
export function sealingProblem(): string | null {
  const key = encryptionKey();
  return key.ok ? null : key.message;
}

/* --- Sealing ---------------------------------------------------------------- */

/**
 * Which block's answer this is, and therefore which envelope it belongs in.
 *
 * Narrowed from `JoinerField` rather than declared as its own list of strings,
 * because the same strings are what `joiner_steps.field` holds — so a kind that
 * isn't a real field, or a field renamed on one side only, is a compile error
 * rather than a row that seals fine and can never be found again.
 *
 * `middle-name` and `date-of-birth` are deliberately absent. Their answers are
 * one short string in the plaintext column and always have been, and sweeping
 * them in here would encrypt a middle name in order to be tidy.
 */
export type SealedKind = Extract<
  JoinerField,
  "personal-details" | "payroll-details"
>;

/**
 * What the ciphertext is bound to, beyond being ciphertext.
 *
 * GCM's additional authenticated data isn't encrypted; it is mixed into the tag,
 * so decryption fails unless the same value is supplied again. Binding to the
 * joiner *and* the step means a sealed answer is that person's answer to that
 * question: a row copied between people, or between two personal-details steps
 * in one plan, simply fails to open rather than quietly reading as somebody
 * else's address. `accounts.ts` binds to the account email for the same reason
 * and says so at length.
 *
 * **The kind is in the string, and that is what makes one key safe for two
 * blocks.** A payroll envelope handed to the identity reader does not decrypt —
 * it fails the tag check and comes back as "can't open this", which is the
 * honest answer — rather than opening into a document whose keys all get
 * dropped and reading as an empty set of details. Domain separation, in the one
 * place it costs nothing.
 *
 * **`personal-details.v1` must keep producing exactly the byte string it did
 * before this file existed.** There are sealed rows on the deployment written
 * under it; a "tidier" prefix here is those answers gone, silently, with the
 * only symptom being an admin told the key must have been rotated. The version
 * is in the string so a future change to what is sealed can be told apart from
 * a corrupt row rather than being indistinguishable from one.
 */
const aad = (kind: SealedKind, joinerId: string, stepId: string) =>
  Buffer.from(`craig.joiner.${kind}.v1:${joinerId}:${stepId}`, "utf8");

export interface SealedValue {
  /** Hex. */
  ciphertext: string;
  /** Hex, 12 bytes. */
  iv: string;
  /** Hex, 16 bytes. GCM's authentication tag. */
  tag: string;
}

export type SealResult =
  | { ok: true; sealed: SealedValue }
  | { ok: false; message: string };

/**
 * The answer, sealed and ready to be written.
 *
 * JSON inside the envelope rather than a field-per-column, because the whole
 * point is that the database holds one opaque thing: twelve encrypted columns
 * would leak the shape of the answer (which optional fields were given, how
 * long the street is) through nothing but the presence and length of the
 * ciphertext, and would need twelve IVs to be safe about it.
 *
 * The document is taken as an object rather than as a named shape, which is the
 * seam that lets one cipher serve two blocks: what a valid answer looks like is
 * decided by the module that owns the shape, before it gets here, and re-judged
 * by that same module on the way out.
 */
export function sealAnswer(
  document: object,
  kind: SealedKind,
  joinerId: string,
  stepId: string,
): SealResult {
  const key = encryptionKey();
  if (!key.ok) return { ok: false, message: key.message };

  /* Fresh per seal, never derived from the person or a counter. An IV reused
     under one key takes GCM from "authenticated encryption" to "the plaintexts
     XOR to each other" — and answering twice to fix a typo is explicitly
     allowed here, so the same person sealing the same fields under the same key
     is the ordinary case rather than the exotic one. */
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key.key, iv);
  cipher.setAAD(aad(kind, joinerId, stepId));

  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(document), "utf8"),
    cipher.final(),
  ]);

  return {
    ok: true,
    sealed: {
      ciphertext: ciphertext.toString("hex"),
      iv: iv.toString("hex"),
      tag: cipher.getAuthTag().toString("hex"),
    },
  };
}

/**
 * The document back, or `null` for every way it can fail to come back.
 *
 * A rotated key, a hand-edited row, a record moved between people, an envelope
 * from the other block and a truncated write all land here, and none of them is
 * distinguishable from the others without saying something about the key — so
 * all of them are `null` and the caller turns that into one honest sentence.
 * Nothing is logged: the only interesting values in scope are the key and
 * somebody's bank account.
 */
function open(
  sealed: SealedValue,
  key: Buffer,
  kind: SealedKind,
  joinerId: string,
  stepId: string,
): Record<string, unknown> | null {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(sealed.iv, "hex"),
    );
    decipher.setAAD(aad(kind, joinerId, stepId));
    decipher.setAuthTag(Buffer.from(sealed.tag, "hex"));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, "hex")),
      decipher.final(),
    ]).toString("utf8");

    const parsed: unknown = JSON.parse(plaintext);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    /* `final()` throws when the tag doesn't check out, which is the case this
       whole design exists to catch. It is a refusal, not a crash. */
    return null;
  }
}

/* --- Reading ---------------------------------------------------------------- */

const db = () => supabaseAdmin();

/**
 * Every sealed answer of one kind this person has given, opened, keyed by step.
 *
 * One query for the whole plan rather than one per step: a workflow could
 * legitimately hold two of these blocks — details before signing and again
 * before the first pay run is a real thing people do — and a screen that asked
 * per step would do a round trip per row it renders.
 *
 * Filtered on `field` in the statement rather than by trying every envelope
 * against every AAD. That is one indexed predicate instead of a decrypt-and-fail
 * per row of the other kind, and — the part that actually matters — it means a
 * caller asking for identity answers cannot receive a payroll one even in the
 * hypothetical where the AADs collided.
 *
 * Steps that cannot be opened are simply absent from the map, which is the
 * behaviour every caller wants: a page renders "these can't be read" for a
 * missing entry, and that is true whether the key was rotated, the row was
 * edited or the answer was never given.
 *
 * **The caller is responsible for having established who is asking.** This
 * takes a joiner id, not a session, and it will open anybody's answers — the
 * ownership check belongs at the door (`requireJoiner`, or `belongsTo` on the
 * admin's page), where the question "whose is this" can actually be answered.
 * A function that took a session and re-derived the answer would be a second
 * copy of that rule, and the two would disagree the day one of them changed.
 */
export async function readSealedAnswers(
  joinerId: string,
  kind: SealedKind,
): Promise<Map<string, Record<string, unknown>>> {
  const opened = new Map<string, Record<string, unknown>>();

  const key = encryptionKey();
  if (!key.ok) return opened;

  const { data, error } = await db()
    .from("joiner_steps")
    .select("step_id, value_ciphertext, value_iv, value_tag")
    .eq("joiner_id", joinerId)
    .eq("field", kind)
    .not("value_ciphertext", "is", null);
  if (error) {
    throw new Error(`Reading sealed answers failed: ${error.message}`);
  }

  for (const row of data) {
    const { value_ciphertext: ciphertext, value_iv: iv, value_tag: tag } = row;
    if (!ciphertext || !iv || !tag) continue;

    const document = open(
      { ciphertext, iv, tag },
      key.key,
      kind,
      joinerId,
      row.step_id,
    );
    if (document) opened.set(row.step_id, document);
  }

  return opened;
}

/**
 * Record an answer, sealed.
 *
 * A sibling of `completeStep` rather than a flag on it, because the two write
 * different columns and one of them must never write the other's: a bug that
 * put a `PersonalDetails` through `completeStep` would `JSON.stringify` an
 * address into a plaintext column and every screen would carry on working.
 * Separate functions make that a compile error instead.
 *
 * `kind` is matched against the row's own `field`, so an envelope sealed for one
 * block cannot be written onto a step of the other even if a caller mixes them
 * up. It is in the statement rather than in a guard above it, so the refusal is
 * zero rows matched rather than a check somebody can forget to call.
 *
 * `value` is written null explicitly. In an UPDATE an absent column means
 * "leave it alone", and a step answered as plain text and then re-answered as
 * details would otherwise keep the old string sitting beside the new envelope,
 * where something would eventually print it.
 *
 * Answering twice overwrites, exactly as it does for a middle name, and for the
 * same reason: correcting your own account number is a thing people do, nothing
 * downstream has consumed it, and the only thing two racing submissions can
 * disagree about is which of this person's own answers survives.
 */
export async function completeSealedStep(
  joinerId: string,
  stepId: string,
  kind: SealedKind,
  sealed: SealedValue,
): Promise<boolean> {
  const { data, error } = await db()
    .from("joiner_steps")
    .update({
      value: null,
      value_ciphertext: sealed.ciphertext,
      value_iv: sealed.iv,
      value_tag: sealed.tag,
      completed_at: new Date().toISOString(),
    })
    .eq("joiner_id", joinerId)
    .eq("step_id", stepId)
    .eq("actor", "joiner")
    .eq("field", kind)
    .select("joiner_id");
  if (error) throw new Error(`Writing steps failed: ${error.message}`);

  return data.length > 0;
}

/* --- Shared plumbing the shape modules both want ---------------------------- */

/**
 * One submitted value as one harmless line.
 *
 * Control characters first, whitespace second — the same order and the same
 * reasoning as the step and invite routes: a newline is caught by either, but
 * the unprintable characters around it survive a naive trim, and these values
 * are shown back to two different people. `\p{Cc}` is that whole category by
 * name, which is easier to be sure of than a hand-typed range of things that
 * are invisible in a diff.
 */
export function oneLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Digits, once everything people put between them is taken out. */
export const digitsOf = (value: string) => value.replace(/\D/g, "");

/** Enough dots to read as "there is something here", never enough to count the
    characters of what is behind them. Fixed-width on purpose: a mask whose
    length tracked the value would leak the length of the value. */
export const DOTS = "••••••••";

/**
 * Who asked to see whose answer, written to the runtime log.
 *
 * Not an audit trail. An audit trail is a table with a retention policy and a
 * screen somebody can read, and this product has neither — saying otherwise in
 * a comment would be the kind of security theatre this codebase argues against
 * everywhere else. What it is, is the difference between "only the admin can
 * read these" being a claim and being something anybody can check afterwards
 * against the logs Vercel already keeps.
 *
 * The kind is logged because the two are not the same event to whoever reads
 * these back: a payroll reveal may have included a tax file number, and "which
 * of my staff opened one, and when" is the question the TFN Rule's security
 * obligation expects an employer to be able to answer.
 *
 * Ids, the kind, and the reader's address. **Never a value** — no last four
 * digits, no masked form, nothing derived — which would put the whole point of
 * this file into a log aggregator.
 */
export function noteReveal(
  kind: SealedKind,
  joinerId: string,
  stepId: string,
  by: string,
): void {
  console.info(
    `[${kind}] revealed joiner=${joinerId} step=${stepId} by=${by}`,
  );
}
