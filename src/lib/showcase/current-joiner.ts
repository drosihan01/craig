import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { JOINER_COOKIE, SIGN_IN_PATH, type Joiner } from "./contract";
import { getJoiner } from "./joiners";
import { readJoinerToken } from "./joiner-session";

/**
 * Which new starter is reading, for server components.
 *
 * `currentUser`'s counterpart, and deliberately the same two checks in the same
 * order — for the same reason, which is that a signed cookie outlives the thing
 * it names. The signature proves the server issued this token and that nobody
 * edited the id inside it; it proves nothing at all about whether that person
 * still has a seat. Their token is valid for ninety days, and in that time the
 * account can be reset, the seat can be taken back, or the store can be cleared
 * from the sandbox. So a token is only accepted while the joiner it refers to
 * is still on the server, which is what makes taking a seat away actually take
 * it away rather than merely stop mentioning it.
 *
 * `cache` for the length of one render, so the page, its metadata and anything
 * else that wants to know can each ask independently. That matters more here
 * than it does for the admin: `generateMetadata` and the page body both need
 * the joiner, they run separately, and without this the alternative is either
 * two lookups or threading the record through props that don't otherwise exist.
 *
 * The proxy already turns anonymous requests away at the edge of `/showcase`,
 * and this exists anyway for the reason the admin's copy spells out — that
 * guard is a matcher one refactor away from not covering a route, and it only
 * ever sees a cookie. This is the check that knows whether there is anybody
 * behind it.
 */
export const currentJoiner = cache(async (): Promise<Joiner | null> => {
  const store = await cookies();
  const id = await readJoinerToken(store.get(JOINER_COOKIE)?.value);
  if (!id) return null;

  return getJoiner(id);
});

/**
 * The same, for the screen that has nothing to show a stranger.
 *
 * Sends them to sign-in, which is the honest least-bad answer rather than a
 * good one. A new starter has no password and no account — their link is the
 * whole credential — so there is genuinely nowhere to send somebody whose link
 * has expired or whose seat has gone except back to whoever invited them. What
 * this must not do is render the screen anyway with the fields empty, which is
 * how a person ends up typing their date of birth into a page that has no idea
 * who they are.
 */
export async function requireJoiner(): Promise<Joiner> {
  const joiner = await currentJoiner();
  if (!joiner) redirect(SIGN_IN_PATH);
  return joiner;
}
