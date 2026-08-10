import "server-only";

import {
  API_ORIGIN,
  API_VERSION,
  MEMBERS_LEVEL,
  MEMBERS_PERMISSION,
  githubApp,
  installUrl,
} from "./config";
import { fail, type GitHubFailed } from "./result";

/**
 * Connecting a customer's GitHub organisation once, and holding what comes
 * back.
 *
 * Unverified: no GitHub organisation has ever been connected through this
 * module. The endpoints, parameters and response shapes are from GitHub's
 * documentation, not from a response this code has received. A first live
 * connection still has to prove: that GitHub accepts the authorize URL built
 * below for a GitHub App; that the token response carries `expires_in` and a
 * refresh token (it does not, if "expire user authorization tokens" is off on
 * the App, which is a setting nothing here can read); that
 * `GET /user/installations` returns `permissions` in the map shape parsed
 * below; and that GitHub's failures really do arrive the two contradictory
 * ways described next rather than only in the docs.
 *
 * ## Two hosts, two failure conventions, one module
 *
 * This is the sharpest edge in the file and the reason there are two request
 * helpers rather than one.
 *
 * **github.com's OAuth endpoints report failure inside a 200.** Ask for JSON
 * and a bad code comes back as `200 {"error":"bad_verification_code"}`. Code
 * that trusted the status would read every failure as success — the same
 * polarity trap `src/lib/slack/auth.ts` documents, and the worst possible
 * polarity for a function that stores credentials.
 *
 * **api.github.com does the opposite** and uses honest status codes: 401 for a
 * dead token, 403 for a permission or a secondary rate limit, 404 where a
 * 403 would leak the existence of something. So the same `if (response.ok)`
 * that is a bug on one host is correct on the other, forty lines away. They
 * are kept in separate functions so nobody has to remember which is which at
 * the call site.
 *
 * ## What is sent, and what is deliberately not
 *
 * No `scope` parameter. GitHub Apps do not use scopes — the docs are explicit
 * that a user access token "does not use scopes, it uses fine-grained
 * permissions" and that the `scope` field in the response is always the empty
 * string. Sending one would be sending a parameter from the other product.
 *
 * No PKCE. GitHub documents `code_challenge`/`code_verifier` as strongly
 * recommended for user access tokens, and it is genuinely worth adding — but
 * PKCE protects a *public* client whose secret can be extracted, and this
 * exchange happens on a server holding a client secret the browser never
 * sees. The verifier would also need somewhere to live across the redirect,
 * which is the signed state cookie, which is where the CSRF defence already
 * lives. Recorded as a deliberate omission rather than an oversight: the day
 * this flow runs anywhere the secret is not private, PKCE stops being
 * optional.
 *
 * Written against `fetch` rather than Octokit, matching Google, Slack, Linear,
 * Resend and Stripe: the SDK wraps three requests in a dependency tree, a
 * plugin system and its own auth abstraction this repo already has a smaller
 * version of.
 */

const AUTHORIZE_ENDPOINT = "https://github.com/login/oauth/authorize";
const TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token";

/** Long enough for a slow network, short enough not to pin a handler open. */
const TIMEOUT_MS = 10_000;

/**
 * What a completed connection gives us. All of it belongs to one customer.
 */
export interface ConnectedGitHub {
  /**
   * The user access token (`ghu_…` by shape, though nothing here depends on
   * the prefix — GitHub documents token formats as subject to change). Dies
   * in eight hours unless the App has token expiry switched off.
   */
  userToken: string;
  /**
   * The half that lasts: six months, and every use rotates both halves.
   * `null` when the App has expiring tokens disabled, in which case
   * `userToken` is the standing permission and never expires — the store
   * decides which of the two to keep on that basis.
   */
  refreshToken: string | null;
  /** Unix seconds, or `null` when GitHub said the token does not expire. */
  refreshExpiresAt: number | null;
  /**
   * GitHub's numeric id for the installation on the customer's account.
   *
   * Returned and deliberately **not stored** — `store.ts` argues why in full:
   * uninstalling and reinstalling an App mints a new one, so a kept id goes
   * stale with no error anywhere. It is here because it is the only value that
   * proves the entry parsed, and because a runner minting installation tokens
   * one day will want it from a fresh read rather than from a column.
   */
  installationId: number;
  /** The organisation's login — `katalis` in github.com/katalis. */
  accountLogin: string;
  /**
   * `Organization` or `User`. Kept because an App installed on a personal
   * account cannot be invited into: `POST /orgs/{org}/invitations` needs an
   * organisation, and a connection to somebody's personal account would look
   * connected and never work.
   */
  accountType: string;
  /**
   * The installation's permissions, flattened to `name:level` strings so they
   * fit the `scopes` column every other provider fills with scopes. See
   * `store.ts` for why that column is the right home for them.
   */
  permissions: string[];
}

