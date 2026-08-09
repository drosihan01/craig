import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode } from "@/lib/google/auth";
import { saveGoogleConnection } from "@/lib/showcase/accounts";
import { currentUser } from "@/lib/showcase/current-user";
import {
  GOOGLE_STATE_COOKIE,
  GOOGLE_STATE_COOKIE_OPTIONS,
  checkGoogleState,
} from "@/lib/showcase/google-state";
import {
  connectLandingPath,
  type ConnectOutcome,
} from "@/lib/showcase/google-outcome";

/**
 * Where Google sends the customer back, and the only place a refresh token is
 * ever created.
 *
 * This is the sharp end of the whole flow. Everything upstream is a link and a
 * consent screen; this handler turns a string in a query parameter into a
 * standing authorisation to create accounts inside somebody else's company,
 * and writes it down. So it is ordered as a series of refusals, and the order
 * is the design:
 *
 * 1. **Cancel first.** Somebody pressing Cancel is a normal outcome and must
 *    not be dressed up as an error. It is checked before anything else so that
 *    path cannot fall into a validation branch on its way past.
 * 2. **Signed in.** A connection has to belong to an account.
 * 3. **`state`.** Before the code is exchanged, and before anything is written.
 *    Without this the handler accepts an authorisation code from anywhere,
 *    which is CSRF straight into somebody else's Workspace being attached to
 *    this account — see `google-state.ts` for the attack in full.
 * 4. **The same account.** The state says which account started the flow; the
 *    session says which account is finishing it. They are usually the same
 *    person and it costs one comparison to be sure, so a flow begun in one
 *    account and completed after signing in as another cannot cross over.
 * 5. **Exchange.** Only now, and only once.
 *
 * The cookie is cleared on every exit including the successful one. It is a
 * one-shot value; leaving it behind means a second callback with the same
 * state would verify, which is the definition of a replayable check.
 *
 * Nothing here is logged except a short reason. The query string on this
 * request contains an authorisation code, and the response from the exchange
 * is the refresh token itself — the two most dangerous strings in the system
 * arrive and depart inside this function, and a debug line echoing either
 * would put one of them in a log aggregator permanently.
 *
 * Verified end to end against a real Google Workspace: a consent granted here
 * created a real account on a real tenant. What that consent exposed is why
 * this flow now starts and ends on `/settings` rather than in the
 * builder's sandbox — see `connectLandingPath`.
 */

const noStore = { "Cache-Control": "no-store" };

/**
 * Back to the settings screen, with the state cookie cleared.
 *
 * One helper for every exit, so "clear the cookie" cannot be forgotten on the
 * branch somebody adds next. Cleared with the same attributes it was set with:
 * a `Set-Cookie` whose path doesn't match the original doesn't replace it, it
 * adds a second cookie beside it and leaves the first sitting there.
 */
function done(
  request: Request,
  outcome: ConnectOutcome,
  /* Only ever the value that came back out of the signed state, already
     validated twice. Never a query parameter from this request. */
  returnTo?: string | null,
) {
  const landing = connectLandingPath(outcome);
  const target = returnTo
    ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}google=${outcome}`
    : landing;

  const response = NextResponse.redirect(new URL(target, request.url), {
    headers: noStore,
  });
  response.cookies.set(GOOGLE_STATE_COOKIE, "", {
    ...GOOGLE_STATE_COOKIE_OPTIONS,
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  /* Google's own way of saying the customer declined, and the reason this
     branch is first. `access_denied` is somebody reading a screen that asks
     for permission to manage their company's user accounts and deciding not
     to, which is a perfectly sensible thing to decide. Anything else in
     `error` is Google refusing for a reason of its own, which is a failure. */
  const declined = params.get("error");
  if (declined) {
    if (declined === "access_denied") return done(request, "cancelled");
    console.error(`[google/callback] consent refused: ${declined}`);
    return done(request, "rejected");
  }

  const session = await currentUser();
  if (!session) return done(request, "signed-out");

  const state = await checkGoogleState(
    params.get("state"),
    request.cookies.get(GOOGLE_STATE_COOKIE)?.value,
  );
  if (!state.ok) {
    /* No detail in the log beyond the fact of it. The interesting values are
       the cookie and the state, and one of them is a secret this browser
       holds. The message the person sees is in `google-state.ts`. */
    console.error("[google/callback] state did not verify");
    return done(request, "mismatch");
  }

  /* The account that started the flow and the account finishing it. Compared
     rather than assumed: the state proves this browser started *a* flow, the
     session proves who is here now, and only together do they prove that this
     consent belongs on this record. Somebody who signed out and back in as
     somebody else between pressing Connect and pressing Allow lands here, and
     the honest thing is to refuse and let them start again. */
  if (state.email !== session.email.trim().toLowerCase()) {
    return done(request, "mismatch");
  }

  /* From here on, every exit goes back to wherever they pressed Connect —
     which is the block panel, usually. The refusals above deliberately do not:
     a state that did not verify is a state whose return path did not either,
     so those land on the one page this route can be certain of. */

  const code = params.get("code");
  if (!code) {
    /* Google returned neither a code nor an error, which should not happen and
       is not something the customer can act on beyond trying again. */
    return done(request, "invalid-request", state.returnTo);
  }

  const exchanged = await exchangeCode(code);
  if (!exchanged.ok) {
    /* The reason only. `exchangeCode` has already logged Google's own words
       server-side, and the code that failed is not going anywhere near here. */
    console.error(`[google/callback] exchange failed: ${exchanged.reason}`);
    return done(request, exchanged.reason, state.returnTo);
  }

  /* No domain means Google did not send an `hd` claim, and Google only sets
     that for an account belonging to a Workspace domain. So this is somebody
     who consented with a personal Google account: the grant is real, and there
     is no tenant behind it and no users to administer.

     Refused rather than stored, which is the same argument as checking the
     encryption key before the redirect. A stored connection with no domain
     looks connected on every screen and can do exactly nothing — the product
     builds `newstarter@domain` out of this field — so every seat it was
     supposed to create would fail weeks later with an authorisation error that
     points at our configuration rather than at the account somebody picked.
     One sentence now, while they are still here and can pick the other one. */
  if (!exchanged.connection.domain) {
    return done(request, "personal-account", state.returnTo);
  }

  const saved = await saveGoogleConnection(session.email, {
    refreshToken: exchanged.connection.refreshToken,
    domain: exchanged.connection.domain,
    adminEmail: exchanged.connection.adminEmail,
    scopes: exchanged.connection.scopes,
  });

  if (!saved.ok) {
    /* Google granted the permission and we could not keep it. Nothing is
       retried and nothing is half-written — the store refuses rather than
       writing a token it cannot encrypt — so the grant simply goes unused, and
       the customer can revoke it at myaccount.google.com if they would rather
       it did not exist. The settings screen says this one is ours to fix; the
       sandbox is where the missing piece is named. */
    console.error("[google/callback] connection not stored");
    return done(request, "not-stored", state.returnTo);
  }

  return done(request, "connected", state.returnTo);
}
