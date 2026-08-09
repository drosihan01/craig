import "server-only";
import { createHash } from "node:crypto";

import { DIRECTORY_SCOPE, SCOPES, oauthClient } from "./config";
import { fail, type GoogleFailed } from "./result";

/**
 * Connecting a customer's Google Workspace once, and acting on it forever
 * after with nobody present.
 *
 * The whole model in three moves. A super admin at the customer clicks
 * "Connect Google Workspace" and is sent to `consentUrl()`. They consent, and
 * Google returns them to us with a one-time code, which `exchangeCode()`
 * trades for a **refresh token** — a long-lived credential that represents
 * that customer's standing permission for us to manage their users. Months
 * later, at three in the morning, a workflow reaches the "create a Workspace
 * account" block and `accessTokenFor()` turns that refresh token into a
 * short-lived access token for the one call it needs. Nobody is watching, and
 * nobody needs to be. That is what `access_type=offline` buys.
 *
 * Written against `fetch` rather than `google-auth-library`. The library
 * brings a dependency tree and a credential-discovery system this project has
 * no use for, wrapped around two form-encoded POSTs. This repo has almost no
 * dependencies on purpose, and the one it would add here buys nothing.
 *
 * Nothing in this file is ever logged. A refresh token is a standing
 * authorisation to create and modify accounts inside somebody else's company;
 * it is strictly more dangerous than a password, because a password at least
 * expires when its owner changes it and nobody is surprised that it is
 * secret. Every failure path below therefore logs a status and Google's own
 * short error code, and never the request.
 *
 * Unverified: this repo has no OAuth client and no tenant to point at, so
 * none of these requests has ever been sent. The endpoints, parameters, grant
 * types and error codes are from Google's OAuth 2.0 web-server documentation
 * rather than from a response.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Long enough for a slow network, short enough not to pin a handler open. */
const TIMEOUT_MS = 10_000;

/**
 * How early a cached access token is treated as spent.
 *
 * A token that expires in four seconds is a token that will expire somewhere
 * between this process and Google's front end, and the failure it produces is
 * a 401 on a request that creates an account — the one request in this module
 * where "did it happen?" is genuinely hard to answer afterwards. Sixty
 * seconds of an hour is a cheap insurance premium.
 */
const RENEW_BEFORE_S = 60;

/**
 * A customer's standing permission, as everything else in the app holds it.
 *
 * `accountId` is not decoration. It is what keys the token cache, and it is
 * the reason a token minted for one customer can never be handed to another:
 * without it the cache would be keyed on the refresh token alone, and the
 * first bug that passed the wrong connection object would create a new
 * starter inside somebody else's company. Whatever the caller uses to
 * identify an account is fine, as long as it is stable and unique.
 */
export interface GoogleConnection {
  accountId: string;
  /**
   * The long-lived credential. Belongs in the account's own record, encrypted
   * at rest, read only by server code. It must never be logged, never be sent
   * to a browser, and never be read for one account while acting for another.
   */
  refreshToken: string;
}

/** What a completed consent gives us. All of it belongs to one customer. */
export interface ConnectedWorkspace {
  /** Store this against the account. It is the whole of the connection. */
  refreshToken: string;
  /** Usable immediately, so the connect route can verify before saving. */
  accessToken: string;
  /** Unix seconds. */
  accessTokenExpiresAt: number;
  /** What Google actually granted, which is not always what we asked for. */
  scopes: string[];
  /** The admin who consented, from the id token. Null if Google omitted it. */
  adminEmail: string | null;
  /**
   * Their Workspace domain, from the id token's `hd` claim. This is what the
   * product builds `newstarter@domain` from, and it is Google's answer rather
   * than something a customer typed into a box.
   */
  domain: string | null;
}

export type ConsentUrlResult = { ok: true; url: string } | GoogleFailed;
export type ExchangeResult =
  { ok: true; connection: ConnectedWorkspace } | GoogleFailed;
