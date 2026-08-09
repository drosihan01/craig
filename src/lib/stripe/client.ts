import "server-only";

import { STRIPE_API_VERSION, stripeConfig } from "./config";
import { fail, type StripeFailed, type StripeFailure } from "./result";

/**
 * The one place this repo talks to Stripe.
 *
 * `fetch`, `URLSearchParams` and nothing else — no `stripe` package. That is
 * the same call `src/lib/email/send.ts` makes about Resend and `directory.ts`
 * makes about `googleapis`, and it is easier to defend here than in either:
 * the official library is a large surface built around a small number of HTTP
 * requests, and this integration makes four of them. What the SDK would
 * actually buy is the retry policy and the form encoder below, which are
 * seventy lines, against a dependency that ships types for several hundred
 * API resources and a Node HTTP agent this codebase has no use for.
 *
 * Everything that can go wrong is turned into something a person can act on
 * before it leaves this file. That is most of the work, because Stripe's
 * errors are accurate and coarse: `resource_missing` is the code for a
 * missing price, a missing customer, a missing subscription and a missing
 * Checkout Session, and those four want four different fixes. See `classify`.
 *
 * The secret key is read here and nowhere else in this directory, and it is
 * never logged, never put in a URL, and never included in an error message.
 */

const API_ROOT = "https://api.stripe.com/v1";

/**
 * Long enough for a slow network, short enough not to pin a request handler
 * open. Stripe's own guidance is that a request that has not answered in this
 * long is not going to.
 */
const TIMEOUT_MS = 15_000;

/**
 * Four attempts, not more.
 *
 * The ceiling is set by what is waiting at the other end of this, which is
 * usually somebody's browser mid-checkout. Four attempts with the backoff
 * below is at most about six seconds of retrying on top of whatever the
 * request itself cost — noticeable, and survivable. Anything more and the
 * request handler is holding a connection open long past the point where the
 * person has decided the button is broken and clicked it again, which
 * manufactures the exact duplicate this file works to avoid.
 */
const MAX_ATTEMPTS = 4;

/** Exponential, and jittered. Without the jitter every client that saw the
    same blip comes back in the same millisecond and reproduces it. */
function backoffMs(attempt: number): number {
  const base = Math.min(500 * 2 ** (attempt - 1), 4_000);
  return base + Math.floor(Math.random() * 250);
}

/* --- Form encoding --------------------------------------------------------- */

/**
 * Stripe's bracket notation, generated rather than typed out.
 *
 * Stripe's API is `application/x-www-form-urlencoded`, and it expresses
 * structure in the key: `line_items[0][price]`, `recurring[interval]`,
 * `subscription_data[metadata][account]`, `expand[0]`. Callers build ordinary
 * nested objects and this flattens them, which is the difference between
 * `{ subscription_data: { metadata: { account: email } } }` and a string
 * literal with the brackets hand-typed. The literal is the version that gets a
 * bracket wrong at 1am and produces a subscription with no metadata on it —
 * silently, because Stripe accepts unknown-looking keys in some positions and
 * simply drops what it does not recognise in others.
 *
 * Arrays are indexed rather than repeated (`expand[0]`, not `expand[]`).
 * Stripe accepts both for most parameters, but indexing is what it documents,
 * and it is the only form that round-trips an array of objects — `line_items[]`
 * with two objects has nowhere to say which field belongs to which item.
 *
 * `undefined` and `null` are dropped entirely rather than sent as empty
 * strings. This is load-bearing: an empty `customer=` is not "no customer" to
 * Stripe, it is a customer id of `""`, which is a `resource_missing`. Dropping
 * lets every optional parameter in `billing.ts` be spelled as a plain
 * `customerId?: string` with no conditional spreading at the call site.
 *
 * Booleans are emitted as `"true"`/`"false"` because that is what the wire
 * format has; `String(false)` is `"false"` and Stripe reads it as false, but
 * only because it is spelled out — an omitted boolean and a false one are not
 * the same thing to `allow_promotion_codes`.
 */
