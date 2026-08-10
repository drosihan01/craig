import { requireUser } from "@/lib/craig/current-user";
import { MissionControlScreen } from "./mission-control-screen";

export const metadata = {
  title: "Mission control — Craig",
  /* Same rule the two rooms behind it follow. These are internal tools, and
     nothing about them belongs in a search index. */
  robots: { index: false, follow: false },
};

/**
 * The landing between Settings and the two tools the product is built with.
 *
 * Settings used to link straight at both of them, and that was the right shape
 * while "mission control" was a heading with two rows under it — the point of
 * that change was that the design system and the mailmaker had spent months
 * with no way in at all, and any link was better than none. What it left behind
 * is a pair of tools that are only ever described in somebody else's screen: to
 * find out what the mailmaker *is*, you have to scroll to the bottom of the
 * account's settings page and read a sentence about it there.
 *
 * So they get an address of their own. Not because two links need a page —
 * they don't — but because these two are the first two of a set that grows
 * every time somebody builds a tool for building the product, and the shelf for
 * the third one should exist before the third one does. Settings keeps the
 * entrance, since that is where anybody has already learned to look; it just
 * points at one door now instead of holding both.
 *
 * A room rather than a redirect. `/mission-control` bouncing straight to the
 * design system and calling the pair a nav was the cheaper version and reads
 * fine until somebody wants to know what they are before opening one — a hub
 * whose only content is its own nav is a page nobody can describe.
 *
 * Server wrapper, client screen, for the guard and only the guard: the shape
 * `/settings`, `/people` and `/email` already use. `requireUser()` has to run
 * somewhere that can redirect, and the screen underneath is `"use client"`
 * because `AppShell` is.
 */
export default async function MissionControlPage() {
  const user = await requireUser();
  return <MissionControlScreen user={user} />;
}
