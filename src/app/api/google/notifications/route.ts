import { NextResponse } from "next/server";
import { reconcileRun } from "@/lib/craig/automation";
import {
  recordDelivery,
  tenantByConnection,
  tenantOfChannel,
  verifyChannelToken,
} from "@/lib/craig/google-watch";
import { listJoiners, runStateOf } from "@/lib/craig/joiners";

/**
 * What Google tells us when somebody finally signs in.
 *
 * The step this closes is the one that used to sit there. Craig creates a
 * Workspace account on somebody's first morning and then nothing happens —
 * Google does not tell the account it was made for, and it did not, until now,
 * tell us when they took it. The step was only ever settled by somebody opening
 * the person's page and the poll in `reconcileRun` firing, which is a fine
 * safety net and a poor mechanism: it means an onboarding completes when an
 * anxious hiring manager happens to refresh, rather than when the event happens.
 *
 * `automation.ts` argues the other way, and that argument was right at the time
 * rather than wrong: a push receiver needs a public HTTPS endpoint, a channel
 * per tenant, and that channel renewed before it expires. That is three pieces
 * of standing infrastructure, and this feature is those three pieces. The poll
 * stays exactly where it is — see the last section below.
 *
 * Unauthenticated by design, like the Stripe webhook, and for the same reason:
 * Google is a stranger POSTing to a public URL with no session to offer.
 * `proxy.ts` already excludes `/api` from the session fence, which is what makes
 * that possible and is also why it is this file's job to say no. The order of
 * refusals below is the design:
 *
 * 1. **A channel id**, or this is not a delivery at all.
 * 2. **The channel token**, before anything touches the database. This is the
 *    authentication step and the whole security of the endpoint: the token is an
 *    HMAC over the channel id under a key that never leaves this server, so a
 *    request that carries a matching one is a request on a channel this
 *    deployment minted. Nothing else about this request is trustworthy.
 * 3. **`sync`**, Google's handshake, acknowledged and dropped.
 * 4. **Dedupe**, because Google redelivers.
 * 5. **Whose tenant**, from the channel id.
 * 6. **Ask Google**, per outstanding seat.
 *
 * The body is never read, and that is deliberate rather than an oversight.
 * A notification carries no user state, so a lookup would be needed regardless —
 * but even if it carried the whole resource, this route would still not read
 * it. Anybody who finds this URL can POST any body they like; the token proves
 * the *channel* is ours and proves nothing whatsoever about the bytes. Using a
 * field out of the body to decide which seat to check would let a replayed
 * delivery with an edited body steer this handler away from the seat that
 * actually changed. So a notification means exactly one thing here — *something*
 * changed in this tenant's directory — and every outstanding seat for that
 * tenant is re-read from Google over an authenticated connection. Same
 * re-read-don't-trust argument the Stripe webhook makes, with one more reason:
 * Stripe at least signs its bodies.
 *
 * **The poll is not removed, and must not be.** Push is best-effort at both
 * ends: a channel can lapse, a delivery can be dropped, a sweep can be late, and
 * this deployment may have no public address at all. `reconcileRun` on a page
 * view still answers the same question, and after this route it nearly always
 * finds the work already done. Two mechanisms writing the same answer through
 * the same idempotent function is the cheapest correctness this feature has.
 *
 * **Unverified.** No channel has ever been created from this repo and no
 * notification has ever arrived. The headers below are from Google's push
 * notifications reference; what has been exercised is every branch that does
 * not need Google — a request with no channel id, a request with a token that
 * does not verify, and a `sync`.
 */

const noStore = { "Cache-Control": "no-store" };

/**
 * How many seats one notification will ask Google about.
 *
 * A notification says a directory changed, not which user, so the work is
 * proportional to how many people that tenant currently has mid-onboarding —
 * and each one costs a Directory call against their daily quota. Twenty is far
 * above any real cohort and low enough that a tenant reorganising their whole
 * directory cannot turn one afternoon of `update` events into a quota outage.
 * Anything past the cap is picked up by the poll, which is what it is for.
 */
const MAX_SEATS_PER_NOTIFICATION = 20;

/** Google stops retrying on a 2xx. Everything this route understood — including
    everything it deliberately did nothing about — says 200, because a 4xx or a
    5xx buys the same delivery again on a backoff for no benefit. */
const ok = (handled: string) =>
  NextResponse.json({ received: true, handled }, { headers: noStore });

