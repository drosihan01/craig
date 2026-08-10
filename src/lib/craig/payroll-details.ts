import "server-only";

import {
  PAYROLL_DETAIL_FIELDS,
  TAX_FREE_THRESHOLD_OPTIONS,
  type PayrollDetailField,
  type PayrollDetailLine,
  type PayrollDetails,
  type PayrollExtra,
} from "./contract";
/* The same envelope the identity block uses, and deliberately not a second copy
   of it. One AES-256-GCM implementation, one key, one place to get it wrong —
   the header on `sealed-answer.ts` makes that argument in full. This file owns
   what a BSB is; it owns no cipher. */
import {
  DOTS,
  digitsOf,
  oneLine,
  readSealedAnswers,
  sealAnswer,
  type SealResult,
} from "./sealed-answer";

/**
 * The only door to what a new starter typed into the payroll details block.
 *
 * **What this block is for, stated plainly, because the scope is unusual.**
 * There is no payroll provider. Craig does not forward any of this to Deel,
 * Gusto, Xero or anything else, and — Dzaky's decision — will not. What happens
 * to a bank account collected here is that an administrator opens the person's
 * page, presses Reveal, reads the number off the screen, and makes a transfer in
 * their own banking app. That is the entire downstream.
 *
 * Everything below follows from that sentence, so it is worth being precise
 * about what it rules in and what it rules out.
 *
 * It rules out "don't persist it". A value a human has to read next Tuesday has
 * to exist on Tuesday, so the option of taking the details, passing them
 * straight to an API and forgetting them — which is how a payroll integration
 * would have worked, and would have been the safer design — is not available.
 * Sealing is therefore not a precaution on this block. It is the only thing
 * between an account number and a plaintext column somebody will one day dump.
 *
 * It rules out anything that implies forwarding. The preset used to carry a
 * "Payroll system" select offering Deel, Remote, Gusto and "Spreadsheet, for
 * now", which was a choice between four labels and one behaviour. It is gone,
 * and the library says why where an admin picking the block will read it.
 *
 * And it is why the tax file number is the hardest question on this file rather
 * than the fourth field down. See the section below, which is the part of this
 * module worth reading before changing anything.
 *
 * ---------------------------------------------------------------------------
 *
 * ## The tax file number, and whether Craig should hold one at all
 *
 * **A TFN is not ordinary personal information and must not be treated as
 * another string.** In Australia it is regulated twice over:
 *
 * - The **Privacy (Tax File Number) Rule 2015**, made under s 17 of the Privacy
 *   Act 1988, is legally binding, and breaching it is an interference with
 *   privacy under the Act. It binds any *TFN recipient*, which is defined by
 *   possession rather than by role — an entity that holds TFN information is
 *   one whether it obtained it lawfully or not. **That includes this
 *   deployment**, not only the employer using it.
 * - The **Taxation Administration Act 1953** makes unauthorised requesting,
 *   recording, use or disclosure of a TFN an *offence*, carrying fines and
 *   potential imprisonment. This is the material difference from every other
 *   field in this product: getting an address wrong is a privacy problem, and
 *   getting a TFN wrong is a criminal one.
 *
 * The obligations the Rule imposes, and where each is discharged here:
 *
 * 1. **Collect only for a purpose authorised by taxation, personal assistance
 *    or superannuation law.** For an employer this is PAYG withholding, and it
 *    is genuine — but see the recommendation below, because Craig does not do
 *    PAYG withholding.
 * 2. **Tell the individual, at collection**, which law authorises it, what it is
 *    for, that declining is *not an offence*, and what happens if they decline.
 *    `TFN_NOTICE` in the contract carries all four, and the field is
 *    consequently **optional even when asked** — a form that will not submit
 *    without a TFN has made declining an offence in practice, whatever the
 *    small print says.
 * 3. **Never use it as an identifier**, or to match records across systems.
 *    Nothing here keys on it, indexes it, or compares two of them: it is one
 *    optional string inside a sealed blob, and the row is keyed by a UUID.
 * 4. **Take reasonable steps to secure it**, and restrict access to those who
 *    need it. Sealed with AES-256-GCM under a key the database does not hold;
 *    readable only by the account that owns the joiner; masked to fixed-width
 *    dots on every screen with no reveal at all in any list; never partially
 *    shown, because the last three digits of a nine-digit number with a
 *    checksum on it is a meaningful fraction of it.
 * 5. **Never log it.** `noteReveal` records ids, the block, and the reader's
 *    email — never a value, not even a masked one.
 * 6. **Destroy it when no longer required by law.** This is the obligation this
 *    product discharges worst, and it should be said out loud rather than
 *    glossed: there is no retention policy, no expiry, and no job that reaps
 *    old joiners. The only destruction path is an administrator removing the
 *    person, which deletes the row and the envelope with it. That is a real
 *    path and it is not a policy.
 *
 * **The recommendation: Craig should not hold a TFN.**
 *
 * The purpose test in (1) is the one that does not survive contact with what
 * this product actually is. A TFN is authorised for working out how much tax to
 * withhold. Craig computes no withholding, files nothing with the ATO, and — by
 * Dzaky's decision — sends nothing to a payroll system that would. The stated
 * downstream is a bank transfer, and a bank transfer needs a BSB and an account
 * number and has never needed a TFN. So the number would be collected here, sit
 * here, and then be typed *again* into whatever actually runs the pay run.
 *
 * There is a second, more practical argument. The ATO's own channel for this is
 * the **TFN declaration**, or employee tax details captured through STP-enabled
 * payroll software; the employer has to obtain it that way regardless. Asking
 * for it in Craig therefore does not replace that step — it duplicates it, which
 * is precisely the sin the identity block called out when it took `legal-name`
 * off this very preset.
 *
 * So: it is behind a tick the admin has to find and turn on, it is off in every
 * default workflow, and removing it altogether is one line — drop
 * `TAX_FILE_NUMBER_EXTRA` from the preset's options in `library.ts` and the
 * field falls out of the form, the validator and both screens, because all four
 * read `PAYROLL_DETAIL_FIELDS`. It is built rather than omitted because it was
 * asked for and because the decision is Dzaky's; the argument is written here so
 * that taking it is cheap and keeping it is deliberate.
 *
 * **If it stays, the honest next piece of work is retention**: a stored "why we
 * hold this", and something that deletes it when that reason expires. Obligation
 * (6) is not satisfied by an administrator remembering.
 */

