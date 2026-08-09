import { NextResponse } from "next/server";
import { currentUser } from "@/lib/showcase/current-user";
import { reconcileRun, runClaimedStep } from "@/lib/showcase/automation";
import {
  claimAutomatedStep,
  getJoiner,
  runStateOf,
} from "@/lib/showcase/joiners";
import { rateLimit } from "@/lib/showcase/rate-limit";

/**
 * Where an automated step actually stands, asked of Google rather than assumed.
 *
 * The polling half of the Workspace step. Creating somebody's account is a
 * thing that happens once and finishes; them *accepting* it is a thing that
 * happens at some point over the following fortnight, when they get round to
 * signing in, and nothing tells us when. So somebody has to ask.
 *
 * A poll rather than a push, and the reasoning belongs on the route that does
 * the asking. Google can send directory changes to a webhook, but a webhook
 * needs a public HTTPS receiver, a notification channel registered per tenant,
 * and that channel renewed before it lapses — three pieces of standing
 * infrastructure, one of which fails silently, for an event that happens once
 * per new starter. A read is one request against a quota measured in thousands,
 * and it needs nothing kept alive. There is no cron either, for the same
 * reason: the honest first version of "check periodically" is checking when
 * somebody is looking, because that is when the answer is worth anything.
 *
 * Two callers, and the difference between them is one flag:
 *
 * **The person's page, on open.** `manual: false`. It reconciles and nothing
 * more — a read, throttled inside `reconcileRun`, so twenty refreshes are one
 * question. It deliberately cannot create anything: an account appearing in
 * somebody's company because a colleague opened a tab is a surprise nobody
 * should get, however correct the timing.
 *
 * **The button.** `manual: true`. It forces the check past the throttle, and it
 * will run a step that is genuinely waiting — which is the one path out of the
 * state this feature spends most of its life in, where the step was reached
 * before anybody had connected Google Workspace. Somebody connects it, presses
 * this, and the workflow carries on from where it stopped.
 *
 * The whole security of the route is the ownership check below, and it is the
 * same one the tick route makes for the same reason: the joiner store is a
 * single file shared by every account on the deployment, and an id is a UUID
 * somebody can post at will. Without it, any signed-in account could make this
 * deployment create a Google account inside a stranger's company — which is a
 * long way past reading somebody else's checklist.
 */

/**
 * Spends nothing from OpenAI's budget and mustn't pretend otherwise. It does
 * spend a customer's Directory quota, which is what `reconcileRun`'s own
 * throttle is for — the two limits protect different things and neither
 * substitutes for the other.
 */
const LIMIT_OPTIONS = { spend: false } as const;

/** Ours, never read by anyone. Long enough not to truncate a real id. */
const MAX_ID = 64;

const noStore = { "Cache-Control": "no-store" };

const refuse = (error: string, status: number) =>
  NextResponse.json({ ok: false, error }, { status, headers: noStore });

/** Control characters first, whitespace second — the order every route here
    uses, because a newline is caught by either but NUL is only caught by the
    first. */
function oneLine(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ID);
}

/** Folded, because `listJoiners` folds and the two must agree — a person who
    appears on the list and then can't be checked on is a broken button. */
const sameAccount = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

export async function POST(request: Request) {
  const session = await currentUser();
  if (!session) return refuse("Not signed in.", 401);

  const limit = rateLimit(`showcase-seat:${session.email}`, LIMIT_OPTIONS);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: limit.message },
      {
        status: 429,
        headers: limit.retryAfter
          ? { ...noStore, "Retry-After": String(limit.retryAfter) }
          : noStore,
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse("Expected JSON.", 400);
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const joinerId = oneLine(input.joinerId);
  const stepId = oneLine(input.stepId);

  /* A boolean, not a truthy value, and defaulting to the harmless half. A
     malformed body must not be readable as "yes, go and create a Google
     account" — the request that can make something in somebody else's company
     is the one request here that has to be asked for in so many words. */
  const manual = input.manual === true;

  const joiner = joinerId ? await getJoiner(joinerId) : null;
  /* Missing and not-yours get the same refusal. Both are true of an id that
     isn't on this account, and wording that told them apart would make this an
     oracle for which ids exist. */
  if (!joiner || !sameAccount(joiner.accountEmail, session.email)) {
    return refuse("That person isn't on this account.", 404);
  }

  const step = joiner.steps.find((s) => s.id === stepId);
  if (!step || step.actor !== "craig") {
    return refuse("That isn't a step Craig runs.", 400);
  }

  /* Reconciling first, always, and that order is doing real work rather than
     being tidy. An interrupted run resolves to `waiting` only once something
     has asked Google whether it got through — so a single press unsticks the
     step and then runs it, rather than needing two. Doing it the other way
     round would find the step still locked and refuse a press that was
     perfectly reasonable. */
  await reconcileRun(joiner.id, stepId, { force: manual });

  if (manual) {
    /* The claim is what makes the button safe to lean on. Two tabs, a
       double-click, a retry after a lost response: the first press claims the
       step and every other one is refused here, before anything reaches Google.
       A refusal is not an error — it means somebody else already started it,
       which is exactly what was wanted. */
    const claim = await claimAutomatedStep(joiner.id, stepId);
    if (claim.ok) {
      /* Awaited, unlike the automatic path. Somebody is watching a spinner they
         started, and the honest thing is to show them the outcome rather than
         finish quietly a moment after the page has already redrawn. With
         nothing connected — the normal case today — this returns without a
         single network call. */
      await runClaimedStep(joiner.id, stepId);
    }
  }

  /* The state, so a caller can say what happened without re-deriving it. The
     page still re-renders from the server, which is what makes the button and
     the screen incapable of disagreeing; this is for the sentence next to the
     button, not a second source of truth to draw from. */
  const settled = (await getJoiner(joiner.id))?.steps.find(
    (s) => s.id === stepId,
  );

  return NextResponse.json(
    { ok: true, state: settled ? runStateOf(settled) : "waiting" },
    { headers: noStore },
  );
}
