import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthSplit } from "@/components/ui";
import { AFTER_SIGN_IN } from "@/lib/showcase/contract";
import { hasAnyAccount } from "@/lib/showcase/accounts";
import { currentUser } from "@/lib/showcase/current-user";
import { safeNext } from "@/lib/showcase/redirect";
import { SIGN_UP_PATH } from "@/lib/showcase/sign-up";
import { SignInForm } from "./sign-in-form";

export const metadata = {
  title: "Sign in — Craig",
};

/**
 * Where the proxy sends anyone without a session.
 *
 * A server component so `?next=` arrives as a prop and can be checked before it
 * reaches the browser, and so an already-signed-in visitor is bounced on the
 * server rather than shown a form they don't need.
 */
export default async function ShowcaseSignInPage(
  props: PageProps<"/showcase/sign-in">,
) {
  if (await currentUser()) redirect(AFTER_SIGN_IN);

  const next = safeNext((await props.searchParams).next);

  /* Before anybody has signed up there is nothing here to sign into, and the
     proxy sends every anonymous request to this page — so the first visit to a
     fresh showcase would land on a form that cannot succeed. `next` rides along
     so signing up still finishes the journey the visitor started.

     This reveals that the showcase is empty, which the sign-in API declines to.
     The asymmetry is deliberate and the two facts are different sizes: the API
     stays generic because it's what gets probed with credentials and must never
     confirm that a *particular* email has an account, whereas "nobody has signed
     up yet" identifies no one and withholding it costs the first visitor their
     way in. */
  if (!(await hasAnyAccount())) {
    redirect(`${SIGN_UP_PATH}?next=${encodeURIComponent(next)}`);
  }

  return (
    <AuthSplit>
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">
          Sign in to Craig
        </h1>

        <SignInForm next={next} />

        <p className="text-sm text-text-subtle">
          No account?{" "}
          <Link
            href={SIGN_UP_PATH}
            className="text-accent underline-offset-4 hover:underline"
          >
            Create one
          </Link>
        </p>
      </div>
    </AuthSplit>
  );
}
