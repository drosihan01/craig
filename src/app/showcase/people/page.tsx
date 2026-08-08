import { requireUser } from "@/lib/showcase/current-user";
import { PeopleList } from "./people-list";

export const metadata = {
  title: "People — Craig",
};

/**
 * A server component wrapping the screen, purely to hold the guard.
 *
 * Every `/showcase/*` page needs `requireUser()`: the proxy is a matcher rather
 * than a wall, and it only ever sees the cookie. This is the check that knows
 * whether the account behind it still exists — and this page is where somebody
 * gets invited, so it is a worse page than most to be wrong about.
 */
export default async function ShowcasePeoplePage() {
  const user = await requireUser();
  return <PeopleList user={user} />;
}
