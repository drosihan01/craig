import { NextResponse } from "next/server";
import { saveSubscription } from "@/lib/showcase/accounts";
import { stripeConfig } from "@/lib/stripe/config";
import { retrieveSubscription } from "@/lib/stripe/billing";
import { isTransient } from "@/lib/stripe/result";
import { verifyEvent } from "@/lib/stripe/webhook";

/**
 * What Stripe tells us when nobody is looking.
 *
 * The return route covers the happy path where somebody pays and waits for the
 * page. This covers everything else, which over a subscription's life is most
 * of it: the card that expires in March, the bank that declines the fourth
 * renewal, the cancellation done from the portal, the payment that succeeds two
 * days after checkout. None of those involve anybody visiting this site, and an
 * integration that only learns about money while a customer happens to be
 * looking at it will be wrong about who has paid within a month.
 *
 * Unauthenticated by design, and signed instead. There is no session here —
 * Stripe is a stranger POSTing JSON — so the signature *is* the authentication,
 * and it is the only thing standing between this route and anybody on the
 * internet granting themselves five seats by posting a made-up event. It is
 * checked before a single field is read.
 *
 * It re-reads rather than trusting the payload, and that is the design decision
 * worth defending. Webhook deliveries are not ordered: an `updated` from
 * 10:00:01 can arrive after one from 10:00:05, and writing whatever the latest
 * *delivery* says would leave the account holding stale state permanently.
 * Asking Stripe for the subscription as it stands right now costs one request
 * and makes ordering irrelevant — the answer is the same whichever order the
 * events land in, and however many times they are redelivered.
 *
 * Which is also why it is safe for this to run at the same time as the return
 * route. Both write the same fields read from the same source of truth, so the
 * race has no losing side.
 */

/**
 * Next's App Router hands the body as bytes we ask for, and we must ask for
 * text. Signature verification hashes the exact bytes Stripe sent; parsing to
 * JSON and re-serializing changes whitespace and key order, and every signature
 * check fails forever in a way that looks like a wrong secret.
 */
export const dynamic = "force-dynamic";

/** Stripe stops retrying on a 2xx. Say 200 for anything we understood, even if
    we chose to do nothing with it — a 4xx would buy us the same event every
    few minutes for three days. */
const ok = () => NextResponse.json({ received: true });

/** The events that change what somebody is entitled to. Anything else is
    acknowledged and dropped, on purpose: subscribing to everything and
    handling four things means a log full of noise nobody reads. */
const HANDLED = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

/** The account an event belongs to, from wherever this kind of event carries
    it. Set on the way in by `createCheckoutSession` — `client_reference_id` on
    the session, `metadata.account` on the subscription — so that this end has
    something to look it up by that isn't an email address a customer can
    change from Stripe's own portal. */
function accountFrom(object: Record<string, unknown>): string {
  const reference = object.client_reference_id;
  if (typeof reference === "string" && reference) return reference;

  const metadata = object.metadata;
  if (metadata && typeof metadata === "object") {
    const account = (metadata as Record<string, unknown>).account;
    if (typeof account === "string" && account) return account;
  }
  return "";
}

/** The subscription this event is about, whether it is the object itself or
    something hanging off a checkout session. */
function subscriptionIdFrom(object: Record<string, unknown>): string {
  if (typeof object.id === "string" && object.id.startsWith("sub_")) {
    return object.id;
  }
  const linked = object.subscription;
  if (typeof linked === "string" && linked) return linked;
  /* Expanded rather than an id, which is what `retrieveCheckoutSession` asks
     for and what a session can carry here too. */
  if (linked && typeof linked === "object") {
    const id = (linked as Record<string, unknown>).id;
    if (typeof id === "string") return id;
  }
  return "";
}

export async function POST(request: Request) {
  const config = stripeConfig();
  /* No secret configured means this deployment cannot tell a real delivery
     from a forged one, and the only safe thing to do with an unverifiable
     instruction to grant seats is refuse it. 501 rather than 200, because
     unlike an event we understood and ignored, this one genuinely hasn't been
     dealt with and a retry later may well succeed. */
  if (!config.ok || !config.webhookSecret) {
    console.error("[showcase/billing] webhook arrived with no signing secret");
    return NextResponse.json({ error: "Not configured." }, { status: 501 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Unsigned." }, { status: 400 });
  }

  const raw = await request.text();

  const event = await verifyEvent(raw, signature, config.webhookSecret);
  if (!event.ok) {
    /* Logged loudly. In development this is nearly always the CLI's secret
       having been reprinted without `.env.local` being updated — but it is
       also exactly what an attempt to forge an event looks like, and those
       two must never be quietly indistinguishable. */
    console.error(`[showcase/billing] webhook rejected: ${event.reason}`);
    return NextResponse.json({ error: "Bad signature." }, { status: 400 });
  }

  const type = event.event.type;
  if (!HANDLED.has(type)) return ok();

  const object = (event.event.data?.object ?? {}) as Record<string, unknown>;

  const accountEmail = accountFrom(object);
  const subscriptionId = subscriptionIdFrom(object);

  /* Acknowledged, not retried. An event with nothing to attach it to will
     still have nothing to attach it to in five minutes — most likely it is a
     subscription somebody made by hand in the Dashboard, which no account here
     owns. Worth a log line and nothing more. */
  if (!accountEmail || !subscriptionId) {
    console.error(
      `[showcase/billing] ${type} had no account (${accountEmail || "none"}) or subscription (${subscriptionId || "none"})`,
    );
    return ok();
  }

  const current = await retrieveSubscription(subscriptionId);
  if (!current.ok) {
    console.error(
      `[showcase/billing] ${type} lookup failed: ${current.reason} ${current.message}`,
    );

    /* Only ask for a retry when a retry could work.

       A 500 tells Stripe to send this event again, backing off over three
       days. That is exactly right for a network blip or a rate limit, and
       exactly wrong for a subscription that does not exist — which will still
       not exist on the twentieth attempt. Answering everything with a 500
       turns one unanswerable event into days of noise, and buries the
       transient failures that genuinely needed the retry. */
    if (isTransient(current)) {
      return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
    }
    return ok();
  }

  await saveSubscription(accountEmail, current.subscription);

  return ok();
}
