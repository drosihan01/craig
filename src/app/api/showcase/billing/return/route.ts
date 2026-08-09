import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/showcase/current-user";
import { saveSubscription } from "@/lib/showcase/accounts";
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
  const target = `/showcase/people?billing=${encodeURIComponent(note)}`;
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
    return NextResponse.redirect(new URL("/showcase/sign-in", request.url), {
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

  /* Paid but not yet settled. Some payment methods take days, and Stripe says
     so rather than pretending. Nothing is written — the webhook will write it
     when the money actually arrives — and the page says it's pending instead
     of promising seats that aren't paid for. */
  if (!found.subscription) {
    return back(request, "pending");
  }

  await saveSubscription(session.email, found.subscription);

  return back(request, "upgraded");
}
