import "server-only";

import { fail, type StripeFailed } from "./result";

/**
 * Proving that a webhook came from Stripe.
 *
 * The webhook endpoint is the only route in this application that grants
 * entitlements to somebody who is not signed in. It is a public URL, its
 * address is discoverable, and the request body claims things like "this
 * account paid". The signature is the entire difference between Stripe saying
 * that and a stranger with `curl` saying it — so this file is a security
 * boundary, not a parsing convenience, and it is written to be read that way.
 *
 * Done with `crypto.subtle` rather than the `stripe` package's
 * `constructEvent`, for the reason the rest of this directory gives for using
 * `fetch`: the library would be a dependency purchased for one HMAC. Web Crypto
 * is in the Node runtime, in the edge runtime, and in the standard.
 *
 * The scheme, from Stripe's own documentation and confirmed against a real
 * `whsec_` secret:
 *
 *   Stripe-Signature: t=1786214546,v1=5257a8…,v1=e3f0c1…
 *
 * The signed payload is `${t}.${rawBody}`, HMAC-SHA256 with the endpoint
 * secret, hex. Compare constant-time against every `v1` present, accept if any
 * matches, and reject anything older than the replay window.
 */

/**
 * Five minutes, which is Stripe's own default.
 *
 * The window is what stops a replay. A signature does not expire on its own —
 * a valid `checkout.session.completed` captured off the wire stays valid
 * forever — so without a timestamp check, anybody who ever obtains one copy of
 * a paid event can re-grant that entitlement whenever they like. With it, a
 * captured event is worth five minutes.
 *
 * The cost is that a server whose clock has drifted more than five minutes
 * rejects everything Stripe sends, which is a genuinely confusing outage and
 * the reason `bad-signature`'s message mentions the clock at all.
 */
const TOLERANCE_SECONDS = 300;

/**
 * The parts of an event this repo reads.
 *
 * The `data.object` is deliberately `unknown`. It is a different shape for
 * every one of Stripe's several hundred event types, and typing it as anything
 * else here would be a promise this file cannot keep — the caller switches on
 * `type` and narrows it, which is the only place the shape is actually known.
 */
export interface StripeEvent {
  id: string;
  type: string;
  data?: { object?: unknown };
  /** Stripe's own timestamp, Unix seconds. */
  created?: number;
  /** Whether this came from the live account. Worth checking. */
  livemode?: boolean;
}

export type VerifyResult = { ok: true; event: StripeEvent } | StripeFailed;

/** `t=…,v1=…,v1=…`, split into the timestamp and every v1 offered. */
function parseSignatureHeader(header: string): {
  timestamp: number | null;
  signatures: string[];
} {
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of header.split(",")) {
    const at = part.indexOf("=");
    if (at === -1) continue;

    const key = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();

    if (key === "t") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) timestamp = parsed;
      continue;
    }

    /* `v1` only. Stripe's `v0` scheme exists and covers a different payload,
       and accepting a scheme this code does not implement correctly would be
       worse than not accepting it. Anything else is a version invented after
       this was written, and silently ignoring it is right — an unknown scheme
       simply fails to match, which is the safe direction. */
    if (key === "v1" && value) signatures.push(value);
  }

  return { timestamp, signatures };
}

/** Hex to bytes, or null. Returns null rather than a partial buffer so a
    malformed signature can't be compared against half of itself. */
function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0) return null;
  if (!/^[0-9a-f]+$/i.test(hex)) return null;

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Compares two byte strings without letting the time taken say how much of
 * them matched.
 *
 * The obvious `a === b` on hex strings returns as soon as it finds a differing
 * character, so the time it takes leaks the length of the matching prefix. An
 * attacker who can send unlimited webhooks and measure the response can then
 * recover a valid signature one byte at a time — a few thousand requests
 * instead of 2^256 guesses. That attack is real against a network service and
 * it is why this loop has no early return: every byte is compared, the
 * differences are accumulated, and the answer is only read at the end.
 *
 * Lengths are checked first, which does leak whether the lengths matched. That
 * is not sensitive: an HMAC-SHA256 digest is always 32 bytes, so the length is
 * public knowledge and a wrong one carries no information about the secret.
 *
 * Honest caveat: JavaScript offers no guarantee that this compiles to constant
 * time — the engine may optimise it. It is the best available primitive short
 * of `crypto.timingSafeEqual`, which is Node-only and would tie this file to
 * one runtime.
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

const encoder = new TextEncoder();