export type ConsentUrlResult = { ok: true; url: string } | GitHubFailed;
export type ExchangeResult =
  | { ok: true; connection: ConnectedGitHub }
  | GitHubFailed;

/* --- The consent screen ---------------------------------------------------- */

/**
 * Where to send a customer's GitHub organisation owner to authorise us.
 *
 * `state` is required rather than optional for the reason every one of these
 * modules makes it required: an optional CSRF token is a CSRF token somebody
 * leaves out, and the attack it stops — a signed-in admin walked into
 * finishing an attacker's consent, attaching the attacker's organisation to
 * their account — is in `github-state.ts`.
 *
 * `prompt=select_account` because a GitHub user is very often signed in to a
 * personal account and an org owner account is a different session; landing
 * on a consent screen for the wrong identity produces a connection that looks
 * fine and can invite nobody. Forcing the chooser costs one click and removes
 * an entire class of silent wrong answer.
 *
 * `allow_signup` is left at its default. A GitHub org owner has an account by
 * definition, so setting it either way would be stating something about a
 * person who cannot exist.
 *
 * What this URL does *not* do is install the App on an organisation. That is
 * a separate act with its own URL (`installUrl` in `config.ts`), and the
 * panel offers both — see the module header for why conflating them would
 * make one of them silently optional.
 */
export function consentUrl(options: {
  /** Opaque, unguessable, bound to a cookie. Compared on return. */
  state: string;
}): ConsentUrlResult {
  const configured = githubApp();
  if (!configured.configured) {
    return fail("not-configured", configured.message);
  }

  if (!options.state.trim()) {
    return fail(
      "invalid-request",
      "A consent link needs a state value to compare against when GitHub sends the customer back. Without one there is no way to tell our own redirect from somebody else's.",
    );
  }

  const params = new URLSearchParams({
    client_id: configured.app.clientId,
    redirect_uri: configured.app.redirectUri,
    state: options.state,
    prompt: "select_account",
  });

  return { ok: true, url: `${AUTHORIZE_ENDPOINT}?${params}` };
}

/**
 * Where to send an organisation owner to put the App *on* their organisation.
 *
 * The other half of the sentence `consentUrl` starts, and genuinely a
 * different screen: GitHub asks which account to install on and which
 * permissions to accept, rather than asking one person to let us act as them.
 * An admin needs both, in either order, and neither implies the other — which
 * is the single most surprising thing about this provider compared with Slack
 * or Linear, where installing and authorising are one button.
 *
 * `state` travels here too. GitHub documents it on the installation URL and
 * echoes it to the callback, which means an install with "request user
 * authorization during installation" enabled lands back with a `code` *and* a
 * state our own cookie can verify — one pass instead of two. Unverified, and
 * the failure if GitHub drops it is a `mismatch` rather than anything unsafe:
 * the callback refuses a state it cannot check, which is the correct behaviour
 * for a redirect that might not be ours.
 */
export function installConsentUrl(options: {
  state: string;
}): ConsentUrlResult {
  const configured = githubApp();
  if (!configured.configured) {
    return fail("not-configured", configured.message);
  }

  if (!options.state.trim()) {
    return fail(
      "invalid-request",
      "An install link needs a state value to compare against when GitHub sends the customer back. Without one there is no way to tell our own redirect from somebody else's.",
    );
  }

  const params = new URLSearchParams({ state: options.state });
  return { ok: true, url: `${installUrl(configured.app.slug)}?${params}` };
}

