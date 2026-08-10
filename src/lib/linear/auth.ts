import "server-only";

import { ADMIN_SCOPE, oauthClient, scopeParameter } from "./config";
import { fail, type LinearFailed } from "./result";

/**
 * Connecting a customer's Linear workspace once, so that a new starter can be
 * invited to it later with nobody present.
 *
 * Unverified: no Linear OAuth application exists and no workspace has ever
 * been connected, so none of these requests has ever been sent. The
 * endpoints, parameters and grant types are from Linear's OAuth 2.0
 * documentation as of August 2026; the error classification is the standard
 * OAuth vocabulary, because Linear does not publish its own table of token
 * endpoint errors. A live tenant must prove: that the consent screen accepts
 * this scope pair, that the exchange returns a refresh token, that the
 * identity query answers on a token minted seconds earlier, and — the one
 * nothing here even attempts — that `organizationInviteCreate` is callable by
 * an OAuth application at all.
 *
 * The flow is Google's (`src/lib/google/auth.ts`) with one difference that
 * changes what a runner must be built around. Google's refresh token lives
 * until revoked; Linear moved every OAuth application to rotating tokens on
 * 1 April 2026 — the access token dies after 24 hours, and each refresh
 * returns a **new refresh token** that replaces the old one. So the sealed
 * refresh token in the store is only current until the first refresh, and
 * whatever runner performs that refresh must write the rotated token back
 * before acting on anything, or the connection dies within a day and looks
 * exactly like a customer who revoked us. This module deliberately stops
 * before the refresh grant: building token rotation before a live workspace
 * can prove it would be the most delicate code in the block resting entirely
 * on documentation.
 *
 * Written against `fetch` rather than `@linear/sdk`, matching Google, Resend
 * and Stripe: the SDK wraps one form-encoded POST and one GraphQL POST in a
 * dependency tree this repo deliberately doesn't have.
 *
 * Nothing in this file is ever logged beyond a status and Linear's short
 * error code. A refresh token with the `admin` scope is a standing
 * authorisation to administer somebody else's workspace — strictly more
 * dangerous than a password, because nobody rotates it when its owner
 * changes theirs.
 */

const AUTH_ENDPOINT = "https://linear.app/oauth/authorize";
const TOKEN_ENDPOINT = "https://api.linear.app/oauth/token";
const REVOKE_ENDPOINT = "https://api.linear.app/oauth/revoke";
const GRAPHQL_ENDPOINT = "https://api.linear.app/graphql";

/** Long enough for a slow network, short enough not to pin a handler open. */
const TIMEOUT_MS = 10_000;

/** What a completed consent gives us. All of it belongs to one customer. */
export interface ConnectedLinear {
  /**
   * The standing permission. Current only until the first refresh — see the
   * header — and sealed before it touches the database.
   */
  refreshToken: string;
  /** Usable immediately; how `whoAuthorized` runs before anything is saved. */
  accessToken: string;
  /** Unix seconds. Documented as 24 hours; read from the response, not assumed. */
  accessTokenExpiresAt: number;
  /** What Linear actually granted, which is not always what we asked for. */
  scopes: string[];
}

export type ConsentUrlResult = { ok: true; url: string } | LinearFailed;
export type ExchangeResult = { ok: true; connection: ConnectedLinear } | LinearFailed;

/* --- The consent screen ---------------------------------------------------- */

/**
 * Where to send a customer's workspace admin to grant us access.
 *
 * `prompt=consent` forces the screen even for an admin who has granted this
 * app before. Linear — unlike Google — returns a full token pair on every
 * fresh code grant, so this is not load-bearing the way it is over there; it
 * is kept because a reconnect must be a decision somebody visibly makes, and
 * because the screen is where a declined scope gets noticed while the person
 * who declined it is still looking at it.
 *
 * `actor=user` is Linear's default and is passed explicitly anyway, because
 * the alternative (`application`) changes whose name is on everything the
 * token later does. An invite sent "by Craig" and an invite sent by the admin
 * who connected the workspace are different sentences in the invitee's inbox,
 * and pinning the choice here means a change in Linear's default cannot
 * silently flip it.
 *
 * `state` is required rather than optional for Google's reason verbatim: an
 * optional CSRF token is a CSRF token somebody leaves out.
 *
 * No login hint. Google's authorize endpoint takes one and Linear's
 * documented parameter list does not, so the account chooser is Linear's own.
 */
