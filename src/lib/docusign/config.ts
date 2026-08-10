import "server-only";

/**
 * Our DocuSign application — the one set of credentials this deployment owns,
 * and the environment it is pointed at.
 *
 * Unverified: no DocuSign application has been registered for this deployment
 * and no DocuSign account has ever been connected. Every endpoint, parameter
 * and limit below is read out of DocuSign's own documentation on 10 August
 * 2026, not out of a response this code has received. A first live connection
 * has to prove: that the consent screen grants `signature extended` as asked;
 * that the token exchange accepts the Basic-auth header this deployment sends;
 * that `/oauth/userinfo` returns an account whose `base_uri` is what API calls
 * actually answer on; and that the callback's cancel code is really
 * `user_cancelled` rather than the `access_denied` every other provider in
 * this repo uses.
 *
 * ## What this block is for, and what it is deliberately not for
 *
 * The **employment contract**, and nothing else. Craig's own signing stays for
 * low-stakes acknowledgements — handbook read, code of conduct, IP assignment
 * — where a tick and a timestamp are proportionate. The contract is the
 * document that gets disputed, and what DocuSign sells that a tick cannot is
 * the tamper-evident seal, the certificate of completion and the audit trail:
 * evidence that survives somebody's lawyer. That is the whole argument for
 * this module existing, and it is why nothing here should ever grow a path
 * that lets the Craig-native signer take the contract.
 *
 * ## Two environments, two hosts, and the failure that does not look like one
 *
 * DocuSign runs a developer (demo) environment and a production environment on
 * **different hosts**, and they do not share users:
 *
 *   demo        https://account-d.docusign.com
 *   production  https://account.docusign.com
 *
 * Pointing at the wrong one is not a silent 500. Authenticating a production
 * user against the demo host gives `Issuer not found` — DocuSign's phrasing for
 * "that user does not exist in this environment" — which reads like the
 * customer's fault and is ours. That much is merely misleading.
 *
 * The genuinely silent failure is the other direction, and for this block it is
 * the important one: **a demo envelope is not a legally binding signature.**
 * DocuSign's own Go-Live page describes promotion to production as what enables
 * "sending of legally binding eSignature requests". An integration left pointed
 * at demo sends envelopes that arrive, get signed, and come back complete —
 * everything succeeds, the step closes, and the company is holding a test
 * document where an employment contract should be. Nobody finds out at the
 * time. They find out in the dispute this integration exists for.
 *
 * So the environment is an explicit variable with **no default**. A default is
 * exactly how a deployment ends up in demo without anybody choosing it, and the
 * cost of guessing wrong here is not an error page.
 *
 * ## The base URI is per account and must be discovered
 *
 * There is no single API host. Authentication is worldwide on one domain
 * (`account.docusign.com` for all production regions), but the *API* lives at
 * `https://{server}.docusign.net` where `{server}` is the customer's data
 * centre — `na3`, `na4`, `eu`, `au`, `ca`, and demo's own `demo.docusign.net`.
 * A customer in Frankfurt and a customer in Sydney are on different hosts.
 *
 * The only supported way to learn it is `GET /oauth/userinfo`, which returns an
 * `accounts[]` array, each entry carrying `account_id`, `account_name` and
 * `base_uri`. Every request is then built as
 *
 *   {base_uri}/restapi/v2.1/accounts/{account_id}/…
 *
 * Hardcoding `demo.docusign.net`, or assuming the first customer's region is
 * everyone's, works perfectly until the second customer — and then fails as a
 * 401 or a 404 that says nothing about regions. `auth.ts` therefore never
 * builds an API URL from a constant; it asks userinfo. DocuSign asks for the
 * answer to be cached for the session, and their limits are generous enough
 * that re-reading it per operation is affordable: 25,000 userinfo calls per
 * hour per user and 50,000 per hour per integration key, resetting on the
 * hour, `429 principal_throttled` past that.
 *
 * ## Production is gated on DocuSign's Go-Live review, and it is a real gate
 *
 * This integration cannot serve a single paying customer on a demo key, and
 * getting off one is not a switch we flip. DocuSign's process, as documented:
 *
 * - The integration key is **promoted** from a developer account into a
 *   production account, by a review DocuSign runs against the recorded API
 *   activity of that key in the demo environment. Statuses are Under Review,
 *   Review Passed, Review Expired (a pass not acted on within 90 days has to
 *   be re-earned) and Declined, where a manual review takes 24–48 hours.
 * - It requires a **paid production DocuSign account** to hold the key, and
 *   administrator access to it. Free developer accounts cannot hold a live
 *   integration.
 * - It requires choosing an **integration classification**, and the
 *   classification is not cosmetic — it decides both the review requirements
 *   and how envelopes are billed. Craig's model is the one DocuSign calls a
 *   **public integration**: many DocuSign customers authorising it against
 *   their own accounts. **Launching a public integration requires joining the
 *   DocuSign Partner Program.** That is a commercial agreement, not an
 *   afternoon's paperwork, and it is the largest single obstacle between this
 *   file and a customer using it.
 * - The key is **copied, not moved**, and its configuration is not copied with
 *   it: the secret key and every redirect URI must be created again by hand in
 *   the production account. A deployment that promotes the key and forgets the
 *   redirect URI fails with `Invalid RedirectUri` on the first real customer.
 *
 * None of that is something this repository can do, and none of it is implied
 * by this file compiling. Until it is done, this integration can only ever be
 * connected to a developer account, and everything it signs is a test.
 *
 * ## A faster way to check DocuSign's real behaviour than these docs
 *
 * DocuSign publishes MCP endpoints — `https://mcp-d.docusign.com/mcp` (demo)
 * and `https://mcp.docusign.com/mcp` (production). They are not part of this
 * block's architecture and must not become part of it: an MCP server is a tool
 * surface for an agent acting as one authenticated user, where this block needs
 * the server acting for many customers at once, which is OAuth plus REST. What
 * they are is a much cheaper way to *verify* API shapes than reading the
 * documentation and hoping — envelope fields, status vocabulary, and the
 * per-account base URI above are all one call away for somebody holding an
 * account. Probed unauthenticated on 10 August 2026: the demo endpoint answers
 * `403 RBAC: access denied`, so it needs a real interactive sign-in and could
 * not be used to settle anything here.
 *
 * ## The environment
 *
 *   DOCUSIGN_INTEGRATION_KEY  the OAuth `client_id`, called an Integration Key
 *                             everywhere in DocuSign's console
 *   DOCUSIGN_SECRET_KEY       the client secret, called a Secret Key there
 *   DOCUSIGN_OAUTH_REDIRECT_URI  absolute https, matching a redirect URI
 *                             registered against the key *in that environment*
 *   DOCUSIGN_ENVIRONMENT      `demo` or `production`, no default
 *
 * The first two are named the way DocuSign's own screens name them, rather
 * than the `CLIENT_ID`/`CLIENT_SECRET` of the Slack and Linear blocks. That is
 * a deliberate break from the neighbours: whoever fills these in is copying
 * values off the Apps and Keys page, and matching the words on that page is
 * worth more than matching the words in the next file along.
 *
 * None of them are NEXT_PUBLIC_, and two of them never can be.
 */

