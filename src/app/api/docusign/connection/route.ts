import { NextResponse } from "next/server";
import { docusignSetupStatus } from "@/lib/docusign/config";
import { revocationNotice } from "@/lib/docusign/auth";
import {
  disconnectDocusign,
  docusignStorageStatus,
  docusignViewFor,
} from "@/lib/docusign/store";
import { currentUser } from "@/lib/craig/current-user";

/**
 * What the DocuSign panel reads, and the button that undoes a connection.
 *
 * Unverified: no panel has read a real connection out of this, because none
 * exists to read. Mirrors `/api/google/connection` — two verbs on one route
 * because they are two halves of one thing, `no-store` on both because a
 * cached "connected" outlives a disconnect.
 *
 * `GET` keeps the deployment's three facts separate for the reason the Google
 * route argues: whether there is an application registered, whether a token
 * can be stored, and whether *this account* has connected are fixed by
 * different people in different places, and one folded boolean turns "add a
 * variable and restart" into a button that cannot work. It carries a fourth
 * fact the other providers have no equivalent of — which of DocuSign's two
 * environments this deployment is pointed at — because "connected" against
 * demo and "connected" against production are different claims, and only one
 * of them is a legally binding signature.
 *
 * ## The disconnect that cannot revoke
 *
 * Every other block in this repo revokes at the provider *before* deleting the
 * local row, which is the rule `docs/building-a-block.md` states and the
 * Google block paid to learn: after the row is gone there is nothing left to
 * authenticate a revocation with.
 *
 * DocuSign's authentication service exposes three endpoints — `/oauth/auth`,
 * `/oauth/token`, `/oauth/userinfo` — and none of them revokes anything.
 * Consent is withdrawn by the account holder under Connected Apps in their
 * DocuSign profile, or by an organisation administrator in DocuSign Admin.
 *
 * So this route does not pretend. There is no best-effort call whose failure
 * is swallowed, because there is nothing to call; the row is deleted and the
 * response carries a sentence saying what was and was not done. A customer who
 * believes DocuSign was told when it was not is worse off than one who is
 * asked to spend thirty seconds finishing the job — the first keeps a live
 * consent they think is gone.
 */

const noStore = { "Cache-Control": "no-store" };

const NOT_SIGNED_IN =
  "Sign in first — a DocuSign connection belongs to an account.";

export async function GET() {
  const session = await currentUser();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: NOT_SIGNED_IN },
      { status: 401, headers: noStore },
    );
  }

  /* `docusignViewFor` is the field-by-field view — there is no shape on this
     route that could carry the refresh token, so there is nothing to remember
     to strip. */
  return NextResponse.json(
    {
      ok: true,
      setup: docusignSetupStatus(),
      storage: docusignStorageStatus(),
      connection: await docusignViewFor(session.email),
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

  /* Only ever this session's own account: the email comes from the signed
     cookie and never from the request. */
  const removed = await disconnectDocusign(session.email);

  /* `removed: false` is a success, not a 404 — disconnecting something already
     disconnected is the outcome the caller wanted.

     `notice` rides along on both paths rather than only when something was
     deleted, because the consent at DocuSign's end can outlive our copy of it
     in either case: a row deleted twice, or a row that never existed while the
     consent did, both leave the same thing standing at DocuSign. */
  return NextResponse.json(
    { ok: true, removed, notice: revocationNotice },
    { headers: noStore },
  );
}
