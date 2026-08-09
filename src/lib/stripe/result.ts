import "server-only";

/**
 * The vocabulary every call into Stripe shares.
 *
 * Nothing in `src/lib/stripe` throws, for the same reason nothing in
 * `src/lib/google` does: a caller that has to remember a try/catch around a
 * network call is a caller that will one day forget, and the thing it forgets
 * around is the block that takes somebody's money. So every operation returns
 * one of these and the type system makes the failure branch impossible to skip.
 *
 * The reasons are named for the fix, not for the status code. Stripe makes
 * that argument better than any provider we talk to, because Stripe's own
 * error codes are deliberately coarse: `resource_missing` is what comes back
 * for a price that doesn't exist, a customer that doesn't exist, a
 * subscription that doesn't exist and a Checkout Session that doesn't exist —
 * verified, all four, against the sandbox. Those are four different
 * conversations. One is "the environment points at a price from another
 * account", one is "we stored a customer id that has since been deleted", one
 * is "this account's subscription was cancelled", and one is "somebody
 * bookmarked a return URL". Passing `resource_missing` up would be accurate
 * and would tell nobody anything.
 *
 * Two of these are not faults at all, and the product has to render them
 * without going red.
 */

export type StripeFailure =
  /**
   * This deployment has no Stripe secret key. Nothing was attempted, and
   * nothing is wrong.
   *
   * A first-class state, not an error — the same call this repo's Google lib
   * makes, and for the same reason. The showcase runs without Stripe most of
   * the time, so a screen that reaches "upgrade to Team" on a machine with no
   * key has to be able to say "billing isn't connected on this deployment"
   * and carry on looking calm. Anything that renders this as red is
   * misrepresenting the product.
   *
   * Also what a webhook route gets when `STRIPE_WEBHOOK_SECRET` is unset,
   * which is its normal state: that value does not exist until somebody runs
   * `stripe listen` or creates an endpoint in the Dashboard, so a repo without
   * it is a repo nobody has got to yet, not a repo that is broken.
   */
  | "not-configured"
  /**
   * The key exists and Stripe won't take it. Revoked, rolled, copied a
   * character short, or belonging to an account that has been closed.
   *
   * Distinct from `not-configured` because a missing key is a to-do and a
   * rejected key is a live outage: every payment on this deployment is failing
   * right now. Stripe returns this as a bare `401` with no error code at all —
   * only the status says so — so it is mapped from the status and not from
   * anything in the body.
   */
  | "unauthorized"
  /**
   * The price id we asked to sell doesn't exist on this account.
   *
   * In practice this is almost never a typo and almost always the wrong
   * account: `STRIPE_PRICE_TEAM` was copied from the Dashboard while it was in
   * live mode and the key is a test key, or the other way round. Prices are
   * per-account and per-mode, and the two modes' ids are indistinguishable by
   * eye. Worth its own reason because the fix is one line in the environment
   * and nobody would ever guess it from "no such price".
   */
  | "no-such-price"
  /**
   * We hold a customer id Stripe doesn't recognise.
   *
   * The one on this list that means our stored state has drifted from
   * Stripe's. Somebody deleted the customer in the Dashboard, or the account
   * record was copied between deployments and carries a test-mode customer id
   * into live mode. The fix is to stop trusting the stored id and start a
   * fresh Checkout rather than a Portal session — which is a decision the
   * caller can only make if it can tell this apart from every other 400.
   */
  | "no-such-customer"
  /**
   * No such subscription. For a lookup this is frequently an answer rather
   * than a fault — it is what you get for a subscription that was cancelled
   * and swept, or for an id belonging to the other mode.
   */
  | "no-such-subscription"
  /**
   * No such Checkout Session.
   *
   * The only one on this list that is usually nobody's fault at all. The
   * session id lives in the return URL's query string, so this is what a
   * bookmarked "thanks for subscribing" page produces when somebody opens it a
   * fortnight later, and what a hand-edited query parameter produces
   * immediately. Neither is a bug and neither is an attack; the answer to both
   * is "we can't find that checkout — start again", which is a different
   * sentence from anything the other reasons would produce.
   *
   * Split out from `no-such-subscription` because those two arrive at the same
   * screen by different roads and would otherwise be indistinguishable there:
   * Stripe answers a missing session with `resource_missing` and no `param` at
   * all, so without this the return page would have to tell somebody their
   * *subscription* was missing when what was missing was the link they clicked.
   */
  | "no-such-session"
  /**
   * The product behind the price has no tax code, and this account sells
   * through Managed Payments, which requires one.
   *
   * This is the failure that actually stops a fresh integration, and it is the
   * reason this list has a twelfth entry the brief didn't ask for. Stripe
   * reports it as a plain `invalid_request_error` with no code, and lumping it
   * into `invalid-request` would hand somebody "Stripe refused the request as
   * invalid" for a condition with a specific, one-time, five-second fix.
   *
   * It is also not a fault in anything this code does. Managed Payments makes
   * Stripe the merchant of record, and a merchant of record has to know what
   * it is selling in order to charge the right tax on it — so every product in
   * a line item needs a `tax_code`. There are exactly two fixes and they are
   * not equivalent: set a tax code on the product, or turn Managed Payments
   * off for the session and be your own merchant of record. The second changes
   * who owes the tax, which is not a decision a REST client gets to make on
   * somebody's behalf — see `createCheckoutSession`.
   */
  | "needs-tax-code"
  /**
   * A card was refused. Type `card_error`, status `402`.
   *
   * Rare on the Checkout path, because the card is entered on Stripe's own
   * page and a decline there is Stripe's to display and retry — the customer
   * never leaves. It shows up on the paths that charge directly, and it is on
   * this list so that the one failure on it that is nobody's bug is impossible
   * to confuse with the ones that are. A declined card is not an integration
   * problem, and telling somebody to check their configuration because their
   * bank said no would be a small cruelty.
   */
  | "card-declined"
  /** Stripe understood the request and says it is malformed. Ours to fix. */
  | "invalid-request"
  /** Too fast. Stripe's limits are generous and per-account, so this is
      usually a loop somebody didn't mean to write. */
  | "rate-limited"
  /** Stripe refused for a reason we don't have a name for, or fell over. */
  | "rejected"
  /** The request never got an answer: no network, or the timeout. */
  | "unreachable"
  /**
   * A webhook arrived and did not come from Stripe — or did, and something
   * between Stripe and us altered it.
   *
   * The only reason on this list that describes a request coming *in*, and the
   * only one where the correct response is to do nothing and say nothing. A
   * webhook endpoint is a public URL that grants entitlements; the signature is
   * the entire difference between "Stripe says this account paid" and "a
   * stranger says this account paid". So this is never retried, never
   * explained to the sender, and never partially trusted.
   *
   * In development it is much more often innocent than hostile, and the
   * innocent causes are all the same mistake: the body was parsed and
   * re-serialised before it got here. See `webhook.ts`.
   */
  | "bad-signature";

