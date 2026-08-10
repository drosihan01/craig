import "server-only";

import { SCOPES, SIGNATURE_SCOPE, docusignClient } from "./config";
import { fail, type DocusignFailed } from "./result";

/**
 * Connecting a customer's DocuSign account, and finding out where their API
 * actually lives.
 *
 * Unverified: no DocuSign account has ever been connected through this module.
 * The endpoints, parameters and response shapes come from DocuSign's
 * authentication reference, not from a response this code has received. A
 * first live consent still has to prove: that the authorize URL below is
 * accepted as written; that the Basic-auth token exchange returns both an
 * access token and a refresh token; that `/oauth/userinfo` names an account
 * with a `base_uri`; and that a customer pressing Cancel really arrives with
 * `error=user_cancelled`.
 *
 * ## Three endpoints, and that is the whole authentication service
 *
 * DocuSign is explicit that its authentication service exposes exactly three:
 * `GET /oauth/auth`, `POST /oauth/token`, `GET /oauth/userinfo`. Both hosts
 * are in `config.ts` and neither is written here, because "which environment"
 * is configuration and a literal host in this file would be a second place for
 * it to be wrong.
 *
 * **There is no revocation endpoint.** That is not an omission in this module;
 * it is the documented shape of DocuSign's OAuth. Consent is withdrawn by a
 * human — the account holder under Manage Profile › Connected Apps › Revoke,
 * or an organisation administrator in DocuSign Admin — and doing so
 * invalidates the refresh tokens while leaving any live access token working
 * until it expires on its own. The disconnect route therefore *cannot* do what
 * the Slack and Google blocks do, and says so rather than calling something
 * that quietly does nothing. `revocationNotice` below is the sentence it uses.
 *
 * ## What is different from the neighbouring blocks, and matters
 *
 * **The authorisation code lives two minutes.** Slack's is about ten, Google's
 * longer. Two minutes is short enough that an ordinary consent — a customer
 * who alt-tabs, or who has to sign in to DocuSign first — can expire in
 * flight. `invalid_grant` on a code that was correct is the expected failure
 * here, not a mysterious one, and its message says so.
 *
 * **The token exchange authenticates with a Basic header, not body fields.**
 * DocuSign wants `Authorization: Basic base64(integrationKey:secretKey)` and a
 * body of only `grant_type` and `code`. Notably it documents **no
 * `redirect_uri` on the exchange**, unlike Google and Slack, which both
 * require the pair to match. Sending one anyway would be guessing at an
 * undocumented parameter on the one request that carries our client secret, so
 * this sends exactly what is documented.
 *
 * **Refresh tokens rotate and expire.** The access token lasts eight hours;
 * the refresh token "typically around 30 days" and DocuSign reserves the right
 * to change that without notice. Every refresh returns a *new* refresh token,
 * and with the `extended` scope it carries a full fresh lifetime. Two
 * consequences for whoever writes the runner: the new refresh token must be
 * written back to the store on every refresh or the connection dies at the old
 * one's expiry, and a connection nobody uses for a month is dead regardless.
 * Nothing in the response says when a refresh token expires, so the lifetime
 * is genuinely undiscoverable from the wire — which means it must never be
 * computed and stored as if it were known. `needs_reconnect` on the row is
 * where the truth will eventually be written, by the first refresh that fails.
 *
 * Written against `fetch` rather than `docusign-esign`, matching every other
 * integration here: the SDK wraps two form-encoded POSTs and a GET in a
 * dependency tree, and drags an API client this block does not need yet.
 */

/** Long enough for a slow network, short enough not to pin a handler open. */
const TIMEOUT_MS = 10_000;

/**
 * What a completed consent gives us. All of it belongs to one customer.
 */
