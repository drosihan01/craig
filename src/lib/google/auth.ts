import "server-only";
import { createPrivateKey, createSign, type KeyObject } from "node:crypto";

import { DIRECTORY_SCOPE, googleConfig } from "./config";
import { fail, type GoogleFailed } from "./result";

/**
 * Getting an access token, without `google-auth-library`.
 *
 * The whole of OAuth 2.0's service account flow is: build a JSON Web Token
 * describing who you are and what you want, sign it RS256 with the service
 * account's private key, and POST it to Google's token endpoint in exchange
 * for a bearer token. That is roughly forty lines with `node:crypto`, which
 * can sign RS256 natively. `google-auth-library` brings a dependency tree,
 * a credential-discovery system this project has no use for, and a retry
 * policy, wrapped around those forty lines. This repo has almost no
 * dependencies on purpose and the one it would add here buys nothing.
 *
 * The `sub` claim is the part that is easy to leave out and impossible to
 * work without. A service account is not a member of the Workspace tenant;
 * it has no seats, no domain and no admin rights of its own. Without `sub` it
 * gets a perfectly valid token that represents *itself*, and `users.insert`
 * answers that token with `403 Not Authorized to access this resource/api` —
 * an error that reads like a missing scope and sends people to the wrong
 * console. With `sub` set to a super admin's address, and the service
 * account's client id authorised for this scope in the Admin console, the
 * token acts as that admin.
 *
 * Nothing here is ever logged. The assertion is a bearer credential for an
 * hour and the token is one for an hour after that, so both are treated the
 * way the password in `directory.ts` is treated: they exist in memory, they
 * go out over TLS, and they never reach a log line or a browser.
 *
 * Unverified: there are no credentials for a real tenant in this repo, so
 * this flow has never been run end to end. The claim set, the `aud`, the
 * grant type URN and the one-hour cap are taken from Google's OAuth 2.0
 * service account documentation rather than from a successful response.
 */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** The exact URN. Google rejects anything else, including near misses. */
const JWT_BEARER = "urn:ietf:params:oauth:grant-type:jwt-bearer";

/**
 * Google caps an assertion at one hour past `iat` and refuses anything
 * longer, so this is the maximum rather than a preference.
 */
const ASSERTION_LIFETIME_S = 3600;

/**
 * How early a cached token is treated as spent.
 *
 * A token that expires in four seconds is a token that will expire somewhere
 * between this process and Google's front end, and the failure it produces is
 * a 401 on a request that creates an account — the one request in this module
 * where "did it happen?" is genuinely hard to answer afterwards. Sixty
 * seconds of an hour is a cheap insurance premium.
 */
const RENEW_BEFORE_S = 60;

/** Long enough for a slow network, short enough not to pin a handler open. */
const TIMEOUT_MS = 10_000;

export type TokenResult = { ok: true; token: string } | GoogleFailed;

/* --- The cache ------------------------------------------------------------- */

interface CachedToken {
  /** Which credentials this belongs to. No secret material — see below. */
  fingerprint: string;
  token: string;
  /** Unix seconds, already reduced by `RENEW_BEFORE_S`. */
  goodUntil: number;
}

interface AuthSlot {
  cached?: CachedToken;
  /** A mint already in progress, shared rather than duplicated. */
  inflight?: { fingerprint: string; promise: Promise<TokenResult> };
}

/**
 * The cache hangs off `globalThis` rather than a module-level `let`.
 *
 * The same reason `showcase/accounts.ts` does it, verified there rather than
 * theorised: Next bundles route handlers and server components into separate
 * module graphs, so the same import gives them different instances of this
 * file. A module-level cache would therefore be one cache per graph, and the
 * dev server re-evaluating the module on hot reload would throw away whatever
 * was in it every time somebody saved. Neither is a correctness problem —
 * the worst case is minting a token that was already minted — but it turns
 * "one token an hour" into "a token per reload", and Google's token endpoint
 * has a quota.
 *
 * Every field is optional, so an object left behind by an older revision of
 * this file degrades to a cold cache rather than to a crash.
 */
const SLOT_KEY = "__craig_google_token__";

function slot(): AuthSlot {
  const scope = globalThis as typeof globalThis & { [SLOT_KEY]?: AuthSlot };
  return (scope[SLOT_KEY] ??= {});
}

/**
 * Identifies a set of credentials without containing any.
 *
 * The email addresses and the scope, which are all non-secret — the service
 * account address appears in the Admin console and the scope is a public URL.
 * The private key is deliberately absent: hashing it would mean holding key
 * material somewhere new for no gain, and the failure this guards against is
 * "somebody changed which admin we impersonate and the old token kept being
 * used", not key rotation. Rotating only the key leaves a valid token cached
 * for up to an hour, which is harmless: the old token was minted from a real
 * key and Google honours it until it expires.
 */
