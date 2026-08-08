import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthSplit } from "@/components/ui";
import { AFTER_SIGN_IN, SIGN_IN_PATH } from "@/lib/showcase/contract";
import { currentUser } from "@/lib/showcase/current-user";
import { safeNext } from "@/lib/showcase/redirect";
import { SignUpForm } from "./sign-up-form";

export const metadata = {
  title: "Create an account — Craig",
};

/**
 * The showcase's front door.
 *
 * Nothing exists until somebody comes through here, and what they type is what
 * they get: their name, their email, their company. It stopped being a demo
 * account with a story attached the moment a second person could sign up.
 *
 * Nothing is prefilled, deliberately. A form that arrives with somebody else's
 * details in it is telling you who you're supposed to be, and the answer here
 * is whoever you actually are.
 */
export default async function ShowcaseSignUpPage(
  props: PageProps<"/showcase/sign-up">,
) {
  if (await currentUser()) redirect(AFTER_SIGN_IN);

  const next = safeNext((await props.searchParams).next);

  return (
    <AuthSplit>
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">
          Create your account
        </h1>

        <SignUpForm next={next} />

        <p className="text-sm text-text-subtle">
          Already have an account?{" "}
          <Link
            href={SIGN_IN_PATH}
            className="text-accent underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </AuthSplit>
  );
}