/** Which envelope these answers travel in. Its own constant so the string that
    is both the `field` column and half the AAD is typed once. */
const KIND = "payroll-details" as const;

/**
 * Which of the optional groups this particular person was asked for.
 *
 * Read off their *snapshot*, never off the request — the same rule
 * `askEmergencyContact` follows, and it matters more here. A client that could
 * set these would be a client that could opt a company into holding a regulated
 * identifier nobody decided to collect, which is exactly the unauthorised
 * collection the TFN Rule is about.
 */
export interface PayrollAsked {
  superFund: boolean;
  taxFileNumber: boolean;
}

/** Whether a field is one this person was actually shown. */
const wasAsked = (field: PayrollDetailField, asked: PayrollAsked): boolean => {
  if (!field.extra) return true;
  return field.extra === "super-fund" ? asked.superFund : asked.taxFileNumber;
};

/* --- Sealing ---------------------------------------------------------------- */

/**
 * The answer, sealed and ready to be written.
 *
 * A named wrapper rather than a bare `sealAnswer` call at each site, because
 * this is the one place the shape and the kind are bound together — and binding
 * them once is what stops an identity document being sealed under the payroll
 * AAD by a caller who passed the wrong string.
 */
export function sealPayrollDetails(
  details: PayrollDetails,
  joinerId: string,
  stepId: string,
): SealResult {
  return sealAnswer(details, KIND, joinerId, stepId);
}

