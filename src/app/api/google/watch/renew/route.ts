import { NextResponse } from "next/server";
import { sweepWatches } from "@/lib/showcase/google-watch";
import { constantTimeEqual } from "@/lib/showcase/session";

/**
 * The thing that has to run on a timer, or the whole feature stops within a
 * week.
 *
 * A Google push channel expires. Gmail documents seven days for its own
 * `users.watch`, the Admin SDK does not commit to a number this repo has
 * verified, and either way the failure mode is identical and silent: the
 * channel lapses, Google stops delivering, nothing errors, and every new
 * starter's Workspace step goes back to being settled only when somebody opens
 * their page. Nothing in a request-driven application notices that, because
 * the symptom is the absence of requests.
 *
 * So renewal is a sweep on a schedule, and it is per tenant because there is
 * nothing else it could be — a channel belongs to one connected Workspace, and
 * `sweepWatches` iterates. What it does *not* do is renew blindly: a channel
 * with plenty of life left costs two indexed reads and no network call, so this
 * is cheap to run far more often than it is needed, which is the correct
 * direction for a job whose failure is invisible.
 *
 * `GET`, which is the wrong verb for something that creates subscriptions at
 * Google, and is the verb every scheduler sends. Vercel Cron issues a `GET`
 * with `Authorization: Bearer $CRON_SECRET` and offers no way to say otherwise,
 * so the choice is this or a job that cannot be scheduled. The bearer check
 * below is what stops it being a public button.
 *
 * **Scheduled daily**, at `0 15 * * *` in `vercel.json` — 15:00 UTC, which is
 * the small hours in Sydney where the functions run.
 *
 * Once a day rather than more often, because this account is on Hobby and that
 * is the only cadence Hobby allows. It is comfortably enough: Google's watch
 * channels last on the order of a week, this renews at a quarter of whatever
 * life it was actually granted, and a sweep that finds nothing near expiry
 * costs two indexed reads and no network call. The margin is days, not hours.
 *
 * A daily expression is also the one that cannot fail a deploy. Vercel rejects
 * a schedule the plan does not allow *at deploy time*, so a more frequent
 * cadence chosen on the assumption of a paid plan would take the whole site
 * down at the next push rather than merely running the sweep too rarely.
 *
 * Still needs `CRON_SECRET` set in the deployment's environment. Without it
 * `authorised` refuses everything, including Vercel, and the sweep never runs —
 * which is the safe failure, but it is a failure and it is silent apart from
 * the log line below.
 */

const noStore = { "Cache-Control": "no-store" };

/**
 * Who may run the sweep.
 *
 * A shared secret rather than a session, because the caller is a scheduler with
 * no account. Compared constant-time for the same reason `google-state.ts`
 * compares its nonce that way — this endpoint is public, an attacker can call
 * it as often as they like and time the answer, and `===` returns as soon as it
 * finds a differing byte.
 *
 * With no `CRON_SECRET` set the sweep is refused outright rather than left
 * open. An unauthenticated version of this route is a public endpoint that
 * makes one Google API call per connected customer on demand, which is a way of
 * exhausting somebody else's quota from the outside.
 */
function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const offered = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!offered) return false;

  return constantTimeEqual(secret, offered);
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    /* Logged, because the innocent cause and the hostile one look identical
       and only one of them is a five-second fix: a scheduler configured before
       `CRON_SECRET` was set fails exactly like somebody probing the endpoint.
       401 rather than 404 — a scheduler that is being refused should be able to
       tell that from a URL that does not exist. */
    console.error("[google/watch] renewal sweep refused: bad or missing secret");
    return NextResponse.json(
      { ok: false, error: "Not authorised." },
      { status: 401, headers: noStore },
    );
  }

  /* Never throws, so there is no try/catch here and no 500 branch. Every way a
     tenant can fail is counted rather than raised — one customer whose
     connection has been revoked must not stop the sweep reaching the next one,
     and a sweep that gave up on the first failure would be a sweep that stops
     working the moment anybody disconnects. */
  const report = await sweepWatches();

  /* The counts go back to whoever ran it and to the platform's log. `current`
     is the number that should dominate on a healthy deployment: it means the
     channel was already live and nothing was sent to Google at all. */
  console.log(
    `[google/watch] sweep: ${report.tenants} tenants, ${report.created} created, ${report.renewed} renewed, ${report.current} current, ${report.skipped} skipped, ${report.failed} failed, ${report.pruned} dedupe rows pruned`,
  );

  return NextResponse.json({ ok: true, ...report }, { headers: noStore });
}