export function consentUrl(options: { state: string }): ConsentUrlResult {
  const configured = oauthClient();
  if (!configured.configured) {
    return fail("not-configured", configured.message);
  }

  if (!options.state.trim()) {
    return fail(
      "invalid-request",
      "A consent link needs a state value to compare against when Linear sends the customer back. Without one there is no way to tell our own redirect from somebody else's.",
    );
  }

  const params = new URLSearchParams({
    client_id: configured.client.clientId,
    redirect_uri: configured.client.redirectUri,
    response_type: "code",
    scope: scopeParameter(),
    prompt: "consent",
    actor: "user",
    state: options.state,
  });

  return { ok: true, url: `${AUTH_ENDPOINT}?${params}` };
}

/* --- What Linear says when it says no -------------------------------------- */

/** The token endpoint's error envelope. Both fields optional: a 502 from
    something in front of Linear has neither. */
interface TokenError {
  error?: string;
  error_description?: string;
}

/**
 * Which failure this is, and what to do about it.
 *
 * Sparser than Google's classifier, honestly so: Google's branches were
 * refined against that endpoint's documented behaviour, and Linear documents
 * only that its token endpoint speaks OAuth. These are the standard codes; a
 * live failure that arrives under some other name lands in `rejected` with
 * Linear's own words in the server log, which is where the next branch of
 * this function gets written from.
 */
function classifyToken(status: number, error: TokenError): LinearFailed {
  const code = (error.error ?? "").toLowerCase();

  if (code === "invalid_grant") {
    /* Only the exchange phase exists in this module, so `invalid_grant` has
       only one meaning here: the authorisation code is stale or already
       spent. The day a refresh grant is added, this needs Google's
       phase-aware split — over there the same string also means "the
       customer revoked us", which is a different conversation entirely. */
    return fail(
      "invalid-request",
      "That connection link has already been used or has expired — authorisation codes are single-use and last a few minutes. Start the connection again.",
    );
  }

  if (code === "invalid_client" || status === 401) {
    return fail(
      "bad-credentials",
      "Linear doesn't recognise this application's credentials. Check LINEAR_OAUTH_CLIENT_ID and LINEAR_OAUTH_CLIENT_SECRET against the OAuth application in Linear's settings — a secret rotated there and not here fails exactly like this.",
    );
  }

  if (code === "redirect_uri_mismatch" || code === "invalid_redirect_uri") {
    return fail(
      "bad-credentials",
      "Linear rejected the redirect URI. LINEAR_OAUTH_REDIRECT_URI has to match a callback URL on the OAuth application character for character.",
    );
  }

  if (code === "invalid_scope" || code === "unauthorized_client") {
    return fail(
      "unauthorized",
      "Linear won't grant this application the permission it asked for. The application needs the admin scope available to it — without that, nobody can be invited to anything.",
    );
  }

  if (status === 429) {
    return fail(
      "rate-limited",
      "Linear is rate limiting token requests for this application. Try again shortly.",
    );
  }

  if (status >= 500) {
    return fail(
      "rejected",
      "Linear's token endpoint is having a problem at their end. Nothing to fix here; try again shortly.",
    );
  }

  return fail(
    "rejected",
    `Linear refused to issue a token (${status}). The full reason is in the server log.`,
  );
}

/* --- Completing a connection ----------------------------------------------- */

interface TokenPayload {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
}

/**
 * What Linear granted, as a list.
 *
 * Tolerant on purpose, and the tolerance is a documented ambiguity rather
 * than defensive habit: Linear's authorize endpoint takes scopes
 * comma-separated where the OAuth convention is spaces, and the docs do not
 * say which shape — or whether a string at all — the token response's `scope`
 * field uses. Splitting on either costs nothing and cannot misread a real
 * scope name, since none of Linear's contain a comma or a space. One live
 * response settles it; this note should shrink then.
 */
function grantedScopes(scope: unknown): string[] {
  if (Array.isArray(scope)) {
    return scope.filter((s): s is string => typeof s === "string");
  }
  if (typeof scope === "string") {
    return scope.split(/[\s,]+/).filter(Boolean);
  }
  return [];
}