export type TokenResult = { ok: true; token: string } | GoogleFailed;

/* --- The consent screen ---------------------------------------------------- */

/**
 * Where to send a customer's super admin to grant us access.
 *
 * Three parameters do the work, and leaving any of them out breaks the
 * unattended half of the product in a way that only shows up later:
 *
 * `access_type=offline` is what makes Google issue a refresh token at all.
 * Without it the consent succeeds, an access token arrives, everything looks
 * connected, and an hour later the integration is dead with nothing to renew
 * from.
 *
 * `prompt=consent` forces the consent screen even for an admin who has
 * granted this app before. Google returns a refresh token only on a fresh
 * grant, so a customer who disconnects and reconnects — or who is being moved
 * between our environments — would otherwise come back with an access token
 * and no refresh token, which is the same dead end reached by a different
 * road. Paying for an extra screen every time is worth never hitting that.
 *
 * `state` is the caller's, and it is required rather than optional on
 * purpose. It is the only defence against somebody being walked into
 * connecting an attacker's Google account to their session, and an optional
 * CSRF token is a CSRF token somebody leaves out. The caller mints it, stores
 * it against the session, and compares it when Google comes back.
 *
 * `hd` is worth passing when the domain is known: it makes Google's account
 * chooser refuse personal accounts up front, rather than letting somebody
 * consent with their own Gmail and discover three screens later that a Gmail
 * account has no Workspace to administer.
 */
export function consentUrl(options: {
  /** Opaque, unguessable, stored against the session. Compared on return. */
  state: string;
  /** Pre-fills the account chooser, when we know who is connecting. */
  loginHint?: string;
  /** Restricts the chooser to one Workspace domain. */
  hostedDomain?: string;
}): ConsentUrlResult {
  const configured = oauthClient();
  if (!configured.configured) {
    return fail("not-configured", configured.message);
  }

  if (!options.state.trim()) {
    return fail(
      "invalid-request",
      "A consent link needs a state value to compare against when Google sends the customer back. Without one there is no way to tell our own redirect from somebody else's.",
    );
  }

  const params = new URLSearchParams({
    client_id: configured.client.clientId,
    redirect_uri: configured.client.redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: options.state,
  });

  if (options.loginHint) params.set("login_hint", options.loginHint);
  if (options.hostedDomain) params.set("hd", options.hostedDomain);

  return { ok: true, url: `${AUTH_ENDPOINT}?${params}` };
}

/* --- Reading the id token -------------------------------------------------- */

/**
 * The consenting admin's address and domain, from the id token.
 *
 * The signature is deliberately not verified, and that is not a shortcut. The
 * OpenID Connect specification says so explicitly: a client that receives an
 * id token by direct communication with the token endpoint, over a TLS
 * connection it initiated and validated, may rely on that channel instead of
 * checking the signature. This token did not come from a browser, a redirect,
 * or anything a user touched — it is the body of a response to a POST that
 * this process made to `oauth2.googleapis.com` moments ago, authenticated
 * with our client secret. Fetching and caching Google's JWKS to verify a
 * token we already know the provenance of would be ceremony, not security.
 *
 * If that ever stops being true — if an id token starts arriving from
 * anywhere else — this function is the wrong tool and the signature has to be
 * checked.
 *
 * Everything is optional-chained and type-checked because this is the one
 * place in the file parsing a structure whose shape we did not ask for. A
 * malformed token costs us the domain, not the connection.
 */
function readIdToken(idToken: unknown): {
  adminEmail: string | null;
  domain: string | null;
} {
  if (typeof idToken !== "string") return { adminEmail: null, domain: null };

  const payload = idToken.split(".")[1];
  if (!payload) return { adminEmail: null, domain: null };

  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { email?: unknown; hd?: unknown };

    const email = typeof claims.email === "string" ? claims.email : null;
    /* `hd` is the hosted domain, and Google only sets it for accounts that
       actually belong to a Workspace domain. Its absence is therefore
       information: it means somebody consented with a personal account, and
       a personal account has no users to administer. */
    const domain = typeof claims.hd === "string" ? claims.hd : null;

    return { adminEmail: email, domain };
  } catch {
    return { adminEmail: null, domain: null };
  }
}

