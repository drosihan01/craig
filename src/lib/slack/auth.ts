import "server-only";

import { INVITE_SCOPE, SCOPES, slackClient } from "./config";
import { fail, type SlackFailed } from "./result";

/**
 * Connecting a customer's Slack workspace once, and holding what comes back.
 *
 * Unverified: no Slack workspace has ever been connected through this module.
 * The endpoints, parameters and response shapes are from Slack's OAuth v2
 * documentation, not from a response this code has received. A first live
 * install still has to prove: that the consent screen grants the scope list
 * in `config.ts` as written; that the granted-scope string comes back
 * comma-separated as documented (it is parsed tolerantly below anyway); that
 * `team.id`/`team.name` are present on a plain workspace install; and that
 * Slack's errors actually arrive as `200 {"ok":false}` in the wild rather
 * than only in the docs.
 *
 * The model differs from Google in one way that shapes everything here:
 * **Slack's default OAuth issues one long-lived bot token and no refresh
 * token.** There is no hourly exchange — `access_token` (an `xoxb-…` string)
 * is the whole standing permission, valid until the workspace uninstalls the
 * app or something calls `auth.revoke`. (Slack's opt-in "token rotation"
 * changes this to a 12-hour token plus refresh token; this app does not opt
 * in, and if that setting is ever flipped at api.slack.com, this module is
 * the thing that has to grow a refresh path — connections made before the
 * flip keep working, new ones would break within a day.) So what gets sealed
 * into the database is the bot token itself, and it is exactly as dangerous
 * as Google's refresh token: a standing authorisation inside somebody else's
 * company, never logged, never sent to a browser.
 *
 * Slack's other sharp edge, handled once in `webApi()` below: **the Web API
 * reports failure inside a 200.** `response.ok` is true and the body says
 * `{"ok": false, "error": "invalid_code"}`. Code that checks the HTTP status
 * the way the Google module does would read every failure as success, which
 * is the worst possible polarity for a function that stores credentials.
 *
 * Written against `fetch` rather than `@slack/oauth`, matching Google, Resend
 * and Stripe: the SDK wraps two form-encoded POSTs in a dependency tree and a
 * state-store abstraction this repo already has a better version of.
 */

const AUTH_ENDPOINT = "https://slack.com/oauth/v2/authorize";
const ACCESS_ENDPOINT = "https://slack.com/api/oauth.v2.access";
const REVOKE_ENDPOINT = "https://slack.com/api/auth.revoke";

/** Long enough for a slow network, short enough not to pin a handler open. */
const TIMEOUT_MS = 10_000;

/** What a completed install gives us. All of it belongs to one customer. */
export interface ConnectedSlack {
  /**
   * The bot token — the whole of the connection. Store sealed, read only by
   * server code. `xoxb-…` by shape, though nothing here depends on the
   * prefix: Slack documents token formats as subject to change.
   */
  botToken: string;
  /** Slack's stable id for the workspace (`T…`). */
  teamId: string;
  /** The workspace's display name — what a screen shows a human to check. */
  teamName: string;
  /**
   * The bot's own user id in that workspace (`U…`). Stored nowhere yet, but
   * returned because `conversations.invite` from a channel the bot is not in
   * fails with `not_in_channel`, and the fix — join first — needs to know
   * who "the bot" is.
   */
  botUserId: string | null;
  /** What Slack actually granted, which is not always what we asked for. */
  scopes: string[];
}

export type ConsentUrlResult = { ok: true; url: string } | SlackFailed;
export type ExchangeResult = { ok: true; connection: ConnectedSlack } | SlackFailed;

/* --- The consent screen ---------------------------------------------------- */

/**
 * Where to send a customer's Slack admin to install the app.
 *
 * Simpler than Google's because Slack's model is simpler: there is no
 * `access_type=offline` (the bot token is long-lived by default) and no
 * `prompt=consent` (reinstalling always returns the token). What must not be
 * simplified away is `state` — the CSRF defence is the caller's, exactly as
 * it is for Google, and it is required rather than optional here for the same
 * reason: an optional CSRF token is a CSRF token somebody leaves out. The
 * attack it stops is in `slack-state.ts`.
 *
 * Bot scopes travel in `scope`; `user_scope` is deliberately never sent, so
 * Slack has no reason to mint a user token that would die with the installing
 * admin's membership.
 */
