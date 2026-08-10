import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode } from "@/lib/github/auth";
import { saveGitHubConnection } from "@/lib/github/store";
import { currentUser } from "@/lib/craig/current-user";
import {
  GITHUB_STATE_COOKIE,
  GITHUB_STATE_COOKIE_OPTIONS,
  checkGitHubState,
} from "@/lib/craig/github-state";
import {
  githubLandingPath,
  type GitHubConnectOutcome,
} from "@/lib/craig/github-outcome";

/**
 * Where GitHub sends the customer back, and the only place a GitHub
 * credential is ever created.
 *
 * Unverified: GitHub has never sent anybody back here. The handler mirrors the
 * Google callback's ordering — which *is* verified, against a real tenant —
 * and the ordering is the design:
 *
 * 1. **Cancel first.** GitHub reports a decline as `?error=access_denied`, and
 *    somebody deciding not to let us manage their organisation's members is a
 *    normal outcome that must not fall into a validation branch on its way
 *    past.
 * 2. **Signed in.** A connection has to belong to an account.
 * 3. **`state`.** Before the code is exchanged and before anything is written;
 *    without it this handler accepts an authorisation code from anywhere,
 *    which is CSRF straight into an attacker's organisation being attached to
 *    this account. The attack in full is in `github-state.ts`.
 * 4. **The same account.** The state names who started the flow, the session
 *    names who is finishing it, and only together do they prove the consent
 *    belongs on this record.
 * 5. **Exchange.** Only now, and only once.
 *
 * The cookie is cleared on every exit including success — a one-shot value
 * left behind is a replayable check.
 *
 * Nothing here is logged except short reasons. The query string carries an
 * authorisation code and the exchange's response body *is* the credential; the
 * two most dangerous strings in the flow arrive and depart inside this
 * function, and a debug line echoing either would put one in a log aggregator
 * permanently.
 *
 * ## What arrives here that does not arrive at the other providers' callbacks
 *
 * `installation_id` and `setup_action`. When an admin comes through the
 * installation screen with "request user authorization during installation"
 * switched on, GitHub adds both alongside `code`. Neither is read, and that is
 * deliberate rather than lazy: `installation_id` is re-read from
 * `GET /user/installations` during the exchange, where it arrives with the
 * organisation's login and permission map attached and cannot be a number
 * somebody put in a URL. This is the callback's version of the rule the Google
 * block paid for with a webhook — a redirect means "something happened", never
 * "here is what happened, use it".
 *
 * One case is handled explicitly because it is otherwise a dead end: an admin
 * can finish the installation screen having *only* configured repositories,
 * with no `code` at all, if the App's user-authorization-during-installation
 * setting is off. That arrives as `setup_action` with nothing to exchange, and
 * the honest answer is "the install worked, now press Connect" rather than the
 * generic "nothing was connected".
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
  outcome: GitHubConnectOutcome,
  /* Only ever the value out of the signed state, already validated twice.
     Never a query parameter from this request. */
  returnTo?: string | null,
) {
  const target = returnTo
    ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}github=${outcome}`
    : githubLandingPath(outcome);

  const response = NextResponse.redirect(new URL(target, request.url), {
    headers: noStore,
  });
  response.cookies.set(GITHUB_STATE_COOKIE, "", {
    ...GITHUB_STATE_COOKIE_OPTIONS,
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  /* GitHub's own way of saying the customer declined. Anything else in `error`
     is GitHub refusing for a reason of its own, which is a failure — and
     unverified territory: GitHub's documented callback errors are thin, so the
     first live refusal is likely to teach this branch a new string. */
  const declined = params.get("error");
  if (declined) {
    if (declined === "access_denied") return done(request, "cancelled");
    console.error(`[github/callback] consent refused: ${declined}`);
    return done(request, "rejected");
  }

  const session = await currentUser();
  if (!session) return done(request, "signed-out");

  const state = await checkGitHubState(
    params.get("state"),
    request.cookies.get(GITHUB_STATE_COOKIE)?.value,
  );
  if (!state.ok) {
    /* The fact of it only — the interesting values are the cookie and the
       state, and one of them is a secret this browser holds. */
    console.error("[github/callback] state did not verify");
    return done(request, "mismatch");
  }

  /* Somebody who signed out and back in as somebody else between pressing
     Connect and pressing Authorize lands here, and the honest thing is to
     refuse and let them start again. */
  if (state.email !== session.email.trim().toLowerCase()) {
    return done(request, "mismatch");
  }

  /* From here every exit returns to wherever they pressed Connect. The
     refusals above deliberately do not: a state that did not verify is a state
     whose return path did not either. */

  const code = params.get("code");
  if (!code) {
    /* An install that came back without a code — see the header. The App is on
       the organisation now and there is simply no token yet, so the outcome
       that names the next step is the one that says the App is installed but
       not connected. */
    if (params.get("setup_action")) {
      return done(request, "not-connected", state.returnTo);
    }
    /* Neither a code, an error nor a setup action should not happen, and there
       is nothing the customer can act on beyond trying again. */
    return done(request, "invalid-request", state.returnTo);
  }

  const exchanged = await exchangeCode(code);
  if (!exchanged.ok) {
    /* The reason only; `exchangeCode` already logged GitHub's own words
       server-side. */
    console.error(`[github/callback] exchange failed: ${exchanged.reason}`);
    return done(request, exchanged.reason, state.returnTo);
  }

  /* `exchangeCode` has already refused every shape of half-connection — no
     token, no installation, an installation on a personal account, an
     installation that cannot manage members — so a success here is storable
     as-is. */
  const saved = await saveGitHubConnection(session.email, {
    userToken: exchanged.connection.userToken,
    refreshToken: exchanged.connection.refreshToken,
    refreshExpiresAt: exchanged.connection.refreshExpiresAt,
    orgLogin: exchanged.connection.accountLogin,
    permissions: exchanged.connection.permissions,
  });

  if (!saved.ok) {
    /* GitHub granted the permission and we could not keep it. Nothing is
       retried and nothing half-written — the store refuses rather than writing
       a credential it cannot encrypt — so the authorisation simply goes
       unused, and revoking it from the customer's own GitHub settings kills it
       entirely. */
    console.error("[github/callback] connection not stored");
    return done(request, "not-stored", state.returnTo);
  }

  return done(request, "connected", state.returnTo);
}
