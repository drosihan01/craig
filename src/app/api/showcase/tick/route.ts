import { after, NextResponse } from "next/server";
import { currentUser } from "@/lib/craig/current-user";
import { fireNextAutomatedStep } from "@/lib/craig/automation";
import { getJoiner, tickStep } from "@/lib/craig/joiners";
import { rateLimit } from "@/lib/craig/rate-limit";

/**
 * The admin saying a step of theirs is done.
 *
 * The other half of the onboarding loop. The new starter answers what was asked
 * of them on their own screen; this is the half nobody can ask anybody for — the
 * name tag exists because somebody made it, and the only evidence that ever
 * reaches a computer is a person here saying so.
 *
 * Which makes this route's whole job the question of *who* is saying it. The
 * joiner store is a single file shared by every account on the deployment, and
 * an id is a UUID in a URL somebody can post at will — so a route that trusted
 * the id it was handed would let any signed-in account tick off steps on a
 * stranger's new starter, and quietly corrupt the one screen the person
 * tracking that hire relies on. The check below is therefore not a formality
 * bolted to the top; it is the reason the route is written by hand rather than
 * being a two-line wrapper around `tickStep`.
 *
 * Missing and not-yours get the same refusal, deliberately. "That person isn't
 * on this account" is true of both, and any wording that distinguished them
 * would turn this endpoint into an oracle for guessing which ids exist.
 *
 * `tickStep` still gets the last word on *what* may be ticked: it refuses any
 * step that isn't `actor: "admin"`, so a caller cannot use this to fabricate an
 * answer the new starter never gave. Two checks, and neither is the other's
 * backup — this one knows whose person it is, that one knows whose step it is.
 */

/**
 * Ticking a box spends nothing from OpenAI's budget, and mustn't pretend
 * otherwise. The daily cap exists to stop the model key being drained; letting
 * a checkbox count against it would mean an admin working through a checklist
 * could switch Craig off for everybody for twenty-four hours, which is a denial
 * of service built out of a safety feature.
 */
const LIMIT_OPTIONS = { spend: false } as const;

/** Ours, never read by anyone: long enough not to truncate a real id, short
    enough not to be a payload. */
const MAX_ID = 64;

const noStore = { "Cache-Control": "no-store" };

const refuse = (error: string, status: number) =>
  NextResponse.json({ ok: false, error }, { status, headers: noStore });

/**
 * A caller-supplied id, as one harmless line.
 *
 * Control characters first, whitespace second — the same order the invite route
 * uses and for the same reason: a newline is caught by either, but NUL and the
 * rest of the C0 range are only caught by the first, and those are the
 * characters that survive a naive trim.
 */
function oneLine(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ID);
}

/**
 * Case-folded, because an address is not case-sensitive in the part that
 * matters and the store's own `listJoiners` folds it too. If this compared
 * exactly and that one folded, a person could appear on somebody's list and
 * then refuse to be ticked off — a disagreement between reading and writing
 * that would look like a broken button rather than like a mismatched string.
 */
const sameAccount = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

export async function POST(request: Request) {
  const session = await currentUser();
  if (!session) return refuse("Not signed in.", 401);

  const limit = rateLimit(`showcase-tick:${session.email}`, LIMIT_OPTIONS);
  if (!limit.ok) {
    /* The limiter's own wording, passed through. It used to be replaced here:
       the message talked about messages, which is the wrong noun in front of
       somebody ticking off a checklist. It no longer names what was being done
       at all, so the sentence that fits the chat fits this too — and the copy
       for one limit now lives in one place instead of being rewritten by each
       route that dislikes it. */
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

  /* A boolean, not a truthy value. `tickStep` takes a direction rather than a
     toggle precisely so that two clicks racing each other can't leave the step
     in the state neither of them asked for — and a body that omitted `done`
     being read as "not done" would turn a malformed request into a silent
     untick of work somebody really did. */
  if (typeof input.done !== "boolean") {
    return refuse("Say whether it's done.", 400);
  }

  const joiner = joinerId ? await getJoiner(joinerId) : null;
  if (!joiner || !sameAccount(joiner.accountEmail, session.email)) {
    return refuse("That person isn't on this account.", 404);
  }

  const updated = await tickStep(joiner.id, stepId, input.done);
  if (!updated) return refuse("That isn't a step you can tick off.", 400);

  /* A tick can move the workflow too, and it has to be able to. An automated
     step sitting behind the admin's own name-tag step would otherwise wait for
     the new starter to answer something — which, if their half is already
     finished, is a wait with nothing on the other end of it.
     `fireNextAutomatedStep` decides whether there is anything to do; unticking
     is silently a no-op here, because taking a tick back doesn't unblock
     anything and the automated step's own `waiting` state is what stops it.

     After the response, not before it, for the same reason as the new starter's
     route: this is a checkbox, and a checkbox that takes as long as somebody
     else's API is a checkbox people press twice. */
  await fireNextAutomatedStep(updated, stepId, after);

  /* The step is echoed rather than the whole person. The screen re-renders from
     the server anyway — that is what makes the tick and the page incapable of
     disagreeing — so this exists to let the caller say what happened without
     guessing, not to be a second source of truth it might render from. */
  const step = updated.steps.find((s) => s.id === stepId);
  return NextResponse.json(
    { ok: true, stepId, done: Boolean(step?.completedAt) },
    { headers: noStore },
  );
}
