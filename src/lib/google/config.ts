import "server-only";

/**
 * Where the Google credentials come from, and the shape they have to be in.
 *
 * A service account with domain-wide delegation, rather than a user going
 * through a consent screen. Creating a seat happens when a workflow reaches
 * that block, which may be at three in the morning six weeks after anybody
 * last thought about it — there is no human present to consent, so the only
 * honest shape is server-to-server.
 *
 * Read from the environment, here and nowhere else. `server-only` makes
 * importing this from a client component a build error rather than a private
 * key somebody notices in a bundle six weeks later.
 *
 * The environment is:
 *
 *   GOOGLE_WORKSPACE_CLIENT_EMAIL   the service account's `client_email`,
 *                                   e.g. craig@my-project.iam.gserviceaccount.com
 *   GOOGLE_WORKSPACE_PRIVATE_KEY    the `private_key` from the same JSON key
 *                                   file: a PKCS#8 PEM beginning
 *                                   "-----BEGIN PRIVATE KEY-----"
 *   GOOGLE_WORKSPACE_ADMIN_EMAIL    a super admin in the Workspace tenant, to
 *                                   impersonate
 *   GOOGLE_WORKSPACE_DOMAIN         optional; the primary domain, so callers
 *                                   can build addresses without hard-coding it
 *
 * None of them are NEXT_PUBLIC_, and one of them never can be.
 */

/**
 * The one scope this module asks for.
 *
 * `admin.directory.user` is what `users.insert` and `users.get` require, and
 * asking for nothing else is the point: whatever is typed into the Admin
 * console's domain-wide delegation box is a standing grant to act as a super
 * admin without anybody's consent, so it should be exactly as wide as the two
 * calls in `directory.ts` and not one scope wider. Adding a scope here means
 * editing the Admin console too — that friction is a feature.
 */
export const DIRECTORY_SCOPE =
  "https://www.googleapis.com/auth/admin.directory.user";

export interface GoogleWorkspaceConfig {
  /** The service account. Becomes the JWT's `iss`. */
  clientEmail: string;
  /** PEM, newlines already real. Never logged, never returned to a browser. */
  privateKey: string;
  /** The super admin to impersonate. Becomes the JWT's `sub`. */
  adminEmail: string;
  /** The tenant's primary domain, when somebody bothered to set it. */
  domain: string | null;
}

export type ConfigResult =
  | { configured: true; config: GoogleWorkspaceConfig }
  | {
      configured: false;
      /** The variables that are missing, or set to something unusable. */
      incomplete: string[];
      /** Safe to show. Says which of the two situations below this is. */
      message: string;
    };

const CLIENT_EMAIL = "GOOGLE_WORKSPACE_CLIENT_EMAIL";
const PRIVATE_KEY = "GOOGLE_WORKSPACE_PRIVATE_KEY";
const ADMIN_EMAIL = "GOOGLE_WORKSPACE_ADMIN_EMAIL";
const DOMAIN = "GOOGLE_WORKSPACE_DOMAIN";

/**
 * Turns whatever survived the journey into a `.env` file back into a PEM.
 *
 * A Google service account key is JSON, and its `private_key` is a single
 * string containing literal backslash-n escapes. Paste that into `.env.local`
 * and there are three things that can happen to it, all of which produce a
 * value `crypto.createPrivateKey` refuses with the same unhelpful message:
 *
 * - The escapes stay escapes, because a `.env` file has no JSON parser. Every
 *   `\n` is two characters, so the PEM is one enormous line.
 * - The whole value gets wrapped in quotes to survive the newlines, and the
 *   quotes come through as part of the string.
 * - A deployment UI that does understand newlines stores it correctly, and
 *   this function has to leave it alone.
 *
 * So: strip a matched pair of surrounding quotes, then turn `\n` sequences
 * into real newlines, then normalise CRLF — a PEM pasted through a Windows
 * clipboard has carriage returns that some OpenSSL builds accept and some do
 * not. All four inputs land in the same place, which is the only way this
 * stops being an hour of somebody's life every time they set it up.
 */
