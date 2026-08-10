import { NextResponse, type NextRequest } from "next/server";
import { accountFor, exchangeCode } from "@/lib/docusign/auth";
import { saveDocusignConnection } from "@/lib/docusign/store";
import { currentUser } from "@/lib/craig/current-user";
import {
  DOCUSIGN_STATE_COOKIE,
  DOCUSIGN_STATE_COOKIE_OPTIONS,
  checkDocusignState,
} from "@/lib/craig/docusign-state";
import {
  docusignLandingPath,
  type DocusignConnectOutcome,
} from "@/lib/craig/docusign-outcome";

/**
 * Where DocuSign sends the customer back, and the only place a DocuSign
 * refresh token is ever created.
 *
 * Unverified: DocuSign has never sent anybody back here. The handler mirrors
 * the Google callback's ordering — which *is* verified, against a real tenant
 * — and the ordering is the design:
 *
 * 1. **Cancel first.** Somebody deciding not to let us send documents from
 *    their DocuSign is a normal outcome that must not fall into a validation
 *    branch on its way past.
 * 2. **Signed in.** A connection has to belong to an account.
 * 3. **`state`.** Before the code is exchanged and before anything is written;
 *    without it this handler accepts an authorisation code from anywhere,
 *    which is how an attacker's DocuSign account ends up sending this
 *    company's employment contracts. The attack in full is in
 *    `docusign-state.ts`.
 * 4. **The same account.** The state names who started the flow, the session
 *    names who is finishing it, and only together do they prove the consent
 *    belongs on this record.
 * 5. **Exchange.** Only now, and only once.
 * 6. **Ask who it was.** DocuSign, alone among the providers here, cannot say
 *    which account was connected in the grant itself — see below.
 *
 * The cookie is cleared on every exit including success — a one-shot value
 * left behind is a replayable check.
 *
 * **The cancel code is DocuSign's own.** Google and Slack both report a
 * decline as `access_denied`; DocuSign documents `user_cancelled`. Both are
 * accepted below, because the documented set is small enough to be incomplete
 * and treating a real cancellation as a failure would put an alarming red box
 * in front of somebody who did nothing wrong. That asymmetry — lenient about
 * what counts as a cancellation, strict about everything that stores a
 * credential — is deliberate.
 *
 * **The extra round trip.** Slack's exchange names the workspace, Linear's
 * names the org, Google's carries the `hd` domain. DocuSign's token response
 * carries none of that, so the account this connection belongs to is only
 * knowable by spending the fresh access token on `/oauth/userinfo` before
 * storing anything. That call is not decoration: it is also the only source of
 * the per-account API host every future call needs, and a connection stored
 * without knowing which DocuSign account it opens is a connection no screen
 * can describe and no runner can safely use.
 *
 * Nothing here is logged except short reasons. The query string carries an
 * authorisation code and the exchange's response body carries both tokens; the
 * most dangerous strings in the flow arrive and depart inside this function,
 * and a debug line echoing either would put one in a log aggregator
 * permanently.
 */

const noStore = { "Cache-Control": "no-store" };

/**
 * One helper for every exit, so "clear the cookie" cannot be forgotten on the
 * branch somebody adds next. Cleared with the attributes it was set with — a
 * `Set-Cookie` whose path doesn't match doesn't replace the cookie, it adds a
 * second one beside it.
 */
function done(
  request: Request,
  outcome: DocusignConnectOutcome,
  /* Only ever the value out of the signed state, already validated twice.
     Never a query parameter from this request. */
  returnTo?: string | null,
) {
  const target = returnTo
    ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}docusign=${outcome}`
    : docusignLandingPath(outcome);

  const response = NextResponse.redirect(new URL(target, request.url), {
    headers: noStore,
  });
  response.cookies.set(DOCUSIGN_STATE_COOKIE, "", {
    ...DOCUSIGN_STATE_COOKIE_OPTIONS,
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const declined = params.get("error");
  if (declined) {
    /* `user_cancelled` is DocuSign's documented spelling; `access_denied` is
       the one every other provider in this repo uses and the one OAuth 2 names
       — accepted too, because being wrong about this shows somebody a failure
       for having changed their mind. */
    if (declined === "user_cancelled" || declined === "access_denied") {
      return done(request, "cancelled");
    }
    console.error(`[docusign/callback] consent refused: ${declined}`);
    return done(request, "rejected");
  }

  const session = await currentUser();
  if (!session) return done(request, "signed-out");

  const state = await checkDocusignState(
    params.get("state"),
    request.cookies.get(DOCUSIGN_STATE_COOKIE)?.value,
  );
  if (!state.ok) {
    /* The fact of it only — the interesting values are the cookie and the
       state, and one of them is a secret this browser holds. */
    console.error("[docusign/callback] state did not verify");
    return done(request, "mismatch");
  }

  /* Somebody who signed out and back in as somebody else between pressing
     Connect and pressing Allow lands here, and the honest thing is to refuse
     and let them start again. */
  if (state.email !== session.email.trim().toLowerCase()) {
    return done(request, "mismatch");
  }

  /* From here every exit returns to wherever they pressed Connect. The
     refusals above deliberately do not: a state that did not verify is a state
     whose return path did not either. */

  const code = params.get("code");
  if (!code) {
    /* Neither a code nor an error should not happen, and there is nothing the
       customer can act on beyond trying again. */
    return done(request, "invalid-request", state.returnTo);
  }

  const exchanged = await exchangeCode(code);
  if (!exchanged.ok) {
    /* The reason only; `exchangeCode` already logged DocuSign's own words
       server-side. */
    console.error(`[docusign/callback] exchange failed: ${exchanged.reason}`);
    return done(request, exchanged.reason, state.returnTo);
  }

  /* The access token is spent here and never stored: eight hours of life is
     no use to a product whose steps happen days apart, and the refresh token
     can mint another whenever something finally needs one. */
  const account = await accountFor(exchanged.connection.accessToken);
  if (!account.ok) {
    console.error(`[docusign/callback] userinfo failed: ${account.reason}`);
    return done(request, account.reason, state.returnTo);
  }

  const saved = await saveDocusignConnection(session.email, {
    refreshToken: exchanged.connection.refreshToken,
    accountName: account.account.accountName,
    adminEmail: account.account.email,
    scopes: exchanged.connection.scopes,
  });

  if (!saved.ok) {
    /* DocuSign granted the permission and we could not keep it. Nothing is
       retried and nothing half-written — the store refuses rather than writing
       a token it cannot encrypt — so the consent simply goes unused. Unlike
       Slack, there is nothing we can call to hand it back; the customer's own
       Connected Apps page is where it can be withdrawn, which is what the
       panel tells them. */
    console.error("[docusign/callback] connection not stored");
    return done(request, "not-stored", state.returnTo);
  }

  return done(request, "connected", state.returnTo);
}
