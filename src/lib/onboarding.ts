import { TEMPLATES as EMAIL_TEMPLATES } from "@/lib/email";
import { WORKFLOWS, stepCount, unconfiguredCount } from "@/lib/demo-workflow";

/**
 * Someone who is actually onboarding.
 *
 * The loop the product exists for: add a seat, a workflow gets assigned to it,
 * Craig runs it. Building a workflow is the means, not the job — an admin who
 * never adds a seat has got nothing out of Craig at all.
 *
 * Front-end state only. Nothing here survives a refresh, and no email is sent
 * by anything in this file.
 */

export interface Onboarding {
  id: string;
  name: string;
  email: string;
  role: string;
  /** Free text — "in 2 weeks", "Monday 24 August". */
  startsIn: string;
  workflowId: string;
  /** Steps done, of the workflow's total. */
  done: number;
  state: "invited" | "running" | "blocked";
}

/** A workflow can only be assigned if it would actually run. */
export function assignable(workflowId: string) {
  const w = WORKFLOWS.find((x) => x.id === workflowId);
  if (!w) return { ok: false as const, reason: "No such workflow" };

  const steps = stepCount(w.blocks);
  if (steps === 0) {
    return { ok: false as const, reason: "It has no steps yet" };
  }

  const gaps = unconfiguredCount(w.blocks);
  if (gaps > 0) {
    return {
      ok: false as const,
      reason: `${gaps} ${gaps === 1 ? "step isn't" : "steps aren't"} configured`,
    };
  }

  return { ok: true as const, steps };
}

/**
 * What adding this seat would set in motion.
 *
 * Shown before the button is pressed, not after. Adding a seat sends real mail
 * to a real person under the company's name, and "are you sure?" is a worse
 * question than "here is exactly what happens".
 */
export function consequences(workflowId: string) {
  const w = WORKFLOWS.find((x) => x.id === workflowId);
  const steps = w ? stepCount(w.blocks) : 0;

  /* The seat invite always goes immediately — it's on the trigger. Everything
     else is scheduled by its own step, so the honest count is "one now, and up
     to N later" rather than a single number that implies a burst. */
  const immediate = EMAIL_TEMPLATES.find((t) => t.id === "seat-invite");

  return {
    steps,
    immediate,
    /* Steps that fall to someone other than the new starter each generate a
       note to their owner. */
    toOthers: w
      ? new Set(
          w.blocks
            .filter((b) => b.owner && b.owner !== "The new hire")
            .map((b) => b.owner as string),
        ).size
      : 0,
  };
}
