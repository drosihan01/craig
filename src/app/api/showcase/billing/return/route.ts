import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/craig/current-user";
import { saveSubscription } from "@/lib/craig/accounts";
import { entitles } from "@/lib/craig/seats";
import { stripeConfig } from "@/lib/stripe/config";
import { retrieveCheckoutSession } from "@/lib/stripe/billing";

/**
 * Where Stripe drops them after they pay.
 *
 * This exists so the seats are already bought by the time the page redraws.
 * The webhook is the authority on subscription state and always will be — it
 * is the only half that still works when somebody closes the tab on the
 * receipt screen — but a webhook is a race with the redirect, and losing that
 * race means a customer who has just been charged $49 looks at a page still
 * telling them they're out of seats. So both write, and the one that gets
 * there first wins. Neither can corrupt the other: they write the same fields
 * read from the same Stripe objects.
 *
 * A GET with a side effect, which is normally worth refusing. It is defensible
 * here for the same reason `/api/google/callback` is: this is a redirect
 * target, the browser will only ever arrive by following Stripe's `Location`,
 * and the effect is idempotent — reading a session and writing what it says
 * twice leaves exactly what writing it once leaves.
 *
 * The session id in the query string is not trusted to identify the account.
 * It is a value from a URL somebody can edit, so it is used only to *ask
 * Stripe* what happened, and the answer's `client_reference_id` is checked
 * against the signed-in session before a single field is written. Without that
 * check, pasting somebody else's session id would attach their subscription to
 * your account.
 */

/** Ours, never read by anyone. Long enough not to truncate a real id. */
const MAX_ID = 128;

function oneLine(value: string | null): string {
  if (!value) return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ID);
}

/** Folded, because addresses are compared folded everywhere else here. */
const sameAccount = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Always somewhere in the product, never a JSON error page.
 *
 * Whatever went wrong, this person has just come back from a payment screen.
 * The worst outcome is a blank page with a status code on it, which tells them
 * nothing about whether their card was charged. Every exit lands on People,
 * where the seat count is the answer to the only question they have.
 */
function back(request: NextRequest, note: string) {
  const target = `/people?billing=${encodeURIComponent(note)}`;
  return NextResponse.redirect(new URL(target, request.url), {
    status: 303,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const session = await currentUser();
  /* Signed out, which mostly means they paid in one browser and landed in
     another. Sending them to sign in is right, and the webhook will have
     recorded the subscription regardless — there is nothing to lose here. */
  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", request.url), {
      status: 303,
    });
  }

  const config = stripeConfig();
  if (!config.ok) return back(request, "unavailable");

  const sessionId = oneLine(request.nextUrl.searchParams.get("session_id"));
  if (!sessionId) return back(request, "unknown");

  const found = await retrieveCheckoutSession(sessionId);
  if (!found.ok) {
    console.error(
      `[showcase/billing] return lookup failed: ${found.reason} ${found.message}`,
    );
    return back(request, "unknown");
  }

  /* The check the whole route turns on. */
  if (
    !found.accountEmail ||
    !sameAccount(found.accountEmail, session.email)
  ) {
    console.error(
      "[showcase/billing] return session belonged to a different account",
    );
    return back(request, "unknown");
  }

  /* One branch per thing that can actually have happened, which is the whole
     of the fix here. This used to be `if (!found.subscription) pending`, and
     that single test answered four different questions with one sentence:
     a payment genuinely in flight, a checkout still sitting open, a session
     Stripe expired without anybody paying, and a subscription this build could
     not read. Three of those four were told "Payment still clearing… no need to
     pay again", which is a claim that money moved, made on no evidence at all.

     The order below is not arbitrary — it runs from "we know least" to "we know
     most", so that nothing reassuring is reachable without the fact that would
     justify it. */
  const outcome = found.outcome;

  /* Stripe answered and this build couldn't describe the answer. It is already
     logged loudly in `retrieveCheckoutSession`, with the session id; the second
     line here is worth its noise because this is where it turns into something
     a customer reads, and because a `?billing=unknown` in a support screenshot
     should be traceable to a specific route and a specific reason.

     Nothing is written, and the message is the one that never reassures. There
     probably *is* a subscription behind this — that is the likeliest way to get
     here — so "you haven't paid" would be as wrong as "you have". The only
     honest position is that we cannot see, and that they should not pay twice
     on our say-so. */
  if (outcome.kind === "unreadable") {
    console.error(
      "[showcase/billing] return session came back in a shape this build can't read",
    );
    return back(request, "unknown");
  }

  /* Nobody paid. The session is open (they can still finish it) or expired
     (they can't), and neither is an error or a fault — abandoning a checkout is
     an ordinary thing to do. This route is not normally how somebody arrives at
     either, because abandoning sends the browser to `cancel_url`; the ways in
     are a bookmarked return URL, a back button, or a hand-edited query string,
     and all three are entitled to a true answer. Both notes say plainly that
     nothing was charged, which is a statement this branch can support and the
     old `pending` could not. */
  if (outcome.kind === "unfinished") {
    return back(
      request,
      outcome.sessionStatus === "expired" ? "expired" : "unpaid",
    );
  }

  /* The one case the old `pending` was actually written for: they finished, and
     Stripe has no subscription to hand over yet. Some payment methods settle
     over days and Stripe is honest about it, so this is honest about it too —
     nothing is written, and the webhook does the writing when the money lands.

     Logged, because it is rare enough on this integration to be worth knowing
     about, and `paymentStatus` is the whole reason it is worth logging: `paid`
     means the money is in and only the subscription is lagging, `unpaid` means
     the bank has it. Those age very differently, and by the time anybody looks,
     the session will read the same for both. */
  if (outcome.kind === "settling") {
    console.warn(
      `[showcase/billing] return session complete with no subscription yet (payment_status=${outcome.paymentStatus ?? "unknown"})`,
    );
    return back(request, "pending");
  }

  /* A real subscription, so record it whatever state it is in. The status is
     Stripe's fact about this account and the store keeps facts, not verdicts —
     the webhook already writes `canceled` and `past_due` here, and a return leg
     that only wrote the flattering ones would leave the two halves disagreeing
     about the same subscription. It also captures the `cus_…`, which is what a
     later checkout needs in order not to create a second customer. */
  await saveSubscription(session.email, outcome.subscription);

  /* And *this* is the seat question, which is not the same question as "is
     there a subscription". `entitles` is the single place that decides which
     statuses open the paid seats, and this branch used to key off the mere
     presence of a subscription instead — so an `incomplete` one, the ordinary
     shape of a first payment that hasn't gone through, produced "You're on the
     Team plan / your seats are available now" over a seat count still sitting at
     the free limit. The customer reads a promise, clicks Add, and is told they
     are out of seats. Asking the same function the paywall asks is what keeps
     the sentence and the seat count from being able to disagree. */
  return back(
    request,
    entitles(outcome.subscription.status) ? "upgraded" : "inactive",
  );
}
