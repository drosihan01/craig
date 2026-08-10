import { NextResponse } from "next/server";
import { githubSetupStatus } from "@/lib/github/config";
import { revokeAuthorization } from "@/lib/github/auth";
import {
  disconnectGitHub,
  githubCredentialFor,
  githubStorageStatus,
  githubViewFor,
} from "@/lib/github/store";
import { currentUser } from "@/lib/craig/current-user";

/**
 * What the GitHub panel reads, and the button that undoes a connection.
 *
 * Unverified: no panel has read a real connection out of this, because none
 * exists to read. Mirrors `/api/slack/connection` — two verbs on one route
 * because they are two halves of one thing, `no-store` on both because a
 * cached "connected" outlives a disconnect.
 *
 * `GET` keeps the deployment's three facts separate for the reason the Google
 * route argues: whether there is an App registered, whether a credential can
 * be stored, and whether *this account* has connected are fixed by different
 * people in different places, and one folded boolean turns "add a variable and
 * restart" into a button that cannot work.
 */

const noStore = { "Cache-Control": "no-store" };

const NOT_SIGNED_IN =
  "Sign in first — a GitHub connection belongs to an account.";

export async function GET() {
  const session = await currentUser();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: NOT_SIGNED_IN },
      { status: 401, headers: noStore },
    );
  }

  /* `githubViewFor` is the field-by-field view — there is no shape on this
     route that could carry the credential, so there is nothing to remember to
     strip. */
  return NextResponse.json(
    {
      ok: true,
      setup: githubSetupStatus(),
      storage: githubStorageStatus(),
      connection: await githubViewFor(session.email),
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

  /* Revoke at GitHub *before* deleting the row — once the row is gone there is
     no credential left anywhere to authenticate the revocation with, and the
     customer would be relying on remembering to revoke us from their own
     GitHub settings. Best-effort and awaited, exactly as the Slack route
     treats `auth.revoke`: `revokeAuthorization` swallows every failure,
     because a disconnect that refused because GitHub was slow would be a
     customer unable to revoke us. If the stored credential cannot even be
     opened — key rotated, row edited — there is nothing to revoke with, and
     deleting the unreadable row is still the right act.

     Worth knowing for whoever reads a support ticket about this: revoking the
     authorisation stops this deployment acting on the customer's behalf, and
     it does *not* uninstall the App from their organisation. Nothing here can
     — an installation is removed by an organisation owner from the
     organisation's own settings — and after the revocation there is no
     credential left to try it with anyway. The panel says so rather than
     letting somebody assume otherwise. */
  const stored = await githubCredentialFor(session.email);
  if (stored.ok) {
    await revokeAuthorization({
      userToken: stored.userToken,
      refreshToken: stored.refreshToken,
    });
  }

  /* Only ever this session's own account: the email comes from the signed
     cookie and never from the request. */
  const removed = await disconnectGitHub(session.email);

  /* `removed: false` is a success, not a 404 — disconnecting something already
     disconnected is the outcome the caller wanted. */
  return NextResponse.json({ ok: true, removed }, { headers: noStore });
}