export type FormValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | FormValue[]
  | { [key: string]: FormValue };

export function encodeForm(input: Record<string, FormValue>): URLSearchParams {
  const params = new URLSearchParams();

  const walk = (prefix: string, value: FormValue): void => {
    if (value === undefined || value === null) return;

    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(`${prefix}[${index}]`, item));
      return;
    }

    if (typeof value === "object") {
      for (const [key, nested] of Object.entries(value)) {
        walk(`${prefix}[${key}]`, nested);
      }
      return;
    }

    params.append(prefix, String(value));
  };

  for (const [key, value] of Object.entries(input)) walk(key, value);

  return params;
}

/* --- Reading Stripe's answers ---------------------------------------------- */

/** Stripe's error envelope. Everything optional: a 502 from a proxy in front
    of Stripe has none of it, and a bad key has only `type` and `message`. */
interface StripeErrorBody {
  error?: {
    type?: string;
    code?: string;
    message?: string;
    param?: string;
    decline_code?: string;
  };
}

/**
 * Which failure this is, and what to do about it.
 *
 * The ordering matters and is not the obvious one, because Stripe's most
 * informative field is the one it reuses most. `resource_missing` is the code
 * for every one of these, all verified against the sandbox on 2026-08-09:
 *
 *   400 resource_missing  param=line_items[0][price]  No such price: '…'
 *   400 resource_missing  param=customer              No such customer: '…'
 *   404 resource_missing  param=id                    No such subscription: '…'
 *   404 resource_missing  (no param)                  No such checkout.session: …
 *
 * So the code alone cannot tell them apart, and neither can the status: the
 * same code arrives as a 400 when the missing thing was referenced by a create
 * and as a 404 when it was the thing being fetched. `param` is close to useful
 * and gives up exactly when it matters — `id` says nothing, and the session
 * case has no `param` at all.
 *
 * What is left is the message noun, which is why the branches below read it.
 * Sniffing an English string from a provider is normally the wrong move and it
 * is a deliberate exception here, hedged two ways: `param` is consulted first
 * where it is meaningful, and the caller passes `notFound` — the resource it
 * *asked* for — as the answer when neither signal resolves. A retrieve knows
 * what it retrieved without having to be told by a sentence. The message
 * probes only have to break the tie for creates, which are the one case that
 * genuinely references several resources at once.
 *
 * The tax-code branch is the other message probe, and it earns its place the
 * way the two in `send.ts` do: it splits a plain `invalid_request_error` with
 * no code at all — which would otherwise land in `invalid-request`, "Stripe
 * refused the request as invalid" — off from a condition with a specific
 * five-second fix that stops the integration dead on a fresh account.
 */