/* --- What Google says when it says no -------------------------------------- */

/** The token endpoint's error envelope. Both fields optional: a 502 from
    something in front of Google has neither. */
interface TokenError {
  error?: string;
  error_description?: string;
}

/**
 * Which failure this is, and what to do about it.
 *
 * `invalid_grant` is the interesting one, and it means opposite things at the
 * two ends of this file. During a code exchange it means the authorisation
 * code is stale or already spent — codes are one-time and live about ten
 * minutes — which is a browser problem: press the button again. During a
 * refresh it means the customer's standing permission is gone, which no retry
 * will fix and which is the single most important state this module has. The
 * same string, two entirely different sentences, so the phase is a parameter
 * rather than something guessed from the text.
 *
 * The rest branch on the code alone. Google's OAuth error codes are a small
 * stable set, and the prose in `error_description` is not something to build
 * behaviour on.
 */
function classifyToken(
  status: number,
  error: TokenError,
  phase: "exchange" | "refresh",
): GoogleFailed {
  const code = (error.error ?? "").toLowerCase();
  const detail = (error.error_description ?? "").toLowerCase();

  if (code === "invalid_grant") {
    if (phase === "refresh") {
      return fail(
        "needs-reconnect",
        "Google Workspace needs reconnecting. The permission granted when this was connected is no longer valid — somebody removed the app from their Google account, an admin's password changed, or the grant simply expired. Nothing is broken and nothing was lost; a Workspace admin has to press Connect once more.",
      );
    }

    if (detail.includes("expired") || detail.includes("code")) {
      return fail(
        "invalid-request",
        "That sign-in link has already been used or has expired — Google's authorisation codes are single-use and last a few minutes. Start the connection again.",
      );
    }

    return fail(
      "bad-credentials",
      "Google refused the authorisation code. If the credentials are right, the usual cause is this machine's clock disagreeing with Google's by more than a few minutes.",
    );
  }

  if (code === "invalid_client" || status === 401) {
    return fail(
      "bad-credentials",
      "Google doesn't recognise this application's credentials. Check GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET against the OAuth client in the Cloud console — a secret that was rotated there and not here fails exactly like this.",
    );
  }

  if (code === "redirect_uri_mismatch") {
    return fail(
      "bad-credentials",
      "Google rejected the redirect URI. GOOGLE_OAUTH_REDIRECT_URI has to match one of the Authorized redirect URIs on the OAuth client character for character — including http vs https, the port, and the trailing slash.",
    );
  }

  if (code === "unauthorized_client" || code === "invalid_scope") {
    return fail(
      "unauthorized",
      "Google won't grant this application the permission it asked for. Check that the Admin SDK API is enabled in the Cloud project and that admin.directory.user is listed on the OAuth consent screen.",
    );
  }

  if (status === 429) {
    return fail(
      "rate-limited",
      "Google is rate limiting token requests for this application. Try again shortly.",
    );
  }

  if (status >= 500) {
    return fail(
      "rejected",
      "Google's token endpoint is having a problem at their end. Nothing to fix here; try again shortly.",
    );
  }

  return fail(
    "rejected",
    `Google refused to issue a token (${status}). The full reason is in the server log.`,
  );
}

/* --- The one POST both grants share ---------------------------------------- */

interface TokenPayload {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  id_token?: unknown;
}

type GrantResult = { ok: true; payload: TokenPayload } | GoogleFailed;

