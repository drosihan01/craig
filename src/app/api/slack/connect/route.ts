import { NextResponse } from "next/server";
import { consentUrl } from "@/lib/slack/auth";
import { slackStorageStatus } from "@/lib/slack/store";
import { currentUser } from "@/lib/craig/current-user";
import {
  SLACK_STATE_COOKIE,
  SLACK_STATE_COOKIE_OPTIONS,
  STATE_MAX_AGE,
  mintSlackState,
} from "@/lib/craig/slack-state";
import {
  slackLandingPath,
  type SlackConnectOutcome,
} from "@/lib/craig/slack-outcome";

/**
 * The start of the Slack connect flow: send a workspace admin to Slack, and
 * remember that we did.
 *
 * Unverified: nobody has ever been sent. The route compiles and mirrors the
 * Google connect route decision for decision; what a live run still has to
 * prove is that Slack accepts the consent URL `auth.ts` builds and honours
 * the state on the way back.
 *
 * The mirrored decisions, argued in full in `/api/google/connect`:
 *
 * - A `GET`, because it is reached by a link, and what it does when
 *   triggered is set a short-lived cookie and offer a redirect — the consent
 *   screen at the other end still requires a person to press a button.
 * - Signed in first: a connection belongs to an account, and an anonymous
 *   visitor must never reach a consent screen whose grant would be thrown
 *   away.
 * - Storage checked *before* the redirect: finding out we cannot keep the
 *   token after an admin has read a screen about letting us into their
 *   company chat and pressed Allow would be granting a permission straight
 *   into a bin.
 * - State minted and cookie set on the same response as the redirect, so
 *   there is no window where the browser is at Slack without the other half.
 * - Every exit is a redirect, never JSON — this route is reached by
 *   navigation, and `{"ok":false}` in a bare tab is the worst rendering of
 *   "you aren't signed in".
 */

const noStore = { "Cache-Control": "no-store" };

/** Back to the landing screen, saying why nobody went to Slack. */
function back(request: Request, outcome: SlackConnectOutcome) {
  return NextResponse.redirect(new URL(slackLandingPath(outcome), request.url), {
    headers: noStore,
  });
}

export async function GET(request: Request) {
  const session = await currentUser();
  if (!session) return back(request, "signed-out");

  const storage = slackStorageStatus();
  if (!storage.ready) return back(request, "no-key");

  /* Where they were when they pressed Connect — the block panel, usually —
     validated inside `mintSlackState` and carried inside the *signed* state,
     which is what stops `?from=` being an open redirect somebody mails
     around. */
  const from = new URL(request.url).searchParams.get("from");
  const minted = await mintSlackState(session.email, from);

  const consent = consentUrl({ state: minted.state });
  if (!consent.ok) {
    /* The reason only. `consentUrl` fails before any network call and its
       messages are about our own configuration, but the values it read to
       get there are the client id and secret. */
    console.error(`[slack/connect] no consent url: ${consent.reason}`);
    return back(request, consent.reason);
  }

  const response = NextResponse.redirect(consent.url, { headers: noStore });

  /* `maxAge` matches the expiry signed into the cookie itself, from one
     constant, so the browser's tidiness and the actual enforcement cannot
     drift into disagreeing. */
  response.cookies.set(SLACK_STATE_COOKIE, minted.cookie, {
    ...SLACK_STATE_COOKIE_OPTIONS,
    maxAge: STATE_MAX_AGE,
  });

  return response;
}
