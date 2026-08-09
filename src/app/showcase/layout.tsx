import { currentUser } from "@/lib/showcase/current-user";
import { AccountScope } from "@/components/showcase/account-scope";

/**
 * Wraps every showcase route, signed in or not.
 *
 * Its only job is the account guard, and the reason it's a layout is that the
 * guard has to be everywhere: the store it protects is shared by all these
 * screens, so a route that forgot to include it would be the route where the
 * previous account's data survives.
 *
 * `currentUser` rather than `requireUser` — sign-in and sign-up live under this
 * path too and have no session, and they are exactly where an account change is
 * about to happen. A null email is a real answer here, not a failure.
 */
export default async function ShowcaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();

  return (
    <>
      <AccountScope email={user?.email ?? null} />
      {children}
    </>
  );
}
