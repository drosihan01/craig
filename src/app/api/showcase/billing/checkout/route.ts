import { NextResponse } from "next/server";
import { PEOPLE_PATH } from "@/lib/craig/contract";
import { currentUser } from "@/lib/craig/current-user";
import { rateLimit } from "@/lib/craig/rate-limit";
import { subscriptionFor } from "@/lib/craig/accounts";
import { stripeConfig } from "@/lib/stripe/config";
import { createCheckoutSession } from "@/lib/stripe/billing";

/**
 * The one route that starts a payment.
 *
 * It creates a Stripe Checkout Session and hands back its URL. Everything about
 * taking the money — the card field, 3-D Secure, Apple Pay, the receipt, the
 * retry when a bank declines — happens on Stripe's page, and that is the point
 * rather than a shortcut. A card number that never touches this server is a
 * card number this server can never leak, and PCI scope is a thing you either
 * have or don't.
 *
 * A POST, not a GET, and not negotiable. This creates objects in Stripe and can
 * create a Customer as a side effect. A GET that creates things is one browser
 * prefetch, one link preview, one crawler away from making them by accident.
 *
 * It returns the URL rather than issuing a redirect, because the button that
 * calls it lives inside a dialog. A redirect turns every failure into a page
 * the person can't get back from; a fetch lets the dialog say "that didn't
 * work" while still standing, which is the difference between a bad minute and
 * a lost customer.
 */

/** Stripe's budget, not OpenAI's. */
const LIMIT_OPTIONS = { spend: false } as const;

const noStore = { "Cache-Control": "no-store" };

const refuse = (error: string, status: number) =>
  NextResponse.json({ ok: false, error }, { status, headers: noStore });

/**
 * Where Stripe sends them back to, built from the request rather than from a
 * configured base URL.
 *
 * The deployment this is running on is the only origin that can be correct
 * here — localhost in development, the real host in production — and a
 * hardcoded one is a redirect that works on somebody's laptop and strands
 * every real customer. `request.url` is the origin that served this call, so
 * it agrees with wherever they actually are by construction.
 */
function originOf(request: Request): string {
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  const session = await currentUser();
  if (!session) return refuse("Not signed in.", 401);

  const limit = await rateLimit(`showcase-checkout:${session.email}`, LIMIT_OPTIONS);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: limit.message },
      {
        status: 429,
        headers: limit.retryAfter
          ? { ...noStore, "Retry-After": String(limit.retryAfter) }
          : noStore,
      },
    );
  }

  /* Said plainly rather than as a 500. A deployment with no Stripe keys is the
     normal state of this showcase on most machines, and the screen that opens
     the paywall has to be able to explain that without looking broken — the
     same argument `src/lib/google/result.ts` makes about `not-configured`. */
  const config = stripeConfig();
  if (!config.ok) {
    return refuse(
      "Payments aren't set up on this deployment yet.",
      config.reason === "not-configured" ? 501 : 500,
    );
  }

  /* Already paying, so don't sell it to them twice.

     Checkout will cheerfully create a second subscription against the same
     customer, and the first anybody would know is two charges on one card at
     the end of the month. The honest answer to "upgrade" when they are already
     upgraded is to send them to the portal, where they can see what they have
     and change it. */
  const existing = await subscriptionFor(session.email);
  if (existing && existing.status !== "canceled") {
    return NextResponse.json(
      {
        ok: false,
        error: "This account already has a plan.",
        manage: true,
      },
      { status: 409, headers: noStore },
    );
  }

  const origin = originOf(request);

  const created = await createCheckoutSession({
    priceId: config.priceId,
    accountEmail: session.email,
    /* `{CHECKOUT_SESSION_ID}` is a literal Stripe substitutes on the way back.
       It must not be URL-encoded, which is why it is written into the string
       here rather than passed through `URLSearchParams`. */
    successUrl: `${origin}/api/showcase/billing/return?session_id={CHECKOUT_SESSION_ID}`,
    /* Back where they pressed the button, with nothing changed and nothing
       said. Abandoning a checkout is not an error and must not be greeted
       like one. */
    cancelUrl: `${origin}${PEOPLE_PATH}`,
    customerId: existing?.customerId,
  });

  if (!created.ok) {
    /* Their words, not Stripe's. The server log already has the real message
       for whoever can act on it. */
    console.error(
      `[showcase/billing] checkout create failed: ${created.reason} ${created.message}`,
    );
    return refuse("Couldn't start checkout. Try again in a moment.", 502);
  }

  return NextResponse.json(
    { ok: true, url: created.url },
    { headers: noStore },
  );
}