export interface ConnectedDocusign {
  /**
   * The standing permission, and the only part worth sealing. Around 30 days
   * of life, replaced on every refresh.
   */
  refreshToken: string;
  /**
   * Eight hours of access, used once here to ask who consented and then
   * dropped. Deliberately *not* stored: an eight-hour credential in a database
   * is a liability with almost no usable life, and the refresh token can mint
   * a fresh one whenever something finally needs it.
   */
  accessToken: string;
  /** Seconds, straight off the response. Never assumed to be 28,800. */
  expiresIn: number;
  /** What DocuSign actually granted, which is not always what we asked for. */
  scopes: string[];
}

/**
 * Which DocuSign account the consent reaches, and where its API lives.
 * Discovered, never configured — see the base-URI argument in `config.ts`.
 */
export interface DocusignAccount {
  /** GUID. Half of every API path this connection will ever build. */
  accountId: string;
  /** The account's name at DocuSign — what a screen shows a human to check. */
  accountName: string;
  /** e.g. `https://demo.docusign.net`, `https://eu.docusign.net`. */
  baseUri: string;
  /** The person who consented. DocuSign returns a real address here. */
  email: string | null;
}

export type ConsentUrlResult = { ok: true; url: string } | DocusignFailed;
export type ExchangeResult =
  | { ok: true; connection: ConnectedDocusign }
  | DocusignFailed;
export type AccountResult =
  | { ok: true; account: DocusignAccount }
  | DocusignFailed;

/* --- The consent screen ---------------------------------------------------- */

/**
 * Where to send a customer's DocuSign administrator to grant consent.
 *
 * `state` is required here rather than optional, although DocuSign documents
 * it as optional and merely "strongly recommended". An optional CSRF token is
 * a CSRF token somebody leaves out, and the attack it stops — a signed-in
 * admin walked into completing an attacker's consent, so that the attacker's
 * DocuSign account is what this company's employment contracts get sent from —
 * is worth more here than anywhere else in this repo. The mechanism is in
 * `docusign-state.ts`.
 *
 * `prompt` is deliberately not sent. Setting it to `login` would force a
 * re-authentication even for an admin already signed in to DocuSign, which
 * buys nothing: the state parameter is what binds the return to this browser,
 * and a forced re-login mostly teaches customers to type their DocuSign
 * password into whatever asks.
 */
export function consentUrl(options: {
  /** Opaque, unguessable, bound to a cookie. Compared on return. */
  state: string;
}): ConsentUrlResult {
  const configured = docusignClient();
  if (!configured.configured) {
    return fail("not-configured", configured.message);
  }

  if (!options.state.trim()) {
    return fail(
      "invalid-request",
      "A consent link needs a state value to compare against when DocuSign sends the customer back. Without one there is no way to tell our own redirect from somebody else's.",
    );
  }

  const params = new URLSearchParams({
    response_type: "code",
    /* Space-separated, which `URLSearchParams` percent-encodes as `+` —
       DocuSign's own sample URLs use `%20`, and the two are equivalent in a
       query string by the same spec that defines the encoding. Recorded
       because it looks like a discrepancy to anybody comparing our URL with
       the documentation's, and is the kind of thing a first live consent
       settles for good. */
    scope: SCOPES.join(" "),
    client_id: configured.client.integrationKey,
    state: options.state,
    redirect_uri: configured.client.redirectUri,
  });

  return {
    ok: true,
    url: `${configured.client.accountServer}/oauth/auth?${params}`,
  };
}

/* --- What DocuSign says when it says no ------------------------------------ */

/**
 * DocuSign's error is a short string in an `error` field; these are the ones
 * worth telling apart because their fixes differ. Everything else is
 * `rejected` with the string kept in the server log.
 *
 * The list mixes standard OAuth 2 names with DocuSign's own, because the
 * documentation gives its errors human titles ("Issuer not found", "Invalid
 * RedirectUri") without stating the machine string that carries them. Matching
 * both spellings costs nothing and covers whichever turns out to be real —
 * this is precisely the gap a first live tenant closes, and the default branch
 * exists so that closing it is a code change rather than a crash.
 */
