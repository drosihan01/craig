import "server-only";

import {
  SUBSCRIPTION_STATUSES,
  type Subscription,
  type SubscriptionStatus,
} from "@/lib/craig/contract";

import { idempotencyKey, stripeRequest, type FormValue } from "./client";
import { fail, type StripeFailed } from "./result";

/**
 * Selling the Team plan, and finding out whether anybody bought it.
 *
 * Four calls: create a Checkout Session, read one back, read a subscription,
 * and open the billing portal. Everything else Stripe can do is deliberately
 * absent — see the note at the bottom of this file.
 *
 * The shape of this integration is Checkout and the Portal rather than the
 * Payment Intents API, and that is the decision the rest follows from. Both
 * are hosted by Stripe, which means no card number ever touches this server,
 * this repo never renders a card field, and SCA, 3-D Secure, wallets, tax and
 * dunning are Stripe's problem rather than four features nobody has time to
 * build. The cost is a redirect off the site and back, which is why
 * `retrieveCheckoutSession` exists at all: coming back is a page load that has
 * to decide what somebody is entitled to.
 *
 * There is no barrel file next to this one, on purpose, for the same reason
 * there isn't one in `src/lib/google`: every module here reads a secret key,
 * and a barrel is the easiest way there is to drag a server-only module into a
 * browser bundle by accident. Server code reaches for
 * `@/lib/stripe/billing` by name.
 */

/* --- Reading Stripe's objects ----------------------------------------------- */

/**
 * The pieces of Stripe's subscription this repo reasons about.
 *
 * Narrow on purpose. Stripe's subscription has about fifty top-level fields,
 * and a wide passthrough would put a customer's payment settings and invoice
 * history into whatever this gets handed to next.
 */
interface RawSubscription {
  id?: unknown;
  status?: unknown;
  customer?: unknown;
  cancel_at_period_end?: unknown;
  items?: { data?: RawItem[] };
}

interface RawItem {
  quantity?: unknown;
  /** Unix seconds. Verified to live here and *not* on the subscription. */
  current_period_end?: unknown;
  price?: {
    id?: unknown;
    metadata?: Record<string, unknown>;
    /** A `prod_…` string, or the product itself when expanded. */
    product?: unknown;
  };
}

const asString = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

/** A Stripe reference is either the id or the whole object, depending on
    whether anybody asked for it to be expanded. Both mean the same id. */
function referenceId(value: unknown): string | null {
  if (typeof value === "string") return value || null;
  if (value && typeof value === "object") {
    return asString((value as { id?: unknown }).id);
  }
  return null;
}

/**
 * Stripe's status, narrowed to the union the rest of the app already speaks.
 *
 * Checked against `SUBSCRIPTION_STATUSES` rather than cast. The two lists
 * agree today, and the entire reason this file pins an API version is that
 * Stripe's list is theirs to extend — so a status this build has never heard
 * of has to be a recognisable failure rather than a string that flows into a
 * `Subscription` and reaches a paywall's `=== "active"` test wearing a type
 * that says it is one of eight things.
 */
function toStatus(value: unknown): SubscriptionStatus | null {
  const raw = asString(value);
  return raw && (SUBSCRIPTION_STATUSES as readonly string[]).includes(raw)
    ? (raw as SubscriptionStatus)
    : null;
}

/**
 * How many seats this subscription bought.
 *
 * The chain is price metadata, then product metadata, then five, and it is in
 * that order because it goes from most specific to least. The seat count is a
 * property of what somebody bought rather than of what we currently sell, so
 * it is read back from Stripe — a customer on last year's plan, or one support
 * granted an extra seat, has a number that our own constant does not know.
 *
 * The fallback is not decoration. Stripe's expansion depth is capped at four
 * levels, verified: from a Checkout Session,
 * `subscription.items.data.price.product` is five and comes back as
 * `400 You cannot expand more than 4 levels`. So on the return-from-Checkout
 * path the product arrives as a bare id and its metadata is out of reach,
 * while on the `retrieveSubscription` path — one level shallower — it is
 * expanded and readable. Two paths, the same subscription, different
 * information.
 *
 * Rather than let them disagree silently, this fetches the product when it has
 * to. It is one small GET, only on the path that cannot expand, and only when
 * the price has no seat count of its own. The alternative — quietly returning
 * five on one path and the real number on the other — would show a customer
 * who paid for ten seats a dialog refusing their sixth colleague, and nothing
 * in the logs would look wrong.
 *
 * **`seats` is now set on the price as well as the product** (9 August 2026,
 * `price_1U2F4OAJzn3u1xQ6NLChkxzD` → `metadata.seats = "5"`), so in practice
 * the first branch answers and the GET below no longer runs. Price metadata is
 * mutable even though the amount is not, so this did not need a new price id.
 *
 * The fallback stays anyway, and deleting it would be the wrong tidy-up. It is
 * what makes a price somebody forgot to annotate degrade into a correct answer
 * rather than a wrong one, and the day this repo sells a second plan is the day
 * that matters — the seat count would be missing on exactly the new price
 * nobody had thought about yet.
 */
