import { NextResponse } from "next/server";
import { consentUrl } from "@/lib/docusign/auth";
import { docusignStorageStatus } from "@/lib/docusign/store";
import { currentUser } from "@/lib/craig/current-user";
import {
  DOCUSIGN_STATE_COOKIE,
  DOCUSIGN_STATE_COOKIE_OPTIONS,
  STATE_MAX_AGE,
  mintDocusignState,
} from "@/lib/craig/docusign-state";
import {
  docusignLandingPath,
  type DocusignConnectOutcome,
} from "@/lib/craig/docusign-outcome";

/**
 * The start of the DocuSign connect flow: send an administrator to DocuSign,
 * and remember that we did.
 *
 * Unverified: nobody has ever been sent. The route compiles and mirrors the
 * Google connect route decision for decision; what a live run still has to
 * prove is that DocuSign accepts the consent URL `auth.ts` builds and honours
 * the state on the way back.
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
 *   token after an administrator has read a screen about letting us send
 *   documents from their company's DocuSign and pressed Allow would be
 *   granting a permission straight into a bin.
 * - State minted and cookie set on the same response as the redirect, so there
 *   is no window where the browser is at DocuSign without the other half.
 * - Every exit is a redirect, never JSON — this route is reached by
 *   navigation, and `{"ok":false}` in a bare tab is the worst rendering of
 *   "you aren't signed in".
 *
 * One thing this route deliberately does not check: whether the deployment is
 * pointed at demo or production. That is a real and serious distinction — a
 * demo envelope is not a legally binding signature — but it is not a reason to
 * refuse a connection, because connecting a demo account is exactly what
 * anybody developing this has to be able to do. It belongs on the screen, next
 * to the connection, where a person can see which one they are in; the panel
 * carries it.
 */

const noStore = { "Cache-Control": "no-store" };

/** Back to the landing screen, saying why nobody went to DocuSign. */
function back(request: Request, outcome: DocusignConnectOutcome) {
  return NextResponse.redirect(
    new URL(docusignLandingPath(outcome), request.url),
    { headers: noStore },
  );
}

export async function GET(request: Request) {
  const session = await currentUser();
  if (!session) return back(request, "signed-out");

  const storage = docusignStorageStatus();
  if (!storage.ready) return back(request, "no-key");

  /* Where they were when they pressed Connect — the block panel, usually —
     validated inside `mintDocusignState` and carried inside the *signed*
     state, which is what stops `?from=` being an open redirect somebody mails
     around. */
  const from = new URL(request.url).searchParams.get("from");
  const minted = await mintDocusignState(session.email, from);

  const consent = consentUrl({ state: minted.state });
  if (!consent.ok) {
    /* The reason only. `consentUrl` fails before any network call and its
       messages are about our own configuration, but the values it read to get
       there are the integration key and secret. */
    console.error(`[docusign/connect] no consent url: ${consent.reason}`);
    return back(request, consent.reason);
  }

  const response = NextResponse.redirect(consent.url, { headers: noStore });

  /* `maxAge` matches the expiry signed into the cookie itself, from one
     constant, so the browser's tidiness and the actual enforcement cannot
     drift into disagreeing. Five minutes here rather than ten, because
     DocuSign's authorisation code dies after two — see `docusign-state.ts`. */
  response.cookies.set(DOCUSIGN_STATE_COOKIE, minted.cookie, {
    ...DOCUSIGN_STATE_COOKIE_OPTIONS,
    maxAge: STATE_MAX_AGE,
  });

  return response;
}
