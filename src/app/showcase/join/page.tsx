import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui";
import { CraigMark } from "@/components/ui/craig-mark";
import { JOIN_PATH, JOINER_HOME } from "@/lib/showcase/contract";
import { getJoiner, progressOf } from "@/lib/showcase/joiners";
import {
  JOINER_COOKIE_OPTIONS,
  JOINER_MAX_AGE,
  readJoinerToken,
} from "@/lib/showcase/joiner-session";

/**
 * Where the link in the invitation lands.
 *
 * The new starter arrives here holding the only credential they will ever have,
 * and leaves with a session and their own screen. Nothing else happens on this
 * page: it exists because a token in a URL and a cookie in a browser are
 * different things, and something has to turn one into the other.
 *
 * It is a page rather than a route handler for one reason and it is a good one:
 * both outcomes need to be looked at by a person. The failure is a stranger's
 * first contact with a company they have just agreed to work for, and hand-rolled
 * HTML inside a `Response` would be the one screen in the product that doesn't
 * look like the product. A `route.ts` here would also make a `page.tsx` at this
 * path impossible — Next allows one or the other, not both.
 *
 * The cost is that a Server Component cannot set a cookie; only a Server
 * Function or a Route Handler can, because by the time a component renders the
 * headers have gone. So the page verifies, and a Server Function does the
 * setting — the handoff is the form below.
 *
 * That form is why there is a button between the link and their onboarding, and
 * the button is worth more than it costs. Mail clients, link scanners and
 * corporate security gateways all fetch URLs out of email before any person
 * sees them; a GET that signs you in is a GET all three of them perform. A POST
 * behind a click is the only signal available here that the request came from a
 * human being, and it costs that human one tap on a screen that is already
 * telling them something they want to know.
 */

export const metadata = {
  title: "Your onboarding",
  /* Nothing under this path should be in an index. The page is worthless
     without a token and the token must never be in one. */
  robots: { index: false, follow: false },
};

/**
 * What's actually waiting for them, in a sentence.
 *
 * Three cases rather than a count, because the count reads wrong in two of
 * them. "0 things to fill in" is a screen that looks broken, and telling
 * somebody who has already finished that they have things to do is worse than
 * saying nothing at all.
 */
function waiting(company: string, count: number, finished: boolean) {
  if (finished) {
    return `You've already given ${company} everything they asked for. This takes you back to it, in case you want to change something.`;
  }
  if (count === 0) {
    return `Nothing needs filling in by you just yet. This is where your onboarding lives, so you can see what's happening and what's still to come.`;
  }
  if (count === 1) {
    return `There's one thing ${company} needs from you. It won't take long, and you can stop and come back to it.`;
  }
  return `There are ${count} things ${company} needs from you. None of them take long, and you can stop and come back whenever suits.`;
}

/**
 * The shell both outcomes share.
 *
 * Deliberately not the `AuthShell` the admin's sign-in uses. That screen opens
 * with the Craig mark at four times this size, and this is the first thing
 * somebody sees after an email that was signed by their new employer and
 * mentioned Craig once, in the corner, in grey. Leading with a logo they have no
 * reason to recognise would undo the whole point of writing that email in the
 * company's voice. So the credit here sits where it sat there.
 */
function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="flex w-full max-w-md flex-col gap-5">
        <div className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-7 shadow-e2">
          {children}
        </div>

        {/* The same watermark as the email, in the same corner, saying the same
            words — this screen is the next thing that happens after that
            message, and a supplier who is a grey line in one and a header in
            the other reads as two different products.

            The real mark rather than the email's typographic stand-in, because
            this is a browser: an SVG renders here, and it is only in the email
            that Gmail and Word between them leave nothing but type. `size-5` is
            `MARK_MIN_SIZE` — below it the drawing collapses into a smudge. */}
        <p className="flex items-center justify-end gap-1.5 text-xs text-text-subtle">
          <CraigMark className="size-5" />
          <span>
            Made with{" "}
            <span className="font-semibold tracking-[-0.01em]">Craig</span>
          </span>
        </p>
      </div>
    </main>
  );
}

