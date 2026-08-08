import "server-only";

import { fail, type StripeFailed } from "./result";

/**
 * The one set of Stripe credentials this deployment owns.
 *
 * Unlike the Google integration next door, there is only one party here.
 * Google is multi-tenant — every customer connects their own Workspace and the
 * credentials arrive per account. Stripe is the opposite: this is *our*
 * merchant account, every customer is a row in it, and no customer ever hands
 * us a Stripe credential. That is why nothing in this directory takes a
 * connection object, and why the secret key can be read from the environment
 * at the point of use rather than threaded through every call.
 *
 * `server-only` makes importing this from a client component a build error
 * rather than a secret key in a bundle somebody notices six weeks later. That
 * matters more here than almost anywhere else in the repo: a leaked Stripe
 * secret key is not a data exposure, it is a stranger with the ability to
 * issue refunds out of a real bank account.
 *
 * The environment is:
 *
 *   STRIPE_SECRET_KEY                     sk_test_… in the sandbox, sk_live_…
 *                                         in production. Never NEXT_PUBLIC_.
 *   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY    pk_…, safe in a browser by design
 *   STRIPE_PRICE_TEAM                     price_… for the Team plan
 *   STRIPE_PRICE_TEAM_LOOKUP_KEY          the same price by a name that
 *                                         survives being re-created
 *   STRIPE_WEBHOOK_SECRET                 whsec_…, printed by `stripe listen`
 *                                         or shown once when an endpoint is
 *                                         created
 */

/**
 * The API version every request pins itself to.
 *
 * Verified against this account on 2026-08-09: an unpinned request comes back
 * with `stripe-version: 2026-07-29.dahlia`, so pinning changes nothing today.
 * Today is not the point. Stripe upgrades accounts, and an account upgrade
 * moves every unpinned integration to a new API at a moment nobody chose —
 * fields get renamed, objects get nested, and the first anybody knows is a
 * checkout flow returning a shape the parser doesn't recognise, in production,
 * on somebody else's schedule.
 *
 * That is not hypothetical here. This very version moved `current_period_end`
 * off the subscription and onto the subscription *item*; see `billing.ts`.
 * An integration written against the older shape and left unpinned would have
 * started reporting every subscription as ending at the Unix epoch on the day
 * Stripe flipped the account, with no deploy and no warning.
 *
 * Pinned, the same request returns the same shape forever, and upgrading
 * becomes a one-line diff with a test run behind it. The cost is that this
 * constant has to be moved deliberately; that cost is the feature.
 */
export const STRIPE_API_VERSION = "2026-07-29.dahlia";

/**
 * The configured branch, which is deliberately a superset of what the routes
 * destructure.
 *
 * The four fields the billing routes agreed on — `ok`, `secretKey`, `priceId`,
 * `webhookSecret` — are the contract, and they are spelled exactly as agreed.
 * The rest ride along because they cost one string read each and because
 * `stripeSetupStatus` has to answer for them without a second pass over the
 * environment. A caller that only wants the four ignores the rest.
 */