const DEFAULT_SEATS = 5;

function seatsFromMetadata(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>).seats;
  const seats = Number(asString(raw) ?? raw);
  return Number.isInteger(seats) && seats > 0 ? seats : null;
}

async function resolveSeats(item: RawItem | undefined): Promise<number> {
  const price = item?.price;

  const fromPrice = seatsFromMetadata(price?.metadata);
  if (fromPrice !== null) return fromPrice;

  const product = price?.product;

  if (product && typeof product === "object") {
    const fromProduct = seatsFromMetadata(
      (product as { metadata?: unknown }).metadata,
    );
    if (fromProduct !== null) return fromProduct;
    return DEFAULT_SEATS;
  }

  const productId = asString(product);
  if (!productId) return DEFAULT_SEATS;

  const result = await stripeRequest<{ metadata?: unknown }>(
    `/products/${encodeURIComponent(productId)}`,
    { method: "GET" },
  );

  /* A failure here is swallowed into the default rather than propagated. The
     subscription itself was read successfully and is the answer the caller
     asked for; failing the whole lookup because a secondary call for a seat
     count didn't land would turn a working paywall into a broken one over a
     number that has a sensible default. It is logged by `stripeRequest`. */
  if (!result.ok) return DEFAULT_SEATS;

  return seatsFromMetadata(result.data.metadata) ?? DEFAULT_SEATS;
}

/**
 * Stripe's subscription, as the rest of this app describes one.
 *
 * `currentPeriodEnd` is the field to be careful about, and the reason this
 * file pins an API version in bold. On `2026-07-29.dahlia`, verified against a
 * real subscription in the sandbox, `current_period_end` **is not on the
 * subscription at all** — it is on the subscription *item*. The top-level
 * field that every tutorial, every older SDK and most of the internet reads is
 * simply absent, and `subscription.current_period_end` is `undefined`.
 *
 * That matters more than a renamed field usually would because of what
 * `undefined` becomes downstream: `Number(undefined)` is `NaN`, and a
 * `NaN` period end fails every comparison silently, so a paywall asking "is
 * this still in date" gets `false` for a subscription that is perfectly
 * current. Nothing throws and nothing logs. Reading it from the item is not a
 * detail; it is the difference between billing working and every paying
 * customer being locked out.
 */
async function toSubscription(raw: RawSubscription): Promise<Subscription | null> {
  const subscriptionId = asString(raw.id);
  const customerId = referenceId(raw.customer);
  const status = toStatus(raw.status);

  const item = raw.items?.data?.[0];
  const priceId = asString(item?.price?.id);
  const periodEnd = Number(item?.current_period_end);

  if (!subscriptionId || !customerId || !status || !priceId) return null;
  if (!Number.isFinite(periodEnd)) return null;

  return {
    customerId,
    subscriptionId,
    status,
    seats: await resolveSeats(item),
    priceId,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: raw.cancel_at_period_end === true,
    /* Stamped when we heard it, not when Stripe changed it. This value's whole
       job is to let a stored copy be recognised as stale later. */
    updatedAt: new Date().toISOString(),
  };
}

/**
 * The expansion used everywhere a subscription is read.
 *
 * `items.data.price` is needed rather than optional: the price id and — as
 * above — the period end both live on the item, so an unexpanded read returns
 * a subscription this file would have to reject.
 */
const SUBSCRIPTION_EXPAND = ["items.data.price", "items.data.price.product"];

/* --- Checkout -------------------------------------------------------------- */