/**
 * Space-separated on the authorize URL, which is DocuSign's spelling — Slack
 * wants commas for the same parameter. Recorded rather than assumed because
 * the two blocks sit next to each other and the wrong separator produces a
 * consent screen that grants the wrong thing rather than an error.
 *
 *   signature  create and send envelopes, and open signing sessions. The
 *              eSignature API's base scope; without it there is no contract.
 *   extended   issues a refresh token whose replacement carries a *full*
 *              lifetime on every refresh. Without it a refresh still works but
 *              the new token inherits the original's expiry, so the connection
 *              dies about 30 days after it was first made no matter how often
 *              it is used — which for onboarding means the connection made in
 *              January is dead for the March starter.
 *
 * `impersonation` is deliberately absent: it belongs to JWT Grant, where an
 * application acts as a user with no user present. Every envelope this block
 * would send has a real admin behind it who consented, which is the flow whose
 * audit trail says something true.
 */
export const SCOPES = ["signature", "extended"] as const;

/**
 * The one a future runner cannot work without, checked against what DocuSign
 * actually granted. The consent screen is approve-all today, but the key's
 * configuration at DocuSign can drift from this file, and a connection stored
 * without `signature` would fail weeks later inside a runner, on somebody's
 * first morning, with an error naming nothing.
 */
export const SIGNATURE_SCOPE = "signature";

/** Which of DocuSign's two worlds this deployment talks to. */
export type DocusignEnvironment = "demo" | "production";

/**
 * The account server per environment. Authentication only — never an API host.
 * DocuSign is explicit that production authentication is the single worldwide
 * `account.docusign.com` while the API is regional, which is the whole reason
 * `base_uri` has to come from userinfo instead of from a table like this one.
 */
const ACCOUNT_SERVER: Record<DocusignEnvironment, string> = {
  demo: "https://account-d.docusign.com",
  production: "https://account.docusign.com",
};

export interface DocusignClient {
  /** The Integration Key. Travels in the authorize URL, so it is not secret. */
  integrationKey: string;
  /** Never logged, never returned to a browser, never in a redirect. */
  secretKey: string;
  redirectUri: string;
  environment: DocusignEnvironment;
  /** `https://account-d.docusign.com` or `https://account.docusign.com`. */
  accountServer: string;
}