/**
 * Verifies a webhook and hands back the event.
 *
 * The first argument is the **raw request body, as a string**, and everything
 * about this depends on it. The signature covers the exact bytes Stripe sent,
 * so a body that has been through `await request.json()` and back out through
 * `JSON.stringify` will not verify — not because the content changed, but
 * because the spelling did: key order, whitespace, unicode escaping and number
 * formatting are all things a round trip is free to alter and a signature is
 * not free to ignore. In a Next.js route handler that means `await
 * request.text()` and nothing else before this, and it is why the parsed event
 * is returned from *here*. A caller that never has to parse the body is a
 * caller that cannot parse it too early.
 *
 * The order of the checks below is the security-relevant part, and it is:
 * secret, header, timestamp, signature. The timestamp is checked *before* the
 * HMAC deliberately — an expired signature is rejected without spending a
 * hash, which keeps the cheap rejection cheap for anything replaying volume at
 * this endpoint.
 *
 * Returns `not-configured` when there is no secret, which is calm and ordinary:
 * `STRIPE_WEBHOOK_SECRET` does not exist until somebody runs `stripe listen`
 * or creates an endpoint, so a fresh clone cannot have one. The route should
 * answer 503 and log, not 400 — Stripe retries a 503 and gives up on a 400,
 * and the events sent while somebody was mid-setup are worth keeping.
 *
 * Never throws.
 */
export async function verifyEvent(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): Promise<VerifyResult> {
  if (!secret) {
    return fail(
      "not-configured",
      "No STRIPE_WEBHOOK_SECRET on this deployment, so the webhook wasn't verified and nothing was acted on. Run `stripe listen --forward-to localhost:3000/api/stripe/webhook`, copy the whsec_… it prints, and restart the server.",
    );
  }

  /* Rejected rather than treated as absent. A request with no signature at all
     is not a misconfiguration on our side — it is somebody posting to the
     endpoint, which is exactly what this file exists to refuse. */
  if (!signatureHeader) {
    return fail(
      "bad-signature",
      "That webhook arrived with no Stripe-Signature header, so it did not come from Stripe. Nothing was acted on.",
    );
  }

  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);

  if (timestamp === null || signatures.length === 0) {
    return fail(
      "bad-signature",
      "The Stripe-Signature header didn't contain a timestamp and a v1 signature. Nothing was acted on.",
    );
  }

  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > TOLERANCE_SECONDS) {
    return fail(
      "bad-signature",
      `That webhook's timestamp is ${age}s away from now, outside the ${TOLERANCE_SECONDS}s replay window, so it was rejected. Either it is a replay of a captured event, or this server's clock is wrong — check the clock first, because a drifting clock rejects every webhook Stripe sends and looks exactly like this.`,
    );
  }

  let expected: ArrayBuffer;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    /* The signed payload. The timestamp is joined to the body with a literal
       dot, and it is the header's `t` rather than the current time — binding
       the two means the timestamp cannot be edited without invalidating the
       signature, which is what makes the replay window above worth anything. */
    expected = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${timestamp}.${rawBody}`),
    );
  } catch (cause) {
    /* Web Crypto missing or refusing the key. Not a signature failure and not
       reported as one: saying "bad signature" here would send somebody looking
       for an attacker instead of at their runtime. */
    console.error("[lib/stripe] webhook HMAC failed:", cause);
    return fail(
      "rejected",
      "Couldn't compute the webhook signature on this runtime, so the event was not verified and nothing was acted on.",
    );
  }

  const digest = new Uint8Array(expected);

  /* Every `v1` offered, not just the first. Stripe sends more than one during
     a secret rotation — the same event signed with the old secret and the new
     one — so accepting any match is what lets a secret be rolled without
     dropping the events in flight. Checking only the first would make every
     rotation a small outage. */
  const matched = signatures.some((candidate) => {
    const bytes = hexToBytes(candidate);
    return bytes !== null && constantTimeEqual(digest, bytes);
  });

  if (!matched) {
    /* Logged without the body and without either signature. The body of a
       `checkout.session.completed` carries a customer's email and address. */
    console.error(
      "[lib/stripe] webhook signature did not match; event ignored",
    );
    return fail(
      "bad-signature",
      "That webhook's signature didn't match, so nothing was acted on. In development the usual cause is innocent and always the same mistake: the request body was parsed and re-serialised before it got here, which changes the bytes and therefore the signature. Pass the raw string from `await request.text()`. Otherwise the endpoint secret belongs to a different endpoint — each one has its own.",
    );
  }

  /* Parsed only now. Everything above this line treated the body as opaque
     bytes, which is the correct order: parsing before verifying means running
     a parser over input from anybody who found the URL. */
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    /* A correctly signed body that isn't JSON means something between Stripe
       and here mangled it — a proxy re-encoding the request, most likely. Not
       `bad-signature`: the signature was fine. */
    console.error("[lib/stripe] webhook verified but the body isn't JSON");
    return fail(
      "rejected",
      "That webhook's signature was valid but its body isn't JSON, which means something between Stripe and this server altered it. Nothing was acted on.",
    );
  }

  const event = (payload ?? {}) as Record<string, unknown>;
  const id = typeof event.id === "string" ? event.id : "";
  const type = typeof event.type === "string" ? event.type : "";

  if (!id || !type) {
    return fail(
      "rejected",
      "That webhook was signed correctly but has no event id or type, so there was nothing to act on.",
    );
  }

  return {
    ok: true,
    event: {
      id,
      type,
      data: (event.data ?? undefined) as { object?: unknown } | undefined,
      created: typeof event.created === "number" ? event.created : undefined,
      livemode: event.livemode === true,
    },
  };
}
