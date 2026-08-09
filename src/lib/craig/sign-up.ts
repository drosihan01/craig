/**
 * What sign-up asks for, and what it does with it.
 *
 * Shared by the form and the route handler on purpose. Validation that lives
 * only in the browser isn't validation, and validation written twice is two
 * rulesets that agree until somebody edits one of them — so the rules live
 * here and both sides run the same function.
 *
 * Not `server-only`: there are no secrets in here, and the point is that the
 * client can run it.
 */

export const SIGN_UP_PATH = "/sign-up";

/** Domains that say nothing about where somebody works. */
/* Only used to decide that an address says nothing about where somebody
   works, so no company name is guessed from it. It does not gate sign-up —
   anyone can use any address. */
export const PUBLIC_DOMAINS = new Set([
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "proton.me",
]);

/**
 * The company, read off the email domain.
 *
 * Craig can read "sam@northgate.io" as well as Sam can, and asking for
 * "Northgate" straight after the domain is asking somebody to prove something
 * we already know. A guess, though, not a fact — it fills the field and the
 * field stays editable. A public mailbox infers nothing rather than guessing
 * "Gmail": a wrong inference costs more than an absent one.
 */
export function companyFromEmail(email: string): string {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain || PUBLIC_DOMAINS.has(domain)) return "";
  const name = domain.split(".")[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * How long each field may be.
 *
 * Every one of these is a ceiling rather than a preference, because all four
 * values are stored, and two of them end up in an email that leaves our
 * verified domain. The company in particular becomes a Subject line and a From
 * display name, and "very long" is its own attack on a header: clients
 * truncate it, wrap it, or refuse the message, and a display name that wraps is
 * a display name that can be made to look like it ends somewhere it doesn't.
 *
 * The numbers are all comfortably above anything real. Sixty characters is
 * longer than any company name anybody has; eighty matches the ceiling the
 * invite route already puts on a person's name and job title; 254 is RFC 5321's
 * limit on an address, so anything past it is not a typo. The password cap
 * exists only so an unbounded string can't be fed to PBKDF2 — there is no upper
 * bound on a good password short of one somebody could post a novel into.
 */
export const COMPANY_MAX_LENGTH = 60;
export const NAME_MAX_LENGTH = 80;
export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MAX_LENGTH = 200;

/**
 * Characters that must never survive into a mail header, and three separate
 * reasons why.
 *
 * **The C0 range and DEL.** This is where CR and LF live, and a newline in a
 * value about to be concatenated into a header is *the* header injection:
 * `Acme\r\nBcc: everyone@example.com` turns one invitation into a mailing list
 * run from somebody else's domain. The rest of the range goes with it, because
 * a NUL or a vertical tab survives a naive `trim()` and is precisely the sort of
 * byte two parsers downstream will disagree about.
 *
 * **The C1 range.** It contains NEL, U+0085, which is a line break that
 * JavaScript's `\s` does not match — so collapsing whitespace alone would let a
 * line ending straight through.
 *
 * **The invisible formatting characters.** Zero-width spaces, the soft hyphen,
 * the bidirectional overrides and isolates, the byte-order mark. They render as
 * nothing, or they reverse the text around them, which is how a display name
 * can arrive in an inbox reading as an address at a domain it has nothing to do
 * with. Nothing legitimate needs them in a company name.
 */
const HEADER_UNSAFE =
  /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff]/g;

/**
 * Characters a display name must not contain even though a header could carry
 * them.
 *
 * `"` and `\` are the two that end a quoted string early — `send.ts` puts the
 * company inside quotes precisely so an ordinary comma in "Acme, Inc." can't
 * split the From header into two addresses, and that only holds if the quoting
 * can't be escaped out of. `<`, `>` and `@` are the impersonation set: a display
 * name of `Acme <security@yourbank.com>` reads, in the clients that show the
 * name and hide the address, as mail from that bank.
 *
 * Replaced with a space rather than deleted, so `Acme<script>` becomes
 * `Acme script` rather than the single word `Acmescript`. Sanitising should
 * leave something visibly odd, not something that quietly reads as a name.
 */
