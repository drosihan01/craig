import { NextResponse } from "next/server";
import {
  DIRECTORY_SCOPE,
  SCOPES,
  googleSetupStatus,
  oauthClient,
} from "@/lib/google/config";
import {
  disconnectGoogle,
  getAccount,
  googleStorageStatus,
} from "@/lib/showcase/accounts";
import { currentUser } from "@/lib/showcase/current-user";
import { GOOGLE_CALLBACK_PATH } from "@/lib/showcase/google-outcome";

/**
 * What the connect screen reads, and the button that undoes a connection.
 *
 * Two verbs on one route because they are two halves of one thing: the state
 * of this account's Google connection, and getting rid of it. Splitting them
 * across two paths would mean two places to keep the session check and the
 * cache headers in step, for no gain.
 *
 * `GET` answers with three separate facts, and keeping them separate is the
 * point. Whether the *deployment* has an OAuth client is one question, whether
 * it can *store* a token is another, and whether *this account* has connected
 * is a third — they are fixed by different people in different places, and a
 * single `connected: false` would collapse "somebody needs to add a variable
 * and restart" into "press the button", which is a button that cannot work.
 *
 * `DELETE` rather than `POST`, because that is what it is, and because the
 * thing `POST` would be protecting against — a prefetcher, an image tag or a
 * link in somebody's mail issuing the request — is already impossible for a
 * method no navigation can produce.
 *
 * `no-store` on both. A cached "connected" is a screen that keeps saying so
 * after somebody has disconnected, and a cached anything on a route that
 * describes a credential is a copy of that description in a shared cache.
 */

const noStore = { "Cache-Control": "no-store" };

/**
 * Deliberately the same for a missing session and an account that has since
 * been reset out from under one. There is nothing a caller does differently,
 * and the sandbox's answer to both is the same sentence.
 */
const NOT_SIGNED_IN =
  "Sign in to the showcase first — a Google connection belongs to an account.";

/**
 * The redirect URI a person has to paste into the Cloud console, and the one
 * this deployment will actually send.
 *
 * Two sources, in that order of authority, because they answer different
 * questions. Once `GOOGLE_OAUTH_REDIRECT_URI` is set and usable it *is* the
 * value the token exchange sends, so showing anything else would be showing a
 * value the callback does not accept — the exact drift a hardcoded string
 * would cause. Until it is set there is nothing configured to show, so the
 * fallback is built from this server's own origin and the callback route's own
 * path constant: what this deployment is serving right now, which is what
 * somebody setting it up for the first time needs to type.
 *
 * Not a secret in either case. A redirect URI is in the address bar of every
 * consent screen Google has ever drawn.
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
    value: new URL(GOOGLE_CALLBACK_PATH, request.url).toString(),
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

  const account = await getAccount(session.email);
  if (!account) {
    return NextResponse.json(
      { ok: false, error: NOT_SIGNED_IN },
      { status: 401, headers: noStore },
    );
  }

  const redirect = redirectUri(request);

  /* `account.google` is `publicView`'s work, which is what makes this route
     safe to write in one line: there is no shape here that could carry the
     refresh token, so there is nothing to remember to strip. See the note on
     `publicView` in `accounts.ts`. */
  return NextResponse.json(
    {
      ok: true,
      setup: {
        /* The names of the missing variables, never their values — they are
           documentation, and they are what turns "not set up" into something a
           person can act on without going to read the source. */
        ...googleSetupStatus(),
        /* Sent so the setup checklist quotes what the consent screen will
           actually ask for. Read from `config.ts` rather than written out
           again in a component: a scope list that disagrees with the one in
           the request is a consent screen that asks for something the Cloud
           console was never told about, and Google refuses that with
           `invalid_scope` long after anybody edited either file. */
        scopes: [...SCOPES],
        sensitiveScope: DIRECTORY_SCOPE,
        redirectUri: redirect.value,
        redirectUriFromEnvironment: redirect.fromEnvironment,
      },
      storage: googleStorageStatus(),
      connection: account.google,
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

  /* Only ever this session's own account. The email comes from the signed
     cookie and never from the request, so there is no spelling of this call
     that deletes somebody else's connection. */
  const removed = await disconnectGoogle(session.email);

  /* `removed: false` is a success, not a 404. Disconnecting something that was
     already disconnected is the outcome the caller wanted, and the honest
     answer to "did this request delete a token" is still worth returning — it
     is the difference between the screen saying "disconnected" and saying
     nothing much. */
  return NextResponse.json({ ok: true, removed }, { headers: noStore });
}