export interface CheckoutInput {
  priceId: string;
  /**
   * The account this subscription belongs to, carried through Stripe and back.
   *
   * Written to three places, which is not redundancy — the three are read by
   * three different things and no one of them covers the others.
   * `client_reference_id` is what the return-from-Checkout page reads;
   * `metadata[account]` on the session is what `checkout.session.*` webhooks
   * carry; and `subscription_data[metadata][account]` is what lands on the
   * subscription itself, which is the only one of the three that survives onto
   * the `customer.subscription.updated` and `.deleted` events that arrive
   * months later, when a card expires or somebody cancels. Those events carry
   * no session and no `client_reference_id` at all, so without the third one a
   * cancellation arrives identifying a subscription this deployment has no way
   * to match to an account.
   */
  accountEmail: string;
  /** Absolute. `{CHECKOUT_SESSION_ID}` in it is substituted by Stripe. */
  successUrl: string;
  cancelUrl: string;
  /**
   * An existing `cus_…`, when this account has bought something before.
   *
   * Worth passing whenever it is known. Without it Stripe creates a fresh
   * customer for every checkout, so one person upgrading twice becomes two
   * customers with one subscription each — and the billing portal, which takes
   * exactly one customer, can then only ever show them half their own history.
   */
  customerId?: string;
  /**
   * Whether Stripe is the merchant of record for this sale.
   *
   * Left unset by default, which means the account's own setting decides.
   * That is deliberate: Managed Payments determines who owes the sales tax on
   * this transaction, and a REST client does not get to answer that on
   * somebody's behalf by picking a convenient default.
   *
   * It exists as an escape hatch because of a real and non-obvious wall.
   * Managed Payments is on by default on new accounts, and it requires every
   * product in a line item to carry a `tax_code`; without one the create fails
   * with the `needs-tax-code` message. Setting a tax code on the product is
   * the better fix and takes five seconds. Passing `false` here is the other
   * one, and it is a different decision, not a workaround.
   */
  managedPayments?: boolean;
  /**
   * Supply one to make repeated submissions collapse into a single session.
   *
   * Defaulted to a random key, which protects against a retried HTTP request
   * but not against a person clicking twice. See `idempotencyKey` for why the
   * derived-key version is worse than it sounds.
   */
  idempotencyKey?: string;
}

export type CheckoutResult = { ok: true; url: string; id: string } | StripeFailed;

/**
 * Opens a hosted Checkout for the Team plan and hands back the URL to send
 * somebody to.
 *
 * `mode: "subscription"` because this is a recurring plan; the same endpoint
 * in `payment` mode takes money once and creates nothing to cancel later.
 *
 * `customer_email` is set only when there is no `customerId`. Sending both is
 * an error to Stripe rather than a preference — the existing customer already
 * has an address, and passing a second one asks Checkout to reconcile two
 * facts it has no rule for. Passing neither means the customer types their
 * address on Stripe's page, which works and loses the link to the account.
 *
 * `allow_promotion_codes` puts a discount-code box on the page. Note it is
 * incompatible with passing `discounts`, so a future coupon feature replaces
 * this rather than joining it.
 *
 * Never throws.
 */
export async function createCheckoutSession(
  input: CheckoutInput,
): Promise<CheckoutResult> {
  const priceId = input.priceId.trim();
  const accountEmail = input.accountEmail.trim().toLowerCase();
  const successUrl = input.successUrl.trim();
  const cancelUrl = input.cancelUrl.trim();

  /* Checked here rather than left to Stripe. A `400` for an empty
     `success_url` is indistinguishable from a `400` for six other things, and
     this can name the field before spending a round trip. */
  if (!priceId || !accountEmail || !successUrl || !cancelUrl) {
    return fail(
      "invalid-request",
      "A checkout needs a price, an account email, a success URL and a cancel URL. One of the four is missing, so nothing was sent.",
    );
  }

  /* Absolute, because Stripe redirects a browser to these from its own domain
     and a relative path there resolves against checkout.stripe.com. Stripe
     does reject them, but only after the session is created — so the failure
     arrives with a session id attached and reads like a bug in the URL rather
     than in the string that built it. */
  if (!/^https?:\/\//.test(successUrl) || !/^https?:\/\//.test(cancelUrl)) {
    return fail(
      "invalid-request",
      "The success and cancel URLs have to be absolute (https://…). Stripe sends the browser to them from its own domain, where a relative path resolves against checkout.stripe.com.",
    );
  }

  const form: Record<string, FormValue> = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    /* Read by the return-from-Checkout page. */
    client_reference_id: accountEmail,
    /* Read by `checkout.session.completed`. */
    metadata: { account: accountEmail },
    /* Read by every `customer.subscription.*` event from here on. */
    subscription_data: { metadata: { account: accountEmail } },
    allow_promotion_codes: true,
    /* Dropped by the encoder when undefined, which is the common case. */
    customer: input.customerId,
    customer_email: input.customerId ? undefined : accountEmail,
    managed_payments:
      input.managedPayments === undefined
        ? undefined
        : { enabled: input.managedPayments },
  };

  const result = await stripeRequest<{ id?: unknown; url?: unknown }>(
    "/checkout/sessions",
    {
      method: "POST",
      form,
      /* Always present, which is what makes this call retryable. Without it
         `stripeRequest` sends it once and gives up, precisely so that a
         network blip cannot turn one click into two subscriptions. */
      idempotencyKey: input.idempotencyKey ?? idempotencyKey(),
    },
  );

  if (!result.ok) return result;

  const id = asString(result.data.id);
  const url = asString(result.data.url);

  if (!id || !url) {
    /* A 200 with no URL means the contract changed under us. Reporting success
       would hand a caller `undefined` to redirect a browser to. */
    console.error("[lib/stripe] checkout session created without a url");
    return fail(
      "rejected",
      "Stripe created the checkout session but didn't return a URL to send anybody to. Nothing was charged. This usually means the pinned API version needs revisiting.",
    );
  }

  return { ok: true, url, id };
}