const NAME_UNSAFE = /["<>@\\]/g;

/**
 * The company name, as one short line that is safe to hand to a mail header.
 *
 * This is the canonical rule for that value and the reason it is exported: it
 * has to run in the browser (so the form can refuse a name it can't keep), on
 * the route handler (so the form is not the thing deciding), and on the way out
 * of the account store (because the store predates this rule and already holds
 * whatever the earliest sign-ups typed). One function, so those three can't
 * drift apart.
 *
 * It sanitises rather than throws, and the caller decides what an empty result
 * means. A name made entirely of characters we strip is a name we cannot send
 * under; a name with one stray control character in the middle of it is almost
 * certainly a copy-paste from a spreadsheet, and refusing that would be
 * punishing somebody for their clipboard.
 *
 * Capped by code point rather than by `String.slice`, which counts UTF-16 units
 * and will happily cut an emoji or a CJK ideograph in half. A lone surrogate is
 * not a character, and it travels through JSON to a mail provider as an escape
 * nothing on the other end is obliged to accept.
 */
export function safeCompany(value: string): string {
  const flat = value
    .replace(NAME_UNSAFE, " ")
    .replace(HEADER_UNSAFE, " ")
    .replace(/\s+/g, " ")
    .trim();

  return Array.from(flat).slice(0, COMPANY_MAX_LENGTH).join("").trim();
}

export interface SignUpFields {
  name: string;
  email: string;
  company: string;
  password: string;
}

export type SignUpErrors = Partial<Record<keyof SignUpFields, string>>;

/** Code points, not UTF-16 units — see the note on capping in `safeCompany`. */
const length = (value: string) => Array.from(value).length;

export function validateSignUp(fields: Partial<SignUpFields>): SignUpErrors {
  const errors: SignUpErrors = {};
  const name = fields.name?.trim() ?? "";
  const email = fields.email?.trim() ?? "";
  const company = fields.company?.trim() ?? "";
  const password = fields.password ?? "";

  if (!name) errors.name = "Enter your name";
  else if (length(name) > NAME_MAX_LENGTH)
    errors.name = `Keep it to ${NAME_MAX_LENGTH} characters or fewer`;

  /* The forbidden set matters more than the shape. The shape check is the same
     permissive "something, an @, something with a dot" the invite route uses,
     because real addresses are stranger than people think and refusing one is a
     bug the person can't work around. The second test is the one that earns its
     place: comma and semicolon are how one address becomes a recipient list,
     angle brackets and quotes are how it becomes a display name wrapping
     somebody else's address, and the whitespace ban covers every newline. This
     address is not put in a header today — but it is the account's identity,
     and the first feature that mails the account holder will reach for it. */
  if (!email) errors.email = "Enter an email";
  else if (length(email) > EMAIL_MAX_LENGTH)
    errors.email = "That doesn't look like an email address";
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    errors.email = "That doesn't look like an email address";
  else if (/[,;<>"\\]/.test(email))
    errors.email = "That doesn't look like an email address";

  /* Too long is a length message, because that is a thing somebody can fix and
     a limit they should be told. A name that sanitises away to nothing gets the
     generic refusal instead: it is only reachable by typing a name made
     entirely of control characters and angle brackets, and there is nothing
     useful to say to whoever did that. */
  if (!company) errors.company = "What's the company called?";
  else if (length(company) > COMPANY_MAX_LENGTH)
    errors.company = `Keep it to ${COMPANY_MAX_LENGTH} characters or fewer`;
  else if (!safeCompany(company))
    errors.company = "That doesn't look like a company name";

  if (password.length < 12) errors.password = "At least 12 characters";
  else if (password.length > PASSWORD_MAX_LENGTH)
    errors.password = `At most ${PASSWORD_MAX_LENGTH} characters`;

  return errors;
}

/**
 * Why a valid sign-up is sometimes still refused.
 *
 * One account per email. Overwriting instead would make "sign up again" a way
 * to take an account off whoever holds it, which is a bad thing for a form to
 * be able to do and a worse thing to find out about afterwards.
 *
 * Defined next to the rules rather than in the route handler because the page
 * needs to be able to say the same thing.
 */
export const SIGN_UP_TAKEN =
  "That email already has an account. Sign in instead, or use a different address.";
