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
 * own errors are accurate and useless: `invalid_grant` is returned when a
 * customer disconnected us last week, when their password reset invalidated
 * our token, and when this machine's clock is wrong, and those are three
 * different conversations.
 *
 * Three of these reasons are not faults at all. They are the states a
 * multi-tenant integration spends most of its life in, and the product has to
 * be able to render them without going red.
 */

export type GoogleFailure =
  /**
   * This deployment has no Google OAuth client at all. Nothing was attempted,
   * and nothing is wrong.
   *
   * A first-class state, not an error. The showcase runs without Google
   * credentials almost all of the time, so a workflow that reaches the
   * "create a Workspace account" block on a machine with no OAuth client has
   * to be able to say "this step is waiting on a connection nobody has set up
   * yet" and carry on looking calm. Anything that renders this as red is
   * misrepresenting the product. Whoever runs this deployment fixes it, once,
   * for everybody.
   */
  | "not-configured"
  /**
   * The deployment is configured and *this customer* has never connected
   * their Google Workspace. Also not a fault: it is the state every account
   * is in before somebody presses the button. The fix is a customer clicking
   * "Connect Google Workspace" and consenting, not anybody debugging.
   */
  | "not-connected"
  /**
   * They connected, and it has stopped working. The stored refresh token was
   * revoked or has expired.
   *
   * The failure that defines this model, and the one a real customer will
   * actually hit: somebody removed the app at myaccount.google.com, or an
   * admin changed their password, or the OAuth client is still in "Testing"
   * and Google expired the grant after seven days, or nothing called it for
   * six months. It says "reconnect", not "error". No amount of retrying fixes
   * it and no log line helps — a person has to consent again.
   */
  | "needs-reconnect"
  /**
   * The deployment's own client id and secret are wrong, or this machine's
   * clock is far enough out that Google refuses the exchange. Distinct from
   * `unauthorized` because it is fixed in a different place by a different
   * person: this is our Cloud project, not the customer's tenant.
   */
  | "bad-credentials"
  /**
   * The connection is live and this action is not permitted. The consenting
   * user wasn't a Workspace super admin, the customer unticked the user
   * management permission on the consent screen, or the Admin SDK API is
   * switched off in the Cloud project.
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

type Outcome = { ok: boolean; reason?: GoogleFailure };

/**
 * Whether this is "nobody has connected Google yet" rather than a fault.
 *
 * Covers both halves of not-set-up — the deployment having no OAuth client,
 * and a customer who hasn't consented — because a screen that shows a
 * "Connect Google Workspace" button wants to show it in either case. The
 * reason itself still distinguishes them for anything that needs to say who
 * has to act.
 *
 * Exists so the UI doesn't have to spell the comparison at every call site
 * and get it subtly wrong at one of them. That branch is the calm one, and
 * every branch this excludes is a problem somebody has to solve.
 */
export function isWaitingOnSetup(result: Outcome): boolean {
  return (
    result.ok === false &&
    (result.reason === "not-configured" || result.reason === "not-connected")
  );
}

/**
 * Whether a live connection has gone stale and needs consenting again.
 *
 * Deliberately not folded into `isWaitingOnSetup`. The two states look
 * identical from the code's point of view and are completely different to the
 * person reading the screen: one is "you haven't done this yet", the other is
 * "the thing you did has stopped working, and until you redo it your new
 * starters aren't getting accounts". The second deserves to be noticed.
 */
export function needsReconnect(result: Outcome): boolean {
  return result.ok === false && result.reason === "needs-reconnect";
}
