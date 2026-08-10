import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode } from "@/lib/slack/auth";
import { saveSlackConnection } from "@/lib/slack/store";
import { currentUser } from "@/lib/craig/current-user";
import {
  SLACK_STATE_COOKIE,
  SLACK_STATE_COOKIE_OPTIONS,
  checkSlackState,
} from "@/lib/craig/slack-state";
import {
  slackLandingPath,
  type SlackConnectOutcome,
} from "@/lib/craig/slack-outcome";

/**
 * Where Slack sends the customer back, and the only place a bot token is
 * ever created.
 *
 * Unverified: Slack has never sent anybody back here. The handler mirrors
 * the Google callback's ordering — which *is* verified, against a real
 * tenant — and the ordering is the design:
 *
 * 1. **Cancel first.** Slack reports a decline as `?error=access_denied`,
 *    and somebody deciding not to let us into their company chat is a normal
 *    outcome that must not fall into a validation branch on its way past.
 * 2. **Signed in.** A connection has to belong to an account.
 * 3. **`state`.** Before the code is exchanged and before anything is
 *    written; without it this handler accepts an authorisation code from
 *    anywhere, which is CSRF straight into an attacker's workspace being
 *    attached to this account. The attack in full is in `slack-state.ts`.
 * 4. **The same account.** The state names who started the flow, the session
 *    names who is finishing it, and only together do they prove the consent
 *    belongs on this record.
 * 5. **Exchange.** Only now, and only once.
 *
 * The cookie is cleared on every exit including success — a one-shot value
 * left behind is a replayable check.
 *
 * Nothing here is logged except short reasons. The query string carries an
 * authorisation code and the exchange's response body *is* the bot token;
 * the two most dangerous strings in the flow arrive and depart inside this
 * function, and a debug line echoing either would put one in a log
 * aggregator permanently.
 *
 * What Google's callback does that this one deliberately does not: register
 * a push channel in `after(...)`. Slack's equivalent — the Events API — is
 * configured app-wide at api.slack.com rather than per connection, and no
 * runner exists to want it; an `after` block doing nothing would be worse
 * than none.
 */

const noStore = { "Cache-Control": "no-store" };

/**
 * One helper for every exit, so "clear the cookie" cannot be forgotten on
 * the branch somebody adds next. Cleared with the attributes it was set
 * with — a `Set-Cookie` whose path doesn't match doesn't replace the cookie,
 * it adds a second one beside it.
 */
function done(
  request: Request,
  outcome: SlackConnectOutcome,
  /* Only ever the value out of the signed state, already validated twice.
     Never a query parameter from this request. */
  returnTo?: string | null,
) {
  const target = returnTo
    ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}slack=${outcome}`
    : slackLandingPath(outcome);

  const response = NextResponse.redirect(new URL(target, request.url), {
    headers: noStore,
  });
  response.cookies.set(SLACK_STATE_COOKIE, "", {
    ...SLACK_STATE_COOKIE_OPTIONS,
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  /* Slack's own way of saying the customer declined. Anything else in
     `error` is Slack refusing for a reason of its own, which is a failure —
     and unverified territory: Slack's documented callback errors are thin,
     so the first live refusal is likely to teach this branch a new string. */
  const declined = params.get("error");
  if (declined) {
    if (declined === "access_denied") return done(request, "cancelled");
    console.error(`[slack/callback] consent refused: ${declined}`);
    return done(request, "rejected");
  }

  const session = await currentUser();
  if (!session) return done(request, "signed-out");

  const state = await checkSlackState(
    params.get("state"),
    request.cookies.get(SLACK_STATE_COOKIE)?.value,
  );
  if (!state.ok) {
    /* The fact of it only — the interesting values are the cookie and the
       state, and one of them is a secret this browser holds. */
    console.error("[slack/callback] state did not verify");
    return done(request, "mismatch");
  }

  /* Somebody who signed out and back in as somebody else between pressing
     Connect and pressing Allow lands here, and the honest thing is to refuse
     and let them start again. */
  if (state.email !== session.email.trim().toLowerCase()) {
    return done(request, "mismatch");
  }

  /* From here every exit returns to wherever they pressed Connect. The
     refusals above deliberately do not: a state that did not verify is a
     state whose return path did not either. */

  const code = params.get("code");
  if (!code) {
    /* Neither a code nor an error should not happen, and there is nothing
       the customer can act on beyond trying again. */
    return done(request, "invalid-request", state.returnTo);
  }

  const exchanged = await exchangeCode(code);
  if (!exchanged.ok) {
    /* The reason only; `exchangeCode` already logged Slack's own words
       server-side. */
    console.error(`[slack/callback] exchange failed: ${exchanged.reason}`);
    return done(request, exchanged.reason, state.returnTo);
  }

  /* `exchangeCode` has already refused the Slack-shaped versions of a
     personal Google account — a response with no token, no workspace
     identity, or a scope grant that couldn't do the block's one job — so a
     success here is storable as-is. */
  const saved = await saveSlackConnection(session.email, {
    botToken: exchanged.connection.botToken,
    teamName: exchanged.connection.teamName,
    scopes: exchanged.connection.scopes,
  });

  if (!saved.ok) {
    /* Slack granted the permission and we could not keep it. Nothing is
       retried and nothing half-written — the store refuses rather than
       writing a token it cannot encrypt — so the install simply goes unused,
       and uninstalling the app from the workspace kills it entirely. */
    console.error("[slack/callback] connection not stored");
    return done(request, "not-stored", state.returnTo);
  }

  return done(request, "connected", state.returnTo);
}