/**
 * A document that came out of the envelope, reshaped rather than re-judged.
 *
 * Deliberately *not* `parsePayrollDetails`. That one is the border check on
 * something a browser sent and refuses a payload with a required field missing —
 * the right answer at the door and the wrong one here, where a refusal means an
 * answer somebody really did give becomes unreadable. This document has already
 * been through that check once, and the tag proves it is the same document.
 *
 * It takes only the keys the shape names, as strings, capped: the row could have
 * been written by an older version of this file, and a key that no longer exists
 * should be dropped rather than carried into a type that swears every field is a
 * string.
 */
function fromStored(raw: Record<string, unknown>): PayrollDetails {
  const details: Record<string, string> = {};

  for (const field of PAYROLL_DETAIL_FIELDS) {
    const value = oneLine(raw[field.key], field.max);
    if (value) details[field.key] = value;
  }

  return details as unknown as PayrollDetails;
}

/* --- Reading ---------------------------------------------------------------- */

/**
 * Every sealed payroll answer this person has given, opened, keyed by step.
 *
 * The query, the key and the failure modes are `readSealedAnswers`'; what is
 * added here is `fromStored`. Steps that cannot be opened are simply absent from
 * the map, which is what every caller wants: a page renders "these can't be
 * read" for a missing entry, and that is true whether the key was rotated, the
 * row was edited, or the answer was never given.
 *
 * **The caller is responsible for having established who is asking.** This takes
 * a joiner id, not a session, and it will open anybody's answers — the ownership
 * check belongs at the door, where the question "whose is this" can actually be
 * answered.
 */
export async function readPayrollDetails(
  joinerId: string,
): Promise<Map<string, PayrollDetails>> {
  const opened = new Map<string, PayrollDetails>();

  for (const [stepId, document] of await readSealedAnswers(joinerId, KIND)) {
    opened.set(stepId, fromStored(document));
  }

  return opened;
}

/* --- Validation ------------------------------------------------------------- */

const THRESHOLD_IDS = new Set(TAX_FREE_THRESHOLD_OPTIONS.map((o) => o.id));

/**
 * A BSB as six digits, or null when it isn't one.
 *
 * Normalised to `123-456` on the way in, for the reason `AU_STATES` stores a
 * code rather than a label: `123456`, `123-456` and `123 456` are one fact typed
 * three ways, and whoever eventually reads this off a screen to type into a
 * banking app should not have to work out whether the hyphen is part of it.
 *
 * The first two digits are the bank and the rest is the branch, and there is a
 * published register of valid combinations. This deliberately does not check
 * against it: the register changes with every branch merger, it is not something
 * this deployment can fetch, and a stale copy would refuse a real account — which
 * is a much worse failure than accepting a mistyped one, because the mistyped one
 * is caught by the bank and the refused one is caught by nobody.
 */