export interface StripeConfig {
  ok: true;
  /** Never logged, never returned to a browser, never in a URL. */
  secretKey: string;
  /**
   * The Team plan's price, `price_…`.
   *
   * Required, so `stripeConfig()` fails without it. That is the routes'
   * decision rather than this file's, and it has one consequence worth
   * knowing: a deployment that only wants to *verify webhooks* still needs
   * `STRIPE_PRICE_TEAM` set to get a config at all, even though nothing a
   * webhook route does depends on a price. If that ever bites, the fix is for
   * the webhook route to read `webhookSecret` from `stripeSetupStatus`-style
   * plumbing rather than to loosen this type, because every other caller
   * genuinely does need the price and a `string | null` here would push that
   * check out to all of them.
   */
  priceId: string;
  /**
   * `whsec_…`, or null, which is an ordinary state and not a failure.
   *
   * Null does not mean anything is broken. This value does not exist until
   * somebody runs `stripe listen` or creates an endpoint in the Dashboard, so
   * a fresh clone cannot have it, and the checkout and portal paths never
   * touch it. Only the webhook route needs it, and `verifyEvent` refuses
   * calmly when it is absent rather than failing the route.
   */
  webhookSecret: string | null;
  /**
   * Safe in a browser — that is what "publishable" means — and still not
   * reachable from one through this file, because this file is server-only.
   *
   * A client component that needs it must read
   * `process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` as a literal, because
   * that is the form the bundler substitutes at build time; the dynamic lookup
   * below only works because it runs on a server with a real environment. It
   * is read here anyway so the mode mismatch described in `modeOf` can be
   * caught, which is invisible from either side alone.
   */
  publishableKey: string | null;
  /**
   * The price addressed by a name instead of an id.
   *
   * Worth carrying because price ids are immutable and prices are not
   * editable: changing $49 to $59 means creating a *new* price with a new id,
   * which means an environment variable somebody has to remember to update in
   * every deployment on the same day. A lookup key can be moved onto the new
   * price, so the environment keeps working. Nothing here resolves it yet —
   * see the note in `billing.ts`.
   */
  priceLookupKey: string | null;
  /**
   * Whether this deployment is pointed at real money.
   *
   * Derived from the secret key's own prefix rather than from `NODE_ENV`,
   * because those two disagree in exactly the situation that matters: a
   * developer with a live key in `.env.local` is in development and is one
   * click away from charging somebody.
   */
  livemode: boolean;
  /**
   * A sentence about something dangerous but not disqualifying, or null.
   *
   * Only ever set for live mode. Distinct from the failure branch on purpose —
   * a live key is not *broken*, and refusing to start because of one would
   * make production the case that doesn't work.
   */
  warning: string | null;
}

export type ConfigResult = StripeConfig | StripeFailed;

const SECRET_KEY = "STRIPE_SECRET_KEY";
const PUBLISHABLE_KEY = "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY";
const PRICE_TEAM = "STRIPE_PRICE_TEAM";
const PRICE_TEAM_LOOKUP_KEY = "STRIPE_PRICE_TEAM_LOOKUP_KEY";
const WEBHOOK_SECRET = "STRIPE_WEBHOOK_SECRET";

/**
 * Which of Stripe's two universes a key belongs to, from its prefix alone.
 *
 * Stripe's keys are self-describing, which is the one piece of good luck in
 * this file: `sk_test_`, `sk_live_`, `pk_test_`, `pk_live_`, and the
 * restricted forms `rk_test_` and `rk_live_`. Nothing has to be sent anywhere
 * to know which is which.
 *
 * `rk_` is included deliberately rather than tolerated. A restricted key with
 * write access to Checkout Sessions and read access to Subscriptions is
 * strictly the better credential for this integration — it cannot issue a
 * refund and cannot read a charge — and a validator that only accepted `sk_`
 * would quietly push whoever set this up towards the more powerful key.
 */
function modeOf(key: string): "test" | "live" | null {
  if (/^(sk|rk|pk)_test_/.test(key)) return "test";
  if (/^(sk|rk|pk)_live_/.test(key)) return "live";
  return null;
}

/** Announced once per process, not once per request. A warning nobody can
    scroll past is a warning everybody scrolls past. */
let announcedLiveMode = false;

/**
 * The credentials, or a precise account of what is missing.
 *
 * Deliberately not cached: `process.env` is re-read on every call, so adding
 * the variables and restarting is the whole of the setup loop and a test can
 * set them. It is five string reads.
 *
 * Everything it can refuse, it refuses here rather than a round trip later.
 * That is worth the lines because Stripe's own answer to a bad key is a bare
 * `401 Invalid API Key provided` — verified against the sandbox — which is the
 * same answer it gives for a revoked key, a key from a closed account, and a
 * publishable key pasted into the wrong slot. Three different fixes, one
 * sentence, none of it said before the request went out.
 *
 * The messages differ on purpose. *Nothing* set is the normal state of this
 * repo — the showcase runs without Stripe, and saying anything alarming about
 * it would be a lie. A key that is *present and malformed* is a different
 * person having a different day, and they need to be told exactly what is
 * wrong with the string they pasted, because a key is sixty indistinguishable
 * characters and nobody is going to spot it by looking.
 */