/**
 * Trades the code Linear sent back for a lasting connection.
 *
 * The caller must already have compared Linear's `state` against the one it
 * put in `consentUrl` — this function cannot, because it never sees the
 * session, and a function that quietly doesn't do a security check the caller
 * assumed it did is worse than one that obviously doesn't.
 *
 * Two refusals here would otherwise fail much later, in a much more confusing
 * place. A missing refresh token: post-migration Linear should always send
 * one, and a stored connection without one is dead within 24 hours, at a
 * moment nobody is watching. A missing `admin` scope: Linear's consent screen
 * lets somebody grant part of what was asked, the flow completes looking
 * entirely successful, and then every invite this product ever attempts
 * returns an authorisation error weeks later — on somebody's first morning,
 * pointing at our configuration rather than at the box they unticked.
 */
export async function exchangeCode(code: string): Promise<ExchangeResult> {
  const configured = oauthClient();
  if (!configured.configured) {
    return fail("not-configured", configured.message);
  }

  if (!code.trim()) {
    return fail(
      "invalid-request",
      "Linear didn't send an authorisation code back. If the customer closed the consent screen, that's what this looks like.",
    );
  }

  let response: Response;
  try {
    /* `URLSearchParams` rather than a template string: the body carries the
       client secret, and hand-rolled escaping is the kind of thing that works
       for a year and then silently truncates a credential at a slash. */
    response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: configured.client.clientId,
        client_secret: configured.client.clientSecret,
        redirect_uri: configured.client.redirectUri,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    /* Logged without the request, because the request body is the client
       secret. */
    console.error("[lib/linear] token endpoint unreachable:", cause);
    return fail(
      "unreachable",
      "Couldn't reach Linear to authenticate — no network, or the request timed out. Nothing was connected and nothing was changed.",
    );
  }

  /* Read as text and parse by hand. An error from a proxy in front of Linear
     is HTML, and `response.json()` on it throws a parse error that reads like
     a bug in this file. */
  const raw = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const error = (payload ?? {}) as TokenError;
    /* The one place Linear's own words are kept, and a place no browser can
       read. Only the short code and description — never `raw` in full, which
       on a success would be the tokens themselves. */
    console.error(
      `[lib/linear] token ${response.status}:`,
      `${error.error ?? ""} ${error.error_description ?? ""}`.trim() ||
        "no error body",
    );
    return classifyToken(response.status, error);
  }

  const tokens = (payload ?? {}) as TokenPayload;
  const accessToken = tokens.access_token;
  const refreshToken = tokens.refresh_token;

  if (typeof accessToken !== "string" || !accessToken) {
    console.error("[lib/linear] code exchange returned 200 with no token");
    return fail(
      "rejected",
      "Linear returned a success with no access token in it. Nothing was connected.",
    );
  }

  if (typeof refreshToken !== "string" || !refreshToken) {
    return fail(
      "invalid-request",
      "Linear didn't return a refresh token, so this connection would stop working within a day. Nothing was stored — try connecting again.",
    );
  }

  const scopes = grantedScopes(tokens.scope);

  if (!scopes.includes(ADMIN_SCOPE)) {
    return fail(
      "unauthorized",
      "Linear was connected, but without permission to manage the workspace — the admin permission wasn't granted on the consent screen. Without it nobody can be invited, so connect again and leave it on.",
    );
  }

  /* Linear's own number, not ours. Documented as 24 hours; a value read from
     the response survives that changing, and a value assumed doesn't. */
  const lifetime =
    typeof tokens.expires_in === "number" && Number.isFinite(tokens.expires_in)
      ? tokens.expires_in
      : 86_400;

  return {
    ok: true,
    connection: {
      refreshToken,
      accessToken,
      accessTokenExpiresAt: Math.floor(Date.now() / 1000) + lifetime,
      scopes,
    },
  };
}

/* --- Who consented, and to which workspace --------------------------------- */

/**
 * The workspace and the admin behind a fresh token.
 *
 * Google answers this with an id token inside the exchange response; Linear's
 * OAuth has no OIDC layer, so the same two facts cost one GraphQL query on
 * the access token that was just minted. They are worth a network call for
 * the reason `google-connection.ts` argues at length: the workspace key is
 * what every screen names the connection by, and it must be Linear's answer
 * rather than a string somebody typed into a box.
 *
 * `viewer.admin` is the schema's own field — "whether the user is a workspace
 * administrator", with the note that on Free plans every member counts as
 * one. The callback refuses to store a consent from a non-admin: the token
 * would be perfectly valid and useless for the one thing this block does, and
 * refusing now, while the person who can fetch an admin is still looking at
 * the screen, beats an authorisation error on somebody's first morning.
 */