/**
 * One form-encoded POST to the token endpoint.
 *
 * `URLSearchParams` rather than a template string: the body carries a client
 * secret and a refresh token, both of which can contain characters that need
 * escaping, and hand-rolled escaping is the kind of thing that works for a
 * year and then silently truncates a credential at a slash.
 *
 * `phase` exists only so the error classifier can tell the two meanings of
 * `invalid_grant` apart. It never reaches Google.
 */
async function grant(
  params: Record<string, string>,
  phase: "exchange" | "refresh",
): Promise<GrantResult> {
  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    /* Logged without the request, because the request body *is* the
       credential — the client secret and, on a refresh, the customer's
       standing permission. */
    console.error(`[lib/google] token endpoint unreachable (${phase}):`, cause);
    return fail(
      "unreachable",
      "Couldn't reach Google to authenticate — no network, or the request timed out. Nothing was created and nothing was changed.",
    );
  }

  /* Read as text and parse by hand. An error from a proxy in front of Google
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
    /* The one place Google's own words are kept, and a place no browser can
       read. Only the short code and description — never `raw` in full, and
       never on a success, where `raw` would be the tokens themselves. */
    console.error(
      `[lib/google] token ${response.status} (${phase}):`,
      `${error.error ?? ""} ${error.error_description ?? ""}`.trim() ||
        "no error body",
    );
    return classifyToken(response.status, error, phase);
  }

  return { ok: true, payload: (payload ?? {}) as TokenPayload };
}

/* --- Completing a connection ----------------------------------------------- */

/**
 * Trades the code Google sent back for a lasting connection.
 *
 * The caller must already have compared Google's `state` against the one it
 * put in `consentUrl` — this function cannot do it, because it never sees the
 * session, and a function that quietly doesn't do a security check the caller
 * assumed it did is worse than one that obviously doesn't.
 *
 * Two things are checked here that would otherwise fail much later, in a much
 * more confusing place:
 *
 * A missing refresh token. Google issues one only on a fresh grant, and while
 * `prompt=consent` should guarantee that, a consent link built by hand
 * somewhere else would not. Storing a connection with no refresh token means
 * everything works for an hour and then stops forever, at a moment nobody is
 * watching. Better to refuse the connection now.
 *
 * A missing directory scope. Google's consent screen lets people grant some
 * of what was asked for and decline the rest, and the checkbox they are most
 * likely to hesitate over is the one that says we can manage their users. If
 * they untick it the flow still completes and looks entirely successful — and
 * then every seat this product ever tries to create returns `403`, weeks
 * later, with an error about authorisation that points at our configuration
 * rather than at their decision. Checking the granted scope here turns that
 * into one clear sentence while they are still on the screen.
 */
export async function exchangeCode(code: string): Promise<ExchangeResult> {
  const configured = oauthClient();
  if (!configured.configured) {
    return fail("not-configured", configured.message);
  }

  if (!code.trim()) {
    return fail(
      "invalid-request",
      "Google didn't send an authorisation code back. If the customer pressed cancel on the consent screen, that's what this looks like.",
    );
  }

  const result = await grant(
    {
      code,
      client_id: configured.client.clientId,
      client_secret: configured.client.clientSecret,
      redirect_uri: configured.client.redirectUri,
      grant_type: "authorization_code",
    },
    "exchange",
  );
  if (!result.ok) return result;

  const { payload } = result;
  const accessToken = payload.access_token;
  const refreshToken = payload.refresh_token;

  if (typeof accessToken !== "string" || !accessToken) {
    console.error("[lib/google] code exchange returned 200 with no token");
    return fail(
      "rejected",
      "Google returned a success with no access token in it. Nothing was connected.",
    );
  }

  if (typeof refreshToken !== "string" || !refreshToken) {
    return fail(
      "invalid-request",
      "Google didn't return a refresh token, so this connection would stop working within the hour. That happens when the account has already granted this app and wasn't asked to consent again — remove the app at myaccount.google.com/permissions and connect once more.",
    );
  }

  const scopes =
    typeof payload.scope === "string" ? payload.scope.split(" ") : [];

  if (!scopes.includes(DIRECTORY_SCOPE)) {
    return fail(
      "unauthorized",
      "Google Workspace was connected, but permission to manage users wasn't granted — that checkbox was left unticked on the consent screen. Without it no accounts can be created, so connect again and leave it on.",
    );
  }

  const lifetime =
    typeof payload.expires_in === "number" &&
    Number.isFinite(payload.expires_in)
      ? payload.expires_in
      : 3600;

  const { adminEmail, domain } = readIdToken(payload.id_token);

  return {
    ok: true,
    connection: {
      refreshToken,
      accessToken,
      accessTokenExpiresAt: Math.floor(Date.now() / 1000) + lifetime,
      scopes,
      adminEmail,
      domain,
    },
  };
}