export function stripeConfig(): ConfigResult {
  const secretKey = process.env[SECRET_KEY]?.trim() ?? "";
  const publishableKey = process.env[PUBLISHABLE_KEY]?.trim() ?? "";
  const priceId = process.env[PRICE_TEAM]?.trim() ?? "";
  const priceLookupKey = process.env[PRICE_TEAM_LOOKUP_KEY]?.trim() ?? "";
  const webhookSecret = process.env[WEBHOOK_SECRET]?.trim() ?? "";

  if (!secretKey) {
    return fail(
      "not-configured",
      "Stripe isn't set up on this deployment, so nothing was attempted. It needs a secret key — add STRIPE_SECRET_KEY from dashboard.stripe.com/apikeys and restart the server so the value is re-read.",
    );
  }

  /* Checked before the prefix test, because it is the mistake that produces
     the most baffling failure. Both keys sit on the same Dashboard page, one
     above the other, and only one of them is meant to be copied — so `pk_` in
     this slot is common. Left to Stripe it comes back as that bare 401 with
     the middle of the key starred out, which looks exactly like a revoked key
     and sends somebody off to roll a perfectly good one. */
  if (/^pk_/.test(secretKey)) {
    return fail(
      "not-configured",
      `${SECRET_KEY} holds a publishable key (pk_…), not a secret key. Those sit next to each other on dashboard.stripe.com/apikeys and only the second one works from a server — copy the value behind "Reveal test key", which starts sk_test_.`,
    );
  }

  const mode = modeOf(secretKey);
  if (!mode) {
    return fail(
      "not-configured",
      /* No fragment of the value, not even the first few characters. This
         message reaches a diagnostics screen, and a secret key with its head
         cut off is still most of a secret key. */
      `${SECRET_KEY} doesn't look like a Stripe key. It should begin sk_test_, sk_live_, or rk_… for a restricted key. The usual cause is a partial copy, or a stray quote or newline in .env.local.`,
    );
  }

  /* A mode mismatch is worth refusing rather than warning about, because it is
     not survivable and it is silent. The browser would create a PaymentIntent
     in one universe while this server confirms subscriptions in the other, and
     every symptom points at the wrong half: a real card entered against a live
     publishable key produces a real charge, on a real statement, against a
     subscription this server will never see. Neither key is wrong on its own,
     which is precisely why nothing else will ever catch this. */
  const publishableMode = publishableKey ? modeOf(publishableKey) : null;
  if (publishableMode && publishableMode !== mode) {
    return fail(
      "not-configured",
      `${SECRET_KEY} is a ${mode}-mode key and ${PUBLISHABLE_KEY} is a ${publishableMode}-mode key. Stripe's two modes are separate worlds with separate customers, prices and subscriptions, so a browser talking to one while this server talks to the other fails in ways that look like anything but this. Copy both keys from the same Dashboard toggle.`,
    );
  }

  if (!priceId) {
    return fail(
      "not-configured",
      `Stripe has a key but no plan to sell: ${PRICE_TEAM} is missing from the environment. Copy the price id — it starts price_, not prod_ — from the Team product on dashboard.stripe.com/products and restart the server.`,
    );
  }

  /* `prod_` here is the same class of mistake as `pk_` above and just as easy
     to make, because the product page shows both ids and the product's is the
     one in the heading. Stripe's answer would be "No such price: 'prod_…'",
     which reads as "that price was deleted" rather than "that is not a
     price". */
  if (priceId.startsWith("prod_")) {
    return fail(
      "not-configured",
      `${PRICE_TEAM} holds a product id (prod_…), not a price id. A product is the thing; a price is what it costs, and only a price can be sold. Open the product on dashboard.stripe.com/products and copy the id from the pricing row — it starts price_.`,
    );
  }

  const livemode = mode === "live";
  let warning: string | null = null;

  if (livemode) {
    /* Reported rather than refused. Live mode is where this is supposed to end
       up, and a library that would not start in production would be a strange
       kind of safe. But it is not the state this repo is normally in, and the
       gap between "the showcase, which invents accounts freely" and "an
       account that bills a real card" is one environment variable — so the
       fact is put somewhere a person will see it rather than left to be
       inferred from a prefix nobody reads.

       Nothing downstream branches on this. If something ever should — a
       confirmation step before a live charge, say — this is the flag it reads,
       and that is a product decision rather than one for a REST client. */
    warning = `${SECRET_KEY} is a LIVE key. Every checkout this deployment creates will charge a real card and every subscription will bill a real account. If this is a development machine, replace it with the sk_test_ key from the same page — the two differ by four characters.`;

    if (!announcedLiveMode) {
      announcedLiveMode = true;
      console.warn(`[lib/stripe] ${warning}`);
    }
  }

  return {
    ok: true,
    secretKey,
    priceId,
    webhookSecret: webhookSecret || null,
    publishableKey: publishableKey || null,
    priceLookupKey: priceLookupKey || null,
    livemode,
    warning,
  };
}

