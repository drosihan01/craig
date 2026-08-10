import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Limits on the routes that spend something, because an agent loop can run away
 * three different ways and only one of them is a person clicking too fast.
 *
 * 1. **A stuck client.** A retry loop in the browser, or a page left open that
 *    resends on focus. Cheap to cause, expensive to leave running overnight.
 * 2. **A stuck agent.** The Agents SDK will keep calling tools and re-planning
 *    until it decides it's finished. A prompt that makes "finished" unreachable
 *    turns one message into an unbounded spend. `MAX_TURNS` is the fix, and the
 *    SDK throws `MaxTurnsExceededError` when it bites.
 * 3. **A stuck stream.** A connection that never closes holds a request open
 *    and keeps the model generating into nothing. `REQUEST_TIMEOUT_MS` aborts.
 *
 * The daily cap is the backstop for all three: whatever else goes wrong, the
 * key cannot be drained past a known number in a day.
 *
 * ## It counts in Postgres, and it used to count in memory
 *
 * The original was a `Map` in this module, and the comment here said that was
 * fine for one machine and would become a Redis call later. Later arrived: on
 * serverless there is no "one machine". Each warm instance kept its own
 * bucket, so scaling to four gave every caller four times the allowance, and a
 * cold start handed out a fresh one. What it exists to protect is the OpenAI
 * key — and "roughly four times whatever you configured, resetting whenever
 * the platform feels like it" is not a guard, it is a decoration.
 *
 * So the counting moved into `rate_limit_check`, a Postgres function, and the
 * one thing the old comment promised would not change did: this is **async**
 * now. There is no way around that and pretending otherwise — a fire-and-
 * forget write, an optimistic local check — would reintroduce exactly the
 * per-instance drift that made the old one meaningless.
 *
 * **Check and record happen in one statement**, which is the other reason it
 * is a function rather than three queries from here. One process with one Map
 * could read-then-write safely; across instances two requests can both read
 * "eleven hits, allowed" and both write, and the twelfth and thirteenth calls
 * are through. Counting and inserting under one snapshot closes that.
 *
 * ## What happens when the database is unreachable
 *
 * It allows the call, and that is deliberate. This limiter guards a spend
 * ceiling, not a security boundary — nothing here decides who somebody is, and
 * every route that calls it has already checked that separately. Failing
 * closed would mean a blip in Postgres logs every new starter out of their own
 * onboarding, which is a worse day than an unmetered hour on a key that also
 * has `MAX_TURNS` and a request timeout in front of it. The failure is logged
 * so it cannot be silent.
 */

/** Per session, per minute. Generous for a person, obvious for a loop. */
const PER_MINUTE = 12;

/** Per session, per hour. Catches a slow loop that stays under the minute. */
const PER_HOUR = 120;

/**
 * Every session, every day. The backstop.
 *
 * Deliberately a global rather than a per-session number: the showcase has one
 * account, so per-session and global are the same thing today, and if that
 * ever stops being true the global cap is the one that still protects the key.
 */
const PER_DAY_GLOBAL = 400;

/** How many times the agent may plan-and-call-tools for one message. */
export const MAX_TURNS = 8;

/** A single request may not hold the connection longer than this. */
export const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Allowed, or refused with something a person can be shown.
 *
 * A union rather than one shape with optional fields, so a refusal always has
 * its sentence and its `Retry-After` and no caller has to invent a fallback for
 * a case that cannot happen. Every hand-written fallback is a second wording of
 * the same refusal, and the second wording is the one nobody rereads.
 */
export type RateLimitResult =
  | { ok: true }
  | {
      ok: false;
      /**
       * Safe to show a user, and specific enough to act on.
       *
       * Written to fit every caller rather than the one it was born on. These
       * messages started on the chat and said "messages", which is the wrong
       * noun in front of a new starter answering their own onboarding or an
       * admin working down a checklist — and the routes that noticed dealt with
       * it by throwing the message away and writing their own, which is how
       * three routes end up saying three different things about one limit.
       *
       * There is deliberately no option to pass a noun in. A noun with a
       * default is a default that is wrong somewhere, and the caller that gets
       * it wrong is always the newest one — so the sentences avoid naming what
       * was being done at all. Only the daily cap is specific, and it can
       * afford to be: it is about the model budget, which is the same fact
       * whoever ran into it.
       */
      message: string;
      /** Seconds until it's worth trying again. */
      retryAfter: number;
    };

export interface RateLimitOptions {
  /**
   * Whether this call counts against the daily global cap. Defaults to true.
   *
   * Pass `false` for anything that doesn't spend money. The daily cap protects
   * the OpenAI key, and auth attempts don't touch it — letting failed sign-ins
   * drain that budget would mean a script guessing passwords could switch the
   * chat off for everyone for twenty-four hours, which is a denial of service
   * built out of a safety feature.
   */
  spend?: boolean;
}

/**
 * Check and record in one call.
 *
 * Deliberately not split into `check` then `record`: every caller would have
 * to remember to do both, and the one that forgets is the one that leaks.
 */
export async function rateLimit(
  key: string,
  { spend = true }: RateLimitOptions = {},
): Promise<RateLimitResult> {
  let decision: { allowed: boolean; retry_after: number; scope: string } | null =
    null;

  try {
    const { data, error } = await supabaseAdmin().rpc("rate_limit_check", {
      p_key: key,
      p_spend: spend,
      p_per_minute: PER_MINUTE,
      p_per_hour: PER_HOUR,
      p_per_day_global: PER_DAY_GLOBAL,
    });
    if (error) throw error;
    decision = Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
  } catch (cause) {
    /* Allowed, loudly. See the header: this guards a budget, not a door, and
       a database blip that locked every new starter out of their onboarding
       would be the worse failure. The log line is what stops it being
       silent — an outage here is invisible from the outside, because the only
       symptom is a limit that briefly stopped limiting. */
    console.error("[rate-limit] couldn't reach the counter, allowing:", cause);
    return { ok: true };
  }

  if (!decision || decision.allowed) return { ok: true };

  /* The sentence is written here rather than in SQL. The function decides
     *whether*; what a person is told is a product decision, and it is one that
     changes far more often than the arithmetic does. */
  if (decision.scope === "day") {
    return {
      ok: false,
      message:
        "The showcase has hit its daily limit. It resets on a rolling 24 hours — this is a spend guard, not a fault.",
      retryAfter: decision.retry_after,
    };
  }

  if (decision.scope === "hour") {
    return {
      ok: false,
      message: "You've hit the hourly limit for the showcase. Try again later.",
      retryAfter: decision.retry_after,
    };
  }

  return {
    ok: false,
    message: "That was a lot at once. Give it a minute.",
    retryAfter: decision.retry_after,
  };
}

/**
 * Who a limit is counted against, when there's no session to count against.
 *
 * The first hop of `x-forwarded-for` is the client as far as the nearest proxy
 * is concerned, and it is trivially spoofable when there's no proxy in front —
 * which on localhost there isn't. So this is a speed bump: enough to stop a
 * script hammering sign-in, not enough to be the only thing between a stored
 * credential and someone determined.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}
