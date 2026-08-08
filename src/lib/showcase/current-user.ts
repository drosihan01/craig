import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SIGN_IN_PATH, type Session } from "./contract";
import { getAccount } from "./accounts";
import { readSession } from "./session";

/**
 * Who's signed in, for server components.
 *
 * Two checks, not one. The signature proves nobody edited the cookie, but a
 * signed cookie outlives the thing it refers to: reset the showcase and every
 * browser still holds a perfectly valid token for an account that no longer
 * exists. So a session is only accepted while its account is still there, which
 * is what makes reset actually reset rather than merely forget.
 *
 * `cache` memoises it for the length of one render, so a layout, a page and
 * three components can each ask independently without repeating the work — and,
 * more usefully, without anyone being tempted to prop-drill the session down
 * the tree to avoid the cost.
 *
 * The proxy already turns anonymous requests away at the edge of `/showcase`.
 * This exists anyway because that guard is a matcher — one refactor away from
 * not covering a route — and because it only ever sees the cookie. This is the
 * check that knows whether the account behind it is real.
 */
export const currentUser = cache(async (): Promise<Session | null> => {
  const store = await cookies();
  const session = await readSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  if (!getAccount(session.email)) return null;

  return session;
});

/** The same, for pages that have nothing to show a signed-out visitor. */
export async function requireUser(): Promise<Session> {
  const session = await currentUser();
  if (!session) redirect(SIGN_IN_PATH);
  return session;
}