export default async function JoinPage(props: PageProps<"/showcase/join">) {
  const { token } = await props.searchParams;

  /* A repeated `?token=` arrives as an array, and there is no sensible way to
     choose between two credentials — so an array is treated as no token rather
     than as the first one. */
  const raw = typeof token === "string" ? token : undefined;

  const joinerId = await readJoinerToken(raw);
  const joiner = joinerId ? getJoiner(joinerId) : null;

  /* One screen for every way this can fail, because every way it can fail has
     the same fix and the person reading it did nothing wrong. A link that
     expired, a link that was retyped by hand with a character missing, and a
     link from before somebody reset the showcase are three different facts and
     none of them are this person's to act on — the only useful sentence is the
     one that tells them who can. No codes, no "invalid", nothing that reads as
     an accusation about the link they were sent. */
  if (!raw || !joiner) {
    return (
      <Screen>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">
          This link didn&rsquo;t work
        </h1>
        <p className="text-base leading-relaxed text-text-muted">
          Links like this one stop working after a while, and they only work for
          the person they were sent to.
        </p>
        <p className="text-base leading-relaxed text-text-muted">
          Ask whoever invited you to send a new one — it takes them a moment,
          and nothing you&rsquo;ve already filled in is lost.
        </p>
      </Screen>
    );
  }

  const progress = progressOf(joiner);
  const firstName = joiner.name.split(" ")[0] || joiner.name;

  /* Captured past the guard, so the Server Function below closes over a value
     that is known to be there. Narrowing doesn't cross into a function that
     runs later — which is the compiler being right about something real: this
     closure is a separate request. */
  const credential = raw;

  /**
   * Accepting the invitation: the cookie, and then their own screen.
   *
   * The token is verified a second time here rather than trusted from the
   * render above. A Server Function is an endpoint like any other — it can be
   * called long after the page that rendered it was drawn, and on a token with
   * a ninety-day life "long after" is a real amount of time. Checking twice
   * costs one HMAC and closes the window where an expired link still lets
   * somebody in because the tab was left open.
   *
   * The token closed over here is what goes in the cookie, unchanged. It is
   * already signed and already carries its own expiry, so the cookie needs to
   * hold nothing else — and `JOINER_MAX_AGE` is the same number the token was
   * minted with, deliberately, because a cookie that outlives its token is a
   * cookie that logs somebody out somewhere the code doesn't expect.
   */
  async function accept() {
    "use server";

    const stillValid = await readJoinerToken(credential);
    if (!stillValid || !getJoiner(stillValid)) {
      /* Back to this page with nothing, which renders the screen above. Better
         than sending them onward to a screen that will refuse them for reasons
         it can't explain. */
      redirect(JOIN_PATH);
    }

    const jar = await cookies();
    jar.set({
      ...JOINER_COOKIE_OPTIONS,
      value: credential,
      maxAge: JOINER_MAX_AGE,
    });

    redirect(JOINER_HOME);
  }

  return (
    <Screen>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-text-subtle">{joiner.company}</p>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">
          Welcome, {firstName}
        </h1>
      </div>

      <p className="text-base leading-relaxed text-text-muted">
        {waiting(
          joiner.company,
          progress.total - progress.done,
          progress.finished,
        )}
      </p>

      {/* No `useFormStatus` spinner and no client component to hold one. Without
          JavaScript this is still a form that submits, which is the state a
          magic link out of an email is most likely to be opened in — a webmail
          preview pane, a locked-down work laptop, a browser that hasn't
          finished hydrating. A button that only works once React arrives is a
          button that fails for exactly those people. */}
      <form action={accept}>
        <Button type="submit" size="lg" className="w-full">
          {progress.finished ? "Open your checklist" : "Get started"}
        </Button>
      </form>
    </Screen>
  );
}
