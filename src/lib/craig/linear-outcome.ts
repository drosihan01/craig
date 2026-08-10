/**
 * What the Linear connect flow says to the screen it lands back on.
 *
 * Unverified: no Linear consent has ever produced any of these codes.
 *
 * Deliberately not `server-only`, for `google-outcome.ts`'s reason: a route
 * handler ends the flow by redirecting and a client component has to explain
 * what happened, and the only thing joining them is a word in a query string
 * that both ends must import from one place. The codes are a closed set so
 * that `?linear=` renders our words or nothing — never a stranger's.
 *
 * One honest gap, recorded here because it is this module's to record: the
 * default landing is `/settings`, which today reads `?google=` and knows
 * nothing of `?linear=`. The exits that carry a verified return path go back
 * to the panel that started them, which does render these codes — but the
 * two refusals that cannot trust their return path (`signed-out`,
 * `mismatch`) land on a screen that will say nothing about them. That is a
 * smaller wrong than inventing a landing page for one provider or trusting
 * an unverified path, and it ends when `/settings` grows a Linear section.
 */

/**
 * Where Linear sends a customer back, as a path. Identical in three places
 * at once — the callback URL on the OAuth application, the
 * `LINEAR_OAUTH_REDIRECT_URI` variable, and the route that answers — and the
 * provider compares byte for byte, so it is a named constant rather than a
 * literal in a paragraph.
 */
export const LINEAR_CALLBACK_PATH = "/api/linear/callback";

/** The screen a connect attempt begins and ends on when nothing better is
    known. See `google-outcome.ts` for why it is the settings screen: signed
    in, names the account, and the same screen a connection is undone from. */
export const LINEAR_SETTINGS_PATH = "/settings";

/** The query parameter carrying the code below. */
export const LINEAR_OUTCOME_PARAM = "linear";

/**
 * Every way the flow can end, named for what the person has to do next.
 *
 * The first group is this flow's own; the second is `LinearFailure` from
 * `lib/linear/result.ts`, spelled out rather than imported because that
 * module is `server-only` and this one must not be — the same arrangement,
 * for the same reason, as `google-outcome.ts`.
 */
export type LinearConnectOutcome =
  /** Stored. There is a working connection now. */
  | "connected"
  /** The token has been deleted from this deployment. */
  | "disconnected"
  /** They closed Linear's consent screen. Not a failure. */
  | "cancelled"
  /** No session, so there was no account to connect anything to. */
  | "signed-out"
  /** No encryption key, so storing a token was refused rather than done badly. */
  | "no-key"
  /** The `state` check failed: wrong browser, too slow, or not our redirect. */
  | "mismatch"
  /**
   * The consent worked and came from somebody who is not a workspace admin,
   * so the one thing this block does — inviting people — would be refused
   * every time. Nothing was stored. Linear's own peculiarity, the analogue
   * of Google's `personal-account`.
   */
  | "not-an-admin"
  /** Linear said yes and the store said no. */
  | "not-stored"
  /* --- straight from lib/linear --------------------------------------------- */
  | "not-configured"
  | "bad-credentials"
  | "unauthorized"
  | "invalid-request"
  | "rate-limited"
  | "rejected"
  | "unreachable";

/**
 * Where a finished connect attempt lands, with what to say about it.
 * Relative, so the caller resolves it against the request it is answering —
 * every source of an absolute host is either configuration or
 * attacker-controlled.
 */
export function linearLandingPath(outcome?: LinearConnectOutcome): string {
  if (!outcome) return LINEAR_SETTINGS_PATH;
  const params = new URLSearchParams({ [LINEAR_OUTCOME_PARAM]: outcome });
  return `${LINEAR_SETTINGS_PATH}?${params}`;
}