export interface StripeFailed {
  ok: false;
  reason: StripeFailure;
  /**
   * Safe to show, and specific enough to act on. Stripe's own words never
   * appear here — they go to the server log, where the person who can act on
   * them is already looking, and where they can carry the request id.
   */
  message: string;
  /** Seconds, when Stripe says how long to wait. */
  retryAfter?: number;
  /**
   * Stripe's `req_…`, when there was a response.
   *
   * Safe to show, and the only thing on this object that is worth anything to
   * Stripe support. It identifies one request in the Dashboard's log — where
   * the full error, the exact parameters and the response are already
   * waiting — and it contains nothing about the account, the card or the
   * customer. Surfacing it turns "billing failed" into a line somebody can
   * paste into a ticket.
   */
  requestId?: string;
}

export const fail = (
  reason: StripeFailure,
  message: string,
  extra?: { retryAfter?: number; requestId?: string },
): StripeFailed => ({
  ok: false,
  reason,
  message,
  ...(extra?.retryAfter !== undefined ? { retryAfter: extra.retryAfter } : {}),
  ...(extra?.requestId ? { requestId: extra.requestId } : {}),
});

type Outcome = { ok: boolean; reason?: StripeFailure };

/**
 * Whether nobody can pay right now and it is ours to fix.
 *
 * Groups the three failures that are properties of the deployment rather than
 * of the request: no key, a key Stripe rejects, and a product that isn't
 * sellable yet. They have different fixes and the `reason` still tells them
 * apart — but they share the only thing a caller usually needs to decide,
 * which is whether to show a customer a payment form at all. Showing one when
 * this is true produces a button that cannot work, and the person who clicks
 * it learns that after typing their card number.
 *
 * Deliberately excludes `unreachable` and `rate-limited`, which look similar
 * and are the opposite situation: those pass on their own, and hiding the
 * payment path because of a blip would be an outage this code invented.
 */
export function isBillingUnavailable(result: Outcome): boolean {
  return (
    result.ok === false &&
    (result.reason === "not-configured" ||
      result.reason === "unauthorized" ||
      result.reason === "needs-tax-code")
  );
}

/**
 * Whether trying the identical request again could plausibly work.
 *
 * `client.ts` already retries these a few times before returning, so a `true`
 * here means the transport has given up rather than that it hasn't tried. It
 * exists for the layer above — a job runner deciding whether to reschedule,
 * or a screen deciding between "try again" and "here's what to fix" — because
 * that is the one question every failure has an answer to and every call site
 * would otherwise spell out as its own list.
 */
export function isTransient(result: Outcome): boolean {
  return (
    result.ok === false &&
    (result.reason === "unreachable" ||
      result.reason === "rate-limited" ||
      result.reason === "rejected")
  );
}
