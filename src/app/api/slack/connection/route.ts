import { NextResponse } from "next/server";
import { slackSetupStatus } from "@/lib/slack/config";
import { revokeToken } from "@/lib/slack/auth";
import {
  disconnectSlack,
  slackConnectionFor,
  slackStorageStatus,
  slackViewFor,
} from "@/lib/slack/store";
import { currentUser } from "@/lib/craig/current-user";

/**
 * What the Slack panel reads, and the button that undoes a connection.
 *
 * Unverified: no panel has read a real connection out of this, because none
 * exists to read. Mirrors `/api/google/connection` — two verbs on one route
 * because they are two halves of one thing, `no-store` on both because a
 * cached "connected" outlives a disconnect — minus the push-health field,
 * because there is no Slack push to be healthy.
 *
 * `GET` keeps the deployment's three facts separate for the reason the
 * Google route argues: whether there is an app registered, whether a token
 * can be stored, and whether *this account* has connected are fixed by
 * different people in different places, and one folded boolean turns "add a
 * variable and restart" into a button that cannot work.
 */

const noStore = { "Cache-Control": "no-store" };

const NOT_SIGNED_IN =
  "Sign in first — a Slack connection belongs to an account.";

export async function GET() {
  const session = await currentUser();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: NOT_SIGNED_IN },
      { status: 401, headers: noStore },
    );
  }

  /* `slackViewFor` is the field-by-field view — there is no shape on this
     route that could carry the bot token, so there is nothing to remember to
     strip. */
  return NextResponse.json(
    {
      ok: true,
      setup: slackSetupStatus(),
      storage: slackStorageStatus(),
      connection: await slackViewFor(session.email),
    },
    { headers: noStore },
  );
}

export async function DELETE() {
  const session = await currentUser();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: NOT_SIGNED_IN },
      { status: 401, headers: noStore },
    );
  }

  /* Revoke at Slack *before* deleting the row — once the row is gone there
     is no credential left anywhere to authenticate the revocation with, and
     the customer would be relying on remembering to uninstall the app from
     Slack's side. Best-effort and awaited, exactly as the Google route
     treats its watch teardown: `revokeToken` swallows every failure, because
     a disconnect that refused because Slack was slow would be a customer
     unable to revoke us. If the stored token cannot even be opened — key
     rotated, row edited — there is nothing to revoke with, and deleting the
     unreadable row is still the right act. */
  const stored = await slackConnectionFor(session.email);
  if (stored.ok) await revokeToken(stored.botToken);

  /* Only ever this session's own account: the email comes from the signed
     cookie and never from the request. */
  const removed = await disconnectSlack(session.email);

  /* `removed: false` is a success, not a 404 — disconnecting something
     already disconnected is the outcome the caller wanted. */
  return NextResponse.json({ ok: true, removed }, { headers: noStore });
}