export async function POST(request: Request) {
  const headers = request.headers;

  const channelId = headers.get("x-goog-channel-id") ?? "";
  if (!channelId) {
    /* Not a Google delivery. No log line: this URL is public, and a line per
       probe is a log nobody reads. */
    return NextResponse.json(
      { error: "Not a notification." },
      { status: 400, headers: noStore },
    );
  }

  /* The security boundary, and it is checked before a single database read.
     Everything below this line is running on a channel id this deployment
     provably minted; everything above it is running on a stranger's headers. */
  const authentic = await verifyChannelToken(
    channelId,
    headers.get("x-goog-channel-token"),
  );

  if (!authentic) {
    /* Logged loudly, and without the token. This is either somebody posting at
       the endpoint, or `SESSION_SECRET` having been rotated out from under a
       live channel — the second is innocent and self-healing on the next
       renewal sweep, and the two must never be quietly indistinguishable.
       403 rather than 200: whatever this is, it is not Google, and there is
       nothing here for it to retry. */
    console.error(
      `[google/notifications] channel token did not verify for ${channelId}`,
    );
    return NextResponse.json(
      { error: "Not a notification." },
      { status: 403, headers: noStore },
    );
  }

  /* Google's handshake. Every new channel opens with one, before anything has
     changed, purely to confirm the endpoint answers — so it carries no event
     and there is nothing to reconcile. Acknowledged rather than ignored: Google
     treats a non-2xx here as the endpoint being unusable. */
  const state = headers.get("x-goog-resource-state") ?? "";
  if (state === "sync") return ok("sync");

  /* Google redelivers, and the message number is how a redelivery says it is
     one — it is repeated verbatim, and it counts within a channel rather than
     globally, which is why the dedupe key is the pair. `unrecorded` is acted
     on anyway; `recordDelivery` defends that at length. */
  const messageNumber = Number(headers.get("x-goog-message-number"));
  const seen = await recordDelivery(channelId, messageNumber);
  if (seen === "duplicate") return ok("duplicate");

  /* Whose directory this was, read out of the channel id rather than looked up
     by it. That is what lets a delivery on a channel created seconds ago — in
     the window a renewal leaves between minting it at Google and writing it
     down — still be attributed instead of dropped. */
  const connectionId = tenantOfChannel(channelId);
  const tenant = connectionId ? await tenantByConnection(connectionId) : null;

  if (!tenant) {
    /* A channel we minted, on a connection that no longer exists: somebody
       disconnected Google Workspace and Google has not caught up, or the stop
       on disconnect did not get through. Nothing to do and nothing to fix from
       here — there is no credential left to stop the channel with, and it
       expires on its own within the week. Acknowledged so Google does not
       retry it for three days first. */
    console.error(
      `[google/notifications] no connection behind ${channelId}; channel is orphaned and will expire`,
    );
    return ok("no-tenant");
  }

  /* Every seat this tenant is currently waiting on. `awaiting` and only
     `awaiting`: that is the state meaning "the account exists and nobody has
     taken it", which is precisely the question a directory change might have
     just answered. `waiting` and `failed` have nothing at Google to ask about,
     `done` is finished, and `running` is an attempt that is either still in
     flight or interrupted — and an interrupted run is resolved by reading a
     record, not by a stranger's POST arriving at the right moment. */
  const joiners = await listJoiners(tenant.accountEmail);

  const outstanding = joiners
    .flatMap((joiner) =>
      joiner.steps
        .filter(
          (step) => step.actor === "craig" && runStateOf(step) === "awaiting",
        )
        .map((step) => ({ joinerId: joiner.id, stepId: step.id })),
    )
    .slice(0, MAX_SEATS_PER_NOTIFICATION);

  if (outstanding.length === 0) return ok("nothing-outstanding");

  /* `reconcileRun` rather than a check written here, and this is the whole
     reason this route is short. It already holds every rule about what
     accepting a seat means: `agreedToTerms` and not `lastLoginTime`, the
     propagation window after a creation, suspension vetoing the answer, and
     leaving a perfectly good seat alone when Google simply would not answer. A
     second implementation of that in a webhook would be a second opinion about
     the most important moment this product has, and it would drift.
     `force` skips the throttle, which exists to stop a refreshing human
     spending a tenant's quota — a push notification is the opposite of that: it
     is the event itself, and it happens once. */
  const settled = await Promise.all(
    outstanding.map(({ joinerId, stepId }) =>
      reconcileRun(joinerId, stepId, { force: true }).catch((cause) => {
        /* `reconcileRun` does not throw, so this is a contract being broken
           rather than a failure being handled — but it is being awaited inside
           a handler that must answer Google, and an unhandled rejection here
           would turn one bad seat into a 500 and a retry storm. */
        console.error(`[google/notifications] ${stepId} threw:`, cause);
        return "skipped" as const;
      }),
    ),
  );

  return ok(`checked:${settled.filter((r) => r === "checked").length}`);
}