function classify(
  status: number,
  body: StripeErrorBody,
  context: { notFound?: StripeFailure; requestId?: string; retryAfter?: number },
): StripeFailed {
  const error = body.error ?? {};
  const code = error.code ?? "";
  const type = error.type ?? "";
  const param = error.param ?? "";
  const text = (error.message ?? "").toLowerCase();
  const extra = { requestId: context.requestId, retryAfter: context.retryAfter };

  /* First, because it is the only status Stripe uses for exactly one thing.
     There is no error code on this response at all — the status is the whole
     signal. */
  if (status === 401) {
    return fail(
      "unauthorized",
      "Stripe rejected the API key. Check STRIPE_SECRET_KEY in .env.local — a rolled key and a key copied a character short look identical from here — then restart the dev server so the value is re-read.",
      extra,
    );
  }

  if (status === 403) {
    return fail(
      "unauthorized",
      "Stripe accepted the key and won't allow this call. That is what a restricted key (rk_…) says when it is missing a permission — the Checkout Sessions and Subscriptions resources both need to be granted on it at dashboard.stripe.com/apikeys.",
      extra,
    );
  }

  if (status === 429 || code === "rate_limit") {
    return fail(
      "rate-limited",
      context.retryAfter
        ? `Stripe is rate limiting this key. Try again in ${context.retryAfter}s.`
        : "Stripe is rate limiting this key. Its limits are generous and per-account, so this is usually a loop calling in a tight cycle rather than genuine traffic.",
      extra,
    );
  }

  if (type === "card_error" || code === "card_declined") {
    /* `decline_code` is deliberately not repeated to the customer. Stripe and
       the issuing bank are explicit that the detailed reason is for the
       merchant, not the cardholder — telling a stranger at a checkout which of
       "insufficient funds", "stolen card" or "fraudulent" the bank said is
       either an embarrassment or a gift to whoever is testing stolen numbers.
       It goes to the log, with the request id, where support can read it. */
    return fail(
      "card-declined",
      "The card was declined. Nothing is wrong with this deployment — the customer's bank refused the payment, and the fix is a different card or a call to their bank.",
      extra,
    );
  }

  if (code === "resource_missing") {
    if (param.includes("price") || text.includes("no such price")) {
      return fail(
        "no-such-price",
        "Stripe has no such price on this account. Almost always this is a mode mismatch rather than a typo: STRIPE_PRICE_TEAM was copied from the Dashboard in live mode while the key is a test key, or the other way round. Prices are per-account and per-mode, and their ids look identical.",
        extra,
      );
    }

    if (param === "customer" || text.includes("no such customer")) {
      return fail(
        "no-such-customer",
        "Stripe has no such customer. The stored customer id has gone stale — deleted in the Dashboard, or carried between test and live mode with the account record. Start a fresh Checkout rather than a billing portal session; that creates a new customer and repairs the link.",
        extra,
      );
    }

    /* Before the subscription branch, because Stripe spells this one
       "No such checkout.session: cs_test_…" — no `param` at all, so the noun
       is the only signal there is. */
    if (text.includes("no such checkout.session")) {
      return fail(
        "no-such-session",
        "Stripe has no such checkout session. The id in the return URL doesn't match a session on this account, which is what a bookmarked return page looks like once the session has aged out. Nothing is wrong — starting checkout again makes a new one.",
        extra,
      );
    }

    if (text.includes("no such subscription")) {
      return fail(
        "no-such-subscription",
        "Stripe has no such subscription. Cancelled subscriptions stay readable for a long time, so this is more likely an id from the other mode than one that has aged out.",
        extra,
      );
    }

    /* Neither param nor noun resolved it, so fall back to what the caller
       asked for. A retrieve knows what it retrieved. */
    if (context.notFound) {
      return fail(
        context.notFound,
        "Stripe has no such object. The id is well formed but belongs to nothing on this account — most often a record from the other mode, or one that was deleted.",
        extra,
      );
    }
  }

  /* No error code on this one either — a bare `invalid_request_error` whose
     entire signal is the prose. Verified against the sandbox: creating a
     Checkout Session against a product with no `tax_code` returns
     "the product tax code is missing … Product tax code is required for
     Managed Payments, which is enabled by default on your account." */
  if (text.includes("tax code") || text.includes("managed payments")) {
    return fail(
      "needs-tax-code",
      'This Stripe account sells through Managed Payments, which makes Stripe the merchant of record — so every product in a checkout needs a tax code to work out what tax to charge. The Team product has none. Fix it once, on the product: set tax_code to txcd_10103001 ("Software as a service (SaaS) — business use") in the Dashboard, or pass managedPayments: false to create the session and be your own merchant of record instead. Those are not equivalent; the second changes who owes the tax.',
      extra,
    );
  }

  if (status === 400 || status === 404 || type === "invalid_request_error") {
    return fail(
      "invalid-request",
      "Stripe refused the request as invalid. The full reason and the request id are in the server log, and the same request is on dashboard.stripe.com under Developers → Logs with every parameter it received.",
      extra,
    );
  }

  if (status >= 500) {
    return fail(
      "rejected",
      "Stripe is having a problem at their end. Nothing to fix here; it was retried already, so try again in a minute rather than immediately.",
      extra,
    );
  }

  return fail(
    "rejected",
    `Stripe refused the request (${status}). The full reason is in the server log.`,
    extra,
  );
}