/* --- What GitHub says when it says no --------------------------------------- */

/**
 * GitHub's OAuth error is one snake_case string in a JSON body. These are the
 * documented ones worth telling apart because their fixes differ; everything
 * else is `rejected` with the string kept in the server log, because a
 * provider's error set is always larger than its documentation and that gap
 * is exactly what a live tenant closes.
 */
function classifyOAuth(error: string): GitHubFailed {
  switch (error) {
    case "bad_verification_code":
      return fail(
        "invalid-request",
        "That connection attempt has already been used or has expired — GitHub's authorisation codes are single-use and last about ten minutes. Start the connection again.",
      );
    case "incorrect_client_credentials":
      return fail(
        "bad-credentials",
        "GitHub doesn't recognise this application's credentials. Check GITHUB_APP_CLIENT_ID and GITHUB_APP_CLIENT_SECRET against the App at github.com/settings/apps — a secret rotated there and not here fails exactly like this.",
      );
    case "redirect_uri_mismatch":
      return fail(
        "bad-credentials",
        "GitHub rejected the redirect URI. GITHUB_OAUTH_REDIRECT_URI has to match the Callback URL on the GitHub App character for character.",
      );
    case "access_denied":
      return fail(
        "invalid-request",
        "The consent screen was closed without granting anything. Nothing was stored.",
      );
    case "application_suspended":
      return fail(
        "needs-reconnect",
        "This application has been suspended on the organisation, so GitHub won't issue it a token. An organisation owner can unsuspend it from the organisation's installed GitHub Apps settings.",
      );
    case "unsupported_grant_type":
      /* Only reachable from the refresh path, and only if this module and
         GitHub disagree about a constant — which is a bug here, not a
         customer's problem. */
      return fail(
        "rejected",
        "GitHub refused the request in a way that means something is wrong on our side rather than yours. Nothing was changed.",
      );
    default:
      return fail(
        "rejected",
        "GitHub refused the request without saying usefully why. The full reason is in the server log.",
      );
  }
}

/* --- github.com: one form POST, JSON back ----------------------------------- */

interface TokenPayload {
  error?: unknown;
  error_description?: unknown;
  access_token?: unknown;
  expires_in?: unknown;
  refresh_token?: unknown;
  refresh_token_expires_in?: unknown;
  token_type?: unknown;
}

type TokenResult = { ok: true; payload: TokenPayload } | GitHubFailed;

/**
 * One POST to github.com's OAuth endpoint, with its inverted failure
 * convention normalised into ours.
 *
 * `Accept: application/json` is load-bearing and not a nicety: without it
 * GitHub answers this endpoint in **form-encoded** form
 * (`access_token=ghu_…&scope=&token_type=bearer`), which `JSON.parse` reads as
 * a syntax error and which would therefore look exactly like a transport
 * failure. One header away from a bug nobody would find by reading the code.
 *
 * The ordering below is the whole reason this helper exists: read the body
 * first, then decide, because the failure lives in the JSON and not in the
 * status. A non-2xx still happens — a proxy, a 429 with an HTML body — so
 * both paths are covered, and a body that is not JSON is treated as the
 * transport failing rather than as a parse bug here.
 *
 * `URLSearchParams` rather than a template string: the body carries the
 * client secret, and hand-rolled escaping is the kind of thing that works for
 * a year and then truncates a credential at an ampersand.
 */
async function tokenRequest(
  params: Record<string, string>,
): Promise<TokenResult> {
  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    /* Logged without the request — the request body is the credential. */
    console.error("[lib/github] token endpoint unreachable:", cause);
    return fail(
      "unreachable",
      "Couldn't reach GitHub — no network, or the request timed out. Nothing was connected and nothing was changed.",
    );
  }

  const raw = await response.text();
  let payload: TokenPayload;
  try {
    payload = JSON.parse(raw) as TokenPayload;
  } catch {
    payload = {};
  }

  if (typeof payload.error === "string" && payload.error) {
    /* The one place GitHub's own words are kept, and a place no browser can
       read. Never `raw` in full — on a success `raw` contains the token, and
       a truncation bug away from being so on any path. */
    console.error(
      `[lib/github] token endpoint refused (${response.status}): ${payload.error}`,
    );
    return classifyOAuth(payload.error);
  }

  if (!response.ok) {
    console.error(`[lib/github] token endpoint HTTP ${response.status}`);
    if (response.status === 429) {
      return fail(
        "rate-limited",
        "GitHub is rate limiting requests from this application. Nothing was stored. Try again shortly.",
      );
    }
    return fail(
      "rejected",
      "GitHub is having a problem at their end. Nothing to fix here; try again shortly.",
    );
  }

  return { ok: true, payload };
}

