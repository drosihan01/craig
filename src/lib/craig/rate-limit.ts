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
 * In-memory and single-instance, which is a real limitation and worth stating
 * plainly rather than discovering later. It resets when the server restarts,
 * and two instances would each get their own allowance. That is fine for a
 * showcase running on one machine and is *not* fine for anything with real
 * users — at that point this file becomes a Redis or Upstash call and nothing
 * else about it changes, which is why the interface is deliberately boring.
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

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

interface Window {
  /** Timestamps, newest last. Trimmed on every check. */
  hits: number[];
}

const buckets = new Map<string, Window>();
const globalDay: Window = { hits: [] };

function trim(w: Window, since: number) {
  /* The list is ordered, so the first index inside the window is where the
     live hits start — no need to filter the whole array. */
  let i = 0;
  while (i < w.hits.length && w.hits[i] < since) i += 1;
  if (i > 0) w.hits.splice(0, i);
}

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
export function rateLimit(
  key: string,
  { spend = true }: RateLimitOptions = {},
): RateLimitResult {
  const now = Date.now();

  trim(globalDay, now - DAY);
  if (spend && globalDay.hits.length >= PER_DAY_GLOBAL) {
    return {
      ok: false,
      message:
        "The showcase has hit its daily limit. It resets on a rolling 24 hours — this is a spend guard, not a fault.",
      retryAfter: Math.ceil((globalDay.hits[0] + DAY - now) / 1000),
    };
  }

  const bucket = buckets.get(key) ?? { hits: [] };
  trim(bucket, now - HOUR);

  const lastMinute = bucket.hits.filter((t) => t > now - MINUTE).length;
  if (lastMinute >= PER_MINUTE) {
    return {
      ok: false,
      message: "That was a lot at once. Give it a minute.",
      retryAfter: 60,
    };
  }

  if (bucket.hits.length >= PER_HOUR) {
    return {
      ok: false,
      message: "You've hit the hourly limit for the showcase. Try again later.",
      retryAfter: Math.ceil((bucket.hits[0] + HOUR - now) / 1000),
    };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  if (spend) globalDay.hits.push(now);

  /* Sessions that stopped talking shouldn't sit in the map forever. Swept
     here rather than on an interval so there's no timer to leak. */
  if (buckets.size > 64) {
    for (const [k, w] of buckets) {
      if (w.hits.length === 0 || w.hits[w.hits.length - 1] < now - HOUR) {
        buckets.delete(k);
      }
    }
  }

  return { ok: true };
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

/** What's left, for anything that wants to show it. */
export function remaining(key: string) {
  const now = Date.now();
  const bucket = buckets.get(key);
  trim(globalDay, now - DAY);
  if (bucket) trim(bucket, now - HOUR);

  return {
    minute:
      PER_MINUTE - (bucket?.hits.filter((t) => t > now - MINUTE).length ?? 0),
    hour: PER_HOUR - (bucket?.hits.length ?? 0),
    day: PER_DAY_GLOBAL - globalDay.hits.length,
  };
}
