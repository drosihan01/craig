import "server-only";

/**
 * Our GitHub App — the one set of credentials this deployment owns.
 *
 * Unverified: no GitHub App has been registered for this deployment and no
 * organisation has ever been connected. Every URL, parameter name and
 * permission string below comes from GitHub's REST and Apps documentation
 * read on 10 August 2026, not from a response this code has received. What a
 * first live connection still has to prove is listed at the bottom of this
 * comment, and it is not a short list.
 *
 * ## GitHub App, not OAuth App — and what that costs
 *
 * GitHub offers two kinds of registration and they are not two spellings of
 * one thing. The choice here is a **GitHub App**, for one reason that
 * outweighs everything else and two that support it:
 *
 * **The permission this block needs has a name, and only a GitHub App can ask
 * for just that name.** `POST /orgs/{org}/invitations` is documented as
 * needing "Members" organisation permissions (write). An OAuth App has no
 * such granularity: the nearest scope is `admin:org`, which is full
 * administration of *every* organisation the consenting person administers —
 * deleting teams, changing billing, rewriting org settings, removing members,
 * managing webhooks. To send one invitation we would be asking a customer to
 * hand this deployment the keys to their whole GitHub organisation, on a
 * consent screen that says exactly that. A GitHub App asks for
 * `members: write` on one organisation, and the screen says exactly that
 * instead. For a product whose entire pitch is "let a tool do the joining
 * paperwork", the size of that consent screen is the product.
 *
 * **It survives the person who set it up.** An OAuth authorisation is a
 * grant by a human, and it dies when that human loses their org membership —
 * which for an onboarding tool is the worst possible expiry trigger, and the
 * same argument `src/lib/slack/config.ts` makes for taking a bot token
 * instead of a user token. A GitHub App is installed *on the organisation*.
 * The installation outlives the installer.
 *
 * **The org can see and revoke it as a thing.** An installed app appears in
 * the organisation's own settings with its permission list and can be removed
 * there. An OAuth authorisation is buried in one person's account settings.
 *
 * Now the honest cost, because there is a real one and it is not small:
 *
 * - **A GitHub App's user access token expires after 8 hours**, with a
 *   refresh token good for 6 months, and every refresh rotates *both* halves.
 *   An OAuth App's token does not expire at all. So this integration takes on
 *   a rotation problem Slack's does not have and Linear's does — see
 *   `store.ts` for what that means for what gets sealed, and note that a
 *   connection nobody touches for six months is simply gone.
 * - **The credential that genuinely never expires is not reachable by
 *   OAuth.** An *installation* access token — the server-to-server one, minted
 *   from the App's private key as a signed JWT plus the installation id, good
 *   for an hour, renewable forever with no human anywhere — is the right
 *   credential for a runner that fires at 6am on somebody's start date. It is
 *   deliberately not built here: it needs an RSA private key in the
 *   environment and a JWT signer, this slice has no runner to use it, and
 *   shipping a second unproven credential path to sit unused would be two
 *   things to debug on first contact instead of one. The user token is enough
 *   to prove the connection works and to name what was connected. Whoever
 *   writes the runner should expect to add the installation path rather than
 *   to refresh user tokens forever.
 * - **Two acts, not one.** Authorising the app (a person) and installing it
 *   (an organisation) are separate in GitHub's model, and an admin can do
 *   either without the other. A user token from an account with no
 *   installation on the org can call nothing useful. That is why
 *   `GITHUB_APP_SLUG` is required below: without the app's public slug there
 *   is no URL to send anybody to install it, and a connection screen that can
 *   only ever produce a useless token is worse than no screen.
 *
 * ## What the App must be configured with at github.com
 *
 * Organisation permission **Members: read and write** — the one the invite
 * needs. Nothing else is requested: no repository permissions at all, because
 * this block invites people to an organisation and joins them to teams, and
 * a repository permission on the consent screen would be asking for something
 * the block does not do. "Request user authorization (OAuth) during
 * installation" should be on, so an admin who installs the app is returned
 * here with a `code` in the same pass rather than being sent round twice.
 *
 * ## The environment
 *
 *   GITHUB_APP_CLIENT_ID       the App's client id (`Iv1.…` or `Iv23…`), from
 *                              the App's own settings page. Deliberately
 *                              named APP rather than OAUTH: a GitHub App's
 *                              client id and an OAuth App's live on different
 *                              settings screens and are not interchangeable,
 *                              and the variable name is the cheapest place to
 *                              say which one this is.
 *   GITHUB_APP_CLIENT_SECRET   issued with it. Never logged, never in a
 *                              redirect, never NEXT_PUBLIC_.
 *   GITHUB_APP_SLUG            the App's public name in a URL —
 *                              github.com/apps/<slug> — which is what an
 *                              install link is built from. Not a secret; it is
 *                              in the URL bar of anybody who installs it.
 *   GITHUB_OAUTH_REDIRECT_URI  the absolute https:// URL GitHub sends the
 *                              admin back to, matching the Callback URL on
 *                              the App config. Production is
 *                              https://craig-alpha.vercel.app/api/github/callback
 *                              — the stable alias, never a per-build URL,
 *                              which has already cost this repo a day once
 *                              (see craig-integration-block-tips).
 *
 * ## What a live organisation still has to prove
 *
 * That the authorize URL built in `auth.ts` is one GitHub accepts for a
 * GitHub App; that the callback really does carry `installation_id` and
 * `setup_action` alongside `code` when authorisation-during-installation is
 * enabled; that `GET /user/installations` returns the installation's
 * permission map in the shape `store.ts` records; that `members: write` on
 * the installation plus an org *owner* consenting is genuinely enough for
 * `POST /orgs/{org}/invitations`, which documents both requirements
 * separately and neither of which we can check from here.
 */

