import "server-only";

/**
 * The vocabulary every call into Slack shares.
 *
 * Unverified: no Slack workspace has ever been connected through this code.
 * The reasons below are mapped from Slack's documented error strings, not from
 * errors a live workspace has actually returned — a real tenant is what
 * settles whether the mapping in `auth.ts` catches the failures that happen
 * rather than the ones the docs name.
 *
 * Same contract as `src/lib/google/result.ts`, and deliberately its own copy
 * rather than an import: the reasons are named for the fix, and the fixes are
 * provider-shaped. Google's `needs-reconnect` means "consent again at a screen
 * Google draws"; Slack's means "reinstall the app to the workspace". Sharing a
 * type would force every screen that renders one provider's failure to be
 * checked against the other's meaning, forever, to save a dozen lines. When a
 * third provider lands, the shape worth extracting is the *pattern* — result
 * object, reason named for the fix, customer sentence — not the union.
 *
 * Nothing in `src/lib/slack` throws. Every operation returns one of these and
 * the type system makes the failure branch impossible to skip — the caller
 * that would forget the try/catch is the callback route that stores a
 * standing credential to somebody's company chat.
 */

export type SlackFailure =
  /**
   * This deployment has no Slack app credentials at all. Nothing was
   * attempted, and nothing is wrong — it is the normal state of every
   * deployment until somebody registers an app at api.slack.com and sets the
   * environment. Whoever runs the deployment fixes it, once, for everybody.
   */
  | "not-configured"
  /**
   * Configured, and *this account* has never connected a Slack workspace.
   * Also not a fault: it is where every account starts, and the fix is a
   * customer pressing Connect, not anybody debugging.
   */
  | "not-connected"
  /**
   * They connected, and it has stopped working: the token was revoked or the
   * app was removed from the workspace. No retry fixes it — a person has to
   * install the app again.
   */
  | "needs-reconnect"
  /**
   * Our own client id or secret is wrong. Fixed in our environment against
   * the app config at api.slack.com, not in the customer's workspace.
   */
  | "bad-credentials"
  /** The token is live and Slack refuses this action with it. */
  | "unauthorized"
  /** Slack understood the request and says it is malformed. */
  | "invalid-request"
  /** Slack's tiered rate limits said stop. */
  | "rate-limited"
  /** Slack refused for a reason we don't have a name for, or fell over. */
  | "rejected"
  /** The request never got an answer. */
  | "unreachable";

export interface SlackFailed {
  ok: false;
  reason: SlackFailure;
  /**
   * Safe to show, and specific enough to act on. Slack's own error strings
   * never appear here — they go to the server log, where the person who can
   * act on them is already looking.
   */
  message: string;
}

export const fail = (reason: SlackFailure, message: string): SlackFailed => ({
  ok: false,
  reason,
  message,
});
