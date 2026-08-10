import "server-only";

/**
 * The vocabulary every call into Linear shares.
 *
 * Unverified: no Linear workspace has ever been connected. Every reason below
 * is taken from Linear's OAuth documentation and the standard OAuth error
 * codes, not from a response — a live tenant still has to prove that Linear's
 * refusals actually arrive under these names.
 *
 * The contract is `src/lib/google/result.ts`'s, argued at length there:
 * nothing in `src/lib/linear` throws, every operation returns a result the
 * type system won't let a caller skip the failure branch of, and the reasons
 * are named for the fix rather than for the status code.
 *
 * The set is smaller than Google's, and that is honesty rather than
 * oversight. Google's vocabulary covers a directory API this product actually
 * calls; Linear has no runner yet, so the only operations that exist are the
 * consent URL, the code exchange, one identity query and a revocation. Two
 * names Google has are deliberately absent until something produces them:
 * `not-connected` lives in the store's own result (`store.ts`), which is
 * where "this account never consented" is discovered, and `needs-reconnect`
 * belongs to the refresh grant — the first thing a runner must build, since
 * Linear access tokens die after 24 hours — and listing it now would be a
 * state no code can reach. A reason nothing returns is worse than a missing
 * one, because a screen would grow a branch for it that can never be seen.
 */

export type LinearFailure =
  /**
   * This deployment has no Linear OAuth application at all. Nothing was
   * attempted, and nothing is wrong — the same first-class calm state as
   * Google's. Whoever runs the deployment fixes it, once, for everybody.
   */
  | "not-configured"
  /**
   * Our own client id or secret is wrong. Fixed in Linear's developer
   * settings and this environment, by whoever runs the deployment — never by
   * the customer, which is why the message must not read like their problem.
   */
  | "bad-credentials"
  /**
   * The token is live and this action is not permitted — the `admin` scope
   * was declined on the consent screen, or Linear will not grant it to this
   * application at all. See `config.ts` for why that scope is the load-bearing
   * one.
   */
  | "unauthorized"
  /** Linear understood the request and says it is malformed or spent. */
  | "invalid-request"
  /** Too fast. Linear rate limits OAuth apps per application and per user. */
  | "rate-limited"
  /** Linear refused for a reason we don't have a name for, or fell over. */
  | "rejected"
  /** The request never got an answer. */
  | "unreachable";

export interface LinearFailed {
  ok: false;
  reason: LinearFailure;
  /**
   * Safe to show, and specific enough to act on. Linear's own words never
   * appear here — they go to the server log, where the person who can act on
   * them is already looking.
   */
  message: string;
}

export const fail = (reason: LinearFailure, message: string): LinearFailed => ({
  ok: false,
  reason,
  message,
});