export function consentUrl(options: {
  /** Opaque, unguessable, bound to a cookie. Compared on return. */
  state: string;
}): ConsentUrlResult {
  const configured = slackClient();
  if (!configured.configured) {
    return fail("not-configured", configured.message);
  }

  if (!options.state.trim()) {
    return fail(
      "invalid-request",
      "A consent link needs a state value to compare against when Slack sends the customer back. Without one there is no way to tell our own redirect from somebody else's.",
    );
  }

  const params = new URLSearchParams({
    client_id: configured.client.clientId,
    redirect_uri: configured.client.redirectUri,
    scope: SCOPES.join(","),
    state: options.state,
  });

  return { ok: true, url: `${AUTH_ENDPOINT}?${params}` };
}

/* --- What Slack says when it says no ---------------------------------------- */

/**
 * Slack's error is one snake_case string; these are the documented ones worth
 * telling apart because their fixes differ. Everything else is `rejected`
 * with the string kept in the server log — Slack's error set is larger than
 * its documentation, which is precisely the kind of gap only a live tenant
 * closes.
 */
function classify(error: string): SlackFailed {
  switch (error) {
    case "invalid_code":
    case "code_already_used":
      return fail(
        "invalid-request",
        "That connection attempt has already been used or has expired — Slack's authorisation codes are single-use and last about ten minutes. Start the connection again.",
      );
    case "invalid_client_id":
    case "bad_client_secret":
      return fail(
        "bad-credentials",
        "Slack doesn't recognise this application's credentials. Check SLACK_CLIENT_ID and SLACK_CLIENT_SECRET against the app at api.slack.com — a secret rotated there and not here fails exactly like this.",
      );
    case "bad_redirect_uri":
    case "oauth_authorization_url_mismatch":
      return fail(
        "bad-credentials",
        "Slack rejected the redirect URI. SLACK_OAUTH_REDIRECT_URI has to match a Redirect URL on the app config character for character.",
      );
    case "invalid_scope":
    case "invalid_scope_requested":
      return fail(
        "unauthorized",
        "Slack won't grant this application the permission it asked for. Check the app's OAuth scopes at api.slack.com against the list in src/lib/slack/config.ts.",
      );
    case "token_revoked":
    case "account_inactive":
      return fail(
        "needs-reconnect",
        "Slack needs reconnecting. The app was removed from the workspace or its token was revoked — nothing is broken and nothing was lost; a workspace admin has to connect it once more.",
      );
    case "ratelimited":
      return fail(
        "rate-limited",
        "Slack is rate limiting requests from this application. Try again shortly.",
      );
    default:
      return fail(
        "rejected",
        "Slack refused the request without saying usefully why. The full reason is in the server log.",
      );
  }
}

/* --- One POST, Slack's way -------------------------------------------------- */

interface AccessPayload {
  ok?: unknown;
  error?: unknown;
  access_token?: unknown;
  token_type?: unknown;
  scope?: unknown;
  bot_user_id?: unknown;
  team?: { id?: unknown; name?: unknown } | null;
}

type WebApiResult = { ok: true; payload: AccessPayload } | SlackFailed;

/**
 * One form-encoded POST to a Slack Web API endpoint, with Slack's own
 * failure convention normalised into ours.
 *
 * The ordering below is the whole reason this helper exists: read the body
 * *first*, then decide, because `ok` lives in the JSON and not in the status.
 * A non-2xx status still happens — a proxy in front of Slack, a 429 with an
 * HTML body — so both paths are covered, and a body that isn't JSON is
 * treated as the transport failing rather than as a parse bug here.
 *
 * `URLSearchParams` rather than a template string: the body carries the
 * client secret, and hand-rolled escaping is the kind of thing that works
 * for a year and then truncates a credential at an ampersand.
 */
async function webApi(
  endpoint: string,
  params: Record<string, string>,
  /**
   * Sent as `Authorization: Bearer`, which is where Slack's current docs put
   * a token — the form-body `token` parameter still works today and is the
   * kind of legacy affordance that gets turned off without a version bump.
   * `oauth.v2.access` is the one call with no token, authenticated by the
   * client secret in its body instead.
   */
  token?: string,
): Promise<WebApiResult> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    /* Logged without the request — the request body is the credential. */
    console.error(`[lib/slack] ${endpoint} unreachable:`, cause);
    return fail(
      "unreachable",
      "Couldn't reach Slack — no network, or the request timed out. Nothing was connected and nothing was changed.",
    );
  }

  const raw = await response.text();
  let payload: AccessPayload;
  try {
    payload = JSON.parse(raw) as AccessPayload;
  } catch {
    payload = {};
  }

  if (payload.ok !== true) {
    const error = typeof payload.error === "string" ? payload.error : "";
    /* The one place Slack's own words are kept, and a place no browser can
       read. Never `raw` in full — on a success `raw` is the token itself, and
       a truncation bug away from being so on any path. */
    console.error(
      `[lib/slack] ${endpoint} refused (${response.status}):`,
      error || "no error field",
    );
    if (response.status === 429) {
      return fail(
        "rate-limited",
        "Slack is rate limiting requests from this application. Try again shortly.",
      );
    }
    if (response.status >= 500) {
      return fail(
        "rejected",
        "Slack is having a problem at their end. Nothing to fix here; try again shortly.",
      );
    }
    return classify(error);
  }

  return { ok: true, payload };
}