/* --- The transport --------------------------------------------------------- */

export type StripeCall<T> = { ok: true; data: T } | StripeFailed;

export interface RequestOptions {
  method: "GET" | "POST";
  /** Nested freely; `encodeForm` flattens it into Stripe's brackets. */
  form?: Record<string, FormValue>;
  /** Sent as `expand[0]`, `expand[1]`, …. Stripe allows four levels, no more. */
  expand?: string[];
  /**
   * Set on every POST that creates something. See `stripeRequest` for why the
   * absence of one disables retrying rather than merely losing a safety net.
   */
  idempotencyKey?: string;
  /**
   * The reason to report when Stripe says `resource_missing` and neither
   * `param` nor the message noun says which resource. A retrieve knows.
   */
  notFound?: StripeFailure;
}

/**
 * Whether a failed attempt is worth repeating.
 *
 * `stripe-should-retry` is consulted first and obeyed absolutely, in both
 * directions. Stripe sends it on ordinary responses — verified: a `402` card
 * decline carries `stripe-should-retry: false` — and it is the only party that
 * knows whether the request had a side effect before it failed. A `500` that
 * says `false` created something; retrying it is how one click becomes two
 * subscriptions.
 */
function shouldRetry(status: number, header: string | null): boolean {
  if (header === "false") return false;
  if (header === "true") return true;
  return status === 429 || status >= 500;
}

/**
 * One authenticated request, with every outcome already turned into a result.
 *
 * Retrying and idempotency are one decision here, not two. A retry is only
 * safe when the server can recognise the second attempt as the same request as
 * the first — otherwise "the connection dropped" and "the connection dropped
 * after Stripe created the subscription" are indistinguishable from this side,
 * and retrying the second one bills somebody twice. So: GETs retry because
 * they have no side effect, POSTs retry only when they carry an
 * `Idempotency-Key`, and a POST without one is sent exactly once and its
 * failure returned. `billing.ts` therefore always sends a key on the two calls
 * that create something.
 *
 * The key is generated once, outside the attempt loop, which is the whole
 * point — a key regenerated per attempt is not an idempotency key, it is three
 * distinct requests wearing a hat.
 *
 * Never throws. Never logs the key, the form body, or anything from the
 * customer: the status, Stripe's own message and the request id go to the log,
 * which is everything the branches in `classify` actually need and nothing
 * that would be a problem to have written down.
 */