/* --- api.github.com: honest status codes ------------------------------------ */

type ApiResult = { ok: true; body: unknown } | GitHubFailed;

/**
 * One authenticated GET against the REST API.
 *
 * The three headers are all required in practice and each for its own reason:
 * `Authorization: Bearer` is where GitHub's current docs put a user access
 * token; `Accept: application/vnd.github+json` selects the documented media
 * type rather than whichever one GitHub decides is the default next year;
 * `X-GitHub-Api-Version` pins the dated version argued for in `config.ts`.
 *
 * `User-Agent` is the fourth, and it is not optional the way it usually is —
 * GitHub's API rejects requests without one outright. Node's fetch does not
 * send a useful default, so this is the difference between working and a 403
 * whose message names nothing.
 */
async function apiGet(path: string, token: string): Promise<ApiResult> {
  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": "craig-onboarding",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    console.error(`[lib/github] GET ${path} unreachable:`, cause);
    return fail(
      "unreachable",
      "Couldn't reach GitHub — no network, or the request timed out. Nothing was changed.",
    );
  }

  if (!response.ok) {
    /* The status and the path, never the token and never the whole body:
       a body can echo a request, and this request is authenticated. */
    console.error(`[lib/github] GET ${path} refused: HTTP ${response.status}`);

    if (response.status === 401) {
      return fail(
        "needs-reconnect",
        "GitHub no longer accepts the permission it gave us. The authorisation was revoked, or it expired unused. An organisation owner has to connect it once more.",
      );
    }
    if (response.status === 403 || response.status === 429) {
      /* GitHub uses 403 for both "you may not" and its secondary rate limit,
         and tells them apart with a header rather than a status. Reading the
         header is what stops "wait a minute" being rendered as "your
         permissions are wrong", which sends somebody to change settings that
         were never the problem. */
      const remaining = response.headers.get("x-ratelimit-remaining");
      const retry = response.headers.get("retry-after");
      if (retry !== null || remaining === "0") {
        return fail(
          "rate-limited",
          "GitHub is rate limiting requests from this application. Nothing was changed. Try again shortly.",
        );
      }
      return fail(
        "unauthorized",
        "GitHub refused with the permission it has. Either the App isn't allowed to manage members on this organisation, or the person who connected it isn't an organisation owner.",
      );
    }
    if (response.status >= 500) {
      return fail(
        "rejected",
        "GitHub is having a problem at their end. Nothing to fix here; try again shortly.",
      );
    }
    return fail(
      "rejected",
      "GitHub turned the request down without saying usefully why. The full status is in the server log.",
    );
  }

  try {
    return { ok: true, body: (await response.json()) as unknown };
  } catch {
    console.error(`[lib/github] GET ${path} answered with unreadable JSON`);
    return fail(
      "rejected",
      "GitHub answered with something that wasn't the expected shape. Nothing was stored.",
    );
  }
}

/* --- Which organisation is this, anyway ------------------------------------- */

/**
 * The shape of one entry in `GET /user/installations`, narrowed to the four
 * fields this module reads. Everything is `unknown` above the fields we
 * actually check, because this is a payload nothing here has ever seen and
 * declaring it as a confident interface would be asserting a shape rather
 * than testing one.
 */
interface InstallationEntry {
  id?: unknown;
  account?: { login?: unknown; type?: unknown } | null;
  permissions?: Record<string, unknown> | null;
}

/** `{ members: "write", metadata: "read" }` becomes
    `["members:write", "metadata:read"]`, sorted so two reads of the same
    installation produce the same list and a diff means something changed. */
