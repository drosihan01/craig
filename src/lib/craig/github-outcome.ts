import { SETTINGS_PATH } from "./google-outcome";

/**
 * What the GitHub connect flow says to the screen it lands back on.
 *
 * Unverified: no GitHub connect has ever landed anywhere, so no screen has yet
 * rendered any of these codes off a real redirect. Deliberately not
 * `server-only`, for the reason `google-outcome.ts` gives: the route ends the
 * flow by redirecting with a code, a client component explains the code, and
 * two spellings of that code drift into a connection that worked reporting
 * nothing at all. Both ends import from here.
 *
 * The codes are a closed set for the same reason Google's are: `?github=`
 * renders whatever a stranger puts in it if the screen trusts the words, so
 * the words on the screen are ours and the URL only ever carries a key into
 * that table.
 *
 * The same honest gap the Slack and Linear versions record applies here: the
 * default landing is `/settings`, and the settings screen renders only Google
 * outcomes. The normal path never sees it, because the Connect button always
 * sends `?from=` and comes back to the block panel, which does render these.
 * The exits that refuse before the state verifies (`signed-out`, `mismatch`)
 * land on a calm settings page with a code in the URL that renders as nothing.
 * Wrong to leave forever, safe while nothing can be connected, and the fix
 * belongs with a provider row on the settings screen rather than with a hack
 * here.
 */

/**
 * Where GitHub sends the customer back, as a path. Has to match the Callback
 * URL on the GitHub App, the `GITHUB_OAUTH_REDIRECT_URI` variable, and the
 * directory holding the callback's `route.ts` — the same three-places-at-once
 * constraint as Google's, and the same reason it is a named constant rather
 * than a literal in a paragraph.
 */
export const GITHUB_CALLBACK_PATH = "/api/github/callback";

/** The query parameter carrying the code below. */
export const GITHUB_OUTCOME_PARAM = "github";

/**
 * Every way the flow can end, named for what the person has to do next. The
 * first group is this flow's own; the second is `GitHubFailure` from
 * `lib/github/result.ts`, passed straight through because those names are
 * already chosen for the fix.
 */
export type GitHubConnectOutcome =
  /** Stored. There is a working connection now. */
  | "connected"
  /** The authorisation has been revoked and deleted from this deployment. */
  | "disconnected"
  /** They pressed Cancel on GitHub's consent screen. Not a failure. */
  | "cancelled"
  /** No session, so there was no account to connect anything to. */
  | "signed-out"
  /** No encryption key, so storing was refused rather than done badly. */
  | "no-key"
  /** The `state` check failed: wrong browser, too slow, or not our redirect. */
  | "mismatch"
  /** GitHub said yes and the store said no. */
  | "not-stored"
  /* --- straight from lib/github --------------------------------------------- */
  | "not-configured"
  | "not-connected"
  /** Authorised, but the App is on no organisation — its own fix, its own
      sentence. The one outcome this provider has that no other does. */
  | "not-installed"
  | "needs-reconnect"
  | "bad-credentials"
  | "unauthorized"
  | "invalid-request"
  | "rate-limited"
  | "rejected"
  | "unreachable";

/**
 * Where a finished connect attempt lands, with what to say about it. Relative,
 * so the caller resolves it against the request it is answering — every source
 * of an absolute host is either configuration or attacker controlled.
 * `SETTINGS_PATH` is imported from `google-outcome.ts` rather than spelt again:
 * the settings screen is one place, not one per provider, and a second
 * spelling is the drift this family of files exists to prevent.
 */
export function githubLandingPath(outcome?: GitHubConnectOutcome): string {
  if (!outcome) return SETTINGS_PATH;
  const params = new URLSearchParams({ [GITHUB_OUTCOME_PARAM]: outcome });
  return `${SETTINGS_PATH}?${params}`;
}