export interface LinearIdentity {
  /** The workspace's URL key — the `katalis` in linear.app/katalis. */
  urlKey: string;
  /** Who consented. Null if Linear omitted it. */
  adminEmail: string | null;
  /** Whether the consenting user can actually invite anybody. */
  isAdmin: boolean;
}

export type IdentityResult = { ok: true; identity: LinearIdentity } | LinearFailed;

/** The shape `data` should come back in. Everything checked, nothing trusted:
    this is the one place in the module parsing a structure we did not mint. */
interface IdentityData {
  viewer?: { email?: unknown; admin?: unknown };
  organization?: { urlKey?: unknown };
}

export async function whoAuthorized(accessToken: string): Promise<IdentityResult> {
  let response: Response;
  try {
    response = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        query: "{ viewer { email admin } organization { urlKey } }",
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    console.error("[lib/linear] graphql unreachable:", cause);
    return fail(
      "unreachable",
      "Couldn't reach Linear to confirm which workspace was connected. Nothing was stored — try connecting again.",
    );
  }

  const raw = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = {};
  }

  /* GraphQL's two ways of saying no: an HTTP failure, and a 200 carrying an
     `errors` array. Both collapse to the same refusal, because both mean the
     same thing to the person on the screen — we couldn't confirm the
     workspace, so nothing was stored. Linear's own words go to the log. */
  const body = (payload ?? {}) as { data?: IdentityData; errors?: { message?: string }[] };
  if (!response.ok || body.errors?.length) {
    console.error(
      `[lib/linear] identity query failed (${response.status}):`,
      body.errors?.map((e) => e.message ?? "").join("; ") || "no error body",
    );
    return fail(
      "rejected",
      "Linear issued a token but wouldn't say which workspace it belongs to, so nothing was stored. Try connecting again.",
    );
  }

  const viewer = body.data?.viewer;
  const organization = body.data?.organization;
  const urlKey =
    typeof organization?.urlKey === "string" ? organization.urlKey : "";

  if (!urlKey) {
    /* A connection with no workspace key is a connection no screen can name
       and no invite address can be checked against — the same argument that
       makes Google refuse a consent with no `hd` claim. */
    return fail(
      "rejected",
      "Linear didn't say which workspace this token belongs to, so nothing was stored. Try connecting again.",
    );
  }

  return {
    ok: true,
    identity: {
      urlKey,
      adminEmail: typeof viewer?.email === "string" ? viewer.email : null,
      /* Missing is treated as false. Storing a connection on an unproven
         claim of adminship is the failure this query exists to prevent. */
      isAdmin: viewer?.admin === true,
    },
  };
}

/* --- Revocation ------------------------------------------------------------ */

/**
 * Tells Linear the grant is over. Called by the disconnect route *before* the
 * sealed token is deleted — after the row is gone there is nothing left to
 * authenticate the revocation with, and the grant would sit live in the
 * customer's workspace until somebody found it in Linear's settings.
 *
 * Best-effort and never throws, mirroring `stopWatch`'s argument: a
 * disconnect that refused because Linear was slow would be a customer unable
 * to revoke us, which is the worse failure by a distance. `false` means the
 * grant may still be live at Linear's end; the caller says so rather than
 * pretending.
 *
 * One documented ambiguity: Linear's docs name the `token` form field and say
 * revocation "via the Authorization header" is also accepted, but never state
 * whether the client id and secret must accompany a body-token revocation.
 * Both are sent — the spec-shaped request — and a live call decides whether
 * that was necessary or merely harmless.
 */
export async function revokeToken(token: string): Promise<boolean> {
  const configured = oauthClient();
  if (!configured.configured) return false;

  try {
    const response = await fetch(REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token,
        client_id: configured.client.clientId,
        client_secret: configured.client.clientSecret,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      /* 400 is "unable to revoke" — most likely already revoked, which is the
         outcome everybody wanted. Logged either way, never blocking. */
      console.error(`[lib/linear] revoke answered ${response.status}`);
    }
    return response.ok;
  } catch (cause) {
    console.error("[lib/linear] revoke unreachable:", cause);
    return false;
  }
}