export type CheckoutSessionResult =
  | {
      ok: true;
      /** From `client_reference_id`. Null if the session was made elsewhere. */
      accountEmail: string | null;
      /**
       * Null is a legitimate success, not a failure.
       *
       * A session can be `complete` with no subscription attached yet, because
       * some payment methods settle asynchronously — the customer has finished
       * and the money has not arrived. The honest answer then is "paid, no
       * entitlement yet", which a caller can turn into a pending state. Making
       * it a failure would mean showing somebody who has just paid an error.
       */
      subscription: Subscription | null;
    }
  | StripeFailed;

/**
 * Reads a Checkout Session back, with the subscription already expanded.
 *
 * For the page Stripe redirects to. That page has a session id in its query
 * string and has to decide, before it renders, whether the account is now
 * entitled — so this expands the subscription and its price rather than
 * returning an id the caller would have to fetch separately, which would be a
 * second round trip inside a page load somebody is watching.
 *
 * The session id in that URL is not a credential and this call does not treat
 * it as one. Anybody can put a `cs_test_…` in a query string; what makes the
 * result trustworthy is that Stripe is asked, and that the account email comes
 * back from Stripe's copy of the session rather than from the URL. The caller
 * still has to check that the returned `accountEmail` is the signed-in account
 * before granting anything — this returns a fact about a session, not a
 * decision about a person.
 *
 * Never throws.
 */
export async function retrieveCheckoutSession(
  id: string,
): Promise<CheckoutSessionResult> {
  const sessionId = id.trim();
  if (!sessionId) {
    return fail(
      "invalid-request",
      "No checkout session id to look up, so nothing was sent.",
    );
  }

  const result = await stripeRequest<{
    client_reference_id?: unknown;
    metadata?: Record<string, unknown>;
    subscription?: unknown;
  }>(`/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    method: "GET",
    /* Four levels is the cap, and `subscription.items.data.price` is exactly
       four. The product would be a fifth — see `resolveSeats`. */
    expand: ["subscription", "subscription.items.data.price"],
    notFound: "no-such-session",
  });

  if (!result.ok) return result;

  const accountEmail =
    asString(result.data.client_reference_id) ??
    asString(result.data.metadata?.account);

  const raw = result.data.subscription;
  const subscription =
    raw && typeof raw === "object"
      ? await toSubscription(raw as RawSubscription)
      : null;

  return { ok: true, accountEmail, subscription };
}

export type SubscriptionResult =
  | { ok: true; subscription: Subscription }
  | StripeFailed;

/**
 * Reads one subscription, which is the authoritative answer to "what is this
 * account entitled to right now".
 *
 * The path a webhook takes: an event says something changed, and rather than
 * trusting the object on the event this refetches it. Events can arrive out of
 * order and can be replayed, so the object attached to one is a snapshot of a
 * moment that may no longer be true; the subscription as it stands now is
 * never stale in that way.
 *
 * Never throws.
 */
export async function retrieveSubscription(
  id: string,
): Promise<SubscriptionResult> {
  const subscriptionId = id.trim();
  if (!subscriptionId) {
    return fail(
      "invalid-request",
      "No subscription id to look up, so nothing was sent.",
    );
  }

  const result = await stripeRequest<RawSubscription>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "GET",
      expand: SUBSCRIPTION_EXPAND,
      /* Stripe answers a missing subscription with `resource_missing` and
         `param: "id"`, which says nothing. This is how `classify` knows. */
      notFound: "no-such-subscription",
    },
  );

  if (!result.ok) return result;

  const subscription = await toSubscription(result.data);

  if (!subscription) {
    /* Reached when Stripe returns a subscription this build can't describe —
       most likely a status added since `SUBSCRIPTION_STATUSES` was written, or
       a shape change under a bumped API version. Reporting it is the point: a
       silent partial mapping would hand a paywall a subscription with a
       plausible-looking `NaN` in it. */
    console.error(
      `[lib/stripe] subscription ${subscriptionId} didn't map to a known shape`,
    );
    return fail(
      "rejected",
      "Stripe returned a subscription in a shape this build doesn't recognise — most likely a status it has never seen, or a change that came with the pinned API version. Nothing was assumed about the entitlement.",
    );
  }

  return { ok: true, subscription };
}