/**
 * The REST API version this code was written against, sent on every call.
 *
 * GitHub currently supports two: `2022-11-28` (the default when the header is
 * absent, supported until March 2028) and `2026-03-10` (the latest). Pinned
 * rather than omitted for the reason every dated API is pinned — "the default"
 * is a value that changes underneath you, on GitHub's schedule rather than
 * ours, and the failure lands in a route nobody is watching. `2022-11-28` is
 * chosen over the newer one deliberately: it is the version the endpoint
 * documentation this module was written from describes, and none of
 * `2026-03-10`'s published breaking changes touch organisation invitations or
 * the token endpoints. Moving to it is a one-line change somebody makes on
 * purpose after reading that list again.
 */
export const API_VERSION = "2022-11-28";

/** GitHub's REST host. The OAuth endpoints are on github.com, not here. */
export const API_ORIGIN = "https://api.github.com";

/**
 * The installation permission the whole block rests on, as GitHub names it in
 * an installation's `permissions` map: the key, and the level.
 *
 * Checked after the exchange the way the Slack block checks `channels:manage`
 * — the App's permissions at github.com can drift from this file, an admin
 * can approve an older permission set than the one currently requested, and a
 * connection installed with yesterday's permissions would fail weeks later
 * inside a runner, on a real person's first morning, pointing at nothing.
 */
export const MEMBERS_PERMISSION = "members";
export const MEMBERS_LEVEL = "write";

export interface GitHubApp {
  clientId: string;
  /** Never logged, never returned to a browser, never in a redirect. */
  clientSecret: string;
  /** github.com/apps/<slug> — public, and the only route to an install. */
  slug: string;
  redirectUri: string;
}

export type AppResult =
  | { configured: true; app: GitHubApp }
  | {
      configured: false;
      /** The variables that are missing, or set to something unusable. */
      incomplete: string[];
      /** Safe to show. Names the situation, never a value. */
      message: string;
    };

const CLIENT_ID = "GITHUB_APP_CLIENT_ID";
const CLIENT_SECRET = "GITHUB_APP_CLIENT_SECRET";
const APP_SLUG = "GITHUB_APP_SLUG";
const REDIRECT_URI = "GITHUB_OAUTH_REDIRECT_URI";

const REQUIRED = [CLIENT_ID, CLIENT_SECRET, APP_SLUG, REDIRECT_URI];

