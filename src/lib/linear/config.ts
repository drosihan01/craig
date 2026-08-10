import "server-only";

/**
 * Our Linear OAuth application — the one set of credentials this deployment
 * owns.
 *
 * Unverified: no Linear OAuth application has been registered and no
 * workspace has ever been connected. The variable names, the scope list and
 * the redirect rules below follow Linear's OAuth documentation; a live
 * connection still has to prove all of it.
 *
 * The same two-party split as `src/lib/google/config.ts`, and the same rule:
 * this file holds *our* application's identity with Linear — one client id
 * and secret, registered once at linear.app/settings/api/applications, shared
 * by every customer. It never holds a customer's credentials; those arrive
 * per account when somebody presses "Connect Linear" and live sealed in the
 * connections table (`store.ts`).
 *
 * The environment is:
 *
 *   LINEAR_OAUTH_CLIENT_ID       from the OAuth application in Linear's
 *                                workspace API settings
 *   LINEAR_OAUTH_CLIENT_SECRET   the secret issued with it
 *   LINEAR_OAUTH_REDIRECT_URI    the absolute https:// URL Linear sends the
 *                                customer back to, matching one of the
 *                                application's configured callback URLs.
 *                                Always the stable alias
 *                                https://craig-alpha.vercel.app/api/linear/callback
 *                                in production — never a per-build URL, which
 *                                re-breaks on every deploy.
 *
 * None of them are NEXT_PUBLIC_, and one of them never can be.
 */

/**
 * The scopes the consent screen asks for, and no more.
 *
 * `read` because Linear's docs say it is always present anyway, and it is
 * what the identity query after the exchange runs on — which workspace this
 * is, and which admin consented, neither of which Linear puts in the token
 * response.
 *
 * `admin` because it is the reason this connection exists. The block's job is
 * inviting a new starter to the customer's workspace, and the mutation that
 * does that — `organizationInviteCreate` in Linear's public GraphQL schema —
 * is an admin action in the product: Linear's own docs say only admins can
 * invite members on paid plans. Linear documents `admin` as "full access to
 * admin level endpoints" and warns never to ask for it unless absolutely
 * needed; inviting members is the absolutely-needed case.
 *
 * Two things the docs leave genuinely unsettled, recorded here because only
 * a live call settles them: Linear publishes no per-mutation scope table, so
 * "`admin` suffices for `organizationInviteCreate`" is an inference from the
 * scope's description rather than a documented fact — and whether that
 * mutation is callable by an OAuth application at all, as opposed to a
 * workspace admin's personal API key, is asserted nowhere either way. The
 * mutation is in the public schema and not marked INTERNAL, which is
 * evidence, not proof.
 */
export const SCOPES = ["read", "admin"] as const;

/** The one that actually matters. Checked against what Linear grants. */
export const ADMIN_SCOPE = "admin";

/**
 * Comma-separated, not space-separated, and this is exactly the kind of
 * one-character difference that costs an afternoon. OAuth's convention — and
 * Google's — is spaces; Linear's authorize endpoint documents "comma
 * separated list of scopes". A space-joined list here would read as one
 * unknown scope and fail at the consent screen, after the customer has
 * already been sent away.
 */
export const scopeParameter = (): string => SCOPES.join(",");

export interface OAuthClient {
  clientId: string;
  /** Never logged, never returned to a browser, never in a redirect. */
  clientSecret: string;
  redirectUri: string;
}

export type ClientResult =
  | { configured: true; client: OAuthClient }
  | {
      configured: false;
      /** The variables that are missing, or set to something unusable. */
      incomplete: string[];
      /** Safe to show. Says which of the situations below this is. */
      message: string;
    };

const CLIENT_ID = "LINEAR_OAUTH_CLIENT_ID";
const CLIENT_SECRET = "LINEAR_OAUTH_CLIENT_SECRET";
const REDIRECT_URI = "LINEAR_OAUTH_REDIRECT_URI";

/**
 * The redirect URI is configuration, not something derived from the request.
 * The two reasons are Google's (`src/lib/google/config.ts`): the provider
 * compares it byte for byte against what the application registered, so a
 * derived value is a guess that has to come out exactly right — and `Host` is
 * attacker-controlled, so deriving from it lets a crafted header steer where
 * an authorisation code is sent.
 */
function usableRedirect(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol === "https:") return true;
  return (
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  );
}

/**
 * The OAuth application, or a precise account of what is missing.
 *
 * Deliberately not cached, and the failure messages are different on purpose
 * — both arguments are made in full on Google's `oauthClient` and hold here
 * unchanged. Nothing set is the normal state of this repo and reads calmly;
 * some set is almost always a typo in a variable name, and that person needs
 * the missing one named.
 */
export function oauthClient(): ClientResult {
  const clientId = process.env[CLIENT_ID]?.trim() ?? "";
  const clientSecret = process.env[CLIENT_SECRET]?.trim() ?? "";
  const redirectUri = process.env[REDIRECT_URI]?.trim() ?? "";

  const incomplete: string[] = [];
  if (!clientId) incomplete.push(CLIENT_ID);
  if (!clientSecret) incomplete.push(CLIENT_SECRET);
  if (!redirectUri) incomplete.push(REDIRECT_URI);

  if (incomplete.length === 3) {
    return {
      configured: false,
      incomplete,
      message:
        "Linear isn't set up on this deployment, so nothing was attempted. It needs an OAuth application — see .env.example for LINEAR_OAUTH_CLIENT_ID, LINEAR_OAUTH_CLIENT_SECRET and LINEAR_OAUTH_REDIRECT_URI.",
    };
  }

  if (incomplete.length > 0) {
    return {
      configured: false,
      incomplete,
      message: `Linear is half set up: ${incomplete.join(", ")} ${incomplete.length === 1 ? "is" : "are"} missing from the environment. Add ${incomplete.length === 1 ? "it" : "them"} and restart the server so the value is re-read.`,
    };
  }

  if (!usableRedirect(redirectUri)) {
    return {
      configured: false,
      incomplete: [REDIRECT_URI],
      message: `${REDIRECT_URI} has to be an absolute https:// URL — http:// only on localhost — and it has to match one of the callback URLs on the Linear OAuth application character for character.`,
    };
  }

  return { configured: true, client: { clientId, clientSecret, redirectUri } };
}

/**
 * Can anybody connect Linear on this deployment, without going near a secret.
 * Returns the *names* of missing variables — documentation, not secrets — for
 * the route that has to explain why a Connect button isn't there. What it
 * does not answer: whether a particular customer has connected. That lives
 * with the account.
 */
export function linearSetupStatus(): {
  available: boolean;
  missing: string[];
} {
  const result = oauthClient();
  return result.configured
    ? { available: true, missing: [] }
    : { available: false, missing: result.incomplete };
}