export async function stripeRequest<T>(
  path: string,
  options: RequestOptions,
): Promise<StripeCall<T>> {
  const config = stripeConfig();
  if (!config.ok) return config;

  const body =
    options.method === "POST"
      ? encodeForm({ ...(options.form ?? {}), expand: options.expand })
      : undefined;

  /* On a GET the same parameters go in the query string. Built through the
     same encoder so `expand` is spelled identically either way. */
  const query =
    options.method === "GET"
      ? encodeForm({ ...(options.form ?? {}), expand: options.expand }).toString()
      : "";

  const url = `${API_ROOT}${path}${query ? `?${query}` : ""}`;

  const retryable =
    options.method === "GET" || Boolean(options.idempotencyKey);

  let lastFailure: StripeFailed | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;

    try {
      response = await fetch(url, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          /* The pin. On every request, including GETs — an account upgrade
             changes the shape of what comes back from a retrieve just as
             surely as from a create. */
          "Stripe-Version": STRIPE_API_VERSION,
          ...(body
            ? { "Content-Type": "application/x-www-form-urlencoded" }
            : {}),
          ...(options.idempotencyKey
            ? { "Idempotency-Key": options.idempotencyKey }
            : {}),
        },
        body: body?.toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        /* Stripe is the record of what somebody paid. A cached answer to
           "is this subscription active" is a paywall opening for an account
           that cancelled, or staying shut for one that just paid. */
        cache: "no-store",
      });
    } catch (cause) {
      /* Logged without the request: the headers carry the secret key. */
      console.error(
        `[lib/stripe] ${options.method} ${path} unreachable (attempt ${attempt}):`,
        cause,
      );

      lastFailure = fail(
        "unreachable",
        "Couldn't reach Stripe — no network, or the request timed out. Whether anything was created is genuinely unknown from here; check dashboard.stripe.com before trying again.",
      );

      /* A request that never got an answer is the case idempotency exists
         for, and the case where retrying without it is worst: the timeout may
         have landed after Stripe committed. */
      if (retryable && attempt < MAX_ATTEMPTS) {
        await new Promise((done) => setTimeout(done, backoffMs(attempt)));
        continue;
      }
      return lastFailure;
    }

    const requestId = response.headers.get("request-id") ?? undefined;

    /* Read as text and parse by hand. An error from a proxy in front of Stripe
       is HTML, and `response.json()` on it throws a parse error that reads
       like a bug in this file. */
    const raw = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = {};
    }

    if (response.ok) return { ok: true, data: payload as T };

    const retryHeader = response.headers.get("retry-after");
    const parsedRetry = Number(retryHeader);
    const retryAfter =
      retryHeader && Number.isFinite(parsedRetry) ? parsedRetry : undefined;

    /* The one place Stripe's own words are kept, and a place no browser can
       read. Without this, "the full reason is in the server log" is a lie.
       The request id is what makes the Dashboard's copy of this findable. */
    const error = (payload ?? {}) as StripeErrorBody;
    console.error(
      `[lib/stripe] ${options.method} ${path} ${response.status} (${requestId ?? "no request id"}):`,
      error.error?.message ?? raw.slice(0, 200),
      error.error?.decline_code ? `decline_code=${error.error.decline_code}` : "",
    );

    lastFailure = classify(response.status, error, {
      notFound: options.notFound,
      requestId,
      retryAfter,
    });

    if (
      retryable &&
      attempt < MAX_ATTEMPTS &&
      shouldRetry(response.status, response.headers.get("stripe-should-retry"))
    ) {
      /* Stripe's own `Retry-After` wins over the backoff curve when it sends
         one — it knows how long the limit has left to run and the curve is
         guessing. Capped so a large value can't hold a request handler open;
         past that the caller is better served by a `rate-limited` it can
         decide about than by a socket nobody is watching. */
      const wait = retryAfter ? Math.min(retryAfter * 1000, 5_000) : backoffMs(attempt);
      await new Promise((done) => setTimeout(done, wait));
      continue;
    }

    return lastFailure;
  }

  /* Unreachable while MAX_ATTEMPTS >= 1 — the loop returns on its last pass —
     but the compiler cannot know that, and inventing a fresh failure here
     would report something that never happened. */
  return (
    lastFailure ??
    fail("rejected", "Stripe didn't answer after several attempts.")
  );
}

/**
 * A fresh idempotency key.
 *
 * Random per call, not derived from the request. A derived key — a hash of the
 * account and the price, say — would also collapse two *deliberate* attempts
 * into one, and Stripe replays a stored response for 24 hours: somebody who
 * abandons a checkout at lunchtime and comes back after dinner would be handed
 * the same expired session URL and no way to get a new one.
 *
 * Random keys protect against the failure that actually happens on this path,
 * which is a retried or double-submitted HTTP request rather than a person
 * changing their mind. Callers that want the stronger guarantee — one session
 * per account per day, say — can pass their own key, which is why the option
 * exists on `RequestOptions` at all.
 */
export function idempotencyKey(): string {
  return crypto.randomUUID();
}