/* --- The cache ------------------------------------------------------------- */

interface CachedToken {
  /** Which refresh token this came from. A digest, never the token. */
  source: string;
  token: string;
  /** Unix seconds, already reduced by `RENEW_BEFORE_S`. */
  goodUntil: number;
}

interface AuthSlot {
  /** Keyed by `accountId`. One customer's token is never another's. */
  tokens?: Map<string, CachedToken>;
  /** Mints in progress, so a burst shares one round trip. */
  inflight?: Map<string, Promise<TokenResult>>;
}

/**
 * The cache hangs off `globalThis` rather than a module-level `const`.
 *
 * The same reason `showcase/accounts.ts` does it, verified there rather than
 * theorised: Next bundles route handlers and server components into separate
 * module graphs, so the same import gives them different instances of this
 * file. A module-level cache would therefore be one cache per graph, and the
 * dev server re-evaluating the module on hot reload would empty it every time
 * somebody saved. Neither is a correctness problem — the worst case is
 * refreshing a token that was already refreshed — but it turns "one token an
 * hour per customer" into "a token per reload", against an endpoint with a
 * quota.
 *
 * Both fields are optional and shape-checked, so an object left behind by an
 * older revision of this file degrades to a cold cache rather than a crash.
 */
const SLOT_KEY = "__craig_google_tokens__";

function slot(): Required<AuthSlot> {
  const scope = globalThis as typeof globalThis & { [SLOT_KEY]?: AuthSlot };
  const existing = scope[SLOT_KEY];

  if (existing?.tokens instanceof Map && existing.inflight instanceof Map) {
    return existing as Required<AuthSlot>;
  }

  const created: Required<AuthSlot> = {
    tokens: new Map(),
    inflight: new Map(),
  };
  scope[SLOT_KEY] = created;
  return created;
}

/**
 * Identifies a refresh token without storing one.
 *
 * The cache has to notice when an account reconnects, because the old access
 * token was minted from a permission that may since have been revoked — but
 * keeping the refresh token in the cache to compare against would mean a
 * second copy of the most dangerous value in the system, in memory, for no
 * reason. A truncated SHA-256 answers "is this the same token as last time"
 * and answers nothing else.
 */
const digest = (refreshToken: string) =>
  createHash("sha256").update(refreshToken).digest("hex").slice(0, 32);

/** Expired entries, dropped on the way past. The map is otherwise bounded by
    the number of connected customers, which is fine, but a long-running
    process with churn shouldn't hold tokens for accounts nobody has touched
    in a week. */
function prune(tokens: Map<string, CachedToken>, now: number) {
  for (const [key, entry] of tokens) {
    if (entry.goodUntil <= now) tokens.delete(key);
  }
}

/* --- The unattended path --------------------------------------------------- */

