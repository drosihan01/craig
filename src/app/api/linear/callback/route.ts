import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, whoAuthorized } from "@/lib/linear/auth";
import { saveLinearConnection } from "@/lib/linear/store";
import { currentUser } from "@/lib/craig/current-user";
import {
  LINEAR_STATE_COOKIE,
  LINEAR_STATE_COOKIE_OPTIONS,
  checkLinearState,
} from "@/lib/craig/linear-state";
import {
  linearLandingPath,
  type LinearConnectOutcome,
} from "@/lib/craig/linear-outcome";

/**
 * Where Linear sends the customer back, and the only place a Linear refresh
 * token is ever created.
 *
 * Unverified: Linear has never sent anybody here. The ordering is
 * `/api/google/callback`'s, argued in full there, and it is the design:
 * cancel first, because declining admin access to a workspace is a decision
 * and not an error; then the session; then `state`, before the code is
 * exchanged and before anything is written, because without it this handler
 * accepts an authorisation code from anywhere; then the same-account check,
 * so a flow begun by one account cannot be finished into another; and only
 * then the exchange, once.
 *
 * One step exists here that Google's callback does without: an identity
 * query on the token just minted. Google's exchange response carries an id
 * token naming the tenant; Linear's carries nothing but the tokens, so
 * "which workspace is this, and can this person invite anybody" costs one
 * GraphQL round trip — and both answers are checked before anything is
 * stored, because a connection from a non-admin would fail at the only thing
 * this block does, weeks later, on somebody's first morning.
 *
 * The cookie is cleared on every exit including the successful one: a
 * one-shot value left behind is a replayable check. Nothing is logged except
 * short reasons — the query string on this request is an authorisation code
 * and the exchange response is the refresh token, and neither may meet a log
 * aggregator.
 */

const noStore = { "Cache-Control": "no-store" };

/**
 * One helper for every exit, so "clear the cookie" cannot be forgotten on
 * the branch somebody adds next. Cleared with the attributes it was set
 * with, since a `Set-Cookie` whose path doesn't match adds a second cookie
 * beside the first rather than replacing it.
 */
function done(
  request: Request,
  outcome: LinearConnectOutcome,
  /* Only ever the value that came back out of the signed state, already
     validated twice. Never a query parameter from this request. */
  returnTo?: string | null,
) {
  const landing = linearLandingPath(outcome);
  const target = returnTo
    ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}linear=${outcome}`
    : landing;

  const response = NextResponse.redirect(new URL(target, request.url), {
    headers: noStore,
  });
  response.cookies.set(LINEAR_STATE_COOKIE, "", {
    ...LINEAR_STATE_COOKIE_OPTIONS,
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  /* Linear's way of saying the customer declined. `access_denied` is the
     OAuth-standard code; anything else in `error` is Linear refusing for a
     reason of its own, which is a failure worth logging. */
  const declined = params.get("error");
  if (declined) {
    if (declined === "access_denied") return done(request, "cancelled");
    console.error(`[linear/callback] consent refused: ${declined}`);
    return done(request, "rejected");
  }

  const session = await currentUser();
  if (!session) return done(request, "signed-out");

  const state = await checkLinearState(
    params.get("state"),
    request.cookies.get(LINEAR_STATE_COOKIE)?.value,
  );
  if (!state.ok) {
    /* No detail beyond the fact of it — the interesting values are the
       cookie and the state, and one of them is a secret this browser holds. */
    console.error("[linear/callback] state did not verify");
    return done(request, "mismatch");
  }

  /* The account that started the flow and the account finishing it, compared
     rather than assumed. Somebody who signed out and back in as somebody
     else between Connect and Allow lands here, and the honest thing is to
     refuse and let them start again. */
  if (state.email !== session.email.trim().toLowerCase()) {
    return done(request, "mismatch");
  }

  /* From here on, every exit goes back to wherever they pressed Connect —
     the block panel, usually. The refusals above deliberately do not: a
     state that did not verify is a state whose return path did not either. */

  const code = params.get("code");
  if (!code) {
    return done(request, "invalid-request", state.returnTo);
  }

  const exchanged = await exchangeCode(code);
  if (!exchanged.ok) {
    /* The reason only; `exchangeCode` has already logged Linear's own words
       server-side. */
    console.error(`[linear/callback] exchange failed: ${exchanged.reason}`);
    return done(request, exchanged.reason, state.returnTo);
  }

  /* Which workspace, and whether this person can invite anybody. Awaited
     rather than deferred, unlike Google's channel registration, because this
     is not a side effect of connecting — its answers decide whether there is
     a connection worth keeping at all. A token we cannot attribute to a
     workspace is refused for the same reason Google refuses a consent with
     no `hd` claim: it would look connected on every screen and be checkable
     on none. */
  const who = await whoAuthorized(exchanged.connection.accessToken);
  if (!who.ok) {
    console.error(`[linear/callback] identity failed: ${who.reason}`);
    return done(request, who.reason, state.returnTo);
  }

  if (!who.identity.isAdmin) {
    /* The grant is real and useless: Linear refuses invites from non-admins.
       Refused now, in one sentence, while somebody who can fetch an admin is
       still looking at the screen. Nothing was stored, so there is nothing
       for the customer to clean up beyond the grant itself in Linear's
       settings, and reconnecting as an admin replaces nothing. */
    return done(request, "not-an-admin", state.returnTo);
  }

  const saved = await saveLinearConnection(session.email, {
    refreshToken: exchanged.connection.refreshToken,
    urlKey: who.identity.urlKey,
    adminEmail: who.identity.adminEmail,
    scopes: exchanged.connection.scopes,
  });

  if (!saved.ok) {
    /* Linear granted the permission and we could not keep it. Nothing is
       retried and nothing half-written — the store refuses rather than
       writing a token it cannot encrypt — so the grant goes unused, and the
       customer can revoke it in Linear's settings if they would rather it
       did not exist. */
    console.error("[linear/callback] connection not stored");
    return done(request, "not-stored", state.returnTo);
  }

  /* No `after(...)` side effects, and that is a statement rather than an
     omission: Google registers a push channel here because acceptance has to
     reach us, and Linear has nothing it needs to watch until a runner
     exists. The first side effect added here should re-read Google's
     hard-won rule first — anything that runs after the user-visible action
     needs a visible health state, or it can sit broken indefinitely. */
  return done(request, "connected", state.returnTo);
}
