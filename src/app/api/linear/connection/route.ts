import { NextResponse } from "next/server";
import { linearSetupStatus, oauthClient } from "@/lib/linear/config";
import { revokeToken } from "@/lib/linear/auth";
import {
  disconnectLinear,
  linearConnectionViewFor,
  linearRefreshTokenFor,
  linearStorageStatus,
} from "@/lib/linear/store";
import { currentUser } from "@/lib/craig/current-user";
import { LINEAR_CALLBACK_PATH } from "@/lib/craig/linear-outcome";

/**
 * What the Linear panel reads, and the button that undoes a connection.
 *
 * Unverified: no live connection has ever been read back through this route
 * or deleted by it. The two-verbs-one-route shape is
 * `/api/google/connection`'s, argued there: the state of the connection and
 * getting rid of it are two halves of one thing, and splitting them means
 * two places to keep the session check and cache headers in step.
 *
 * `GET` answers with three separate facts — deployment configured, storage
 * ready, account connected — kept separate because they are fixed by
 * different people in different places, and one flattened boolean would turn
 * "somebody needs to add a variable and restart" into a Connect button that
 * cannot work.
 *
 * `DELETE`'s one ordering rule is this block's version of Google's
 * stop-the-watch-first: revoke at Linear *before* deleting the row, because
 * the sealed token in the row is the only credential the revocation can be
 * made with. Google's disconnect leaves the grant standing and points at
 * myaccount.google.com; Linear documents a revocation endpoint, so leaving
 * an admin-scoped grant live in a customer's workspace after they pressed
 * Disconnect would be a choice, and the wrong one.
 *
 * `no-store` on both: a cached "connected" outlives a disconnect, and a
 * cached anything on a route describing a credential is a copy of that
 * description in a shared cache.
 */

const noStore = { "Cache-Control": "no-store" };

const NOT_SIGNED_IN =
  "Sign in first — a Linear connection belongs to an account.";

/**
 * The callback URL a person has to paste into Linear's application settings,
 * and the one this deployment will actually send. Configured value first —
 * once set it *is* what the token exchange sends, so showing anything else
 * would be showing a value the callback does not accept — with this server's
 * own origin as the fallback for whoever is setting it up for the first
 * time. Not a secret either way: a redirect URI is in the address bar of
 * every consent screen the provider has ever drawn.
 */
function redirectUri(request: Request): {
  value: string;
  fromEnvironment: boolean;
} {
  const configured = oauthClient();
  if (configured.configured) {
    return { value: configured.client.redirectUri, fromEnvironment: true };
  }
  return {
    value: new URL(LINEAR_CALLBACK_PATH, request.url).toString(),
    fromEnvironment: false,
  };
}

export async function GET(request: Request) {
  const session = await currentUser();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: NOT_SIGNED_IN },
      { status: 401, headers: noStore },
    );
  }

  /* `linearConnectionViewFor` is the view's work: there is no shape in this
     payload that could carry the refresh token, so there is nothing to
     remember to strip. */
  return NextResponse.json(
    {
      ok: true,
      setup: {
        ...linearSetupStatus(),
        redirectUri: redirectUri(request).value,
      },
      storage: linearStorageStatus(),
      connection: await linearConnectionViewFor(session.email),
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

  /* Revocation first, and awaited — the one ordering in this feature that
     cannot be rearranged; see the header. Best-effort beyond that: a
     disconnect that refused because Linear was slow would be a customer
     unable to revoke us. When the token cannot even be unsealed there is
     nothing to revoke with, and deleting the unreadable row is still the
     right outcome — the honest description is "removed here, possibly still
     granted there", which is what `revoked: false` lets the panel say. */
  const token = await linearRefreshTokenFor(session.email);
  const revoked = token.ok ? await revokeToken(token.refreshToken) : false;

  /* Only ever this session's own account. The email comes from the signed
     cookie and never from the request, so there is no spelling of this call
     that deletes somebody else's connection. */
  const removed = await disconnectLinear(session.email);

  /* `removed: false` is a success, not a 404 — disconnecting something
     already disconnected is the outcome the caller wanted. */
  return NextResponse.json({ ok: true, removed, revoked }, { headers: noStore });
}
