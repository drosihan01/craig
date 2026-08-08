import "server-only";

/**
 * The vocabulary every call into Google shares.
 *
 * Nothing in `src/lib/google` throws. A caller that has to remember a
 * try/catch around a network call is a caller that will one day forget, and
 * the thing it forgets around is the block that creates somebody's email
 * account on their first morning. So every operation returns one of these,
 * and the type system makes the failure branch impossible to skip.
 *
 * The reasons are named for the fix, not for the status code — the same
 * argument `src/lib/email/send.ts` makes, and for the same reason. Google's
 * own errors are accurate and useless: `403 Not Authorized to access this
 * resource/api` is returned both when nobody has granted the service account
 * its scopes in the Admin console and when the Admin SDK API was never
 * enabled in the Cloud project, and those are different afternoons.
 */

export type GoogleFailure =
  /**
   * No credentials in the environment. Nothing was attempted, and nothing is
   * wrong.
   *
   * This is a first-class state, not an error. The showcase runs without
   * Google credentials almost all of the time, so a workflow that reaches the
   * "create a Workspace account" block on a machine with no service account
   * has to be able to say "this step is waiting on a connection nobody has
   * set up yet" and carry on looking calm. Anything that renders this as red
   * is misrepresenting the product.
   */
  | "not-configured"
  /**
   * Credentials are present and something refuses them outright: a private
   * key that isn't a key, a key that doesn't match the service account, an
   * impersonated address that doesn't exist in the tenant, a clock far enough
   * out that the assertion is rejected as stale.
   *
   * Split from `unauthorized` on purpose. "Your key is wrong" and "your key
   * is fine but nobody granted it this scope" are fixed in two different
   * consoles by two different people, and collapsing them sends whoever is
   * debugging to the wrong one.
   */
  | "bad-credentials"
  /**
   * The credentials are good and this action is not permitted. Domain-wide
   * delegation not granted for the scope, the impersonated user isn't a super
   * admin, or the Admin SDK API is switched off in the Cloud project.
   */
  | "unauthorized"
  /** That address is already a Google account. */
  | "already-exists"
  /**
   * There is no such user. For a lookup this is an answer rather than a
   * fault: it is what you get for an address that was never created, or for
   * one asked about in the seconds before Google's backends agree it exists.
   */
  | "no-such-user"
  /** The tenant is out of seats or licences. Somebody has to buy one. */
  | "quota-exhausted"
  /** Google understood the request and says it is malformed. */
  | "invalid-request"
  /** Too fast, or the daily allowance is gone. */
  | "rate-limited"
  /** Google refused for a reason we don't have a name for, or fell over. */
  | "rejected"
  /** The request never got an answer. */
  | "unreachable";

export interface GoogleFailed {
  ok: false;
  reason: GoogleFailure;
  /**
   * Safe to show, and specific enough to act on. Google's own words never
   * appear here — they go to the server log, where the person who can act on
   * them is already looking.
   */
  message: string;
  /** Seconds, when Google says how long to wait. */
  retryAfter?: number;
}

export const fail = (
  reason: GoogleFailure,
  message: string,
  retryAfter?: number,
): GoogleFailed => ({ ok: false, reason, message, retryAfter });

/**
 * Whether a failure is really just "nobody has connected Google yet".
 *
 * Exists so the UI doesn't have to spell `result.reason === "not-configured"`
 * at every call site and get it subtly wrong at one of them. The difference
 * matters: this is the branch that shows a calm "waiting on a connection"
 * state, and every other branch is a problem somebody has to solve.
 */
export function isWaitingOnSetup(result: {
  ok: boolean;
  reason?: GoogleFailure;
}): boolean {
  return result.ok === false && result.reason === "not-configured";
}
