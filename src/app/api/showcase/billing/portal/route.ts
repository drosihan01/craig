import { NextResponse } from "next/server";
import { currentUser } from "@/lib/showcase/current-user";
import { rateLimit } from "@/lib/showcase/rate-limit";
import { subscriptionFor } from "@/lib/showcase/accounts";
import { stripeConfig } from "@/lib/stripe/config";
import { createPortalSession } from "@/lib/stripe/billing";

/**
 * The way out, which is not optional and shouldn't feel like it.
 *
 * Stripe's billing portal is where somebody changes their card, reads their
 * invoices, and cancels. Building our own version of those screens would mean
 * writing a cancellation flow, and a cancellation flow written by the company
 * being cancelled on is a thing nobody has ever made good. Stripe's is honest,
 * already translated, and stays correct when their subscription model changes
 * underneath us.
 *
 * It needs a customer id and nothing else, which means it only works for an
 * account that has actually bought something. There is no portal for a free
 * account because there is nothing in it.
 */

const LIMIT_OPTIONS = { spend: false } as const;

const noStore = { "Cache-Control": "no-store" };

const refuse = (error: string, status: number) =>
  NextResponse.json({ ok: false, error }, { status, headers: noStore });

export async function POST(request: Request) {
  const session = await currentUser();
  if (!session) return refuse("Not signed in.", 401);

  const limit = rateLimit(`showcase-portal:${session.email}`, LIMIT_OPTIONS);
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

  const config = stripeConfig();
  if (!config.ok) {
    return refuse("Payments aren't set up on this deployment yet.", 501);
  }

  const subscription = await subscriptionFor(session.email);
  if (!subscription) {
    return refuse("This account doesn't have a plan to manage.", 404);
  }

  const created = await createPortalSession({
    customerId: subscription.customerId,
    /* Straight back to the seats. Whatever they went in to do — new card,
       cancel, read an invoice — the thing it changes is how many people they
       can add, so that is the screen worth returning them to. */
    returnUrl: `${new URL(request.url).origin}/showcase/people`,
  });

  if (!created.ok) {
    console.error(
      `[showcase/billing] portal create failed: ${created.reason} ${created.message}`,
    );
    return refuse("Couldn't open billing. Try again in a moment.", 502);
  }

  return NextResponse.json(
    { ok: true, url: created.url },
    { headers: noStore },
  );
}
