import { NEW_HIRE, PEOPLE } from "@/lib/demo";

/**
 * What Craig did without being asked.
 *
 * This is the file that makes him an agent rather than a tracker. A tracker
 * stores state and renders it; an agent senses, decides, acts, and can tell
 * you afterwards what it did. Everything here is the fourth part — the record
 * of actions nobody clicked a button for.
 *
 * The rules that would produce these live in `craig-rules.ts`. This is what
 * they'd have produced by now for Nils's run, so both halves of the product
 * can show Craig's side of the story before there's a scheduler to generate
 * it for real.
 *
 * Fixture data. Goes when the rules run on a queue.
 */

export type ActivityKind =
  | "chased"
  | "asked"
  | "sent"
  | "checked"
  | "noticed"
  /* Craig writing a value into a workflow, which is the one he does on her
     behalf rather than to somebody else. */
  | "set";

export interface Activity {
  id: string;
  kind: ActivityKind;
  /** First person. Craig is the subject of every one of these. */
  what: string;
  /** Which step it was about, when it was about one. */
  step?: string;
  /** Who it involved. */
  who?: string;
  when: string;
  /** Set when Craig is still waiting on the result. */
  outstanding?: boolean;
}

export const ACTIVITY: Activity[] = [
  {
    id: "act1",
    kind: "sent",
    what: `Sent ${NEW_HIRE.name.split(" ")[0]} his contract and set up his account when he signed it`,
    step: "Sign contract",
    when: "Monday",
  },
  {
    id: "act2",
    kind: "checked",
    what: "Confirmed his Google Workspace account exists and he's in all three groups",
    step: "Google Workspace",
    when: "Monday",
  },
  {
    id: "act3",
    kind: "checked",
    what: "Confirmed he accepted the GitHub invitation",
    step: "GitHub",
    when: "Tuesday",
  },
  {
    id: "act4",
    kind: "asked",
    what: `Asked ${PEOPLE.ada.name.split(" ")[0]} which Slack channels he should be in`,
    step: "Slack",
    who: PEOPLE.ada.name,
    when: "Tuesday",
    outstanding: true,
  },
  {
    id: "act5",
    kind: "chased",
    what: "Chased it again — it's the only thing holding up the rest of his week",
    step: "Slack",
    who: PEOPLE.ada.name,
    when: "Yesterday",
    outstanding: true,
  },
  {
    id: "act6",
    kind: "noticed",
    what: "Noticed he's nine hours ahead, so nothing gets sent to him after 3pm his time",
    when: "Monday",
  },
];

/** What Craig is still waiting on, which is what he'd lead with. */
export const outstanding = ACTIVITY.filter((a) => a.outstanding);

export const ACTIVITY_VERB: Record<ActivityKind, string> = {
  chased: "Chased",
  asked: "Asked",
  sent: "Sent",
  checked: "Checked",
  noticed: "Noticed",
  set: "Set",
};