export type ClientResult =
  | { configured: true; client: DocusignClient }
  | {
      configured: false;
      /** The variables that are missing, or set to something unusable. */
      incomplete: string[];
      /** Safe to show. Names the situation, never a value. */
      message: string;
    };

const INTEGRATION_KEY = "DOCUSIGN_INTEGRATION_KEY";
const SECRET_KEY = "DOCUSIGN_SECRET_KEY";
const REDIRECT_URI = "DOCUSIGN_OAUTH_REDIRECT_URI";
const ENVIRONMENT = "DOCUSIGN_ENVIRONMENT";

/**
 * Same rule as Slack and Google: the redirect is configuration, never derived
 * from the request. DocuSign compares it against the list registered for the
 * key and refuses any drift — "The redirect URI strings must match exactly,
 * including space and slash characters" — so a value built from `Host`, which
 * an attacker controls, would be both broken and a way to steer where an
 * authorisation code lands.
 *
 * https is required here rather than merely preferred. DocuSign documents no
 * loopback exception, so local development needs a tunnel; enforcing it now
 * turns that into a sentence on our own screen instead of DocuSign's error
 * page after somebody has already left the site.
 */
function usableRedirect(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function readEnvironment(raw: string): DocusignEnvironment | null {
  return raw === "demo" || raw === "production" ? raw : null;
}

/**
 * The application's credentials and environment, or a precise account of what
 * is missing.
 *
 * Not cached — four string reads — so adding the variables and restarting is
 * the whole setup loop. The nothing-set and some-set messages differ on
 * purpose: nothing set is the normal state of this repo and deserves calm,
 * while some set is almost always a typo in a variable name, and that person
 * needs the name.
 */
export function docusignClient(): ClientResult {
  const integrationKey = process.env[INTEGRATION_KEY]?.trim() ?? "";
  const secretKey = process.env[SECRET_KEY]?.trim() ?? "";
  const redirectUri = process.env[REDIRECT_URI]?.trim() ?? "";
  const environmentRaw = process.env[ENVIRONMENT]?.trim() ?? "";

  const incomplete: string[] = [];
  if (!integrationKey) incomplete.push(INTEGRATION_KEY);
  if (!secretKey) incomplete.push(SECRET_KEY);
  if (!redirectUri) incomplete.push(REDIRECT_URI);
  if (!environmentRaw) incomplete.push(ENVIRONMENT);

  if (incomplete.length === 4) {
    return {
      configured: false,
      incomplete,
      message:
        "DocuSign isn't set up on this deployment, so nothing was attempted. It needs an integration key from a DocuSign developer account — see .env.example for DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_SECRET_KEY, DOCUSIGN_OAUTH_REDIRECT_URI and DOCUSIGN_ENVIRONMENT.",
    };
  }

  if (incomplete.length > 0) {
    return {
      configured: false,
      incomplete,
      message: `DocuSign is half set up: ${incomplete.join(", ")} ${incomplete.length === 1 ? "is" : "are"} missing from the environment. Add ${incomplete.length === 1 ? "it" : "them"} and restart the server so the value is re-read.`,
    };
  }

  const environment = readEnvironment(environmentRaw);
  if (!environment) {
    /* Refused rather than defaulted. A default here is how a deployment ends
       up sending demo envelopes as employment contracts — see the header. */
    return {
      configured: false,
      incomplete: [ENVIRONMENT],
      message: `${ENVIRONMENT} has to be exactly "demo" or "production". There is no default, on purpose: the two are different hosts with different users, and a deployment pointed at demo by accident sends contracts that look signed and are not legally binding.`,
    };
  }

  if (!usableRedirect(redirectUri)) {
    return {
      configured: false,
      incomplete: [REDIRECT_URI],
      message: `${REDIRECT_URI} has to be an absolute https:// URL — DocuSign allows no localhost exception, so local development needs a tunnel — and it has to match a redirect URI registered against the integration key in this same environment, character for character.`,
    };
  }

  return {
    configured: true,
    client: {
      integrationKey,
      secretKey,
      redirectUri,
      environment,
      accountServer: ACCOUNT_SERVER[environment],
    },
  };
}

/**
 * Can anybody connect DocuSign on this deployment, without going near a
 * secret. Names of missing variables only — they are documentation — for the
 * route that has to explain why there is no Connect button.
 *
 * `environment` rides along because it is the one piece of this configuration
 * a customer-facing screen has a legitimate reason to show: "connected to
 * DocuSign's demo environment" is the difference between a contract and a
 * rehearsal, and hiding it would be hiding the thing most worth checking.
 */
export function docusignSetupStatus(): {
  available: boolean;
  missing: string[];
  environment: DocusignEnvironment | null;
} {
  const result = docusignClient();
  return result.configured
    ? { available: true, missing: [], environment: result.client.environment }
    : { available: false, missing: result.incomplete, environment: null };
}
