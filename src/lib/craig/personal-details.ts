import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  AU_STATES,
  PERSONAL_DETAIL_FIELDS,
  type DetailLine,
  type PersonalDetailField,
  type PersonalDetails,
} from "./contract";

/**
 * The only door to what a new starter typed into the personal details block.
 *
 * **Why any of this exists.** Date of birth, residential address and mobile
 * number, held together with a legal name, is not a form — it is the bundle
 * somebody opens a credit account with. Two doors down, in `connections`, an
 * OAuth refresh token gets AES-256-GCM before it is allowed near a row, on the
 * argument that anybody who can read the table (a leaked secret key, a
 * misconfigured policy, an old backup) must find something useless. Every word
 * of that argument applies here and one word applies harder: a stolen token can
 * be revoked, and a stolen date of birth is a fact about a person for the rest
 * of their life.
 *
 * `joiner_steps.value` is plaintext and stays plaintext, because a middle name
 * is not this. The sealed columns are separate — `value_ciphertext`,
 * `value_iv`, `value_tag`, named after `token_ciphertext`/`token_iv`/
 * `token_tag` because they are the same idea in the same schema — and a step
 * that uses them leaves `value` null. Nothing that reads a `Joiner` therefore
 * carries this data around by accident: the admin's page, the joiner's own
 * Craig and anything anybody adds later all see an answered step with no
 * answer on it, and have to come here on purpose.
 *
 * **Why now rather than later.** Retrofitting encryption onto data already
 * collected is the expensive version of this: it means a migration that reads
 * every plaintext row, a window where both shapes exist, and a decision about
 * what to tell the people whose details sat in the clear in the meantime.
 * There is no real customer data on this deployment yet. This is the cheapest
 * hour this will ever cost.
 *
 * **What this deliberately is not.** It is not protection from us. The server
 * holds the key and the admin can read every field — that is the product, and
 * Dzaky's stated reason for collecting an address at all is to pay somebody by
 * bank transfer. What it buys is that the database alone is not enough: a dump
 * of `joiner_steps` without `JOINER_PII_ENCRYPTION_KEY` is a column of hex.
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
      message: `Personal details can't be collected on this deployment yet: ${KEY_VAR} isn't set, and it is what the answers are encrypted with. Rather than write somebody's date of birth and home address down in the clear, nothing is stored at all. Generate 32 bytes — node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" — put it in the environment, and redeploy so the value is re-read.`,
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
 * Whether this deployment can collect personal details at all.
 *
 * Asked by the screens *before* they draw a form, so a new starter never fills
 * in twelve boxes and then finds out the server won't take them. Cheap — it
 * reads an environment variable — so it costs nothing to ask on every render.
 */
export const canSealPersonalDetails = (): boolean => encryptionKey().ok;

/** The sentence to show whoever can act, when it can't. Never shown to the
    joiner: it names an environment variable they have no access to. */
export function sealingProblem(): string | null {
  const key = encryptionKey();
  return key.ok ? null : key.message;
}

/* --- Sealing ---------------------------------------------------------------- */

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
 * Versioned in the string, so a future change to what is sealed can be told
 * apart from a corrupt row rather than being indistinguishable from one.
 */
const aad = (joinerId: string, stepId: string) =>
  Buffer.from(`craig.joiner.personal-details.v1:${joinerId}:${stepId}`, "utf8");

interface SealedValue {
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
 */
export function sealPersonalDetails(
  details: PersonalDetails,
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
  cipher.setAAD(aad(joinerId, stepId));

  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(details), "utf8"),
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
 * The answer back, or `null` for every way it can fail to come back.
 *
 * A rotated key, a hand-edited row, a record moved between people and a
 * truncated write all land here, and none of them is distinguishable from the
 * others without saying something about the key — so all of them are `null` and
 * the caller turns that into one honest sentence. Nothing is logged: the only
 * interesting values in scope are the key and somebody's address.
 */
function unseal(
  sealed: SealedValue,
  key: Buffer,
  joinerId: string,
  stepId: string,
): PersonalDetails | null {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(sealed.iv, "hex"),
    );
    decipher.setAAD(aad(joinerId, stepId));
    decipher.setAuthTag(Buffer.from(sealed.tag, "hex"));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, "hex")),
      decipher.final(),
    ]).toString("utf8");

    const parsed: unknown = JSON.parse(plaintext);
    if (!parsed || typeof parsed !== "object") return null;

    return fromStored(parsed as Record<string, unknown>);
  } catch {
    /* `final()` throws when the tag doesn't check out, which is the case this
       whole design exists to catch. It is a refusal, not a crash. */
    return null;
  }
}