/**
 * The redirect URI is configuration, never derived from the request. Both
 * reasons are Google's and hold unchanged: GitHub compares the value against
 * the Callback URL on the App config and refuses drift, so a derived value is
 * a guess that has to come out exactly right — and `Host` is
 * attacker-controlled, so building the redirect from it lets a crafted header
 * steer where an authorisation code is sent.
 *
 * http on loopback is allowed, unlike Slack's rule. GitHub documents
 * `http://127.0.0.1` and `http://localhost` callback URLs as acceptable for
 * local development, so refusing them here would force a tunnel for no reason
 * GitHub itself gives.
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
 * A slug that can go in a URL path without being escaped into something else.
 *
 * GitHub derives the slug from the App's display name and documents it as
 * lowercase with dashes, which is the kind of "obvious" rule the Google block
 * learned to distrust — its channel ids were documented as opaque and turned
 * out to enforce a charset. So this checks the shape rather than trusting it,
 * and the cost of being wrong is only a refusal with the variable named.
 * Anything with a slash, a dot or a space in it would silently build an
 * install link pointing somewhere else entirely.
 */
function usableSlug(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,38}$/.test(value);
}

/**
 * The App's credentials, or a precise account of what is missing.
 *
 * Not cached — four string reads — so adding the variables and restarting is
 * the whole setup loop. The nothing-set and some-set messages differ for the
 * reason Google's `oauthClient` gives: nothing set is the normal state of this
 * repo and deserves calm; some set is almost always a typo in a variable name,
 * and that person needs the name.
 */
export function githubApp(): AppResult {
  const clientId = process.env[CLIENT_ID]?.trim() ?? "";
  const clientSecret = process.env[CLIENT_SECRET]?.trim() ?? "";
  const slug = process.env[APP_SLUG]?.trim() ?? "";
  const redirectUri = process.env[REDIRECT_URI]?.trim() ?? "";

  const incomplete: string[] = [];
  if (!clientId) incomplete.push(CLIENT_ID);
  if (!clientSecret) incomplete.push(CLIENT_SECRET);
  if (!slug) incomplete.push(APP_SLUG);
  if (!redirectUri) incomplete.push(REDIRECT_URI);

  if (incomplete.length === REQUIRED.length) {
    return {
      configured: false,
      incomplete,
      message:
        "GitHub isn't set up on this deployment, so nothing was attempted. It needs a GitHub App registered at github.com/settings/apps — see .env.example for GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET, GITHUB_APP_SLUG and GITHUB_OAUTH_REDIRECT_URI.",
    };
  }

  if (incomplete.length > 0) {
    return {
      configured: false,
      incomplete,
      message: `GitHub is half set up: ${incomplete.join(", ")} ${incomplete.length === 1 ? "is" : "are"} missing from the environment. Add ${incomplete.length === 1 ? "it" : "them"} and restart the server so the value is re-read.`,
    };
  }

  if (!usableSlug(slug)) {
    return {
      configured: false,
      incomplete: [APP_SLUG],
      message: `${APP_SLUG} has to be the App's URL name on its own — the part after github.com/apps/, lowercase letters, digits and dashes. A full URL or a display name with spaces in it builds an install link that goes somewhere else.`,
    };
  }

  if (!usableRedirect(redirectUri)) {
    return {
      configured: false,
      incomplete: [REDIRECT_URI],
      message: `${REDIRECT_URI} has to be an absolute https:// URL — http:// only on localhost — and it has to match the Callback URL on the GitHub App character for character.`,
    };
  }

  return {
    configured: true,
    app: { clientId, clientSecret, slug, redirectUri },
  };
}

/**
 * Where an admin goes to put the App on their organisation.
 *
 * Separate from the consent URL on purpose, because in GitHub's model they
 * are separate acts and conflating them would make one of them silently
 * optional. Public, unguessable by nobody, and safe to build here: the slug
 * is not a secret and this URL is the same for every customer.
 */
export function installUrl(slug: string): string {
  return `https://github.com/apps/${slug}/installations/new`;
}

/**
 * Can anybody connect GitHub on this deployment, without going near a secret.
 * Names of missing variables only — they are documentation — for the route
 * that has to explain why there is no Connect button. What it does not answer
 * is whether a particular customer has connected; that lives with the account.
 */
export function githubSetupStatus(): {
  available: boolean;
  missing: string[];
} {
  const result = githubApp();
  return result.configured
    ? { available: true, missing: [] }
    : { available: false, missing: result.incomplete };
}
