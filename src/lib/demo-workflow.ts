import type { WorkflowBlock } from "@/components/ui";
import { NEW_HIRE, PEOPLE } from "@/lib/demo";

/**
 * The one workflow Katalis has, and the metadata the list page shows about it.
 *
 * Both the list and the canvas read from here so their counts can't drift —
 * a list claiming "9 steps · 2 unconfigured" next to a canvas showing
 * something else is the kind of thing nobody notices until a demo.
 *
 * Fixture data. Goes when WorkflowTemplate is a real type.
 */

/* Exactly the nine steps Craig proposes at the end of the scripted session,
   in the same order and with the same two gaps left open. If the conversation
   and the draft disagree, the demo's whole argument falls over. */
export const INITIAL: WorkflowBlock[] = [
  {
    id: "t",
    kind: "trigger",
    title: "A new hire is added",
    summary: `Engineer · ${NEW_HIRE.name} starts in ${NEW_HIRE.startsIn}`,
  },
  {
    id: "b1",
    kind: "document",
    title: "Contract and payroll details",
    summary: "Before day one",
    owner: PEOPLE.ada.name,
  },
  {
    id: "b2",
    kind: "task",
    title: "Order the laptop",
    summary: "Two weeks to arrive — start this the day he signs",
    owner: PEOPLE.ada.name,
  },
  {
    id: "b3",
    kind: "task",
    title: "GitHub, AWS and the provider keys",
    summary: "Jason owns all of these",
    owner: PEOPLE.jason.name,
  },
  {
    id: "b4",
    kind: "task",
    title: "Add to Slack channels",
    summary: "Which ones is currently tribal knowledge",
    incomplete: "Nobody owns this yet",
  },
  {
    id: "b5",
    kind: "delay",
    title: "Wait until day one",
    summary: "Resumes 9:00am Berlin — 9h ahead of Jason",
  },
  {
    id: "b6",
    kind: "document",
    title: "Read the handbook",
    summary: "Katalis Handbook — last updated Feb 2026",
    owner: PEOPLE.ada.name,
    incomplete: "Needs refreshing before he reads it",
  },
  {
    id: "b7",
    kind: "task",
    title: "Walk through what's live and what's fallback",
    summary: "Half an hour with Jason — the bit only in his head",
    owner: PEOPLE.jason.name,
  },
  {
    id: "b8",
    kind: "approval",
    title: "Jason signs off on prod access",
    summary: "Nothing touches routing until this clears",
    owner: PEOPLE.jason.name,
  },
  {
    id: "b9",
    kind: "task",
    title: "30-day check-in",
    summary: "What should have been written down and wasn't",
    owner: PEOPLE.ada.name,
  },
];

export const WORKFLOW = {
  id: "engineer",
  name: "Engineer",
  role: "Engineering hire",
  blocks: INITIAL,
  /** Who the current draft was written for. */
  forWho: NEW_HIRE.name,
  startsIn: NEW_HIRE.startsIn,
  createdBy: "Craig, from your handbook",
  updated: "Just now",
} as const;

/** Steps excluding the trigger. */
export const stepCount = (blocks: WorkflowBlock[]) => blocks.length - 1;
export const unconfiguredCount = (blocks: WorkflowBlock[]) =>
  blocks.filter((b) => b.incomplete).length;