async function refresh(
  connection: GoogleConnection,
  clientId: string,
  clientSecret: string,
): Promise<TokenResult> {
  const result = await grant(
    {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refreshToken,
      grant_type: "refresh_token",
    },
    "refresh",
  );
  if (!result.ok) return result;

  const { payload } = result;
  const token = payload.access_token;

  if (typeof token !== "string" || !token) {
    /* A 200 with no token means the contract moved under us. Note what stays
       out of the log line: the payload, which on a success is the token. */
    console.error("[lib/google] refresh returned 200 with no token");
    return fail(
      "rejected",
      "Google returned a success with no access token in it. Nothing was attempted against the Directory API.",
    );
  }

  /* Google's own number, not ours. It has been 3600 for years, but a cache
     that assumes a lifetime rather than reading the one it was given is a
     cache that outlives its token the day that changes. */
  const lifetime =
    typeof payload.expires_in === "number" &&
    Number.isFinite(payload.expires_in)
      ? payload.expires_in
      : 3600;

  const now = Math.floor(Date.now() / 1000);
  const { tokens } = slot();
  prune(tokens, now);
  tokens.set(connection.accountId, {
    source: digest(connection.refreshToken),
    token,
    goodUntil: now + lifetime - RENEW_BEFORE_S,
  });

  /* Google does not rotate refresh tokens for standard web clients, so the
     `refresh_token` field of this response is absent and there is nothing to
     write back. If that ever changes, this is the one place that would have
     to notice — a caller still holding the superseded token would look, months
     later, exactly like a customer who had revoked us. */

  return { ok: true, token };
}

/**
 * An access token for one customer's Workspace, cached for its lifetime.
 *
 * One refresh an hour per account rather than one per call. Refreshing is a
 * network round trip against an endpoint with a quota, and doing it per call
 * would put a second point of failure in front of every operation.
 *
 * Concurrent callers for the same account share one refresh. Without the
 * in-flight map, a workflow that adds three starters at once fires three
 * identical refreshes, two of which are thrown away — pure waste, with a
 * small chance of a rate limit at exactly the moment the product is doing its
 * most visible work.
 *
 * The cache is keyed by `accountId` and validated against a digest of the
 * refresh token, so an account that reconnects gets a new token rather than
 * the one minted under the permission it just replaced, and a token minted
 * for one customer can never be served to another.
 *
 * Never throws, and never logs a token.
 */
export async function accessTokenFor(
  connection: GoogleConnection | null,
): Promise<TokenResult> {
  const configured = oauthClient();
  if (!configured.configured) {
    /* Not logged. This is the normal state of a machine with no Google
       credentials, and a log line every time a workflow looks at a seat would
       be noise that trains people to ignore the log. */
    return fail("not-configured", configured.message);
  }

  if (!connection?.refreshToken || !connection.accountId) {
    return fail(
      "not-connected",
      "This account hasn't connected Google Workspace yet, so nothing was attempted. A Workspace admin needs to connect it once; after that this step runs on its own.",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const source = digest(connection.refreshToken);
  const { tokens, inflight } = slot();

  const cached = tokens.get(connection.accountId);
  if (cached && cached.goodUntil > now && cached.source === source) {
    return { ok: true, token: cached.token };
  }

  /* The two maps are keyed differently, and the difference matters.

     The token cache is keyed by account alone, because a reconnect should
     *replace* what is cached for that account rather than accumulate beside
     it. The in-flight map is keyed by account *and* which refresh token the
     mint is running on, because sharing a round trip across that boundary
     would hand a caller holding a freshly reconnected credential a token
     minted from the one it just replaced — which, if the reconnect happened
     because the old permission was revoked, is a token that is already dead.
     It would surface as an intermittent `needs-reconnect` immediately after
     reconnecting, which is about the most confusing thing this module could
     do to somebody. */
  const key = `${connection.accountId}|${source}`;

  const pending = inflight.get(key);
  if (pending) return pending;

  const { clientId, clientSecret } = configured.client;
  const promise = refresh(connection, clientId, clientSecret).finally(() => {
    /* Cleared only if it is still ours: a slower caller's `finally` must not
       delete a newer refresh that replaced it. */
    const map = slot().inflight;
    if (map.get(key) === promise) map.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}
