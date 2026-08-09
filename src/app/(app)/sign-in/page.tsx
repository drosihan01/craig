import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthSplit } from "@/components/ui";
import { AFTER_SIGN_IN, JOIN_PATH } from "@/lib/craig/contract";
import { hasAnyAccount } from "@/lib/craig/accounts";
import { currentUser } from "@/lib/craig/current-user";
import { safeNext } from "@/lib/craig/redirect";
import { SIGN_UP_PATH } from "@/lib/craig/sign-up";
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
  props: PageProps<"/sign-in">,
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

        <div className="flex flex-col gap-1.5 text-sm text-text-subtle">
          <p>
            No account?{" "}
            <Link
              href={SIGN_UP_PATH}
              className="text-accent underline-offset-4 hover:underline"
            >
              Create one
            </Link>
          </p>

          {/* The only thing in the product that points at `/join`, which until
              now nothing did. A new starter who has lost the link in their
              invitation has one instinct — find the login page — and this is
              the page they find. Without this line it is a dead end: an email
              and password form for an account they were never given and cannot
              create, on somebody's first week.

              Below the sign-up line rather than above it, because this page is
              addressed to the person who bought Craig and they are still the
              likelier reader. It is a way out for the person on the wrong
              screen, not a second front door. */}
          <p>
            Joining a company?{" "}
            <Link
              href={JOIN_PATH}
              className="text-accent underline-offset-4 hover:underline"
            >
              Get your link
            </Link>
          </p>
        </div>
      </div>
    </AuthSplit>
  );
}
