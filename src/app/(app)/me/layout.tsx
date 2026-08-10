import { currentJoiner } from "@/lib/craig/current-joiner";
import { NotificationScope } from "@/components/craig/notification-scope";
import { joinerNotifications } from "@/lib/craig/outstanding";

/**
 * Everything under `/me` belongs to the new starter, including the bell.
 *
 * The layout above this resolves notifications from whichever session it finds,
 * and it preferred the admin's when both cookies existed — "somebody testing
 * their own onboarding", with the admin's product winning. That reasoning is
 * right for admin rooms and **wrong here**, and this is exactly the case it got
 * wrong: an admin holding a joiner link, which is how anybody would check what
 * a new starter sees. They opened `/me` and were shown seats, billing and other
 * people's broken steps, on the screen that is supposed to contain nothing but
 * their own onboarding.
 *
 * So the scope follows the **route**, not the cookie. A nested provider wins
 * over the one above it, so everything under `/me` gets the joiner's list and
 * cannot get anybody else's — there is no branch here to take the wrong way.
 * `notificationsFor` is not imported into this file at all, which is the
 * property worth having: the admin's list is not reachable from the joiner's
 * layout even by mistake.
 *
 * `currentJoiner` rather than `requireJoiner`: the redirect belongs to the
 * pages, which each say where they send somebody. A layout that redirected
 * would take that decision away from them, and an empty bell for a session that
 * is about to be bounced anyway costs nothing.
 */
export default async function JoinerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const joiner = await currentJoiner();

  return (
    <NotificationScope items={joiner ? joinerNotifications(joiner) : []}>
      {children}
    </NotificationScope>
  );
}