function normalBsb(value: string): string | null {
  const digits = digitsOf(value);
  if (digits.length !== 6) return null;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

/**
 * Whether a tax file number is structurally a tax file number.
 *
 * The ATO's TFN carries a **weighted modulus-11 check digit**: multiply the nine
 * digits by 1, 4, 3, 7, 5, 8, 6, 9, 10 in order, sum, and a valid number's total
 * is divisible by 11. That is worth applying for the same reason the step route
 * checks a date of birth is a date: a transposed pair of digits here is not
 * discovered by this product, or by the next one, but by the person being taxed
 * at the top marginal rate three weeks later.
 *
 * **Only nine-digit numbers are checksummed.** Older TFNs are eight digits and
 * the weighting that applies to them is not something this file is going to
 * guess at — and refusing a legitimate number somebody has held for thirty years
 * would be a far worse failure than accepting an unverified one. Eight digits
 * passes on length alone, and says so here rather than pretending to more.
 *
 * The value is never logged, never echoed back in an error message, and never
 * used to look anything up. The refusal below says the number looks wrong; it
 * does not repeat the number.
 */
const TFN_WEIGHTS = [1, 4, 3, 7, 5, 8, 6, 9, 10];

function tfnProblem(value: string): string | null {
  const digits = digitsOf(value);

  if (digits.length !== 8 && digits.length !== 9) {
    return "A tax file number is eight or nine digits. Have another look at that one — or leave it blank, which you're allowed to do.";
  }

  if (digits.length === 9) {
    const sum = TFN_WEIGHTS.reduce(
      (total, weight, i) => total + Number(digits[i]) * weight,
      0,
    );
    if (sum % 11 !== 0) {
      /* Almost always a transposition. Said as "check it" rather than "that is
         invalid", because the person is reading their own ATO letter and the
         useful instruction is to look again. */
      return "That tax file number doesn't check out — it's usually two digits swapped. Have another look, or leave it blank.";
    }
  }

  return null;
}

export type PayrollParseResult =
  | { ok: true; details: PayrollDetails }
  | { ok: false; problem: string };

/**
 * The payload, rebuilt from the request rather than cast from it.
 *
 * **Nothing that arrives is trusted.** This is a form posted by a browser we do
 * not control, on behalf of somebody holding a link that was emailed to them,
 * and the result is sealed and then read by an administrator who will type it
 * into a banking app. So every field is looked up by name from
 * `PAYROLL_DETAIL_FIELDS`, coerced to a string, stripped of control characters,
 * trimmed, capped at the length the field declares, and checked against its kind
 * — and anything the request carried that isn't on that list is dropped on the
 * floor rather than sealed along for the ride.
 *
 * **The optional groups are skipped, not merely un-required.** With the tick
 * off, the fields governed by it are `continue`d past before they are read, so a
 * hand-built request cannot smuggle a tax file number into a company that never
 * asked for one. That is the emergency contact's rule, and here it is also the
 * TFN Rule's: collection has to have been decided on, and a client is not who
 * decides.
 *
 * Refusals are sentences for the person typing, and name the field, because
 * "that didn't work" on a nine-box form is a puzzle rather than a message.
 */
export function parsePayrollDetails(
  input: unknown,
  asked: PayrollAsked,
): PayrollParseResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, problem: "That didn't arrive in one piece. Try again." };
  }

  const raw = input as Record<string, unknown>;
  const details: Record<string, string> = {};

  for (const field of PAYROLL_DETAIL_FIELDS) {
    /* Not validated, not stored, not read. See above: with the tick off this
       question does not exist for this person. */
    if (!wasAsked(field, asked)) continue;

    const value = oneLine(raw[field.key], field.max);

    if (!value) {
      if (field.required) return { ok: false, problem: missing(field) };
      continue;
    }

    const checked = checkKind(field, value);
    if (!checked.ok) return { ok: false, problem: checked.problem };

    /* The *normalised* value, not what they typed. A BSB becomes `123-456` and
       an account number becomes digits, so the admin reading it back gets one
       shape rather than whichever one this person favours. */
    details[field.key] = checked.value;
  }

  /* The cast is safe in the one direction that matters: the loop above only
     ever writes keys from `PAYROLL_DETAIL_FIELDS`, whose `key` is typed as
     `keyof PayrollDetails`, and every required one has been proven non-empty or
     returned already. */
  return { ok: true, details: details as unknown as PayrollDetails };
}

/** What to say when a required box is empty, in the words the box uses. */
function missing(field: PayrollDetailField): string {
  if (field.kind === "choice") return `I still need an answer to "${field.label}"`;
  return `I still need your ${field.label.toLowerCase()}.`;
}

type KindResult =
  | { ok: true; value: string }
  | { ok: false; problem: string };

/**
 * Whether a value is the kind of thing its field asked for, and what to store.
 *
 * Returns the value rather than only a verdict, because three of these kinds
 * normalise: a BSB gains its hyphen, an account number loses its spaces, and a
 * USI is upper-cased. Splitting "is it valid" from "what do we keep" would mean
 * two functions that have to agree about the same string.
 */
