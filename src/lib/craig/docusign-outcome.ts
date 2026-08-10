import { SETTINGS_PATH } from "./google-outcome";

/**
 * What the DocuSign connect flow says to the screen it lands back on.
 *
 * Unverified: no DocuSign connect has ever landed anywhere, so no screen has
 * yet rendered any of these codes off a real redirect. Deliberately not
 * `server-only`, for the reason `google-outcome.ts` gives: the route ends the
 * flow by redirecting with a code, a client component explains the code, and
 * two spellings of that code drift into a connection that worked reporting
 * nothing at all. Both ends import from here.
 *
 * The codes are a closed set for the same reason the others are: `?docusign=`
 * renders whatever a stranger puts in it if the screen trusts the words, so
 * the words on the screen are ours and the URL only ever carries a key into
 * that table.
 *
 * The same honest gap the Slack flow records applies here: the default landing
 * is `/settings`, which grew up around the Google connection and does not
 * render DocuSign outcomes. The normal path never sees it, because the Connect
 * button always sends `?from=` and comes back to the block panel, which does.
 * The exits that refuse before the state verifies land on a calm settings page
 * with a code in the URL that renders as nothing. Wrong to leave forever, safe
 * while nothing can be connected, and the fix belongs with a DocuSign row on
 * the settings screen rather than with a hack here.
 */

/**
 * Where DocuSign sends the customer back, as a path. Has to match the redirect
 * URI registered against the integration key, the
 * `DOCUSIGN_OAUTH_REDIRECT_URI` variable, and the directory holding the
 * callback's `route.ts` — and, once the key is promoted, the *separate* copy of
 * that redirect URI which has to be created by hand in the production account,
 * because DocuSign does not copy configuration with the key. Four places, which
 * is one more than any other provider here, and the reason this is a named
 * constant rather than a literal in a paragraph.
 */
export const DOCUSIGN_CALLBACK_PATH = "/api/docusign/callback";

/** The query parameter carrying the code below. */
export const DOCUSIGN_OUTCOME_PARAM = "docusign";

/**
 * Every way the flow can end, named for what the person has to do next. The
 * first group is this flow's own; the second is `DocusignFailure` from
 * `lib/docusign/result.ts`, passed straight through because those names are
 * already chosen for the fix.
 */
export type DocusignConnectOutcome =
  /** Stored. There is a working connection now. */
  | "connected"
  /**
   * Our copy is deleted. Deliberately not called "revoked": DocuSign has no
   * endpoint an application can use to hand a permission back, so the consent
   * may well still exist at their end. The panel's copy for this code is the
   * one place a customer is told where to finish the job.
   */
  | "disconnected"
  /** They pressed Cancel on DocuSign's consent screen. Not a failure. */
  | "cancelled"
  /** No session, so there was no account to connect anything to. */
  | "signed-out"
  /** No encryption key, so storing a token was refused rather than done badly. */
  | "no-key"
  /** The `state` check failed: wrong browser, too slow, or not our redirect. */
  | "mismatch"
  /** DocuSign said yes and the store said no. */
  | "not-stored"
  /* --- straight from lib/docusign ------------------------------------------ */
  | "not-configured"
  | "not-connected"
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
export function docusignLandingPath(outcome?: DocusignConnectOutcome): string {
  if (!outcome) return SETTINGS_PATH;
  const params = new URLSearchParams({ [DOCUSIGN_OUTCOME_PARAM]: outcome });
  return `${SETTINGS_PATH}?${params}`;
}