/**
 * A document that came out of the envelope, reshaped rather than re-judged.
 *
 * Deliberately *not* `parsePersonalDetails`. That one is the border check on
 * something a browser sent, and it refuses a payload with a required field
 * missing — which is the right answer at the door and the wrong one here, where
 * a refusal means an answer somebody really did give becomes unreadable. This
 * document has already been through that check once, and the tag proves it is
 * the same document.
 *
 * What it still does is take only the keys the shape names, as strings, capped:
 * the row could have been written by an older version of this file, and a key
 * that no longer exists should be dropped rather than carried into a type that
 * swears every field is a string.
 */
function fromStored(raw: Record<string, unknown>): PersonalDetails {
  const details: Record<string, string> = {};

  for (const field of PERSONAL_DETAIL_FIELDS) {
    const value = oneLine(raw[field.key], field.max);
    if (value) details[field.key] = value;
  }

  return details as unknown as PersonalDetails;
}

/* --- Reading ---------------------------------------------------------------- */

const db = () => supabaseAdmin();

/**
 * Every sealed answer this person has given, opened, keyed by step.
 *
 * One query for the whole plan rather than one per step: a workflow could
 * legitimately hold two of these blocks — details before signing and again
 * before the first pay run is a real thing people do — and a screen that asked
 * per step would do a round trip per row it renders.
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
export async function readPersonalDetails(
  joinerId: string,
): Promise<Map<string, PersonalDetails>> {
  const opened = new Map<string, PersonalDetails>();

  const key = encryptionKey();
  if (!key.ok) return opened;

  const { data, error } = await db()
    .from("joiner_steps")
    .select("step_id, value_ciphertext, value_iv, value_tag")
    .eq("joiner_id", joinerId)
    .not("value_ciphertext", "is", null);
  if (error) {
    throw new Error(`Reading personal details failed: ${error.message}`);
  }

  for (const row of data) {
    const { value_ciphertext: ciphertext, value_iv: iv, value_tag: tag } = row;
    if (!ciphertext || !iv || !tag) continue;

    const details = unseal(
      { ciphertext, iv, tag },
      key.key,
      joinerId,
      row.step_id,
    );
    if (details) opened.set(row.step_id, details);
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
 * `value` is written null explicitly. In an UPDATE an absent column means
 * "leave it alone", and a step answered as plain text and then re-answered as
 * details would otherwise keep the old string sitting beside the new envelope,
 * where something would eventually print it.
 *
 * Answering twice overwrites, exactly as it does for a middle name, and for the
 * same reason: correcting your own address is a thing people do, nothing
 * downstream has consumed it, and the only thing two racing submissions can
 * disagree about is which of this person's own answers survives.
 */
export async function completeSealedStep(
  joinerId: string,
  stepId: string,
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
    .eq("field", "personal-details")
    .select("joiner_id");
  if (error) throw new Error(`Writing steps failed: ${error.message}`);

  return data.length > 0;
}

/* --- Validation ------------------------------------------------------------- */

/**
 * A date of birth, or why it isn't one.
 *
 * Built from the parts rather than `new Date(string)`, which reads a bare date
 * as UTC midnight and then compares it in the server's timezone — west of
 * Greenwich that turns today's date into tomorrow's and refuses somebody's
 * birthday for being in the future.
 *
 * The floor is a sanity check, not a policy about age. Nobody filling in an
 * onboarding form was born in 1723, so a year that far out is a slip of the
 * calendar rather than a person, and saying so is kinder than storing it.
 *
 * Lives here rather than in the step route because two fields now want it — the
 * standalone `date-of-birth` block and the one inside this form — and the two
 * must not be able to drift into disagreeing about what a birthday is.
 */
export function birthDateProblem(value: string): string | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) return "Pick that one from the calendar.";

  const [year, month, day] = parts.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return "That isn't a real date. Pick it from the calendar.";
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (date.getTime() > today.getTime()) return "That date is in the future.";
  if (year < 1900) return "Have a look at the year on that one.";

  return null;
}

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
function oneLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const STATE_CODES = new Set(AU_STATES.map((s) => s.id));

/** Digits, once everything people put between them is taken out. */
const digitsOf = (value: string) => value.replace(/\D/g, "");

export type ParseResult =
  | { ok: true; details: PersonalDetails }
  | { ok: false; problem: string };

/**
 * The payload, rebuilt from the request rather than cast from it.
 *
 * **Nothing that arrives is trusted.** This is a form posted by a browser we do
 * not control, on behalf of somebody holding a link that was emailed to them,
 * and the result gets sealed and shown to an admin as fact. So every field is
 * looked up by name from `PERSONAL_DETAIL_FIELDS`, coerced to a string, stripped
 * of control characters, trimmed, capped at the length the field declares, and
 * checked against its kind — and anything the request carried that isn't on that
 * list is dropped on the floor rather than sealed along for the ride. A `cast`
 * here would let a client decide the shape of a document we later hand to a
 * payroll system.
 *
 * **The emergency contact is all-or-nothing, and only when asked.** With the
 * option unticked, its three fields are ignored even if the request contains
 * them — a client cannot opt a company into holding a third party's phone
 * number. With it ticked, all three are required, because a name with no number
 * is not somebody you can call.
 *
 * Refusals are sentences for the person typing, and name the field, because
 * "that didn't work" on a twelve-box form is a puzzle rather than a message.
 */