/* --- Completing a connection ----------------------------------------------- */

/**
 * Trades the code Slack sent back for the workspace's bot token.
 *
 * The caller must already have compared Slack's `state` against the one it
 * minted — this function never sees the session, and a security check it
 * quietly didn't do would be worse than one it obviously doesn't.
 *
 * Three refusals here would otherwise become confusing failures much later:
 *
 * A missing bot token — a 200 with `ok: true` and nothing usable in it means
 * the contract moved and nothing must be stored.
 *
 * A missing team — the workspace's id and name are how every screen names
 * which company's Slack this is, and the analogue of Google's refusal to
 * store a connection with no `hd` domain: a connection that cannot say what
 * it is attached to looks connected and can only mislead.
 *
 * A granted scope list without `channels:manage` — Slack's consent screen is
 * approve-all today, but the app config at api.slack.com can drift from
 * `config.ts`, and a connection installed with yesterday's scopes would fail
 * weeks later inside a runner, on a real person's first morning, with an
 * error pointing at nothing. One sentence now instead.
 */
export async function exchangeCode(code: string): Promise<ExchangeResult> {
  const configured = slackClient();
  if (!configured.configured) {
    return fail("not-configured", configured.message);
  }

  if (!code.trim()) {
    return fail(
      "invalid-request",
      "Slack didn't send an authorisation code back. If the customer pressed cancel on the consent screen, that's what this looks like.",
    );
  }

  const result = await webApi(ACCESS_ENDPOINT, {
    code,
    client_id: configured.client.clientId,
    client_secret: configured.client.clientSecret,
    /* Required on the exchange because it was sent on the authorize URL —
       Slack, like Google, checks the pair match. */
    redirect_uri: configured.client.redirectUri,
  });
  if (!result.ok) return result;

  const { payload } = result;
  const botToken = payload.access_token;

  if (typeof botToken !== "string" || !botToken) {
    console.error("[lib/slack] oauth.v2.access ok with no access_token");
    return fail(
      "rejected",
      "Slack returned a success with no token in it. Nothing was connected.",
    );
  }

  const teamId = payload.team?.id;
  const teamName = payload.team?.name;
  if (typeof teamId !== "string" || !teamId || typeof teamName !== "string") {
    return fail(
      "invalid-request",
      "Slack didn't say which workspace was connected, so there was nothing to attach the connection to. Nothing was stored — connect again, and pick the workspace from Slack's own chooser.",
    );
  }

  /* Documented as comma-separated on oauth.v2.access — the opposite of
     Google's space-separated — and split on both anyway, because a format the
     docs call fixed is a format one live response gets to contradict. */
  const scopes =
    typeof payload.scope === "string"
      ? payload.scope.split(/[\s,]+/).filter(Boolean)
      : [];

  if (!scopes.includes(INVITE_SCOPE)) {
    return fail(
      "unauthorized",
      "Slack connected, but without permission to add people to channels — which is the one thing this block is for. The app's scopes at api.slack.com don't match what Craig needs; nothing was stored.",
    );
  }

  return {
    ok: true,
    connection: {
      botToken,
      teamId,
      teamName,
      botUserId:
        typeof payload.bot_user_id === "string" ? payload.bot_user_id : null,
      scopes,
    },
  };
}

/* --- Undoing one ------------------------------------------------------------ */

/**
 * Revokes the token at Slack, best-effort, for the disconnect route to call
 * *before* deleting the row — after the row is gone there is nothing left to
 * authenticate the revocation with, which is the rule the Google block's
 * watch teardown paid to learn.
 *
 * Never throws and never blocks a disconnect: a customer must be able to
 * revoke us even when Slack is having a bad afternoon, and the token they
 * are left holding at Slack's end can still be killed by uninstalling the
 * app from the workspace itself.
 */
export async function revokeToken(botToken: string): Promise<void> {
  const result = await webApi(REVOKE_ENDPOINT, {}, botToken);
  if (!result.ok) {
    /* The reason is already in the log from `webApi`. Nothing else to do:
       the caller is about to delete our copy either way. */
    console.error(`[lib/slack] auth.revoke did not confirm: ${result.reason}`);
  }
}