function classify(error: string): DocusignFailed {
  switch (error.toLowerCase()) {
    case "invalid_grant":
    case "invalid grant":
      return fail(
        "invalid-request",
        "That connection attempt expired before it could be finished. DocuSign's authorisation codes are single-use and last two minutes, which is short enough that an interruption is all it takes. Start the connection again — it will normally work second time.",
      );
    case "invalid_client":
    case "unauthorized_client":
    case "client id is disabled":
      return fail(
        "bad-credentials",
        "DocuSign doesn't recognise this application's credentials, or the integration key is disabled. Check DOCUSIGN_INTEGRATION_KEY and DOCUSIGN_SECRET_KEY against the Apps and Keys page for this environment — a key that only exists in the developer environment fails exactly like this against production.",
      );
    case "invalid_redirect_uri":
      return fail(
        "bad-credentials",
        "DocuSign rejected the redirect URI. DOCUSIGN_OAUTH_REDIRECT_URI has to match a redirect URI registered against the integration key, character for character — and redirect URIs are not copied when a key is promoted to production, so a key that works in demo can fail here on its first production use.",
      );
    case "invalid_scope":
      return fail(
        "unauthorized",
        "DocuSign won't grant this application the permission it asked for. Check the integration key's settings against the scope list in src/lib/docusign/config.ts.",
      );
    case "consent_required":
      return fail(
        "needs-reconnect",
        "DocuSign needs consent again before it will issue anything. Nothing is broken and nothing was lost; a DocuSign administrator has to approve the connection once more.",
      );
    case "issuer not found":
      return fail(
        "bad-credentials",
        "DocuSign says that user doesn't exist in the environment this deployment is pointed at. That is almost always ours rather than yours: DOCUSIGN_ENVIRONMENT is set to the wrong one of demo and production.",
      );
    case "principal_throttled":
    case "rate_limit_exceeded":
      return fail(
        "rate-limited",
        "DocuSign is rate limiting requests from this application. Nothing was changed. Try again shortly — their limits reset on the hour.",
      );
    default:
      return fail(
        "rejected",
        "DocuSign refused the request without saying usefully why. The full reason is in the server log.",
      );
  }
}

/* --- One request, DocuSign's way -------------------------------------------- */

interface TokenPayload {
  access_token?: unknown;
  token_type?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  error?: unknown;
  error_description?: unknown;
}

type TokenApiResult = { ok: true; payload: TokenPayload } | DocusignFailed;

/**
 * `Authorization: Basic base64(key:secret)`, which is how DocuSign
 * authenticates the token endpoint.
 *
 * Built here rather than at the call site so the secret is handled in one
 * place, and with `Buffer` rather than `btoa` because `btoa` operates on
 * Latin-1 and would mangle any non-ASCII byte rather than refusing — DocuSign
 * keys and secrets are GUIDs today, which is exactly the sort of "can't
 * happen" that changes without an announcement.
 */
function basicAuth(integrationKey: string, secretKey: string): string {
  return `Basic ${Buffer.from(`${integrationKey}:${secretKey}`, "utf8").toString("base64")}`;
}

/**
 * One form-encoded POST to `/oauth/token`, with DocuSign's failures normalised
 * into ours.
 *
 * Unlike Slack, DocuSign reports failure with an HTTP status *and* a JSON
 * body, so the status is trustworthy here — but the body is read first
 * regardless, because the `error` field is the only thing that distinguishes
 * "your code expired" from "your secret is wrong", and both arrive as 400.
 *
 * `URLSearchParams` rather than a template string: hand-rolled escaping is the
 * kind of thing that works for a year and then truncates a credential at an
 * ampersand.
 */
