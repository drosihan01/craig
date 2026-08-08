import { requireUser } from "@/lib/showcase/current-user";
import { listJoiners, progressOf } from "@/lib/showcase/joiners";
import { PeopleList } from "./people-list";

export const metadata = {
  title: "People — Craig",
};

/**
 * A server component wrapping the screen, and now doing real work in it.
 *
 * Every `/showcase/*` page needs `requireUser()`: the proxy is a matcher rather
 * than a wall, and it only ever sees the cookie. This is the check that knows
 * whether the account behind it still exists — and this page is where somebody
 * gets invited, so it is a worse page than most to be wrong about.
 *
 * The people themselves come from the server, which is a change. They used to
 * come from the browser's own copy, and that could never have worked once the
 * new starter had a screen of their own: they fill their steps in on a
 * different device, in a different browser, and nothing they did could reach
 * the person tracking it. So whoever holds a seat, and how far through they
 * are, is read here and handed down.
 */
export default async function ShowcasePeoplePage() {
  const user = await requireUser();

  /* Flattened to what the list actually draws, rather than passing the whole
     record down. The steps are the new starter's business and the person's own
     page is where they belong; the list only needs to say how far along. */
  const people = listJoiners(user.email).map((joiner) => {
    const { done, total, next, finished } = progressOf(joiner);
    return {
      id: joiner.id,
      name: joiner.name,
      email: joiner.email,
      role: joiner.role,
      startDate: joiner.startDate,
      workflowName: joiner.workflowName,
      done,
      total,
      finished,
      nextStep: next?.title ?? null,
    };
  });

  return <PeopleList user={user} people={people} />;
}
