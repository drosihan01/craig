import { NextResponse } from "next/server";
import { consentUrl } from "@/lib/google/auth";
import { googleStorageStatus } from "@/lib/showcase/accounts";
import { currentUser } from "@/lib/showcase/current-user";
import {
  GOOGLE_STATE_COOKIE,
  GOOGLE_STATE_COOKIE_OPTIONS,
  STATE_MAX_AGE,
  mintGoogleState,
} from "@/lib/showcase/google-state";
import {
  connectLandingPath,
  type ConnectOutcome,
} from "@/lib/showcase/google-outcome";

/**
 * The start of the connect flow: send a Workspace admin to Google, and
 * remember that we did.
 *
 * Two things happen here and they are inseparable. A `state` is minted and put
 * in a cookie, and the customer is redirected to Google's consent screen
 * carrying the matching half. If either happened without the other the
 * callback would have nothing to compare against, so both are done in one
 * response — the redirect and the `Set-Cookie` travel together.
 *
 * A `GET`, because it is reached by a link. That is worth a sentence, since
 * the rest of this repo's mutating routes are deliberately `POST`: the thing a
 * `GET` protects against is a prefetcher or an image tag triggering it, and
 * what this route does when triggered is set a short-lived cookie and offer a
 * redirect. Nothing is created, nothing is spent, and nobody is connected to
 * anything — the consent screen at the other end requires a person to read it
 * and press a button. The route that *does* change something is the callback,
 * and it is guarded by the state this one mints.
 *
 * Every exit is a redirect back to the settings screen rather than a JSON
 * error, because this is reached by navigation. A browser that followed a link
 * and received `{"ok":false}` shows the customer raw JSON with no way back,
 * which is the worst possible rendering of what is usually "you aren't signed
 * in".
 */

const noStore = { "Cache-Control": "no-store" };

/** Back to the settings screen, saying why nobody went to Google. */
function back(request: Request, outcome: ConnectOutcome) {
  return NextResponse.redirect(
    new URL(connectLandingPath(outcome), request.url),
    {
      headers: noStore,
    },
  );
}

export async function GET(request: Request) {
  /* Signed in first, before anything else is read or minted. A connection
     belongs to an account, and there is no sensible thing to do with a consent
     that arrived for nobody — the callback would have no record to write to.
     Checking here also means an anonymous visitor never reaches Google's
     consent screen, which is the difference between "sign in first" and a
     Workspace admin granting us permission that gets thrown away. */
  const session = await currentUser();
  if (!session) return back(request, "signed-out");

  /* Checked before the redirect rather than after the consent, and this is the
     ordering the whole route exists to get right. Without the key we cannot
     store a refresh token, and finding that out *after* somebody has read a
     page about letting us manage their company's users, chosen an account and
     pressed Allow is a uniquely bad experience — they have granted real
     permission and we have thrown it away. The customer is told this simply
     isn't available yet; the sandbox is where the missing piece is named. */
  const storage = googleStorageStatus();
  if (!storage.ready) return back(request, "no-key");

  /* Where they were when they pressed it, so the callback can put them back.
     Read from the query and validated inside `mintGoogleState`, which is what
     makes it safe to carry: it ends up inside the signed state rather than on
     a URL anybody can write, so nobody can turn this into an open redirect by
     sending somebody a link. */
  const from = new URL(request.url).searchParams.get("from");
  const minted = await mintGoogleState(session.email, from);

  const consent = consentUrl({
    state: minted.state,
    /* A hint, not a constraint: it pre-fills Google's account chooser with the
       address they signed up here with, which is usually the same person's
       work address. Google ignores it when it doesn't match anything, so the
       worst case is the chooser they would have seen anyway.

       `hostedDomain` is deliberately not passed. We do not know their Workspace
       domain until they have connected once — that is what the id token is for
       — and guessing it from the email domain would lock the chooser to a
       domain that may be their personal one, with no way past it. */
    loginHint: session.email,
  });

  if (!consent.ok) {
    /* Logged with the reason only. `consentUrl` fails before any network call
       and its messages are about our own configuration, but the values it read
       to reach that conclusion are the client id and secret. */
    console.error(`[google/connect] no consent url: ${consent.reason}`);
    return back(request, consent.reason);
  }

  const response = NextResponse.redirect(consent.url, { headers: noStore });

  /* Set on the response that does the redirecting, so there is no window in
     which the browser has been sent to Google without holding the other half
     of the state. `maxAge` matches the expiry signed into the cookie itself —
     the cookie disappearing is the browser being tidy, the signed expiry is
     what actually enforces the window, and they are set from one constant so
     they cannot drift into disagreeing. */
  response.cookies.set(GOOGLE_STATE_COOKIE, minted.cookie, {
    ...GOOGLE_STATE_COOKIE_OPTIONS,
    maxAge: STATE_MAX_AGE,
  });

  return response;
}