/**
 * What is wired up, without going anywhere near a secret.
 *
 * For the screen that has to explain why there is no "Upgrade to Team" button,
 * or why a webhook route is answering "not configured". Everything on this
 * object is either a variable *name* — documented in this file's header, not
 * sensitive — or a boolean, so it is safe to hand to a route that renders it.
 *
 * Nothing here makes a network call, so a page can ask as often as it likes.
 * Note what that means it cannot answer: whether the key actually *works*. A
 * revoked key is indistinguishable from a good one until something is sent,
 * and pretending otherwise would put a green tick next to a dead integration.
 * `available: true` means "present and correctly shaped", and the first real
 * call is what turns that into knowledge.
 */
export function stripeSetupStatus(): {
  /** A usable key and a price are present. Not a promise that Stripe agrees. */
  available: boolean;
  /** Names only, never values. */
  missing: string[];
  /** Whether inbound webhooks can be verified. Ordinary to be false. */
  canVerifyWebhooks: boolean;
  livemode: boolean;
  /** The pinned API version, so a diagnostics page can say which API this is. */
  apiVersion: string;
  /** The live-mode warning, or the reason nothing is available. */
  message: string | null;
} {
  const result = stripeConfig();

  if (!result.ok) {
    /* Which variables are missing is recomputed from the environment rather
       than carried on the failure, because `StripeFailed` is the shared
       vocabulary of every call in this directory and hanging a config-shaped
       field off it would put a field on ninety-nine failures that only one
       ever sets. */
    const missing: string[] = [];
    if (!process.env[SECRET_KEY]?.trim()) missing.push(SECRET_KEY);
    if (!process.env[PRICE_TEAM]?.trim()) missing.push(PRICE_TEAM);
    if (!process.env[WEBHOOK_SECRET]?.trim()) missing.push(WEBHOOK_SECRET);

    return {
      available: false,
      missing,
      canVerifyWebhooks: false,
      livemode: false,
      apiVersion: STRIPE_API_VERSION,
      message: result.message,
    };
  }

  /* The webhook secret is reported as missing without making anything
     unavailable, because that is exactly what it is: a deployment with no
     webhook secret can still sell perfectly well. Collapsing the two into one
     red light would misreport both. */
  return {
    available: true,
    missing: result.webhookSecret ? [] : [WEBHOOK_SECRET],
    canVerifyWebhooks: Boolean(result.webhookSecret),
    livemode: result.livemode,
    apiVersion: STRIPE_API_VERSION,
    message: result.warning,
  };
}
