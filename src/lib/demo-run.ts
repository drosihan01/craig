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
 * The state below is deliberately mid-flight and deliberately awkward: Nils
 * has done everything that was his to do, and he is now sitting behind two
 * steps that belong to Jason, who is nine hours behind him. That's the case
 * the product exists for. A demo where everything is green demonstrates
 * nothing.
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
      "Employment agreement, IP assignment and an NDA. Ada has already countersigned.",
    status: "complete",
    owner: PEOPLE.ada.name,
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
      "German residence and work permit, checked by Ada. Cleared before your start date.",
    status: "complete",
    owner: PEOPLE.ada.name,
    mine: false,
  },
  {
    id: "r4",
    title: "Your laptop",
    description: "MacBook Pro 14. Shipped to your address in Berlin.",
    status: "complete",
    owner: PEOPLE.ada.name,
    mine: false,
  },
  {
    id: "r5",
    title: "Google Workspace",
    description: "nils@katalis.ai, plus the everyone@ and engineering@ groups.",
    status: "complete",
    owner: PEOPLE.jason.name,
    mine: false,
  },
  {
    id: "r6",
    title: "Slack",
    description:
      "Your account is live, but nobody has decided which channels you should be in. Jason is on it.",
    status: "awaiting",
    owner: PEOPLE.jason.name,
    mine: false,
    waitingOn: PEOPLE.jason.name,
  },
  {
    id: "r7",
    title: "GitHub",
    description: "Write access on the engineering and infra teams.",
    status: "complete",
    owner: PEOPLE.jason.name,
    mine: false,
  },
  {
    id: "r8",
    title: "Linear",
    description: "Engineering and Infra.",
    status: "complete",
    owner: PEOPLE.jason.name,
    mine: false,
  },
  {
    id: "r9",
    title: "AWS",
    description:
      "Dev and staging through SSO. Production comes later, once you've been walked through what's live.",
    status: "awaiting",
    owner: PEOPLE.jason.name,
    mine: false,
    waitingOn: PEOPLE.jason.name,
  },
  {
    id: "r10",
    title: "Set up multi-factor",
    description:
      "A passkey on your email, GitHub and the AWS console. Takes about two minutes and it's the one thing here nobody can do for you.",
    status: "in_progress",
    owner: me,
    mine: true,
    metrics: [
      { value: 1, label: "of 3 done" },
      { value: "~2 min", label: "left" },
    ],
    primaryAction: { label: "Set up multi-factor", href: "#" },
  },
  {
    id: "r11",
    title: "Five questions",
    description:
      "Not a test — nobody sees the answers. It's the fastest way to find the two or three things nobody has thought to tell you.",
    status: "not_started",
    owner: me,
    mine: true,
    primaryAction: { label: "Start", href: "#" },
  },
  {
    id: "r12",
    title: "Half an hour with Jason",
    description:
      "The bit that isn't written down anywhere: what's live, what's fallback, and what breaking production actually looks like here.",
    status: "not_started",
    owner: PEOPLE.jason.name,
    mine: false,
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