export function parsePersonalDetails(
  input: unknown,
  { emergencyContact }: { emergencyContact: boolean },
): ParseResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, problem: "That didn't arrive in one piece. Try again." };
  }

  const raw = input as Record<string, unknown>;
  const details: Record<string, string> = {};

  for (const field of PERSONAL_DETAIL_FIELDS) {
    /* Skipped rather than validated when nobody asked for it. `continue` and
       not "validate but don't require": the value is not written at all, so an
       unticked emergency contact cannot be smuggled in by a hand-built
       request. */
    if (field.emergency && !emergencyContact) continue;

    const value = oneLine(raw[field.key], field.max);

    if (!value) {
      if (field.required) return { ok: false, problem: missing(field) };
      continue;
    }

    const problem = kindProblem(field, value);
    if (problem) return { ok: false, problem };

    details[field.key] = value;
  }

  /* The cast is safe in the one direction that matters: the loop above only
     ever writes keys from `PERSONAL_DETAIL_FIELDS`, whose `key` is typed as
     `keyof PersonalDetails`, and every required one has been proven non-empty
     or returned already. */
  return { ok: true, details: details as unknown as PersonalDetails };
}

/** What to say when a required box is empty, in the words the box uses. */
function missing(field: PersonalDetailField): string {
  const what = field.emergency
    ? `${field.label.toLowerCase()} for your emergency contact`
    : field.label.toLowerCase();
  return `I still need ${what}.`;
}