function flattenPermissions(
  permissions: Record<string, unknown> | null | undefined,
): string[] {
  if (!permissions) return [];
  return Object.entries(permissions)
    .filter(([, level]) => typeof level === "string")
    .map(([name, level]) => `${name}:${level as string}`)
    .sort();
}

/**
 * Whether an installation can do the one thing this block exists for.
 *
 * GitHub's permission levels are ordered — `read` < `write` < `admin` — and
 * an installation granted `admin` on members satisfies a `write` requirement.
 * Spelled out rather than compared as strings because `"admin" >= "write"` is
 * false alphabetically, which is the kind of comparison that passes review
 * and then quietly rejects the most-privileged installations there are.
 */
function canManageMembers(permissions: Record<string, unknown> | null): boolean {
  const level = permissions?.[MEMBERS_PERMISSION];
  return level === MEMBERS_LEVEL || level === "admin";
}

/* --- Completing a connection ------------------------------------------------ */

/**
 * Trades the code GitHub sent back for a user access token, then asks GitHub
 * what that token is actually attached to.
 *
 * The caller must already have compared GitHub's `state` against the one it
 * minted — this function never sees the session, and a security check it
 * quietly didn't do would be worse than one it obviously doesn't.
 *
 * The second request is not optional decoration. GitHub's token response
 * contains a token and *nothing identifying at all* — no organisation, no
 * account, no login. Slack names the workspace in the exchange, Linear
 * answers an identity query, Google puts the domain in the id token; GitHub
 * says nothing, so a connection stored straight off the exchange could not
 * tell anybody which organisation it opens. Every module in this family
 * refuses to store a connection that cannot say what it is attached to, and
 * `GET /user/installations` is the cheapest way to ask.
 *
 * Four refusals here would otherwise become confusing failures much later:
 *
 * No token in a success — the contract moved, and nothing must be stored.
 *
 * No installation at all — they authorised us and never put the App on an
 * organisation. Its own reason (`not-installed`) because its own fix: an
 * organisation owner has to install it, and telling them to check permissions
 * would send them somewhere the problem is not.
 *
 * An installation on a personal account only — `POST /orgs/{org}/invitations`
 * needs an organisation, so a personal-account install is a connection that
 * would look fine and invite nobody.
 *
 * An installation without `members: write` — the App's requested permissions
 * at github.com can drift from `config.ts`, and an admin can approve an older
 * set than the one currently requested. One sentence now instead of a runner
 * failing weeks later on somebody's first morning.
 */
