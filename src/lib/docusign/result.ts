import "server-only";

/**
 * The vocabulary every call into DocuSign shares.
 *
 * Unverified: no DocuSign account has ever been connected through this code.
 * The reasons below are mapped from DocuSign's documented error strings, not
 * from errors a live account has returned — and DocuSign's documented set is
 * unusually thin (the authentication reference names three callback errors in
 * total), so a real tenant is very likely to teach `auth.ts` a string that is
 * not in it.
 *
 * Same contract as `src/lib/slack/result.ts` and `src/lib/google/result.ts`,
 * and deliberately its own copy rather than an import, for the reason the
 * Slack file argues: the reasons are named for the *fix*, and the fixes are
 * provider-shaped. Slack's `needs-reconnect` means "reinstall the app to the
 * workspace"; DocuSign's means "the refresh token has expired or consent was
 * revoked in Connected Apps, and an admin has to consent again". Sharing a
 * union would force every screen rendering one provider's failure to be
 * checked against the other's meaning, forever.
 *
 * This is the fourth copy of this shape, so it is worth saying what the third
 * and fourth have taught about extracting it: the *union members* differ every
 * time and the *structure* never does. Whoever finally extracts it should take
 * `{ ok: false; reason; message }` and the rule that library sentences go to
 * the log while customer sentences go to the screen, and leave each provider
 * its own list of reasons.
 *
 * Nothing in `src/lib/docusign` throws. Every operation returns one of these
 * and the type system makes the failure branch impossible to skip — the caller
 * that would forget the try/catch is the callback route that stores a standing
 * credential to somebody's contract system.
 */

export type DocusignFailure =
  /**
   * This deployment has no DocuSign application at all, or no environment
   * chosen. Nothing was attempted and nothing is wrong — it is the normal
   * state of every deployment until somebody registers an integration key.
   * Whoever runs the deployment fixes it, once, for everybody.
   */
  | "not-configured"
  /**
   * Configured, and *this account* has never connected DocuSign. Also not a
   * fault: it is where every account starts, and the fix is a customer
   * pressing Connect.
   */
  | "not-connected"
  /**
   * They connected and it has stopped working: the refresh token expired
   * (DocuSign's live around 30 days), or the admin revoked us under Connected
   * Apps. No retry fixes it — a person has to consent again. This is the
   * reason most likely to be seen in practice, because a connection that sits
   * unused between hires expires on its own.
   */
  | "needs-reconnect"
  /**
   * Our own integration key or secret is wrong — or, the version of this that
   * only DocuSign has: right key, wrong environment. Both are fixed in our
   * environment against the Apps and Keys page, not in the customer's account.
   */
  | "bad-credentials"
  /** The token is live and DocuSign refuses this action with it. */
  | "unauthorized"
  /**
   * DocuSign understood the request and says it is malformed. Includes the
   * expired authorisation code, which is a two-minute window here rather than
   * Slack's ten — see `auth.ts`.
   */
  | "invalid-request"
  /**
   * DocuSign's hourly or 30-second burst limits said stop. Worth its own
   * reason because the fix is only ever waiting: 3,000 requests an hour per
   * account by default, and `principal_throttled` on the userinfo endpoint.
   */
  | "rate-limited"
  /** DocuSign refused for a reason we don't have a name for, or fell over. */
  | "rejected"
  /** The request never got an answer. */
  | "unreachable";

export interface DocusignFailed {
  ok: false;
  reason: DocusignFailure;
  /**
   * Safe to show, and specific enough to act on. DocuSign's own error strings
   * never appear here — they go to the server log, where the person who can
   * act on them is already looking.
   */
  message: string;
}

export const fail = (
  reason: DocusignFailure,
  message: string,
): DocusignFailed => ({
  ok: false,
  reason,
  message,
});