function checkKind(field: PayrollDetailField, value: string): KindResult {
  switch (field.kind) {
    case "bsb": {
      const bsb = normalBsb(value);
      return bsb
        ? { ok: true, value: bsb }
        : { ok: false, problem: "A BSB is six digits, like 123-456." };
    }

    case "account-number": {
      const digits = digitsOf(value);
      if (/[^\d\s-]/.test(value)) {
        return {
          ok: false,
          problem: "An account number should only have digits in it.",
        };
      }
      if (digits.length < 5 || digits.length > 10) {
        return {
          ok: false,
          problem: "Australian account numbers are between five and ten digits.",
        };
      }
      return { ok: true, value: digits };
    }

    case "tfn": {
      const problem = tfnProblem(value);
      if (problem) return { ok: false, problem };
      /* Stored as bare digits. The spacing people use — `123 456 789` — is a
         reading convention rather than part of the number, and the admin's
         revealed view puts it back for them. */
      return { ok: true, value: digitsOf(value) };
    }

    case "usi": {
      /* Deliberately loose. A USI is alphanumeric and around 8–20 characters, an
         ABN is 11 digits, and funds print both with spaces in them. What is
         refused is punctuation that has no business in either, because this
         value is read off a screen and typed into a clearing house. */
      if (!/^[A-Za-z0-9 ]+$/.test(value)) {
        return {
          ok: false,
          problem: "A USI or ABN is just letters and numbers.",
        };
      }
      if (value.replace(/\s/g, "").length < 8) {
        return { ok: false, problem: "That looks too short for a USI or ABN." };
      }
      return { ok: true, value: value.toUpperCase() };
    }

    case "choice":
      /* From a radio group, so a value that isn't on the list came from
         something other than the form. Refused rather than stored: an answer
         nothing recognises is one the person reading it would have to guess
         at, on the field that decides how much tax comes out of somebody's
         pay. */
      return THRESHOLD_IDS.has(value)
        ? { ok: true, value }
        : { ok: false, problem: "Pick one of the two answers about the tax-free threshold." };

    case "text":
      return { ok: true, value };
  }
}

/* --- Showing --------------------------------------------------------------- */

/**
 * The answer as lines, in full.
 *
 * Only ever built behind a check on who is asking — the reveal route, and
 * nowhere else. Unlike the identity block, this one is *not* used on the new
 * starter's own screen: there is nothing on this form they would want read back
 * to them in an office, and their own account number is not a thing they need
 * this product to remind them of.
 *
 * Optional fields that were left empty are absent rather than blank, so a list
 * of these is what was actually given rather than a form with holes in it.
 */
