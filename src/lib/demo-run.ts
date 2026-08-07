import type { TaskStatus, WorkflowStep } from "@/components/ui";
import { NEW_HIRE, PEOPLE } from "@/lib/demo";

/**
 * A workflow that is actually running against a person.
 *
 * This is an *instance*, not a template, and the difference is the whole
 * reason it lives in its own file. A template is what Ada edits; an instance
 * is a frozen copy plus per-step state. Editing the Engineer template must
 * never retroactively rewrite an onboarding someone is halfway through —
 * least of all marking a step incomplete that they already finished.
 *
 * The state below is deliberately mid-flight. Nils is partway through, one
 * step is waiting on Ada to decide something nobody has written down, and the
 * MFA step in front of him gates everything after it. A demo where everything
 * is green demonstrates nothing.
 *
 * Fixture data. Goes when WorkflowInstance is a real type.
 */

export interface RunStep extends WorkflowStep {
  /** Who has to do it. The new starter's own steps say so. */
  owner: string;
  mine: boolean;
  /** Shown when it isn't theirs and isn't done. */
  waitingOn?: string;
}

export const RUN = {
  id: "run-nils",
  workflow: "Engineer",
  company: "Katalis",
  person: NEW_HIRE.name,
  email: NEW_HIRE.email,
  startedOn: "Monday",
  /** Local to them, not to the company. Nils is nine hours ahead of Jason. */
  timezone: NEW_HIRE.location,
};

const me = "You";

export const RUN_STEPS: RunStep[] = [
  {
    id: "r1",
    title: "Sign your contract",
    description:
      "Employment agreement, IP assignment and an NDA. Ada has already countersigned — signing it is also what got you this page.",
    status: "complete",
    owner: me,
    mine: true,
  },
  {
    id: "r2",
    title: "Personal and payroll details",
    description:
      "Legal name, address, bank and tax details, emergency contact. Goes straight to payroll — nobody at Katalis reads it.",
    status: "complete",
    owner: me,
    mine: true,
  },
  {
    id: "r3",
    title: "Right to work",
    description:
      "German residence and work permit. Ada checks it, but you upload it.",
    status: "complete",
    owner: me,
    mine: true,
  },
  {
    id: "r4",
    title: "Collect your laptop",
    description:
      "MacBook Pro 14, in the office. Tick it when you have it — nobody else needs to.",
    status: "complete",
    owner: me,
    mine: true,
  },
  {
    id: "r5",
    title: "Google Workspace",
    description:
      "nils@katalis.ai, plus the everyone@ and engineering@ groups. Everything below is addressed to it, so this one comes first.",
    status: "complete",
    owner: me,
    mine: true,
  },
  {
    id: "r6",
    title: "MFA on Google Workspace",
    description:
      "A passkey on nils@katalis.ai. Two minutes, and nothing below unlocks until it's done.",
    status: "complete",
    owner: me,
    mine: true,
  },
  {
    id: "r7",
    title: "Slack",
    description:
      "Your invite is waiting. Nobody has decided which channels you should be in yet — Ada is on that.",
    status: "awaiting",
    owner: me,
    mine: true,
    waitingOn: PEOPLE.ada.name,
  },
  {
    id: "r8",
    title: "GitHub",
    description: "Write access on the engineering and infra teams.",
    status: "complete",
    owner: me,
    mine: true,
  },
  {
    id: "r9",
    title: "MFA on GitHub",
    description:
      "Same again. Source control is the other account worth stealing, and it's the last thing between you and the rest of the list.",
    status: "in_progress",
    owner: me,
    mine: true,
    metrics: [{ value: "~2 min", label: "left" }],
    primaryAction: { label: "Set up multi-factor", href: "#" },
  },
  {
    id: "r10",
    title: "Linear",
    description: "Engineering and Infra.",
    status: "not_started",
    owner: me,
    mine: true,
  },
  {
    id: "r11",
    title: "Vanta",
    description:
      "Accept the policies, do the security training, install the device agent. Dull, and the reason Katalis can sell to anyone with a procurement team.",
    status: "not_started",
    owner: me,
    mine: true,
    primaryAction: { label: "Open Vanta", href: "#" },
  },
];

export const runSummary = (steps: RunStep[]) => {
  const done = steps.filter((s) => s.status === "complete").length;
  const mine = steps.filter(
    (s) => s.mine && s.status !== "complete",
  );
  const waiting = steps.filter((s) => s.waitingOn);
  return { done, total: steps.length, mine, waiting };
};

export const statusWord: Record<TaskStatus, string> = {
  complete: "Done",
  in_progress: "Now",
  awaiting: "Waiting",
  blocked: "Blocked",
  not_started: "Later",
};
