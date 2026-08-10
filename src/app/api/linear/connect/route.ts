import { NextResponse } from "next/server";
import { consentUrl } from "@/lib/linear/auth";
import { linearStorageStatus } from "@/lib/linear/store";
import { currentUser } from "@/lib/craig/current-user";
import {
  LINEAR_STATE_COOKIE,
  LINEAR_STATE_COOKIE_OPTIONS,
  LINEAR_STATE_MAX_AGE,
  mintLinearState,
} from "@/lib/craig/linear-state";
import {
  linearLandingPath,
  type LinearConnectOutcome,
} from "@/lib/craig/linear-outcome";

/**
 * The start of the Linear connect flow: send a workspace admin to Linear,
 * and remember that we did.
 *
 * Unverified: nobody has ever been sent. The route mirrors
 * `/api/google/connect`, whose reasoning holds unchanged and is written out
 * there — the state and the cookie minted as an inseparable pair on one
 * response; a `GET` because it is reached by a link and does nothing but set
 * a short-lived cookie and offer a redirect, with the consent screen at the
 * other end requiring a person; the signed-in check first, so an anonymous
 * visitor never reaches a consent screen whose grant would be thrown away;
 * and the storage-key check *before* the redirect, because discovering the
 * missing key after somebody has read a screen about handing us admin access
 * to their workspace and pressed Allow is a uniquely bad experience.
 *
 * Every exit is a redirect rather than JSON, because this is reached by
 * navigation and a browser showing `{"ok":false}` has no way back.
 */

const noStore = { "Cache-Control": "no-store" };

/** Back to the settings screen, saying why nobody went to Linear. */
function back(request: Request, outcome: LinearConnectOutcome) {
  return NextResponse.redirect(new URL(linearLandingPath(outcome), request.url), {
    headers: noStore,
  });
}

export async function GET(request: Request) {
  const session = await currentUser();
  if (!session) return back(request, "signed-out");

  const storage = linearStorageStatus();
  if (!storage.ready) return back(request, "no-key");

  /* Where they were when they pressed Connect, so the callback can put them
     back. Validated inside `mintLinearState` and carried inside the signed
     state rather than on a URL anybody can write — which is what stops a
     link somebody sends turning this into an open redirect. */
  const from = new URL(request.url).searchParams.get("from");
  const minted = await mintLinearState(session.email, from);

  const consent = consentUrl({ state: minted.state });

  if (!consent.ok) {
    /* The reason only. `consentUrl` fails before any network call and its
       messages are about our own configuration, but the values it read to
       reach that conclusion are the client id and secret. */
    console.error(`[linear/connect] no consent url: ${consent.reason}`);
    return back(request, consent.reason);
  }

  const response = NextResponse.redirect(consent.url, { headers: noStore });

  /* Set on the response that does the redirecting, so there is no window in
     which the browser has been sent away without holding the other half of
     the state. `maxAge` and the signed expiry come from one constant, so
     they cannot drift into disagreeing. */
  response.cookies.set(LINEAR_STATE_COOKIE, minted.cookie, {
    ...LINEAR_STATE_COOKIE_OPTIONS,
    maxAge: LINEAR_STATE_MAX_AGE,
  });

  return response;
}
