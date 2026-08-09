import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthSplit, Button } from "@/components/ui";
import { JoinerLinkForm } from "@/components/craig/joiner-link-form";
import { JOIN_PATH, JOINER_HOME } from "@/lib/craig/contract";
import { getJoiner, progressOf } from "@/lib/craig/joiners";
import {
  JOINER_COOKIE_OPTIONS,
  JOINER_MAX_AGE,
  readJoinerToken,
} from "@/lib/craig/joiner-session";

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
 * human being, and it costs that human one tap.
 *
 * That tap used to be paid for by a sentence saying what was waiting for them.
 * It is not any more — the screen is now their name, their employer's name and
 * the button, because Dzaky asked for this page on the sign-in layout with only
 * the form and the button on it. The count they used to read here is the first
 * thing on the screen the button opens, one tap later.
 */

export const metadata = {
  title: "Your onboarding",
  /* Nothing under this path should be in an index. The page is worthless
     without a token and the token must never be in one. */
  robots: { index: false, follow: false },
};

/**
 * The shell both outcomes share — the same two-panel layout as sign-in.
 *
 * This used to be a card of its own, on the argument that the admin's
 * `AuthShell` opens with the Craig mark at four times the size and that leading
 * with a logo they have no reason to recognise would undo an email written in
 * their employer's voice. The argument was right and it is no longer about a
 * screen that exists: sign-in moved to `AuthSplit`, which puts a small lockup in
 * the top corner and nothing else. That is the same register this page was
 * asking for, so the two can now be the one layout without the cost.
 *
 * `aside` is an empty panel rather than the default. What lives there otherwise
 * is `AuthMarketing` — claims aimed at somebody deciding whether to buy Craig,
 * and this person is not buying anything. They were hired. The dot grid stays
 * because it is the product's own texture; the pitch goes because they are not
 * the audience for it.
 */
function Screen({ children }: { children: React.ReactNode }) {
  return (
    <AuthSplit aside={<span aria-hidden />}>
      <div className="flex flex-col gap-5">{children}</div>
    </AuthSplit>
  );
}

export default async function JoinPage(props: PageProps<"/join">) {
  const { token } = await props.searchParams;

  /* A repeated `?token=` arrives as an array, and there is no sensible way to
     choose between two credentials — so an array is treated as no token rather
     than as the first one. */
  const raw = typeof token === "string" ? token : undefined;

  const joinerId = await readJoinerToken(raw);
  const joiner = joinerId ? await getJoiner(joinerId) : null;

  /* One screen for every way this can fail, because every way it can fail has
     the same fix and the person reading it did nothing wrong. A link that
     expired, a link that was retyped by hand with a character missing, and a
     link from before somebody reset the showcase are three different facts and
     none of them are this person's to act on — so the screen offers the one
     thing that fixes all three rather than explaining which happened. No codes,
     no "invalid", nothing that reads as an accusation about the link they were
     sent.

     It is also the only such screen in the product, and that is on purpose.
     `requireJoiner()` redirects here rather than rendering its own version of
     this apology, so somebody whose session has run out on `/me` reads
     these exact words instead of a second, slightly different set that would
     drift from them — and instead of the admin's password form, which is what
     they used to be shown and which they can never satisfy. Anything changed
     below changes for both. */
  if (!raw || !joiner) {
    return (
      <Screen>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">
          {raw ? "This link didn\u2019t work" : "Get your link"}
        </h1>
        {/* The form rather than "ask whoever invited you", which is what this
            screen used to say. It was true and it was a dead end: somebody's
            onboarding stopped until an admin read a message and remembered how
            to resend, on a product whose whole promise is that things keep
            moving while nobody is watching.

            It carries its own label — "Your email address" — and its own
            button, which is why the two paragraphs that used to sit either side
            of it are gone: they explained a field that explains itself, and the
            heading already says which of the two situations this is. */}
        <JoinerLinkForm />
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
    if (!stillValid || !(await getJoiner(stillValid))) {
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
