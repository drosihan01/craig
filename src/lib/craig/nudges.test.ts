import { describe, expect, it } from "vitest";
import type { Joiner, JoinerStep } from "./contract";
import {
  CHASE_EVERY_DAYS,
  FIRST_CHASE_AFTER_DAYS,
  NUDGE_CEILING,
  UNDATED_GRACE_DAYS,
  decideNudge,
  lateSteps,
} from "./nudges";

/**
 * The chasing cadence, pinned.
 *
 * This is the first thing worth a test in this codebase, because it is the
 * one decision nobody can see. A screen that renders wrongly is caught by
 * looking at it; a cadence that chases somebody twice on one morning, or
 * gives up after two attempts instead of three, or never gives up at all, is
 * caught a fortnight later by a new starter who has stopped opening the mail.
 *
 * Every case here is written against the *behaviour* rather than the numbers —
 * the constants are imported rather than repeated, so changing the policy
 * changes these tests' inputs and not their meaning. A test that hardcodes
 * `3` is a test that has to be edited when the policy changes, which is
 * exactly when you least want to be editing the thing that checks it.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-08-10T09:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

function step(over: Partial<JoinerStep> = {}): JoinerStep {
  return {
    id: "s1",
    title: "Provide your payroll details",
    actor: "joiner",
    field: "payroll-details",
    ...over,
  } as JoinerStep;
}

function joiner(over: Partial<Joiner> = {}): Joiner {
  return {
    id: "j1",
    email: "sam@example.com",
    name: "Sam Okafor",
    role: "Designer",
    /* Ten days ago, so a `due: 0` step is comfortably overdue and the
       undated fallback has also elapsed unless a case says otherwise. */
    startDate: "2026-07-31",
    accountEmail: "admin@example.com",
    company: "Katalis",
    workflowId: "w1",
    workflowName: "Onboarding",
    steps: [step({ due: 0 })],
    invitedAt: ago(10).toISOString(),
    nudgeCount: 0,
    nudgedAt: null,
    handedOverAt: null,
    ...over,
  } as Joiner;
}

describe("what counts as late", () => {
  it("ignores steps that belong to somebody else", () => {
    /* The rule that stops a new starter being chased for a contract only the
       admin can countersign — being asked for something you cannot do teaches
       you to ignore the next one. */
    const admins = joiner({ steps: [step({ actor: "admin", due: 0 })] });
    expect(lateSteps(admins, NOW)).toHaveLength(0);

    const craigs = joiner({ steps: [step({ actor: "craig", due: 0 })] });
    expect(lateSteps(craigs, NOW)).toHaveLength(0);
  });

  it("ignores a step sitting behind an unfinished one", () => {
    /* The workflow's order is deliberate: a step nobody has been asked for
       yet cannot be late. */
    const blocked = joiner({
      steps: [
        step({ id: "first", actor: "joiner", due: 0 }),
        step({ id: "second", actor: "joiner", due: 0 }),
      ],
    });
    expect(lateSteps(blocked, NOW).map((s) => s.id)).toEqual(["first"]);
  });

  it("ignores anything already done", () => {
    const done = joiner({
      steps: [step({ due: 0, completedAt: ago(1).toISOString() })],
    });
    expect(lateSteps(done, NOW)).toHaveLength(0);
  });

  it("does not treat a future deadline as late", () => {
    const soon = joiner({ startDate: "2026-09-01", steps: [step({ due: 0 })] });
    expect(lateSteps(soon, NOW)).toHaveLength(0);
  });

  it("falls back to the invitation date when a step has no deadline", () => {
    /* Most steps carry no `due` at all. Without this fallback the majority of
       onboardings would be un-chaseable, which is the bug rather than the
       safe default. */
    const fresh = joiner({
      steps: [step({ due: undefined })],
      invitedAt: ago(UNDATED_GRACE_DAYS - 1).toISOString(),
    });
    expect(lateSteps(fresh, NOW)).toHaveLength(0);

    const stale = joiner({
      steps: [step({ due: undefined })],
      invitedAt: ago(UNDATED_GRACE_DAYS + 1).toISOString(),
    });
    expect(lateSteps(stale, NOW)).toHaveLength(1);
  });
});

describe("the ladder", () => {
  it("waits before the first chase, then sends it", () => {
    const barely = joiner({
      startDate: "2026-08-09",
      steps: [step({ due: 0 })],
      invitedAt: ago(1).toISOString(),
    });
    expect(decideNudge(barely, NOW).action).toBe("nothing");

    const overdue = joiner({
      startDate: new Date(NOW.getTime() - FIRST_CHASE_AFTER_DAYS * DAY)
        .toISOString()
        .slice(0, 10),
      steps: [step({ due: 0 })],
    });
    const first = decideNudge(overdue, NOW);
    expect(first.action).toBe("chase");
    if (first.action === "chase") expect(first.attempt).toBe(1);
  });

  it("will not chase twice in one day", () => {
    /* The cap that stops four outstanding steps becoming four emails on one
       morning to the person least likely to want them. */
    const justChased = joiner({ nudgeCount: 1, nudgedAt: NOW.toISOString() });
    expect(decideNudge(justChased, NOW).action).toBe("nothing");
  });

  it("waits the full interval between chases", () => {
    const tooSoon = joiner({
      nudgeCount: 1,
      nudgedAt: ago(CHASE_EVERY_DAYS - 1).toISOString(),
    });
    expect(decideNudge(tooSoon, NOW).action).toBe("nothing");

    const due = joiner({
      nudgeCount: 1,
      nudgedAt: ago(CHASE_EVERY_DAYS).toISOString(),
    });
    const next = decideNudge(due, NOW);
    expect(next.action).toBe("chase");
    if (next.action === "chase") expect(next.attempt).toBe(2);
  });

  it("hands over at the ceiling instead of chasing again", () => {
    /* The whole point of the feature. A reminder that has failed three times
       will not succeed on the ninth; what is needed is a person. */
    const spent = joiner({
      nudgeCount: NUDGE_CEILING,
      nudgedAt: ago(CHASE_EVERY_DAYS).toISOString(),
    });
    expect(decideNudge(spent, NOW).action).toBe("hand-over");
  });

  it("hands over without waiting out another interval first", () => {
    /* The ceiling is checked before the interval on purpose: somebody who has
       had their three should be escalated on the next sweep, not three days
       later. */
    const spentToday = joiner({
      nudgeCount: NUDGE_CEILING,
      nudgedAt: NOW.toISOString(),
    });
    expect(decideNudge(spentToday, NOW).action).toBe("hand-over");
  });

  it("goes quiet for good once handed over", () => {
    const done = joiner({
      nudgeCount: NUDGE_CEILING,
      nudgedAt: ago(30).toISOString(),
      handedOverAt: ago(20).toISOString(),
    });
    expect(decideNudge(done, NOW).action).toBe("nothing");
  });

  it("says nothing when there is nothing of theirs outstanding", () => {
    const finished = joiner({
      steps: [step({ due: 0, completedAt: ago(1).toISOString() })],
    });
    expect(decideNudge(finished, NOW).action).toBe("nothing");
  });
});