const fingerprint = (clientEmail: string, adminEmail: string) =>
  `${clientEmail}|${adminEmail}|${DIRECTORY_SCOPE}`;

/* --- The assertion --------------------------------------------------------- */

/**
 * Base64url, as JWT requires: URL-safe alphabet, no padding. Node's `base64url`
 * encoding does both, so this exists mainly to keep the call sites readable.
 */
function base64url(input: string | Buffer): string {
  const bytes = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return bytes.toString("base64url");
}

/**
 * The signed assertion.
 *
 * `kid` is left out of the header. Google's documentation makes it optional
 * and tries every key on the service account when it is absent, which is the
 * behaviour we want: it means a key rotation that updates
 * `GOOGLE_WORKSPACE_PRIVATE_KEY` but not some second variable holding the key
 * id cannot produce a mismatch, because there is no second variable.
 */
function assertion(
  key: KeyObject,
  clientEmail: string,
  adminEmail: string,
): string {
  /* Seconds, and floored. Google reads `iat` and `exp` as integers; a
     fractional value has been observed to be rejected as a malformed claim,
     and `Date.now() / 1000` is fractional by construction. */
  const issuedAt = Math.floor(Date.now() / 1000);

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: DIRECTORY_SCOPE,
      aud: TOKEN_ENDPOINT,
      exp: issuedAt + ASSERTION_LIFETIME_S,
      iat: issuedAt,
      /* The whole reason this module can create a user. See the file header. */
      sub: adminEmail,
    }),
  );

  const signingInput = `${header}.${claims}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(key);

  return `${signingInput}.${base64url(signature)}`;
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
 * The token endpoint uses a small, stable set of `error` codes and puts the
 * useful detail in `error_description`, so this branches on the code first
 * and probes the description only where one code covers two genuinely
 * different fixes. `invalid_grant` is that code: it is returned for a key
 * that doesn't match the service account, for an impersonated address that
 * doesn't exist in the tenant, and for a machine whose clock has drifted far
 * enough that the assertion looks stale. Those are three different people's
 * problems and one status.
 *
 * `unauthorized_client` is the one almost everybody hits first, and it is
 * worth its own sentence because the fix is in a console most people don't
 * expect: domain-wide delegation lives in the *Admin* console, under
 * Security > Access and data control > API controls, keyed by the service
 * account's numeric client id — not by its email, and not in the Cloud
 * console where the service account was created.
 */
function classifyToken(status: number, error: TokenError): GoogleFailed {
  const code = (error.error ?? "").toLowerCase();
  const detail = (error.error_description ?? "").toLowerCase();

  if (code === "unauthorized_client" || code === "invalid_scope") {
    return fail(
      "unauthorized",
      "Google won't let this service account act for the domain. In the Admin console, under Security > Access and data control > API controls > Manage Domain Wide Delegation, add the service account's client ID with the scope https://www.googleapis.com/auth/admin.directory.user. A change there can take a few minutes to take effect.",
    );
  }

  if (code === "invalid_grant") {
    if (detail.includes("signature")) {
      return fail(
        "bad-credentials",
        "Google rejected the signature on the request. GOOGLE_WORKSPACE_PRIVATE_KEY doesn't match GOOGLE_WORKSPACE_CLIENT_EMAIL — usually two halves of two different key files, or a key that has since been deleted in the Cloud console.",
      );
    }

    if (detail.includes("short-lived") || detail.includes("timeframe")) {
      return fail(
        "bad-credentials",
        "Google rejected the request as out of date, which means this machine's clock disagrees with Google's by more than a few minutes. Nothing about the credentials is wrong; fix the system time.",
      );
    }

    return fail(
      "bad-credentials",
      "Google refused to issue a token for the impersonated admin. Check GOOGLE_WORKSPACE_ADMIN_EMAIL is a real, active super admin in this Workspace tenant — an address that has been deleted, suspended, or belongs to a different domain fails exactly like this.",
    );
  }

  if (code === "invalid_client") {
    return fail(
      "bad-credentials",
      "Google doesn't recognise this service account. Check GOOGLE_WORKSPACE_CLIENT_EMAIL against the client_email in the JSON key file, and that the service account still exists.",
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
    `Google refused to issue an access token (${status}). The full reason is in the server log.`,
  );
}

/* --- The token ------------------------------------------------------------- */

async function mint(
  clientEmail: string,
  privateKey: string,
  adminEmail: string,
): Promise<TokenResult> {
  let key: KeyObject;
  try {
    key = createPrivateKey(privateKey);
  } catch {
    /* `config.ts` already checked this looks like a PEM, so reaching here
       means the armour is right and the body isn't: a key truncated on paste,
       or one whose newlines were mangled in a way `normalisePem` couldn't
       undo. The exception is swallowed rather than logged because some Node
       builds include a fragment of the input in the message. */
    return fail(
      "bad-credentials",
      "GOOGLE_WORKSPACE_PRIVATE_KEY starts and ends like a private key but can't be parsed as one. It's usually a copy that lost a line — re-copy the whole private_key value from the service account's JSON key file.",
    );
  }

  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      /* `URLSearchParams` rather than a template string: the assertion is
         base64url and the grant type is a URN full of colons, and both would
         need escaping by hand exactly once before somebody got it wrong. */
      body: new URLSearchParams({
        grant_type: JWT_BEARER,
        assertion: assertion(key, clientEmail, adminEmail),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    /* Logged without the request, because the request body *is* the
       credential. */
    console.error("[lib/google] token endpoint unreachable:", cause);
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
       read. Without this, "the full reason is in the server log" is a lie.
       The response body of a *failed* token request contains no token. */
    console.error(
      `[lib/google] token ${response.status}:`,
      `${error.error ?? ""} ${error.error_description ?? raw.slice(0, 200)}`.trim(),
    );
    return classifyToken(response.status, error);
  }

  const body = (payload ?? {}) as { access_token?: unknown; expires_in?: unknown };
  const token = body.access_token;
  if (typeof token !== "string" || !token) {
    /* A 200 with no token means the contract moved under us. Note what is
       *not* logged: `raw`, which on a success would be the token itself. */
    console.error("[lib/google] token endpoint returned 200 with no token");
    return fail(
      "rejected",
      "Google returned a success with no access token in it. Nothing was attempted against the Directory API.",
    );
  }

  /* Google's own number, not ours. It has been 3600 for years, but a cache
     that assumes a lifetime rather than reading the one it was given is a
     cache that outlives its token the day that changes. */
  const lifetime =
    typeof body.expires_in === "number" && Number.isFinite(body.expires_in)
      ? body.expires_in
      : ASSERTION_LIFETIME_S;

  const goodUntil = Math.floor(Date.now() / 1000) + lifetime - RENEW_BEFORE_S;

  slot().cached = {
    fingerprint: fingerprint(clientEmail, adminEmail),
    token,
    goodUntil,
  };

  return { ok: true, token };
}

/**
 * A bearer token for the Directory API, cached for its lifetime.
 *
 * One token an hour rather than one per call. Minting is an RSA signature and
 * a network round trip, and doing it per call would put a second point of
 * failure in front of every single operation as well as burning quota on the
 * token endpoint.
 *
 * Concurrent callers share one mint. Without the in-flight promise, a
 * workflow that adds three starters at once fires three identical token
 * requests, two of which are thrown away — and each one invalidates nothing,
 * so it is pure waste with a small chance of a rate limit at exactly the
 * moment the product is doing its most visible work.
 *
 * Never throws, and never logs the token.
 */
export async function accessToken(): Promise<TokenResult> {
  const configured = googleConfig();
  if (!configured.configured) {
    /* Not logged. This is the normal state of a machine with no Google
       credentials, and a log line every time a workflow looks at a seat would
       be noise that trains people to ignore the log. */
    return fail("not-configured", configured.message);
  }

  const { clientEmail, privateKey, adminEmail } = configured.config;
  const id = fingerprint(clientEmail, adminEmail);
  const state = slot();

  const cached = state.cached;
  if (
    cached &&
    cached.fingerprint === id &&
    cached.goodUntil > Math.floor(Date.now() / 1000)
  ) {
    return { ok: true, token: cached.token };
  }

  /* Only joins a mint for the same credentials. Sharing one across a change
     of impersonated admin would hand the caller a token for the wrong
     identity, which is the kind of bug that looks like a permissions problem
     for a very long time. */
  const inflight = state.inflight;
  if (inflight && inflight.fingerprint === id) return inflight.promise;

  const promise = mint(clientEmail, privateKey, adminEmail).finally(() => {
    /* Cleared only if it is still ours: a slower caller's `finally` must not
       delete a newer mint that replaced it. */
    if (slot().inflight?.promise === promise) slot().inflight = undefined;
  });

  state.inflight = { fingerprint: id, promise };
  return promise;
}