function normalisePem(raw: string): string {
  const unquoted = raw.replace(/^\s*(['"])([\s\S]*)\1\s*$/, "$2");
  return unquoted.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
}

/**
 * Cheap enough to run on every call, and worth it.
 *
 * Only checks that this looks like a PEM at all. A truncated body still gets
 * through and fails later in `node:crypto`, which is fine — the point of the
 * check here is to catch the far more common mistake of pasting the
 * *whole JSON key file* into the variable, or pasting the `private_key_id`
 * instead of the key. Both of those produce a value that is obviously not a
 * key, and saying so before a network round trip is worth four lines.
 */
const looksLikePem = (value: string) =>
  /^-----BEGIN (RSA )?PRIVATE KEY-----/.test(value) &&
  /-----END (RSA )?PRIVATE KEY-----\s*$/.test(value);

/**
 * The credentials, or a precise account of what is missing.
 *
 * Deliberately not cached: `process.env` is re-read on every call so that
 * adding the variables and restarting is the whole of the setup loop, and so
 * that a test can set them. It is three string reads.
 *
 * The two failure messages are different on purpose, and the distinction is
 * the point of this function. *Nothing* set is the normal state of this
 * repo — the showcase runs without Google credentials, and saying anything
 * alarming about it would be a lie. *Some* set is a half-finished setup, and
 * almost always a typo in a variable name; that person needs to be told which
 * one, immediately, by name. Both come back as `not-configured` so the UI
 * stays calm either way, but only one of them reads like a to-do.
 */
export function googleConfig(): ConfigResult {
  const clientEmail = process.env[CLIENT_EMAIL]?.trim() ?? "";
  const rawKey = process.env[PRIVATE_KEY] ?? "";
  const adminEmail = process.env[ADMIN_EMAIL]?.trim() ?? "";
  const domain = process.env[DOMAIN]?.trim() || null;

  const privateKey = rawKey.trim() ? normalisePem(rawKey) : "";

  const incomplete: string[] = [];
  if (!clientEmail) incomplete.push(CLIENT_EMAIL);
  if (!privateKey) incomplete.push(PRIVATE_KEY);
  if (!adminEmail) incomplete.push(ADMIN_EMAIL);

  if (incomplete.length === 3) {
    return {
      configured: false,
      incomplete,
      message:
        "Google Workspace isn't connected, so nothing was attempted. This step needs a service account with domain-wide delegation — see the setup notes for GOOGLE_WORKSPACE_CLIENT_EMAIL, GOOGLE_WORKSPACE_PRIVATE_KEY and GOOGLE_WORKSPACE_ADMIN_EMAIL.",
    };
  }

  if (incomplete.length > 0) {
    return {
      configured: false,
      incomplete,
      /* Named, because the overwhelmingly likely cause of a partial setup is
         a misspelled variable name, and a misspelled name is invisible until
         somebody tells you which one didn't arrive. */
      message: `Google Workspace is half-connected: ${incomplete.join(", ")} ${incomplete.length === 1 ? "is" : "are"} missing from the environment. Add ${incomplete.length === 1 ? "it" : "them"} and restart the server so the value is re-read.`,
    };
  }

  if (!looksLikePem(privateKey)) {
    return {
      configured: false,
      incomplete: [PRIVATE_KEY],
      message: `${PRIVATE_KEY} doesn't look like a private key. It wants the "private_key" field from the service account's JSON key file — the block that starts with -----BEGIN PRIVATE KEY----- — and not the whole file, and not the key id.`,
    };
  }

  return {
    configured: true,
    config: { clientEmail, privateKey, adminEmail, domain },
  };
}

/**
 * Is Google connected, without going near a secret.
 *
 * For the screen that has to explain why a workflow block is sitting there
 * doing nothing. It returns the *names* of the variables that are missing,
 * which are not sensitive — they are documented above and in this file's
 * header — and never the values, so this is safe to hand to a route that
 * renders it. Nothing here makes a network call, so a page can ask it as
 * often as it likes.
 */
export function googleWorkspaceStatus(): {
  connected: boolean;
  missing: string[];
  /** The tenant's domain when it's known, for "they'll be name@this". */
  domain: string | null;
} {
  const result = googleConfig();
  return result.configured
    ? { connected: true, missing: [], domain: result.config.domain }
    : {
        connected: false,
        missing: result.incomplete,
        domain: process.env[DOMAIN]?.trim() || null,
      };
}
