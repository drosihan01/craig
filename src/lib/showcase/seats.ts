import type { Subscription, SubscriptionStatus } from "./contract";

/**
 * How many people an account may put in a seat, and the one place that decides.
 *
 * This used to be a constant sitting next to the paywall dialog, on the honest
 * grounds that the number and the screen explaining the number are the same
 * fact. That argument was right about constants and is wrong about this: the
 * limit is no longer a property of the product, it is a property of *this
 * account's subscription*, and a client component cannot know it. So the fact
 * moved to where the subscription is readable, and the dialog is told what
 * to say rather than deriving it — see `SeatPaywall`, which now takes the
 * numbers as props for exactly this reason.
 *
 * Nothing here reaches Stripe. It is a pure function of a stored subscription
 * and a count, which is what lets the two screens that gate an invitation
 * answer in a millisecond, on the server, without an outage at a payments
 * provider becoming an outage in somebody's onboarding.
 */

/**
 * The floor, and what an account gets before anybody pays for anything.
 *
 * Not counting whoever holds the account: they hold an account rather than a
 * seat, and a free plan that spends its one seat on the person who signed up
 * would be a free plan you cannot use.
 */
export const FREE_SEATS = 1;

/**
 * What the paid plan offers, which is not the same as what a customer has.
 *
 * This number is the pitch — it is what the dialog quotes beside the price
 * and what a new subscription is created with. `Subscription.seats` is what
 * somebody actually bought. They agree today and are allowed to disagree
 * tomorrow, and when they do, the limit follows the subscription rather than
 * this: a customer on last year's plan must not silently be re-sold this
 * year's, in either direction.
 */
export const PAID_SEATS = 5;

/** Said once, beside the seats it buys, so price and promise can't drift. */
export const SEAT_PRICE = "$49";

/**
 * The statuses that entitle somebody to the paid seat count.
 *
 * `active` and `trialing` are uncontroversial. `past_due` is the one worth
 * arguing, and it is deliberate: Stripe does not fail a subscription the moment
 * a card is declined, it moves it to `past_due` and retries for days, and a
 * large share of those retries succeed. Taking somebody's ability to onboard
 * staff the hour their card expired — while Stripe is still trying, and will
 * probably win — punishes a customer for a decision their bank made, at the
 * moment they are least able to do anything about it. The cost of being wrong
 * runs the other way too, and it is not symmetrical: a few days of seats we
 * were not paid for against a new starter with no accounts on their first
 * morning. Stripe's own dunning settings decide when this ends, and when it
 * does the status becomes `unpaid` or `canceled`, both of which are below.
 *
 * `incomplete` is not here: that is a checkout whose first payment never
 * completed, so nobody has paid anything yet. `incomplete_expired`, `unpaid`
 * and `canceled` are over. `paused` is Stripe's word for a subscription
 * deliberately stopped, which is a decision somebody made rather than a payment
 * that failed.
 *
 * A whitelist rather than a blacklist, and that direction is the point: a
 * status Stripe invents next year lands as "not entitled", which costs a
 * customer an upgrade prompt they can argue with, rather than as "entitled",
 * which costs us seats nobody has ever paid for and which nobody would notice.
 */
const ENTITLING = new Set<SubscriptionStatus>([
  "active",
  "trialing",
  "past_due",
]);

/** Whether a subscription in this state grants the seats it names. */
export const entitles = (status: SubscriptionStatus) => ENTITLING.has(status);

/**
 * The seat limit for one account: what it has bought, and who is in a seat.
 *
 * Three things go into it, and the order they are combined in is the rule:
 *
 * 1. A live subscription grants the seats it says it grants.
 * 2. Otherwise the free floor, which is also the floor for a subscription that
 *    somehow claims fewer seats than the free plan gives — nobody should be
 *    worse off for having paid.
 * 3. Never fewer than are already taken.
 *
 * The third is the one that has to be in code rather than in a policy
 * document. If a plan lapses while four people are half-way through
 * onboarding, nobody is thrown out: the limit stops the *next* invitation and
 * never invalidates one that was already made. The paywall already promises
 * exactly this — "their onboarding carries on exactly as it is" — and a limit
 * that dropped below `taken` would make that copy a lie in the one place the
 * product asks for money, which is the worst possible place to be caught in
 * one. It would also be pointless: those seats are held by real people whose
 * accounts already exist, and refusing to count them changes nothing except
 * what the screen says.
 *
 * Returned as a number rather than a boolean because two different questions
 * are asked of it — "may I invite" and "what do I tell them" — and a boolean
 * can only answer the first.
 */
export function seatLimit(
  subscription: Subscription | null,
  taken: number,
): number {
  const granted =
    subscription && entitles(subscription.status)
      ? subscription.seats
      : FREE_SEATS;

  return Math.max(FREE_SEATS, granted, taken);
}

/**
 * What a screen may know about the limit it is enforcing.
 *
 * A view object rather than four props threaded separately, for the reason
 * `GoogleConnectionView` is one: it is the whole of what a page needs and
 * nothing else, so the record behind it — customer ids, a price id, a period
 * end — stays on the server by construction rather than by everyone
 * remembering not to pass it. It is also what makes the boundary cheap: a page
 * hands one prop down, exactly as it already hands down `people`.
 */
export interface SeatEntitlement {
  /** How many people this account may have in a seat, right now. */
  limit: number;
  /**
   * Whether a *live* plan is what `limit` comes from.
   *
   * Not "does a subscription record exist". A cancelled plan is a record and
   * is not a plan, and the difference decides whether the paywall sells a price
   * or says something true about what they already pay for.
   */
  subscribed: boolean;
  /** What the paid plan offers, for the screen that is selling it. */
  paidSeats: number;
  /** The price, written the way it is written on screen. */
  price: string;
}

/**
 * The limit and everything a screen needs to talk about it, in one read.
 *
 * Computed on the server and handed down. The same argument the `taken` count
 * already makes on People: a browser holds a copy of a list it heard about
 * once, and a browser that has not heard about a subscription starting — or
 * lapsing, or a colleague being let go on another device — would go on
 * enforcing a limit that stopped being true. The server is the only place both
 * halves of this sum are known at the same instant.
 */
export function seatEntitlement(
  subscription: Subscription | null,
  taken: number,
): SeatEntitlement {
  return {
    limit: seatLimit(subscription, taken),
    subscribed: Boolean(subscription && entitles(subscription.status)),
    paidSeats: PAID_SEATS,
    price: SEAT_PRICE,
  };
}

/**
 * Whether another person can be given a seat, asked the same way everywhere.
 *
 * Two screens offer an invitation — People, and the editor the moment you
 * publish — and the rule has to be one rule, or publishing becomes a way
 * around a limit that People enforces. So the comparison lives by the numbers
 * rather than being written out at each call site.
 *
 * Both arguments come from the server. `taken` is how many people hold a seat
 * *now*: this used to be checked against whichever list the calling screen
 * happened to have in the browser, and a browser that had not heard about a
 * removal would go on refusing an invitation for a seat that was free. `limit`
 * is now the same kind of fact for the same kind of reason — it depends on a
 * subscription, and the browser is the last place that should be guessing at
 * one.
 */
export const outOfSeats = (taken: number, limit: number) => taken >= limit;
