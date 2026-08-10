import "server-only";

/**
 * The vocabulary every call into GitHub shares.
 *
 * Unverified: no GitHub organisation has ever been connected through this
 * code. The reasons below are mapped from GitHub's documented error responses
 * and status codes, not from errors a live organisation has returned — a real
 * install is what settles whether the mapping in `auth.ts` catches the
 * failures that happen rather than the ones the docs name.
 *
 * The fourth copy of this shape, and deliberately still its own copy rather
 * than an import. The argument `src/lib/slack/result.ts` makes holds exactly:
 * the reasons are named for the *fix*, and the fixes are provider-shaped.
 * Google's `needs-reconnect` means "consent again at a screen Google draws";
 * Slack's means "reinstall the app to the workspace"; GitHub's means "an
 * organisation owner has to authorise us again, and possibly reinstall the
 * App on the org" — two acts, not one, which is a distinction no shared union
 * could carry without every screen learning all four providers' meanings.
 *
 * Four copies is however the point at which "wait for a second flow" stops
 * being the honest answer. The pattern is now proven by repetition — result
 * object, reason named for the fix, one customer sentence — and what is worth
 * extracting is that pattern plus the handful of reasons every provider
 * genuinely shares (`not-configured`, `not-connected`, `unreachable`), with
 * the provider-specific ones left local. That extraction wants doing when the
 * first runner lands and these strings start being read by something other
 * than a redirect.
 *
 * One member here has no counterpart anywhere else, and it is the one this
 * provider's model forces: `not-installed`. A person can authorise this App
 * without ever putting it on their organisation, which produces a perfectly
 * valid token that can do nothing at all. Calling that `unauthorized` would
 * send an admin to check permissions that are fine; it needs its own word
 * because it needs its own sentence.
 *
 * Nothing in `src/lib/github` throws. Every operation returns one of these and
 * the type system makes the failure branch impossible to skip — the caller
 * that would forget the try/catch is the callback route that stores a standing
 * credential to somebody's source code.
 */

export type GitHubFailure =
  /**
   * This deployment has no GitHub App credentials at all. Nothing was
   * attempted, and nothing is wrong — it is the normal state of every
   * deployment until somebody registers an App at github.com/settings/apps and
   * sets the environment. Whoever runs the deployment fixes it, once, for
   * everybody.
   */
  | "not-configured"
  /**
   * Configured, and *this account* has never connected a GitHub organisation.
   * Also not a fault: it is where every account starts, and the fix is a
   * customer pressing Connect, not anybody debugging.
   */
  | "not-connected"
  /**
   * They authorised us, and the App is on no organisation we can see. The
   * token is real and useless. The fix is an install, and only an
   * organisation owner can do it.
   */
  | "not-installed"
  /**
   * They connected, and it has stopped working: the authorisation was revoked,
   * the App was uninstalled, or the refresh token passed its six months
   * unused. No retry fixes it — a person has to authorise again.
   */
  | "needs-reconnect"
  /**
   * Our own client id or secret is wrong. Fixed in our environment against the
   * App at github.com/settings/apps, not in the customer's organisation.
   */
  | "bad-credentials"
  /**
   * The token is live and GitHub refuses this action with it — the
   * installation lacks the permission, or the person is not an organisation
   * owner. Both are fixed inside the customer's organisation.
   */
  | "unauthorized"
  /** GitHub understood the request and says it is malformed. */
  | "invalid-request"
  /**
   * GitHub's primary or secondary rate limits said stop. Worth its own name
   * because GitHub's invitation endpoint has a documented daily cap as well
   * as a per-hour one, and "wait a minute" and "wait until tomorrow" are
   * different sentences.
   */
  | "rate-limited"
  /** GitHub refused for a reason we don't have a name for, or fell over. */
  | "rejected"
  /** The request never got an answer. */
  | "unreachable";

export interface GitHubFailed {
  ok: false;
  reason: GitHubFailure;
  /**
   * Safe to show, and specific enough to act on. GitHub's own error strings
   * never appear here — they go to the server log, where the person who can
   * act on them is already looking.
   */
  message: string;
}

export const fail = (reason: GitHubFailure, message: string): GitHubFailed => ({
  ok: false,
  reason,
  message,
});
