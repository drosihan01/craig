import { requireUser } from "@/lib/showcase/current-user";
import { PersonProgress } from "./person-progress";

export const metadata = {
  title: "Person — Craig",
};

/**
 * A server component wrapping the person's page, purely to hold the guard.
 *
 * Same reasoning as every other `/showcase/*` page: the proxy turns anonymous
 * requests away at the edge, but it is a matcher rather than a wall and it can
 * only see the cookie. `requireUser()` is the check that knows whether the
 * account behind that cookie still exists — and this page is somebody's name,
 * their address and the date they start, which is a worse page than most to
 * show the wrong person.
 *
 * The title is static because whose page this is isn't server data. Everyone
 * with a seat lives in the account's own state alongside the workflows, so a
 * tab that named them would have to be told twice.
 */
export default async function ShowcasePersonPage(
  props: PageProps<"/showcase/people/[id]">,
) {
  const user = await requireUser();
  const { id } = await props.params;

  return <PersonProgress id={id} user={user} />;
}
