import "server-only";

/**
 * Our OAuth client — the one set of credentials this deployment owns.
 *
 * Worth being precise about whose credentials these are, because there are
 * two parties and only one of them is in the environment. This file holds
 * *our* application's identity with Google: one client id and secret,
 * registered once in our Cloud project, shared by every customer. What it
 * does not hold, and must never hold, is any customer's credentials. Those
 * arrive per account when somebody presses "Connect Google Workspace", and
 * they live in the account store — see `auth.ts` for the shape and the
 * report for where they belong.
 *
 * This is not a service account. A service account with domain-wide
 * delegation is the right answer for a company automating its own domain, and
 * the wrong answer for a product: it would mean every customer pasting our
 * numeric client id into their own Admin console and typing scopes into a box
 * before anything worked. That is an enterprise onboarding ritual, not a
 * button. The authorisation code flow with `access_type=offline` gets the
 * same unattended power from one browser consent.
 *
 * Read from the environment, here and nowhere else. `server-only` makes
 * importing this from a client component a build error rather than a client
 * secret somebody notices in a bundle six weeks later.
 *
 * The environment is:
 *
 *   GOOGLE_OAUTH_CLIENT_ID       from the Web application OAuth client in the
 *                                Cloud console, ending .apps.googleusercontent.com
 *   GOOGLE_OAUTH_CLIENT_SECRET   the secret issued with it
 *   GOOGLE_OAUTH_REDIRECT_URI    the absolute https:// URL Google sends the
 *                                customer back to, byte-identical to one of
 *                                the Authorized redirect URIs on that client
 *
 * None of them are NEXT_PUBLIC_, and one of them never can be.
 */

/**
 * The scopes the consent screen asks for, and no more.
 *
 * `admin.directory.user` is what `users.insert` and `users.get` require. It
 * is a sensitive scope, which means the consent screen shows it in strong
 * language and Google will want the app verified before strangers can grant
 * it — so asking for one scope more than the two calls in `directory.ts`
 * actually use makes both the screen scarier and the review longer, for
 * nothing.
 *
 * `openid` and `email` are along for a reason that pays for itself at connect
 * time rather than later. They are non-sensitive, they add nothing to the
 * review, and they make Google return an id token identifying *which* admin
 * consented and which Workspace domain they belong to. Without that the
 * product has to ask a customer to type their own domain into a text box in
 * order to build `newstarter@theirdomain.com` — and then live with whatever
 * they typed. With it, the domain is Google's answer rather than a guess.
 */
export const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/admin.directory.user",
] as const;

/** The one that actually matters. Checked against what Google grants. */
export const DIRECTORY_SCOPE =
  "https://www.googleapis.com/auth/admin.directory.user";

export interface OAuthClient {
  clientId: string;
  /** Never logged, never returned to a browser, never in a redirect. */
  clientSecret: string;
  redirectUri: string;
}

export type ClientResult =
  | { configured: true; client: OAuthClient }
  | {
      configured: false;
      /** The variables that are missing, or set to something unusable. */
      incomplete: string[];
      /** Safe to show. Says which of the situations below this is. */
      message: string;
    };

const CLIENT_ID = "GOOGLE_OAUTH_CLIENT_ID";
const CLIENT_SECRET = "GOOGLE_OAUTH_CLIENT_SECRET";
const REDIRECT_URI = "GOOGLE_OAUTH_REDIRECT_URI";

/**
 * The redirect URI is configuration, not something derived from the request.
 *
 * The tempting shortcut is to build it from the incoming `Host` header so it
 * works in every environment without being set. Two reasons not to. Google
 * compares the value byte for byte against the Authorized redirect URIs on
 * the client and rejects anything else, so a derived value is a guess that
 * has to come out exactly right; and `Host` is attacker-controlled, so
 * deriving it means a crafted header can steer where Google sends an
 * authorisation code. An environment variable is one line in a deploy config
 * and neither of those problems.
 *
 * Required https, with an exception for loopback. Google itself refuses
 * plain http redirect URIs for web clients except on localhost, so enforcing
 * it here turns a confusing `redirect_uri_mismatch` on Google's own error
 * page — which happens after the customer has already been sent away — into a
 * sentence before anybody leaves the site.
 */
function usableRedirect(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol === "https:") return true;
  return (
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  );
}

/**
 * The OAuth client, or a precise account of what is missing.
 *
 * Deliberately not cached: `process.env` is re-read on every call so that
 * adding the variables and restarting is the whole of the setup loop, and so
 * that a test can set them. It is three string reads.
 *
 * The failure messages are different on purpose, and that distinction is the
 * point of this function. *Nothing* set is the normal state of this repo —
 * the showcase runs without Google credentials, and saying anything alarming
 * about it would be a lie. *Some* set is a half-finished setup, and almost
 * always a typo in a variable name; that person needs to be told which one,
 * immediately, by name. Both come back as `not-configured` at the call sites
 * so the UI stays calm either way, but only one of them reads like a to-do.
 */
export function oauthClient(): ClientResult {
  const clientId = process.env[CLIENT_ID]?.trim() ?? "";
  const clientSecret = process.env[CLIENT_SECRET]?.trim() ?? "";
  const redirectUri = process.env[REDIRECT_URI]?.trim() ?? "";

  const incomplete: string[] = [];
  if (!clientId) incomplete.push(CLIENT_ID);
  if (!clientSecret) incomplete.push(CLIENT_SECRET);
  if (!redirectUri) incomplete.push(REDIRECT_URI);

  if (incomplete.length === 3) {
    return {
      configured: false,
      incomplete,
      message:
        "Google Workspace isn't set up on this deployment, so nothing was attempted. It needs an OAuth client — see the setup notes for GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REDIRECT_URI.",
    };
  }

  if (incomplete.length > 0) {
    return {
      configured: false,
      incomplete,
      /* Named, because the overwhelmingly likely cause of a partial setup is
         a misspelled variable name, and a misspelled name is invisible until
         somebody tells you which one didn't arrive. */
      message: `Google Workspace is half set up: ${incomplete.join(", ")} ${incomplete.length === 1 ? "is" : "are"} missing from the environment. Add ${incomplete.length === 1 ? "it" : "them"} and restart the server so the value is re-read.`,
    };
  }

  if (!usableRedirect(redirectUri)) {
    return {
      configured: false,
      incomplete: [REDIRECT_URI],
      message: `${REDIRECT_URI} has to be an absolute https:// URL — http:// only on localhost — and it has to match one of the Authorized redirect URIs on the OAuth client character for character, including the trailing slash or the lack of one.`,
    };
  }

  return { configured: true, client: { clientId, clientSecret, redirectUri } };
}

/**
 * Can anybody connect Google on this deployment, without going near a secret.
 *
 * For the screen that has to explain why a "Connect Google Workspace" button
 * isn't there. It returns the *names* of the variables that are missing,
 * which are not sensitive — they are documented above and in this file's
 * header — and never the values, so this is safe to hand to a route that
 * renders it. Nothing here makes a network call, so a page can ask as often
 * as it likes.
 *
 * Note what this does *not* answer: whether a particular customer has
 * connected. That lives with the account, not with the environment, and
 * conflating the two would tell a customer who has never consented that
 * everything is fine.
 */
export function googleSetupStatus(): {
  available: boolean;
  missing: string[];
} {
  const result = oauthClient();
  return result.configured
    ? { available: true, missing: [] }
    : { available: false, missing: result.incomplete };
}
