import type { TaskStatus } from "@/components/ui";
import { V3_PEOPLE, V3_STARTER } from "@/lib/v3/company";

/**
 * Priya's onboarding, as Theo watches it happen.
 *
 * An *instance*, not the workflow — a frozen copy plus per-step state. Editing
 * the Quality Systems Associate workflow must not retroactively change what
 * Priya was actually asked to do, because in a 13485 shop that record is the
 * thing an auditor reads.
 *
 * The demo runs it forward. `SCRIPT` is the order steps complete in once the
 * play button is driving, with the pauses that make it read as a week
 * compressed rather than a progress bar filling up.
 *
 * Fixture data. Goes when there's a scheduler.
 */

export type Certainty = "verified" | "confirmed" | "assumed";

export interface V3RunStep {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  /** Who has to do it. */
  owner: string;
  /** How Craig knows it's done. */
  certainty?: Certainty;
  /** What Craig did about it without being asked. */
  craigNote?: string;
  /** Set while it's someone else's turn. */
  waitingOn?: string;
}

const HER = V3_STARTER.name;
const THEO = V3_PEOPLE.theo.name;
const SAOIRSE = V3_PEOPLE.saoirse.name;

export const V3_RUN = {
  id: "run-priya",
  workflow: "Quality Systems Associate",
  person: HER,
  email: V3_STARTER.email,
  role: V3_STARTER.role,
  startedOn: "10 days before her start date",
  startDate: V3_STARTER.startDate,
  location: V3_STARTER.location,
} as const;

/**
 * The initial state, the moment after Theo invites her.
 *
 * Not all zeroes. The police check goes out the instant the seat is created,
 * because that was the whole point of putting it before day one — a workflow
 * that waits for a human to press go on the step with the longest lead time
 * has reintroduced the problem it was built to solve.
 */
export const V3_RUN_STEPS: V3RunStep[] = [
  {
    id: "v3-police",
    title: "National Police Check",
    description:
      "Consent form sent to her personal address. Checkmate quote 5–15 business days.",
    status: "in_progress",
    owner: THEO,
    craigNote:
      "Sent this the second her seat existed — it's the only step that can't be rushed later.",
    waitingOn: "Checkmate",
  },
  {
    id: "v3-contract",
    title: "Sign contract",
    description: "Employment agreement, IP assignment and an NDA.",
    status: "in_progress",
    owner: HER,
    waitingOn: HER,
    craigNote: "Sent with her invite. Signing it is also how she gets her account.",
  },
  {
    id: "v3-payroll",
    title: "Personal and payroll details",
    description: "TFN declaration, super choice, bank details and next of kin.",
    status: "not_started",
    owner: HER,
  },
  {
    id: "v3-rtw",
    title: "Right to work",
    description: "Passport or visa evidence, checked against VEVO.",
    status: "not_started",
    owner: HER,
  },
  {
    id: "v3-laptop",
    title: "Collect your laptop",
    description: "MacBook Air 15, on her desk on day one.",
    status: "not_started",
    owner: HER,
  },
  {
    id: "v3-google",
    title: "Google Workspace",
    description: `${V3_STARTER.email} — everything after this is addressed to it.`,
    status: "not_started",
    owner: HER,
  },
  {
    id: "v3-mfa",
    title: "Set up MFA",
    description: "On the Google account. Her choice of app.",
    status: "not_started",
    owner: HER,
  },
  {
    id: "v3-induction",
    title: "Lab induction",
    description: `Tuesday with ${SAOIRSE}.`,
    status: "not_started",
    owner: SAOIRSE,
  },
  {
    id: "v3-docs",
    title: "Controlled document sign-off",
    description: "SOP-014, SOP-002, QMS Manual Rev D and the quality policy.",
    status: "not_started",
    owner: HER,
  },
  {
    id: "v3-access",
    title: "Unsupervised lab access",
    description: "Unlocks when the police check clears, not on a date.",
    status: "not_started",
    owner: SAOIRSE,
  },
  {
    id: "v3-repo",
    title: "GitHub",
    description: "Read-only on the QMS repo.",
    status: "not_started",
    owner: HER,
  },
  {
    id: "v3-record",
    title: "Training record",
    description: `${V3_STARTER.name.split(" ")[0]} signs, then ${THEO} approves.`,
    status: "not_started",
    owner: THEO,
  },
];

/**
 * The week, compressed.
 *
 * Each entry advances one step and says what Craig did, in the order it would
 * really happen — accounts before the induction, the induction before the
 * documents, the record last and only once everything it attests to is true.
 * The police check lands late on purpose: it's the one thing nobody at Calder
 * controls, and watching it clear is the moment the ordering pays off.
 */
export interface RunBeat {
  step: string;
  status: TaskStatus;
  /** What Craig says in the activity feed as it happens. */
  note: string;
  certainty?: Certainty;
  /** Milliseconds to hold before the next beat. */
  hold?: number;
}

export const V3_SCRIPT: RunBeat[] = [
  {
    step: "v3-contract",
    status: "complete",
    certainty: "verified",
    note: "She signed within the hour. Her account's live.",
  },
  {
    step: "v3-payroll",
    status: "complete",
    certainty: "confirmed",
    note: "Payroll details in and away to Employment Hero. Nobody here read them.",
  },
  {
    step: "v3-rtw",
    status: "complete",
    certainty: "verified",
    note: "Passport checked against VEVO — Australian citizen, no restrictions.",
  },
  {
    step: "v3-google",
    status: "complete",
    certainty: "verified",
    note: "Account created and she's in both groups. I checked rather than assumed.",
  },
  {
    step: "v3-mfa",
    status: "complete",
    certainty: "verified",
    note: "MFA on. She picked the same app as everyone else, which makes support easier.",
  },
  {
    step: "v3-laptop",
    status: "complete",
    certainty: "confirmed",
    note: "She ticked it off herself on Monday morning.",
  },
  {
    step: "v3-induction",
    status: "complete",
    certainty: "confirmed",
    note: `Ran on the Tuesday as planned. ${SAOIRSE} signed it off.`,
    hold: 1400,
  },
  {
    step: "v3-repo",
    status: "complete",
    certainty: "verified",
    note: "Read-only on the QMS repo, as scoped.",
  },
  {
    step: "v3-docs",
    status: "complete",
    certainty: "verified",
    note: "All four signed off. That's the evidence §5.2 asks for.",
  },
  {
    step: "v3-police",
    status: "complete",
    certainty: "verified",
    note: "Police check came back clear — 9 business days. This is why it went first.",
    hold: 1600,
  },
  {
    step: "v3-access",
    status: "complete",
    certainty: "confirmed",
    note: `Badge issued and the access register updated. ${SAOIRSE} did it the same afternoon.`,
  },
  {
    step: "v3-record",
    status: "complete",
    certainty: "verified",
    note: "She signed, you approved. Four working days from start — inside §5.2.",
    hold: 900,
  },
];