export function describePayroll(details: PayrollDetails): PayrollDetailLine[] {
  return PAYROLL_DETAIL_FIELDS.flatMap((field) => {
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
 * bank account printed there is exposed to everybody in the room for the whole
 * of that, in exchange for nobody having read it.
 *
 * **Masked on the server, not with CSS.** The full values are not in the page at
 * all. Blurring them in the browser is not hiding — it is publishing the data
 * and asking the client politely not to draw it. Reveal is a fetch.
 *
 * **What is masked and what isn't**, by what it would cost:
 *
 * - *The account name* is shown. It is usually the person's own name, which is
 *   the heading of the page it sits on, and it is the one field that answers
 *   "have I got the right person's account here" — which is the question that
 *   stops money going to a stranger.
 * - *The BSB* is shown. It identifies a branch, not a person; nobody can be paid
 *   into a BSB, and seeing it is how an admin recognises the account they
 *   already have on file.
 * - *The account number* keeps its last three digits and nothing else — the same
 *   trade the identity block makes on a phone number. Enough to answer "is this
 *   the account I paid last month", not enough to pay into.
 * - *The tax-free threshold* is shown outright. It is a yes or a no about a tax
 *   preference, it identifies nobody, and it is the single thing on this form
 *   that an admin has a legitimate reason to read at a glance.
 * - *The tax file number is masked absolutely*, to a fixed-width row of dots,
 *   with no tail and no length. Not because a partial mask would be sloppy, but
 *   because it would be *effective*: nine digits carrying a modulus-11 check
 *   means the last three narrow the remaining space enormously, and the whole
 *   point of the TFN Rule's security obligation is that this number does not
 *   leak by degrees. It is never shown in a list, on a card, in a metric or in a
 *   summary — only behind the reveal, which is logged.
 * - *The fund name and its USI* are shown; they identify a superannuation fund,
 *   which is a company with a website, not a person.
 * - *The member number* is masked. That one does identify the person, inside the
 *   fund.
 */
export function maskPayroll(details: PayrollDetails): PayrollDetailLine[] {
  return describePayroll(details).map((line) => {
    const field = PAYROLL_DETAIL_FIELDS.find((f) => f.key === line.key);
    const raw = details[line.key] ?? "";
    const value = field ? masked(field, raw) : DOTS;
    return { ...line, value, masked: value !== line.value };
  });
}

function masked(field: PayrollDetailField, value: string): string {
  switch (field.key) {
    case "accountName":
    case "bsb":
    case "claimsTaxFreeThreshold":
    case "superFundName":
    case "superUsi":
      return shown(field, value);

    case "accountNumber": {
      const digits = digitsOf(value);
      return digits.length > 3 ? `•••• ${digits.slice(-3)}` : DOTS;
    }

    default:
      /* The tax file number, the member number — and anything added later,
         which is the point of defaulting this way. A new field arrives masked
         and somebody has to argue it out of the mask, rather than arriving in
         the clear because nobody remembered this function existed. The TFN in
         particular must never acquire a `case` above with a tail on it. */
      return value ? DOTS : "";
  }
}

/**
 * A stored value as it should read: codes become labels, and the two numbers
 * people space out get their spacing back.
 *
 * Same rule the block library's `describeSetup` follows — ids persist, labels
 * are for reading — extended to the one case where the stored form is
 * deliberately tighter than the readable one. A tax file number is stored as
 * nine bare digits and is read off a screen by somebody typing it somewhere
 * else, and `123 456 789` is how every ATO document prints it.
 */
function shown(field: PayrollDetailField, value: string): string {
  if (field.kind === "choice") {
    return field.options?.find((o) => o.id === value)?.label ?? value;
  }

  if (field.kind === "tfn") {
    const digits = digitsOf(value);
    return digits.length === 9
      ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
      : value;
  }

  return value;
}

/**
 * Their own answer, back to them, in one line.
 *
 * For the new starter's plan, where every other finished step shows what they
 * sent — and where this one shows **no value whatsoever**, which is a departure
 * from the identity block and a deliberate one. That block shows their name back
 * because a name is a thing they might want to check was typed right and is not
 * a fact anybody could not have guessed. Nothing on this form is like that: the
 * last digits of their account number and any part of their tax file number are
 * both things this screen would be putting in front of whoever is standing
 * behind them in their first week, in exchange for a reassurance a sentence can
 * give for free.
 *
 * So: the categories they answered, and nothing they typed.
 */
export function summarisePayroll(details: PayrollDetails): string {
  const parts = ["your bank details"];
  if (details.superFundName || details.superUsi || details.superMemberNumber) {
    parts.push("your super fund");
  }
  if (details.taxFileNumber) parts.push("your tax file number");

  /* No trailing "and it's encrypted": the form they just pressed said that, and
     the row this lands in already reads "you sent this on 10 August". A screen
     that says the same thing twice in one line reads as one that has lost track
     of what it has already told you. */
  const listed =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

  return `${listed[0].toUpperCase()}${listed.slice(1)}`;
}

/**
 * Which optional groups a workflow's block asked for, from the ticked ids.
 *
 * Here rather than in `stepsFromBlocks`, so that what an extra id *means* lives
 * beside the fields it governs. The invite route sanitises a list of strings
 * without knowing what any of them are; this turns them into the two questions
 * the form and the validator actually branch on.
 */
export function payrollAskedFrom(extras: readonly string[]): PayrollAsked {
  const has = (extra: PayrollExtra) => extras.includes(extra);
  return {
    superFund: has("super-fund"),
    taxFileNumber: has("tax-file-number"),
  };
}
