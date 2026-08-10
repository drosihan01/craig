import "server-only";

import {
  AU_STATES,
  PERSONAL_DETAIL_FIELDS,
  type DetailLine,
  type PersonalDetailField,
  type PersonalDetails,
} from "./contract";
/* The envelope, shared with the payroll block. This file owns what an address
   is; it deliberately owns no cipher — see the header on `sealed-answer.ts` for
   why one AES-GCM implementation serving both is the whole point. */
import {
  DOTS,
  digitsOf,
  oneLine,
  readSealedAnswers,
  sealAnswer,
  type SealResult,
} from "./sealed-answer";

/**
 * The only door to what a new starter typed into the personal details block.
 *
 * **What this file is and is not.** It is the *shape*: what a legal name, an
 * address and an emergency contact are, what counts as a valid one, and how much
 * of each an admin gets to see without asking. The sealing itself lives in
 * `sealed-answer.ts` and is shared with the payroll block, which arrived hours
 * later wanting exactly the same envelope around a different document — one
 * cipher, one key, one place to get GCM wrong.
 *
 * **Why any of this is encrypted at all** is argued in full over there, and the
 * short version is that a date of birth, a residential address and a mobile
 * number held together with a legal name is not a form, it is the bundle
 * somebody opens a credit account with. A stolen token can be revoked; a stolen
 * date of birth is a fact about a person for the rest of their life.
 *
 * **Why now rather than later.** Retrofitting encryption onto data already
 * collected is the expensive version of this: it means a migration that reads
 * every plaintext row, a window where both shapes exist, and a decision about
 * what to tell the people whose details sat in the clear in the meantime.
 * There is no real customer data on this deployment yet. This is the cheapest
 * hour this will ever cost.
 */

/** Which envelope these answers travel in. Its own constant so the string that
    is both the `field` column and half the AAD is typed once. */
const KIND = "personal-details" as const;

/**
 * The answer, sealed and ready to be written.
 *
 * A named wrapper rather than a bare `sealAnswer` call at each site, because
 * this is the one place the shape and the kind are bound together — and binding
 * them once is what stops a payroll document being sealed under the identity
 * AAD by a caller who passed the wrong string.
 */
export function sealPersonalDetails(
  details: PersonalDetails,
  joinerId: string,
  stepId: string,
): SealResult {
  return sealAnswer(details, KIND, joinerId, stepId);
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

/**
 * Every sealed answer this person has given to *this* block, opened, by step.
 *
 * The query, the key and the failure modes are `readSealedAnswers`'; what is
 * added here is `fromStored`, which is the reason this is not simply that
 * function called at the call site. A document that comes out of an envelope is
 * still a document that went in under an older version of this file, and it has
 * to be reshaped to the fields this one knows about before anything treats it
 * as a `PersonalDetails`.
 */
export async function readPersonalDetails(
  joinerId: string,
): Promise<Map<string, PersonalDetails>> {
  const opened = new Map<string, PersonalDetails>();

  for (const [stepId, document] of await readSealedAnswers(joinerId, KIND)) {
    opened.set(stepId, fromStored(document));
  }

  return opened;
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

const STATE_CODES = new Set(AU_STATES.map((s) => s.id));

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
