import { currentUser } from "@/lib/craig/current-user";
import { currentJoiner } from "@/lib/craig/current-joiner";
import { AccountScope } from "@/components/craig/account-scope";
import { NotificationScope } from "@/components/craig/notification-scope";
import {
  joinerNotifications,
  notificationsFor,
} from "@/lib/craig/outstanding";

/**
 * Wraps every showcase route, signed in or not.
 *
 * Its first job is the account guard, and the reason it's a layout is that the
 * guard has to be everywhere: the store it protects is shared by all these
 * screens, so a route that forgot to include it would be the route where the
 * previous account's data survives.
 *
 * `currentUser` rather than `requireUser` — sign-in and sign-up live under this
 * path too and have no session, and they are exactly where an account change is
 * about to happen. A null email is a real answer here, not a failure.
 *
 * Its second job is the bell, and it is here for the same reason: every screen
 * shows one, so exactly one place should decide what is in it. Five pages each
 * fetching their own is four queries written out five times, and the fifth is
 * where the bell quietly disagrees with the page it sits on.
 *
 * **Which list depends on who is reading, and that is the part worth being
 * careful about.** `/me` runs on the same shell as the admin's screens. The
 * admin's list is seats, billing, unpublished workflows and other people's
 * broken steps — none of it a new starter's business. So the two are resolved
 * separately here, from two different identities, and a joiner cannot reach the
 * employer's list by any route through the app: `notificationsFor` takes an
 * account email, and a joiner does not have one.
 */
export default async function ShowcaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();

  /* Only asked when there is no admin session. Both cookies can exist at once
     — somebody testing their own onboarding — and in that case this is the
     admin's product, so the admin's list wins. */
  const joiner = user ? null : await currentJoiner();

  const notifications = user
    ? await notificationsFor(user.email)
    : joiner
      ? joinerNotifications(joiner)
      : [];

  return (
    <>
      <AccountScope email={user?.email ?? null} />
      <NotificationScope items={notifications}>{children}</NotificationScope>
    </>
  );
}
