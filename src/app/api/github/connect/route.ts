import { NextResponse } from "next/server";
import { consentUrl, installConsentUrl } from "@/lib/github/auth";
import { githubStorageStatus } from "@/lib/github/store";
import { currentUser } from "@/lib/craig/current-user";
import {
  GITHUB_STATE_COOKIE,
  GITHUB_STATE_COOKIE_OPTIONS,
  STATE_MAX_AGE,
  mintGitHubState,
} from "@/lib/craig/github-state";
import {
  githubLandingPath,
  type GitHubConnectOutcome,
} from "@/lib/craig/github-outcome";

/**
 * The start of the GitHub connect flow: send an organisation owner to GitHub,
 * and remember that we did.
 *
 * Unverified: nobody has ever been sent. The route compiles and mirrors the
 * Google connect route decision for decision; what a live run still has to
 * prove is that GitHub accepts the consent URL `auth.ts` builds for a GitHub
 * App and honours the state on the way back.
 *
 * The mirrored decisions, argued in full in `/api/google/connect`:
 *
 * - A `GET`, because it is reached by a link, and what it does when triggered
 *   is set a short-lived cookie and offer a redirect — the consent screen at
 *   the other end still requires a person to press a button.
 * - Signed in first: a connection belongs to an account, and an anonymous
 *   visitor must never reach a consent screen whose grant would be thrown
 *   away.
 * - Storage checked *before* the redirect: finding out we cannot keep the
 *   credential after an owner has read a screen about letting us manage
 *   members of their organisation and pressed Authorize would be granting a
 *   permission straight into a bin.
 * - State minted and cookie set on the same response as the redirect, so there
 *   is no window where the browser is at GitHub without the other half.
 * - Every exit is a redirect, never JSON — this route is reached by
 *   navigation, and `{"ok":false}` in a bare tab is the worst rendering of
 *   "you aren't signed in".
 *
 * ## One route, two destinations
 *
 * `?install=1` sends the same signed state to GitHub's *installation* screen
 * instead of its authorisation screen, because in GitHub's model those are two
 * separate acts and a customer needs both: the install puts the App on the
 * organisation, the authorisation gives this deployment a token to act with.
 * The panel offers both links; which one somebody needs depends on what they
 * have already done, and only GitHub knows that.
 *
 * They share this route rather than getting one each because they share
 * everything that matters — the session check, the storage check, the minted
 * state, the cookie, the return path. A second route would be the same forty
 * lines with one URL changed, and the first bug fixed in one of them would
 * live on in the other. Both come back to the same callback, and with "request
 * user authorization during installation" switched on at github.com the
 * install route completes both acts in a single pass.
 *
 * Unverified, and specifically: GitHub documents `state` on the installation
 * URL, and this relies on it being echoed back to the callback exactly as it
 * is from the authorisation URL. If a live install comes back without it, the
 * callback refuses with `mismatch` and the fix is to install from GitHub's own
 * side and then press Connect — no data is at risk either way, but the
 * sentence somebody reads would be the wrong one.
 */

const noStore = { "Cache-Control": "no-store" };

/** Back to the landing screen, saying why nobody went to GitHub. */
function back(request: Request, outcome: GitHubConnectOutcome) {
  return NextResponse.redirect(
    new URL(githubLandingPath(outcome), request.url),
    { headers: noStore },
  );
}

export async function GET(request: Request) {
  const session = await currentUser();
  if (!session) return back(request, "signed-out");

  const storage = githubStorageStatus();
  if (!storage.ready) return back(request, "no-key");

  /* Where they were when they pressed Connect — the block panel, usually —
     validated inside `mintGitHubState` and carried inside the *signed* state,
     which is what stops `?from=` being an open redirect somebody mails
     around. */
  const params = new URL(request.url).searchParams;
  const minted = await mintGitHubState(session.email, params.get("from"));

  /* Exactly `1`, not "anything truthy". The parameter is on a URL a customer
     can edit, and a route that branched on the presence of the word would send
     somebody to the wrong screen because they pasted a link with a stray
     `install=` on the end. */
  const consent =
    params.get("install") === "1"
      ? installConsentUrl({ state: minted.state })
      : consentUrl({ state: minted.state });

  if (!consent.ok) {
    /* The reason only. `consentUrl` fails before any network call and its
       messages are about our own configuration, but the values it read to get
       there are the client id and secret. */
    console.error(`[github/connect] no consent url: ${consent.reason}`);
    return back(request, consent.reason);
  }

  const response = NextResponse.redirect(consent.url, { headers: noStore });

  /* `maxAge` matches the expiry signed into the cookie itself, from one
     constant, so the browser's tidiness and the actual enforcement cannot
     drift into disagreeing. */
  response.cookies.set(GITHUB_STATE_COOKIE, minted.cookie, {
    ...GITHUB_STATE_COOKIE_OPTIONS,
    maxAge: STATE_MAX_AGE,
  });

  return response;
}
