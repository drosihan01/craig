import type { Joiner, JoinerStep } from "./contract";
import { dueDateFrom } from "@/lib/workflow/library";

/**
 * When Craig chases somebody, and when he stops.
 *
 * An onboarding nobody finishes is the product failing quietly, and until this
 * existed nothing in Craig ever asked a second time. The `nudge` template has
 * been sitting in `templates.ts` since the beginning with nothing that sends
 * it: the copy was written, the bell was built, and a new starter who put
 * their invitation aside on the Friday was never heard from again.
 *
 * ## The policy, and why it is this one
 *
 * Common practice across onboarding tooling is consistent on three points, and
 * this follows all three rather than inventing a cadence:
 *
 * 1. **Every two to three days while they are actively starting.** Daily reads
 *    as broken software; weekly is slower than the thing being onboarded.
 * 2. **Triggered by what somebody has or hasn't done, not by a fixed drip.**
 *    A chase that arrives after the work is done is worse than no chase — it
 *    says nobody is reading.
 * 3. **A ceiling, then escalation to a human.** This is the part that matters
 *    and the part most likely to be dropped. Escalation is what makes an
 *    automation trustworthy: a reminder that has failed three times will not
 *    succeed on the ninth, and what is actually needed is a person who can
 *    walk over and ask. Craig chasing forever is not persistence, it is Craig
 *    being unable to tell that he isn't working.
 *
 * So: chase, chase, chase, then say plainly that it isn't landing and hand the
 * problem to whoever hired them. **Craig giving up loudly is the feature.**
 *
 * ## What it will not do
 *
 * - **Never more than one email a day**, however many steps are outstanding.
 *   Per-step reminders would send four emails on one morning to the person
 *   least likely to want them.
 * - **Never about somebody else's work.** Only steps whose actor is the joiner
 *   count. A new starter cannot make the admin countersign a contract, and
 *   being chased for it teaches them to ignore the next one.
 * - **Never about a step that isn't theirs yet.** The workflow's order is
 *   deliberate, so a step sitting behind an incomplete one is not late.
 * - **Never anyone who has finished**, and never anyone already handed over.
 */

/** Days after a step falls due before the first chase. */
export const FIRST_CHASE_AFTER_DAYS = 2;

/** Days between chases after the first. */
export const CHASE_EVERY_DAYS = 3;

/**
 * How many chases before Craig stops and tells the admin.
 *
 * Three, which is the point at which the evidence says the channel is not
 * working rather than that the timing was unlucky.
 */
export const NUDGE_CEILING = 3;

/**
 * Days after the invitation before a step with *no* deadline counts as late.
 *
 * Most steps carry no `due` — it is optional on a block and usually unset — so
 * without this the majority of onboardings would be un-chaseable, which is the
 * bug rather than the safe default. A week is long enough that nobody is
 * hurried for a task nobody put a date on.
 */
export const UNDATED_GRACE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between two instants, floored. Negative when `then` is later. */
function daysBetween(then: Date, now: Date): number {
  return Math.floor((now.getTime() - then.getTime()) / DAY_MS);
}

/**
 * The steps this person is actually late on.
 *
 * "Theirs, unblocked, unfinished, and past whichever clock applies" — the four
 * conditions in one place so that nothing downstream has to remember three of
 * them.
 */
export function lateSteps(joiner: Joiner, now: Date): JoinerStep[] {
  const late: JoinerStep[] = [];

  for (const [index, step] of joiner.steps.entries()) {
    if (step.actor !== "joiner") continue;
    if (step.completedAt) continue;

    /* The same ordering rule the joiner's own screen uses: a step behind an
       unfinished one has not been asked for yet, so it cannot be late. Written
       out rather than calling `isStepDue`, which takes a step id and would
       re-scan the list once per step. */
    const blocked = joiner.steps
      .slice(0, index)
      .some((s) => s.actor && !s.completedAt);
    if (blocked) continue;

    const due = dueDateFrom(joiner.startDate, step.due);
    if (due) {
      if (daysBetween(due, now) >= 0) late.push(step);
      continue;
    }

    /* No deadline on the block. Fall back to how long they have held the
       invitation, which is the only other clock there is. */
    const invited = new Date(joiner.invitedAt);
    if (!Number.isNaN(invited.getTime()) && daysBetween(invited, now) >= UNDATED_GRACE_DAYS) {
      late.push(step);
    }
  }

  return late;
}

export type NudgeDecision =
  | { action: "chase"; steps: JoinerStep[]; attempt: number }
  | { action: "hand-over"; steps: JoinerStep[] }
  | { action: "nothing"; because: string };

/**
 * What, if anything, to do about this person today.
 *
 * Pure: takes the record and the clock, returns a decision, sends nothing and
 * writes nothing. That is what makes the cadence something you can reason
 * about and check at a glance, rather than a behaviour you can only observe by
 * waiting a week and reading somebody's inbox.
 */
export function decideNudge(joiner: Joiner, now: Date): NudgeDecision {
  if (joiner.handedOverAt) {
    return { action: "nothing", because: "already handed over to the admin" };
  }

  const late = lateSteps(joiner, now);
  if (late.length === 0) {
    return { action: "nothing", because: "nothing of theirs is late" };
  }

  /* The ceiling is checked before the interval, so somebody who has had their
     three chases hands over on the next sweep rather than waiting out another
     three days first. */
  if (joiner.nudgeCount >= NUDGE_CEILING) {
    return { action: "hand-over", steps: late };
  }

  const last = joiner.nudgedAt ? new Date(joiner.nudgedAt) : null;

  if (!last || Number.isNaN(last.getTime())) {
    /* Never chased. The first one waits `FIRST_CHASE_AFTER_DAYS` past the
       oldest thing they are late on, so that a deadline missed by an afternoon
       does not produce an email that evening. */
    const overdueBy = Math.max(
      ...late.map((step) => {
        const due = dueDateFrom(joiner.startDate, step.due);
        const from = due ?? new Date(joiner.invitedAt);
        return daysBetween(from, now);
      }),
    );
    if (overdueBy < FIRST_CHASE_AFTER_DAYS) {
      return { action: "nothing", because: "late, but not yet late enough" };
    }
    return { action: "chase", steps: late, attempt: 1 };
  }

  if (daysBetween(last, now) < CHASE_EVERY_DAYS) {
    return { action: "nothing", because: "chased too recently" };
  }

  return { action: "chase", steps: late, attempt: joiner.nudgeCount + 1 };
}