export async function exchangeCode(code: string): Promise<ExchangeResult> {
  const configured = githubApp();
  if (!configured.configured) {
    return fail("not-configured", configured.message);
  }

  if (!code.trim()) {
    return fail(
      "invalid-request",
      "GitHub didn't send an authorisation code back. If the customer pressed cancel on the consent screen, that's what this looks like.",
    );
  }

  const exchanged = await tokenRequest({
    client_id: configured.app.clientId,
    client_secret: configured.app.clientSecret,
    code,
    /* Sent because it was sent on the authorize URL — GitHub, like Google and
       Slack, checks the pair match.

       One unverified risk, recorded because it would be baffling from a stack
       trace: a code minted by the *installation* screen was never given a
       redirect URI, because that screen uses the App's configured Callback URL
       rather than one on the query string. The two are the same value here by
       construction, so this should match either way — but "should" is doing
       real work in that sentence, and the failure would be a
       `redirect_uri_mismatch` on the install path only, while the plain
       authorise path kept working. */
    redirect_uri: configured.app.redirectUri,
  });
  if (!exchanged.ok) return exchanged;

  const userToken = exchanged.payload.access_token;
  if (typeof userToken !== "string" || !userToken) {
    console.error("[lib/github] token endpoint answered with no access_token");
    return fail(
      "rejected",
      "GitHub returned a success with no token in it. Nothing was connected.",
    );
  }

  /* Both absent when the App has token expiry switched off, which is a
     setting on the App that this code cannot read — so it is inferred from
     what arrived rather than assumed. `store.ts` is where the consequence
     lives: with no refresh token, the user token itself is the standing
     permission. */
  const refreshToken =
    typeof exchanged.payload.refresh_token === "string" &&
    exchanged.payload.refresh_token
      ? exchanged.payload.refresh_token
      : null;

  const refreshLife = exchanged.payload.refresh_token_expires_in;
  const refreshExpiresAt =
    typeof refreshLife === "number" && refreshLife > 0
      ? Math.floor(Date.now() / 1000) + refreshLife
      : null;

  const installations = await apiGet("/user/installations", userToken);
  if (!installations.ok) return installations;

  const listed = (installations.body as { installations?: unknown })
    ?.installations;
  const entries: InstallationEntry[] = Array.isArray(listed)
    ? (listed as InstallationEntry[])
    : [];

  if (entries.length === 0) {
    return fail(
      "not-installed",
      "You're signed in to GitHub, but Craig isn't installed on any organisation yet — so the permission it just received can't reach anything. Install it on the organisation you're onboarding into, then connect again.",
    );
  }

  /* Organisations first, and among them the ones that can actually invite.
     Picking the first entry instead would connect whichever installation
     GitHub happened to list first, which on an account with a personal
     install and an org install is a coin toss nobody would notice until an
     invitation went nowhere. */
  const usable = entries.filter(
    (entry) =>
      entry.account?.type === "Organization" &&
      canManageMembers(entry.permissions ?? null),
  );

  const organisations = entries.filter(
    (entry) => entry.account?.type === "Organization",
  );

  if (organisations.length === 0) {
    return fail(
      "not-installed",
      "Craig is installed on your personal GitHub account rather than on an organisation. Inviting somebody needs an organisation — install it on the organisation you're onboarding into, then connect again.",
    );
  }

  if (usable.length === 0) {
    return fail(
      "unauthorized",
      "Craig is installed on your organisation but without permission to manage members, which is the one thing this block is for. An organisation owner needs to review the App's requested permissions and accept them; nothing was stored.",
    );
  }

  /* More than one usable organisation is a real possibility and this stores
     the first. That is a known limit, not a decision: the `connections` table
     holds one row per (account, provider), so one Craig account connects one
     GitHub organisation, and an admin who manages two would have to pick.
     Choosing here silently is still better than storing a connection whose
     organisation nobody named — the panel shows which one was taken, which is
     what makes a wrong pick visible rather than mysterious. */
  const chosen = usable[0];

  const installationId = chosen.id;
  const accountLogin = chosen.account?.login;
  if (typeof installationId !== "number" || typeof accountLogin !== "string") {
    console.error("[lib/github] installation entry missing id or account");
    return fail(
      "rejected",
      "GitHub didn't say which organisation the permission belongs to, so there was nothing to attach the connection to. Nothing was stored.",
    );
  }

  return {
    ok: true,
    connection: {
      userToken,
      refreshToken,
      refreshExpiresAt,
      installationId,
      accountLogin,
      accountType: "Organization",
      permissions: flattenPermissions(chosen.permissions),
    },
  };
}

/* --- Keeping one alive ------------------------------------------------------ */

export type RefreshResult =
  | {
      ok: true;
      userToken: string;
      refreshToken: string | null;
      refreshExpiresAt: number | null;
    }
  | GitHubFailed;

/**
 * Trades a refresh token for a fresh pair.
 *
 * The single most important thing about this call, and the thing that makes
 * it dangerous to treat as a retryable idempotent request: **using a refresh
 * token destroys both halves of the old pair.** GitHub's docs are explicit —
 * "once you use a refresh token, that refresh token and the old user access
 * token will no longer work". So a caller that refreshes, fails to store the
 * result, and refreshes again from the sealed copy has locked the customer
 * out entirely and the only fix is a human authorising again.
 *
 * Which means the rule for whoever writes the runner: **whatever calls this
 * must also be the writer**, in the same operation, before doing anything
 * else with the token. That is the same rule `src/lib/linear/store.ts` records
 * for Linear's rotation, learned from the same shape of problem, and it is the
 * kind of thing that is obvious in a comment and invisible in a stack trace.
 *
 * Today the only caller is the disconnect path below, where destroying the
 * old pair is the entire point.
 */
