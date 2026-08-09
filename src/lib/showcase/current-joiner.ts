import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { JOIN_PATH, JOINER_COOKIE, type Joiner } from "./contract";
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
 * Deliberately not `SIGN_IN_PATH`. That is the admin's door — an email address
 * and a password — and a new starter has neither, on purpose: the link in their
 * invitation is the whole credential. Sending them there put a password form in
 * front of somebody who was never given a password, for an account that does
 * not exist and cannot be created, which is a dead end wearing the costume of a
 * next step. It is also the worst possible moment for it: this is somebody's
 * first week at a new job, and a screen that asks them to prove who they are
 * and then refuses every answer reads as something they have done wrong.
 *
 * `/showcase/join` with nothing in the query is where they go instead, because
 * that page already renders exactly this failure and already has the words for
 * it — the link has aged out or was never theirs, and whoever invited them can
 * send another. Every way of arriving here is one of those: a ninety-day token
 * that has finally expired, a device that never had the cookie, a seat taken
 * back, a showcase reset. They are different facts with one fix, and the join
 * page says so.
 *
 * A redirect to that screen rather than a second copy of it rendered here. Two
 * screens apologising for the same thing in two slightly different sets of
 * words is a thing that drifts, and the half that gets rewritten is never the
 * half the person is looking at. The join page's own `accept()` already sends
 * people to this same address when a token goes stale between the render and
 * the click, so this is that door rather than a new one.
 *
 * What is not on that screen is a button offering to send a new link, and the
 * absence is the design. This person has nothing to prove who they are with, so
 * such a button could only ever post somebody's onboarding to whatever address
 * was typed into it. Naming the person to ask is both the honest answer and the
 * only safe one.
 *
 * What this must not do is render the onboarding anyway with the fields empty,
 * which is how somebody ends up typing their date of birth into a page that has
 * no idea who they are.
 */
export async function requireJoiner(): Promise<Joiner> {
  const joiner = await currentJoiner();
  if (!joiner) redirect(JOIN_PATH);
  return joiner;
}