/* --- The billing portal ----------------------------------------------------- */

export type PortalResult = { ok: true; url: string } | StripeFailed;

/**
 * Opens Stripe's own billing portal for a customer.
 *
 * This is why there is no "update card", "cancel plan", "download invoice" or
 * "change plan" anywhere in this repo. All four are a login, a form, an email
 * and an edge case each; the portal is one URL, hosted by Stripe, already
 * localised, already compliant, and already correct about proration. Building
 * any of them here would be re-implementing something a redirect gets for free
 * and getting the tax wrong.
 *
 * `returnUrl` is where the "back" link on the portal goes. It is not a
 * callback and nothing is appended to it: anything that changes in the portal
 * arrives here as a webhook, not as a query parameter, so a page that reads
 * entitlement from this URL would be reading a customer's own address bar.
 *
 * Fails with `no-such-customer` when the stored id has gone stale, which is
 * the failure this path actually has — see that reason in `result.ts` for
 * what to do about it.
 *
 * Never throws.
 */
export async function createPortalSession(input: {
  customerId: string;
  returnUrl: string;
}): Promise<PortalResult> {
  const customerId = input.customerId.trim();
  const returnUrl = input.returnUrl.trim();

  if (!customerId || !returnUrl) {
    return fail(
      "invalid-request",
      "A billing portal session needs a customer id and a return URL. One of the two is missing, so nothing was sent.",
    );
  }

  if (!/^https?:\/\//.test(returnUrl)) {
    return fail(
      "invalid-request",
      "The return URL has to be absolute (https://…). Stripe sends the browser to it from billing.stripe.com, where a relative path resolves against their domain.",
    );
  }

  const result = await stripeRequest<{ url?: unknown }>(
    "/billing_portal/sessions",
    {
      method: "POST",
      form: { customer: customerId, return_url: returnUrl },
      /* A portal session is a create, so it carries a key — a double-submitted
         "manage billing" click should hand back the same portal URL rather
         than mint a second one. */
      idempotencyKey: idempotencyKey(),
      notFound: "no-such-customer",
    },
  );

  if (!result.ok) return result;

  const url = asString(result.data.url);
  if (!url) {
    console.error("[lib/stripe] portal session created without a url");
    return fail(
      "rejected",
      "Stripe created the billing portal session but didn't return a URL. This usually means the pinned API version needs revisiting.",
    );
  }

  return { ok: true, url };
}

/**
 * What is deliberately not here.
 *
 * No customer create, update or delete. Checkout creates the customer, and the
 * portal edits it; a second path that writes to the same object is how the
 * name on an invoice ends up disagreeing with the name in the portal.
 *
 * No cancel, no plan change, no card update, no invoice list. All four are the
 * billing portal's, above.
 *
 * No `prices.list` and no lookup-key resolution, though
 * `STRIPE_PRICE_TEAM_LOOKUP_KEY` is read and carried in `config.ts` against
 * the day somebody wants it. Resolving a lookup key means a second round trip
 * before every checkout, to answer a question whose answer is already sitting
 * in the environment. It becomes worth it the day prices change often enough
 * that updating a variable is a real chore, and not before.
 *
 * No refunds. That is a decision a person makes in the Dashboard, with the
 * charge in front of them, and it is not one an automation should be able to
 * make at three in the morning.
 */
