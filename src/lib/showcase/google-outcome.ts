/**
 * What the connect flow says to the screen it lands back on.
 *
 * Deliberately not `server-only`, and that is the whole reason it is a file
 * rather than two string literals. A route handler running on the server ends
 * the flow by redirecting, and a component running in a browser has to explain
 * what happened; the only thing joining them is a word in a query string. Two
 * copies of that word drift, and the way anybody finds out is a connection
 * that worked perfectly reporting nothing at all — so both ends import from
 * here, and a rename is a compile error rather than a silence.
 *
 * The codes are a closed set on purpose. The alternative is putting the
 * failure's own sentence in the URL, which reads well right up until somebody
 * notices that `?google=` renders whatever they put in it — a screenshot of
 * this product saying anything a stranger likes. Google's real words go to the
 * server log, the code comes back in the URL, and the words on the screen are
 * ours.
 */

/**
 * Where Google sends a customer back, as a path.
 *
 * The one string in this repo that has to be identical in three places at
 * once: the Authorized redirect URI on the OAuth client, the
 * `GOOGLE_OAUTH_REDIRECT_URI` variable the token exchange sends, and the
 * route that actually answers. Google compares it byte for byte and rejects
 * anything else, so a typo in any of the three is a `redirect_uri_mismatch` on
 * Google's own error page — after the customer has already been sent away.
 *
 * Kept here so the panel that tells somebody what to paste into the Cloud
 * console derives it from the same constant, rather than from a sentence
 * somebody wrote once. It still has to match the directory that holds the
 * callback's `route.ts`, which nothing can check for us; that is the reason
 * it is a named constant rather than a literal in a paragraph.
 */
export const GOOGLE_CALLBACK_PATH = "/api/google/callback";

/** The sandbox, and the section within it the flow belongs to. */
export const SANDBOX_PATH = "/sandbox";
export const SANDBOX_TAB_PARAM = "tab";
export const SANDBOX_GOOGLE_TAB = "google";

/** The query parameter carrying the code below. */
export const CONNECT_OUTCOME_PARAM = "google";

/**
 * Every way the flow can end, named for what the person has to do next.
 *
 * The first group is this flow's own; the second is `GoogleFailure` from
 * `lib/google/result.ts`, passed straight through because those names are
 * already chosen for the fix rather than for the status code, and flattening
 * them into one "it didn't work" would throw away the distinction between
 * "check the client secret" and "your admin isn't a super admin".
 */
export type ConnectOutcome =
  /** Stored. There is a working connection now. */
  | "connected"
  /** The token has been deleted from this deployment. */
  | "disconnected"
  /** They pressed Cancel on Google's consent screen. Not a failure. */
  | "cancelled"
  /** No showcase session, so there was no account to connect anything to. */
  | "signed-out"
  /** No encryption key, so storing a token was refused rather than done badly. */
  | "no-key"
  /** The `state` check failed: wrong browser, too slow, or not our redirect. */
  | "mismatch"
  /** Consent came from a personal Google account, which has no Workspace. */
  | "personal-account"
  /** Google said yes and the store said no. */
  | "not-stored"
  /* --- straight from lib/google -------------------------------------------- */
  | "not-configured"
  | "not-connected"
  | "needs-reconnect"
  | "bad-credentials"
  | "unauthorized"
  | "already-exists"
  | "no-such-user"
  | "quota-exhausted"
  | "invalid-request"
  | "rate-limited"
  | "rejected"
  | "unreachable";

/**
 * Where a finished connect attempt lands, with what to say about it.
 *
 * Relative, so the caller resolves it against the request it is answering and
 * cannot accidentally build a redirect to somewhere else — an absolute URL
 * assembled here would need a host from somewhere, and every source of a host
 * in a request is either configuration or attacker-controlled.
 */
export function sandboxGooglePath(outcome?: ConnectOutcome): string {
  const params = new URLSearchParams({
    [SANDBOX_TAB_PARAM]: SANDBOX_GOOGLE_TAB,
  });
  if (outcome) params.set(CONNECT_OUTCOME_PARAM, outcome);
  return `${SANDBOX_PATH}?${params}`;
}
