import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/craig/session";
import { sweepNudges } from "@/lib/craig/nudge-sweep";

/**
 * The daily sweep that chases people, and stops chasing people.
 *
 * Until this route existed, Craig asked once and never again. The `nudge`
 * template had been written from the beginning with nothing that sent it, so a
 * new starter who put their invitation aside on the Friday was simply never
 * heard from again — and an onboarding nobody finishes is the product failing
 * in the quietest way available to it.
 *
 * `GET`, which is the wrong verb for something that sends mail to real people,
 * and is the verb every scheduler sends. Vercel Cron issues a `GET` with
 * `Authorization: Bearer $CRON_SECRET` and offers no way to say otherwise, so
 * the choice is this or a job that cannot be scheduled. The bearer check is
 * what stops it being a public button that emails a stranger's new hires.
 *
 * **Scheduled `0 20 * * *`** in `vercel.json` — 20:00 UTC, which is 6 or 7 in
 * the morning in Sydney depending on daylight saving. Deliberately *not* the
 * same hour as the Google watch renewal at 15:00: two jobs on one small plan
 * that both wake at once is a self-inflicted thundering herd, and this one
 * wants to land in somebody's morning rather than at 1am.
 *
 * Once a day, because Hobby allows no more than that. Note that Vercel refuses
 * the *deployment* if a schedule exceeds the plan, so a finer cadence chosen on
 * the assumption of a paid plan takes the whole site down at the next push
 * rather than merely running too often. The cadence that matters lives in
 * `nudges.ts` anyway — this job asks "is anybody due" daily, and the answer is
 * usually no.
 *
 * Reuses `CRON_SECRET` rather than adding a second secret. It is already set,
 * already unreadable, and already understood to mean "the scheduler"; a second
 * one would be a second thing to lose.
 */

const noStore = { "Cache-Control": "no-store" };

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const offered = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!offered) return false;

  /* Constant-time for the same reason the watch renewal's is: this endpoint is
     public, it can be called as often as anybody likes, and `===` returns as
     soon as it finds a differing byte. */
  return constantTimeEqual(secret, offered);
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    /* Logged, because the innocent cause and the hostile one look identical
       and only one is a five-second fix: a scheduler configured before
       `CRON_SECRET` was set fails exactly like somebody probing the endpoint. */
    console.error("[nudge] sweep refused: bad or missing secret");
    return NextResponse.json(
      { ok: false, error: "Not authorised." },
      { status: 401, headers: noStore },
    );
  }

  /* The origin the links in these emails point at, taken from the request
     rather than from configuration. Vercel Cron calls the deployment's own
     URL, so this is right by construction — and a hardcoded one is the trap
     `GOOGLE_OAUTH_REDIRECT_URI` already fell into, where a per-build hostname
     was pinned in config and re-broke on every deploy. */
  const origin = new URL(request.url).origin;

  const report = await sweepNudges(origin);

  /* `quiet` is the number that should dominate on a healthy deployment: it
     means somebody was considered and deliberately left alone. A sweep where
     `chased` is large every day is a sweep whose cadence is wrong. */
  console.log(
    `[nudge] sweep: ${report.seen} seen, ${report.chased} chased, ${report.handedOver} handed over, ${report.quiet} quiet, ${report.failed} failed`,
  );

  return NextResponse.json({ ok: true, ...report }, { headers: noStore });
}
