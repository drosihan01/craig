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

export const SIGN_UP_PATH = "/showcase/sign-up";

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

export interface SignUpFields {
  name: string;
  email: string;
  company: string;
  password: string;
}

export type SignUpErrors = Partial<Record<keyof SignUpFields, string>>;

export function validateSignUp(fields: Partial<SignUpFields>): SignUpErrors {
  const errors: SignUpErrors = {};
  const name = fields.name?.trim() ?? "";
  const email = fields.email?.trim() ?? "";
  const company = fields.company?.trim() ?? "";
  const password = fields.password ?? "";

  if (!name) errors.name = "Enter your name";

  if (!email) errors.email = "Enter an email";
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    errors.email = "That doesn't look like an email address";

  if (!company) errors.company = "What's the company called?";

  if (password.length < 12) errors.password = "At least 12 characters";

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