export async function refreshUserToken(
  refreshToken: string,
): Promise<RefreshResult> {
  const configured = githubApp();
  if (!configured.configured) {
    return fail("not-configured", configured.message);
  }

  const refreshed = await tokenRequest({
    client_id: configured.app.clientId,
    client_secret: configured.app.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (!refreshed.ok) return refreshed;

  const userToken = refreshed.payload.access_token;
  if (typeof userToken !== "string" || !userToken) {
    return fail(
      "needs-reconnect",
      "GitHub wouldn't renew the permission Craig was given. Refresh tokens last six months and a connection nobody has used in that time simply lapses — an organisation owner has to connect it once more.",
    );
  }

  const nextRefresh =
    typeof refreshed.payload.refresh_token === "string" &&
    refreshed.payload.refresh_token
      ? refreshed.payload.refresh_token
      : null;

  const life = refreshed.payload.refresh_token_expires_in;

  return {
    ok: true,
    userToken,
    refreshToken: nextRefresh,
    refreshExpiresAt:
      typeof life === "number" && life > 0
        ? Math.floor(Date.now() / 1000) + life
        : null,
  };
}

/* --- Undoing one ------------------------------------------------------------ */

/**
 * Hands the authorisation back to GitHub, best-effort, for the disconnect
 * route to call *before* deleting the row — after the row is gone there is
 * nothing left to authenticate the revocation with, which is the rule the
 * Google block's watch teardown paid to learn.
 *
 * `DELETE /applications/{client_id}/grant` rather than `/token`, deliberately.
 * The token endpoint kills one token; the grant endpoint kills the whole
 * authorisation and every token issued under it, which is what a customer
 * pressing Disconnect means. Both are authenticated by HTTP Basic with the
 * App's client id as the username and its secret as the password — an odd
 * shape next to every other call in this file, and one of the few places
 * GitHub still uses Basic auth at all.
 *
 * The refresh-first step is not belt and braces. The sealed user token is
 * eight hours old at most and very probably dead by the time anybody presses
 * Disconnect, and revoking with a dead token is a 404. Refreshing produces a
 * live one — and, because a refresh destroys the pair it came from, it also
 * means that even if the revocation itself then fails, the credential this
 * deployment had sealed is already worthless. The failure mode of the whole
 * function is therefore "the customer's authorisation still exists at GitHub
 * and we can no longer use it", which is an acceptable worst case; the
 * unacceptable one would be keeping something that still works.
 *
 * Never throws and never blocks a disconnect: a customer must be able to
 * revoke us even when GitHub is having a bad afternoon, and the authorisation
 * they are left holding can still be killed from their own GitHub settings.
 */
export async function revokeAuthorization(credential: {
  userToken: string | null;
  refreshToken: string | null;
}): Promise<void> {
  const configured = githubApp();
  if (!configured.configured) return;

  let token = credential.userToken;

  if (credential.refreshToken) {
    const refreshed = await refreshUserToken(credential.refreshToken);
    if (refreshed.ok) {
      token = refreshed.userToken;
    } else {
      /* Already logged with GitHub's own words by `tokenRequest`. A refresh
         that fails usually means the grant is gone anyway, which is the
         outcome being asked for. */
      console.error(
        `[lib/github] refresh before revoke failed: ${refreshed.reason}`,
      );
    }
  }

  if (!token) {
    console.error("[lib/github] nothing live enough to revoke with");
    return;
  }

  const basic = Buffer.from(
    `${configured.app.clientId}:${configured.app.clientSecret}`,
    "utf8",
  ).toString("base64");

  try {
    const response = await fetch(
      `${API_ORIGIN}/applications/${encodeURIComponent(configured.app.clientId)}/grant`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Basic ${basic}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": API_VERSION,
          "User-Agent": "craig-onboarding",
        },
        body: JSON.stringify({ access_token: token }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );

    /* 204 is the documented success. 404 means GitHub has no such grant,
       which is the state being asked for and so is not worth a line. */
    if (!response.ok && response.status !== 404) {
      console.error(
        `[lib/github] revoking the authorisation did not confirm: HTTP ${response.status}`,
      );
    }
  } catch (cause) {
    console.error("[lib/github] revoke unreachable:", cause);
  }
}