async function tokenRequest(
  params: Record<string, string>,
): Promise<TokenApiResult> {
  const configured = docusignClient();
  if (!configured.configured) {
    return fail("not-configured", configured.message);
  }

  let response: Response;
  try {
    response = await fetch(`${configured.client.accountServer}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicAuth(
          configured.client.integrationKey,
          configured.client.secretKey,
        ),
      },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    /* Logged without the request — the request body carries an authorisation
       code or a refresh token, and the headers carry the client secret. */
    console.error("[lib/docusign] token endpoint unreachable:", cause);
    return fail(
      "unreachable",
      "Couldn't reach DocuSign — no network, or the request timed out. Nothing was connected and nothing was changed.",
    );
  }

  const raw = await response.text();
  let payload: TokenPayload;
  try {
    payload = JSON.parse(raw) as TokenPayload;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const error = typeof payload.error === "string" ? payload.error : "";
    const description =
      typeof payload.error_description === "string"
        ? payload.error_description
        : "";
    /* DocuSign's own words, in the one place no browser can read. Never `raw`
       in full — on success `raw` contains both tokens, and a copy-paste of
       this line onto the success path is one careless edit away. */
    console.error(
      `[lib/docusign] token endpoint refused (${response.status}): ${error || "no error field"} ${description}`.trim(),
    );
    if (response.status === 429) {
      return fail(
        "rate-limited",
        "DocuSign is rate limiting requests from this application. Nothing was changed. Try again shortly.",
      );
    }
    if (response.status >= 500) {
      return fail(
        "rejected",
        "DocuSign is having a problem at their end. Nothing to fix here; try again shortly.",
      );
    }
    return classify(error);
  }

  return { ok: true, payload };
}

/**
 * The shared reading of a token response, used by both the first exchange and
 * every refresh — the two return the same shape and DocuSign's rotation makes
 * that not a coincidence: a refresh is an exchange of one grant for another.
 *
 * Three refusals here would otherwise become confusing failures much later.
 *
 * No refresh token means the grant cannot outlive the afternoon. DocuSign only
 * returns one on the Authorization Code Grant, so its absence means either the
 * key is configured for a different grant type or the contract moved; storing
 * an eight-hour credential and calling it a connection would be a lie the
 * product tells for eight hours and then stops.
 *
 * No access token means there is nothing to ask userinfo with, so the account
 * cannot be named, so nothing could be checked.
 *
 * A grant without `signature` cannot send a contract, which is the block's one
 * job. DocuSign's consent screen is approve-all today, but the key's
 * configuration can drift from `config.ts`, and the alternative to refusing
 * now is failing on a real person's first morning.
 */
function readTokens(payload: TokenPayload): ExchangeResult {
  const accessToken = payload.access_token;
  const refreshToken = payload.refresh_token;

  if (typeof accessToken !== "string" || !accessToken) {
    console.error("[lib/docusign] token response carried no access_token");
    return fail(
      "rejected",
      "DocuSign returned a success with no token in it. Nothing was connected.",
    );
  }

  if (typeof refreshToken !== "string" || !refreshToken) {
    console.error("[lib/docusign] token response carried no refresh_token");
    return fail(
      "rejected",
      "DocuSign granted access that expires in a few hours and nothing that could renew it, so nothing was stored — a connection that quietly stops working overnight is worse than one that never started. Check that the integration key is configured for Authorization Code Grant.",
    );
  }

  /* Space-separated per OAuth 2, and split on commas too because a format the
     docs call fixed is a format one live response gets to contradict — the
     lesson the Slack block wrote down and the Google block paid for. */
  const scopes =
    typeof payload.scope === "string"
      ? payload.scope.split(/[\s,]+/).filter(Boolean)
      : [];

  if (scopes.length > 0 && !scopes.includes(SIGNATURE_SCOPE)) {
    return fail(
      "unauthorized",
      "DocuSign connected, but without permission to send documents for signature — which is the one thing this block is for. The integration key's scopes don't match what Craig needs; nothing was stored.",
    );
  }

  return {
    ok: true,
    connection: {
      refreshToken,
      accessToken,
      /* Read off the response rather than assumed. DocuSign documents eight
         hours; the Google block learned the hard way that a documented
         lifetime and a granted lifetime are different numbers. */
      expiresIn:
        typeof payload.expires_in === "number" ? payload.expires_in : 0,
      scopes,
    },
  };
}

/* --- Completing a connection ----------------------------------------------- */

/**
 * Trades the code DocuSign sent back for a refresh token.
 *
 * The caller must already have compared DocuSign's `state` against the one it
 * minted — this function never sees the session, and a security check it
 * quietly didn't do would be worse than one it obviously doesn't.
 */
export async function exchangeCode(code: string): Promise<ExchangeResult> {
  if (!code.trim()) {
    return fail(
      "invalid-request",
      "DocuSign didn't send an authorisation code back. If the customer pressed Cancel on the consent screen, that's what this looks like.",
    );
  }

  const result = await tokenRequest({
    grant_type: "authorization_code",
    code,
  });
  if (!result.ok) return result;

  return readTokens(result.payload);
}

/**
 * A fresh access token from a stored refresh token.
 *
 * **Nothing calls this yet**, and saying so is the point: there is no runner,
 * so no code path in this repo has ever needed an access token after the
 * callback. It exists because a stored refresh token with no documented way to
 * spend it is a credential whose purpose a later reader has to reconstruct,
 * and because the rotation rule below is easier to state next to the code that
 * causes it than in a comment somewhere else.
 *
 * **The returned refresh token replaces the stored one.** DocuSign issues a
 * new refresh token on every refresh and retires the old one. A runner that
 * uses the new access token and forgets to write back the new refresh token
 * gets exactly one more successful run, then a dead connection — which is the
 * same trap Linear's rotation sets, one file over.
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<ExchangeResult> {
  if (!refreshToken.trim()) {
    return fail(
      "not-connected",
      "There is no stored DocuSign connection to renew, so nothing was attempted.",
    );
  }

  const result = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (!result.ok) {
    /* An expired or revoked refresh token comes back as `invalid_grant`, which
       `classify` reads as a malformed request — accurate for a two-minute
       authorisation code, wrong for a thirty-day refresh token. The fix a
       customer needs is "consent again", so it is renamed here, where the
       distinction is knowable, rather than in `classify`, where it is not. */
    return result.reason === "invalid-request"
      ? fail(
          "needs-reconnect",
          "DocuSign no longer accepts the permission it gave us. That happens when the connection has gone unused for about a month, or when somebody revoked it under Connected Apps in their DocuSign profile. Nothing is broken; a DocuSign administrator has to connect it once more.",
        )
      : result;
  }

  return readTokens(result.payload);
}

/* --- Where this customer's API actually lives -------------------------------- */

interface UserInfoAccount {
  account_id?: unknown;
  account_name?: unknown;
  base_uri?: unknown;
  is_default?: unknown;
}

interface UserInfoPayload {
  email?: unknown;
  accounts?: unknown;
}

/**
 * Asks DocuSign who consented, which account they chose, and — the part
 * nothing else can supply — what host that account's API answers on.
 *
 * This is not an optional nicety on the way to storing a token. It is the only
 * documented source of the `base_uri` every future API call has to be built
 * from, and the only way to put a checkable name on the connection. See
 * `config.ts` for why a constant here would work until the second customer.
 *
 * **Which account, when there are several.** A DocuSign user can belong to
 * many, and exactly one is normally flagged `is_default` — normally, because
 * DocuSign documents rare records with no default at all, and even rarer ones
 * with no accounts. The default is taken when there is one, the first entry
 * when there is not, and no account at all is a refusal rather than a guess.
 * Offering the customer a chooser would be better and needs a screen this
 * block does not have yet; what saves it from being a silent wrong guess is
 * that the chosen account's *name* is stored and shown, so a person can see
 * which one it picked.
 */
export async function accountFor(accessToken: string): Promise<AccountResult> {
  const configured = docusignClient();
  if (!configured.configured) {
    return fail("not-configured", configured.message);
  }

  let response: Response;
  try {
    response = await fetch(`${configured.client.accountServer}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    console.error("[lib/docusign] userinfo unreachable:", cause);
    return fail(
      "unreachable",
      "Couldn't reach DocuSign to find out which account was connected. Nothing was stored.",
    );
  }

  const raw = await response.text();
  let payload: UserInfoPayload;
  try {
    payload = JSON.parse(raw) as UserInfoPayload;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    /* Safe to log in full: this endpoint's error bodies carry an error name, a
       description and a support reference id, and no credential. The token is
       in the request header, which is not logged. */
    console.error(`[lib/docusign] userinfo refused (${response.status}):`, raw);
    if (response.status === 429) {
      return fail(
        "rate-limited",
        "DocuSign is rate limiting this application's requests. Nothing was stored — try connecting again shortly.",
      );
    }
    if (response.status === 401) {
      return fail(
        "unauthorized",
        "DocuSign wouldn't accept the permission it had just granted. Nothing was stored; connecting again is safe.",
      );
    }
    return fail(
      "rejected",
      "DocuSign wouldn't say which account was connected, so there was nothing to attach the connection to. Nothing was stored.",
    );
  }

  const accounts = Array.isArray(payload.accounts)
    ? (payload.accounts as UserInfoAccount[])
    : [];
  const chosen =
    accounts.find((entry) => entry.is_default === true) ?? accounts[0];

  const accountId = chosen?.account_id;
  const baseUri = chosen?.base_uri;

  if (typeof accountId !== "string" || !accountId) {
    console.error("[lib/docusign] userinfo returned no usable account");
    return fail(
      "rejected",
      "DocuSign signed in but reported no account for that user, so there was nothing to connect. DocuSign's own guidance for this is to contact their support — it means the user's record needs repairing at their end. Nothing was stored.",
    );
  }

  if (typeof baseUri !== "string" || !baseUri) {
    /* Refused rather than defaulted to demo.docusign.net. A wrong base URI is
       not a broken connection, it is a connection that talks to the wrong
       data centre — see `config.ts`. */
    return fail(
      "rejected",
      "DocuSign didn't say which of its regions this account uses, and guessing would mean sending contracts to the wrong data centre. Nothing was stored; connecting again is safe.",
    );
  }

  return {
    ok: true,
    account: {
      accountId,
      accountName:
        typeof chosen?.account_name === "string" && chosen.account_name
          ? chosen.account_name
          : "",
      /* Trailing slash trimmed once, here, because DocuSign's documented
         path-building concatenates `base_uri` with `/restapi/v2.1/...` and a
         doubled slash is the sort of thing that works on one host and 404s on
         another. */
      baseUri: baseUri.replace(/\/+$/, ""),
      email: typeof payload.email === "string" ? payload.email : null,
    },
  };
}

/* --- Undoing one ------------------------------------------------------------ */

/**
 * What the disconnect route tells a customer instead of revoking.
 *
 * Exported as a sentence rather than implemented as a function, because the
 * function would be a lie. DocuSign's authentication service has three
 * endpoints and none of them revokes a token: consent is withdrawn by the
 * account holder in their own DocuSign profile, or by an organisation
 * administrator in DocuSign Admin. Deleting our copy is genuinely the whole of
 * what this deployment can do, and the honest disconnect is one that deletes
 * the credential and says plainly what it could not do — rather than a
 * `revokeToken` that swallows a 404 and lets a customer believe DocuSign was
 * told.
 *
 * Worth knowing for whoever writes the runner: revoking consent at DocuSign
 * invalidates refresh tokens but leaves already-issued access tokens working
 * until they expire, so "revoked" and "cannot act" are up to eight hours
 * apart.
 */
export const revocationNotice =
  "Craig's copy of the permission is gone. DocuSign has no way for an application to hand a permission back, so to withdraw it at their end too, open your DocuSign profile, go to Connected Apps and revoke Craig there.";