/** Whether a value is the kind of thing its field asked for. */
function kindProblem(
  field: PersonalDetailField,
  value: string,
): string | null {
  switch (field.kind) {
    case "date":
      return birthDateProblem(value);

    case "email":
      /* The same shape check the invite route applies to an address it is about
         to send to, and for a related reason: this one is where somebody gets
         told their contract is ready. No spaces, no angle brackets, one @, and
         a dot in the domain — everything past that is a job for actually
         sending to it, which nothing here does. */
      if (/[\s,;<>"\\]/.test(value) || !/^[^@]+@[^@]+\.[^@]{2,}$/.test(value)) {
        return "That doesn't look like an email address.";
      }
      return null;

    case "phone": {
      /* Loose on purpose. `+61 412 345 678`, `0412 345 678` and
         `(02) 9000 0000` are one number written three ways, and a person
         copying their own number out of their own phone should not be told it
         is wrong. What is refused is a string with no number in it. */
      if (/[^\d\s+()\-.]/.test(value)) {
        return `${field.label} should only have numbers in it.`;
      }
      const digits = digitsOf(value);
      if (digits.length < 8 || digits.length > 15) {
        return `That doesn't look like a full phone number.`;
      }
      return null;
    }

    case "state":
      /* From the select, so a value that isn't on the list came from something
         other than the form. Refused rather than stored, because a state code
         nothing recognises is a value the next system down will reject on a
         day nobody is watching. */
      return STATE_CODES.has(value)
        ? null
        : "Pick your state or territory from the list.";

    case "postcode":
      return /^\d{4}$/.test(value)
        ? null
        : "An Australian postcode is four digits.";

    case "text":
      return null;
  }
}

/* --- Showing --------------------------------------------------------------- */

/**
 * The answer as lines, in full.
 *
 * Only ever built behind a check on who is asking — the reveal route, and the
 * new starter's own screen looking at their own record. Optional fields that
 * were left empty are absent rather than blank, so a list of these is what was
 * actually given rather than a form with holes in it.
 */
export function describeDetails(details: PersonalDetails): DetailLine[] {
  return PERSONAL_DETAIL_FIELDS.flatMap((field) => {
    const value = details[field.key];
    if (!value) return [];
    return [
      {
        key: field.key,
        group: field.group,
        label: field.adminLabel,
        value: shown(field, value),
        masked: false,
      },
    ];
  });
}

/**
 * The same lines, with the parts nobody needs to read taken out.
 *
 * **Why mask at all, when the reader is allowed to see it.** They are allowed to
 * see it *when they ask*. The rest of the time this page is a status screen
 * somebody leaves open on a second monitor, shares in a call, screenshots into a
 * chat to ask a colleague about a start date, or scrolls past in an office. A
 * date of birth and a home address printed there are exposed to everybody in the
 * room for the whole of that, in exchange for nobody having read them.
 *
 * **Masked on the server, not with CSS.** The full values are not in the page
 * at all. Blurring them in the browser, or rendering them behind a
 * `display: none`, is not hiding — it is publishing the data and asking the
 * client politely not to draw it, and the first person to open the element
 * inspector, or the first extension that reads the DOM, has all of it. Reveal is
 * a fetch, so the values cross the wire when and only when somebody presses the
 * button.
 *
 * **What is masked and what isn't**, by what it would cost:
 *
 * - *Names* are shown. Whoever is reading this page invited this person by name
 *   and it is the heading of the page they are on; masking it protects nothing
 *   and turns the panel into a row of dots. The middle name is the one somebody
 *   came here for — it is what goes on the contract — so it stays readable too.
 * - *Date of birth* is masked outright. It is the single most reusable fact on
 *   the form and the one with no operational use on this screen.
 * - *Email and phone* keep their tail: the domain, and the last three digits.
 *   That is enough to answer "is this the address I already have for them"
 *   without being enough to contact them or to quote back at a call centre.
 * - *The street and postcode* are masked; the suburb and state are not. The
 *   admin gets to see the person is where they said they were, without the page
 *   holding a line you could post a letter to.
 * - *The emergency contact's name and number* are masked hardest, and their
 *   relationship is shown. That person is not a customer, not a user, and never
 *   agreed to be on anybody's screen — the most this page owes anyone about
 *   them is that they exist and who they are to the joiner.
 */
export function maskDetails(details: PersonalDetails): DetailLine[] {
  return describeDetails(details).map((line) => {
    const field = PERSONAL_DETAIL_FIELDS.find((f) => f.key === line.key);
    const raw = details[line.key] ?? "";
    const value = field ? masked(field, raw) : DOTS;
    return { ...line, value, masked: value !== line.value };
  });
}

/** Enough dots to read as "there is something here", never enough to count the
    characters of what is behind them. Fixed-width on purpose: a mask whose
    length tracked the value would leak the length of the value. */
const DOTS = "••••••••";

function masked(field: PersonalDetailField, value: string): string {
  switch (field.key) {
    case "legalFirstName":
    case "middleNames":
    case "legalSurname":
    case "preferredName":
    case "suburb":
    case "state":
    case "emergencyRelationship":
      return shown(field, value);

    case "personalEmail": {
      const at = value.lastIndexOf("@");
      return at > 0 ? `••••${value.slice(at)}` : DOTS;
    }

    case "mobile":
    case "emergencyPhone": {
      const digits = digitsOf(value);
      return digits.length > 3 ? `•••• ${digits.slice(-3)}` : DOTS;
    }

    default:
      /* Date of birth, street, postcode, the emergency contact's name — and
         anything added later, which is the point of defaulting this way. A new
         field arrives masked and somebody has to argue it out of the mask,
         rather than arriving in the clear because nobody remembered this
         function existed. */
      return value ? DOTS : "";
  }
}

/** A stored value as it should read: codes become labels, everything else is
    what they typed. Same rule the block library's `describeSetup` follows. */
function shown(field: PersonalDetailField, value: string): string {
  if (field.kind !== "state") return value;
  return AU_STATES.find((s) => s.id === value)?.label ?? value;
}

/**
 * Their own answer, back to them, in one line.
 *
 * For the new starter's plan, where every other finished step shows what they
 * sent. Twelve fields cannot go on that row, and the full set on their own
 * screen would be the same shoulder-surfing problem as the admin's page —
 * they are, after all, likely to be reading it in the office.
 *
 * So: their name as they gave it, which is the part they might want to check
 * was typed right, and a plain acknowledgement of the rest. Nothing here is a
 * fact they would not have been able to say from memory a minute earlier.
 */
export function summariseDetails(details: PersonalDetails): string {
  const name = [
    details.legalFirstName,
    details.middleNames,
    details.legalSurname,
  ]
    .filter(Boolean)
    .join(" ");

  const rest = details.emergencyName
    ? "your contact details, address and emergency contact"
    : "your contact details and address";

  return `${name} — with ${rest}`;
}

/**
 * Who asked to see whose details, written to the runtime log.
 *
 * Not an audit trail. An audit trail is a table with a retention policy and a
 * screen somebody can read, and this product has neither — saying otherwise in
 * a comment would be the kind of security theatre this codebase argues against
 * everywhere else. What it is, is the difference between "only the admin can
 * read these" being a claim and being something anybody can check afterwards
 * against the logs Vercel already keeps.
 *
 * Ids and addresses only. Nothing that was revealed is ever logged, which would
 * put the whole point of this file into a log aggregator.
 */
export function noteReveal(
  joinerId: string,
  stepId: string,
  by: string,
): void {
  console.info(
    `[personal-details] revealed joiner=${joinerId} step=${stepId} by=${by}`,
  );
}
