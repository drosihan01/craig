import type { WorkflowBlock } from "@/components/ui";
import { isUnconfigured } from "@/components/ui";
import { NEW_HIRE, PEOPLE } from "@/lib/demo";

/* Every step in the Engineer draft is the new starter's. Named once so it
   reads as a role rather than a string repeated eleven times. */
const NEW = "The new hire";

/**
 * The workflows Katalis has, and the metadata the list page shows about them.
 *
 * Both the list and the canvas read from here so their counts can't drift —
 * a list claiming "15 steps · 3 unconfigured" next to a canvas showing
 * something else is the kind of thing nobody notices until a demo.
 *
 * Fixture data. Goes when WorkflowTemplate is a real type.
 */

/**
 * The trigger. There is one and it isn't a choice.
 *
 * Craig runs onboarding; onboarding starts when someone is given a seat. A
 * trigger picker would only ever offer wrong answers, so every workflow —
 * drafted, blank, or built from a template — opens with this exact block.
 */
const TRIGGER: WorkflowBlock = {
  id: "t",
  kind: "trigger",
  title: "New seat added",
  summary:
    "Runs whenever someone is given a seat in People. Every workflow starts here, and this step has nothing to configure.",
};

/**
 * The Engineer draft — what Craig proposes at the end of the scripted session.
 *
 * Almost every step is the new starter's. That isn't a simplification, it's
 * the shape that falls out of Ada being the only person in Craig: there is
 * nobody else to assign anything to, so the workflow is a list of things Nils
 * does and Ada watches.
 *
 * Signing the contract is the hinge. It's the first thing, it happens before
 * he has an account, and doing it is what gives him one — so everything after
 * it can live inside Craig.
 *
 * The laptop is his to tick rather than Ada's to mark. It's the one step that
 * genuinely depends on someone else being in the room, and a step that sits
 * waiting on a person who isn't looking at Craig is a step that stalls.
 *
 * MFA sits directly behind each account rather than once at the end. The
 * workflow runs in order, so position is the gate — he cannot get to GitHub
 * without having put a passkey on the Workspace account, and cannot get to
 * Linear without having done GitHub. No new mechanism, just sequence used for
 * what it's for.
 *
 * Two things are left open on purpose, and they're the two Craig flags in the
 * conversation: which right-to-work check applies to a Berlin hire, and which
 * Slack channels he actually needs. Everything else carries real config, so
 * "configured" means something.
 */
export const INITIAL: WorkflowBlock[] = [
  TRIGGER,

  {
    id: "b1",
    kind: "document",
    preset: "sign-contract",
    title: "Sign contract",
    summary: "Signed in Craig — and it's how he gets his account",
    owner: NEW,
    config: {
      template: "Katalis — engineer contract.pdf",
      countersign: PEOPLE.ada.name,
      provider: "craig",
      acks: ["ip", "nda"],
    },
  },
  {
    id: "b2",
    kind: "document",
    preset: "payroll-details",
    title: "Personal and payroll details",
    summary: "Deel — he's employed through the German entity",
    owner: NEW,
    config: {
      fields: ["legal-name", "address", "bank", "tax", "emergency"],
      system: "deel",
      owner: NEW,
    },
  },
  {
    id: "b3",
    kind: "document",
    preset: "verify-identity",
    title: "Verify employment eligibility",
    summary: "Germany — nobody has said which check that means",
    owner: NEW,
    /* Deliberately empty: the check field is required, so this shows as
       unconfigured without anyone typing a warning string. */
    config: { verifier: PEOPLE.ada.name, deadline: "before-start" },
  },
  {
    id: "b4",
    kind: "task",
    preset: "laptop",
    title: "Collect your laptop",
    summary: "He ticks it himself — nobody has to be watching Craig",
    owner: NEW,
    config: {
      spec: "MacBook Pro 14, M4, 24GB",
      ship: "Collected in the office",
      owner: NEW,
      when: "day-one",
    },
  },

  {
    id: "b5",
    kind: "task",
    preset: "google-workspace",
    title: "Google Workspace",
    summary: "nils@katalis.ai — everything after this is addressed to it",
    owner: NEW,
    config: {
      domain: "katalis.ai",
      groups: ["everyone", "eng", "alerts"],
      license: "standard",
      owner: NEW,
      when: "day-one",
    },
  },
  {
    id: "b6",
    kind: "task",
    preset: "mfa",
    title: "MFA on Google Workspace",
    summary: "A passkey, before the account gets used for anything",
    owner: NEW,
    config: { systems: ["email"], method: "passkey", deadline: "day-one" },
  },
  {
    id: "b7",
    kind: "task",
    preset: "slack",
    title: "Slack",
    summary: "Which channels is currently tribal knowledge",
    owner: NEW,
    config: {
      workspace: "katalis.slack.com",
      type: "member",
      owner: NEW,
      when: "day-one",
    },
  },
  {
    id: "b8",
    kind: "task",
    preset: "github",
    title: "GitHub",
    summary: "Write on the engineering team, not admin",
    owner: NEW,
    config: {
      org: "github.com/katalis",
      teams: ["eng", "infra"],
      permission: "write",
      owner: NEW,
      when: "day-one",
    },
  },
  {
    id: "b9",
    kind: "task",
    preset: "mfa",
    title: "MFA on GitHub",
    summary: "Same again. Source control is the other account worth stealing",
    owner: NEW,
    config: { systems: ["code"], method: "passkey", deadline: "day-one" },
  },
  {
    id: "b10",
    kind: "task",
    preset: "linear",
    title: "Linear",
    summary: "Engineering and Infra",
    owner: NEW,
    config: {
      workspace: "linear.app/katalis",
      teams: ["eng", "infra"],
      role: "member",
      owner: NEW,
      when: "day-one",
    },
  },
  {
    id: "b11",
    kind: "task",
    preset: "vanta",
    title: "Vanta",
    summary: "Policies, security training, device agent",
    owner: NEW,
    config: {
      tasks: ["policies", "training", "agent"],
      deadline: "first-week",
      owner: NEW,
      when: "first-week",
    },
  },
];

/**
 * The finished one.
 *
 * Katalis has a small, complete workflow for a non-engineering hire and a
 * large, half-finished one for an engineer. That's the honest shape of a
 * three-person company: the simple case got done because it was simple, and
 * the one that matters most is the one still full of holes.
 *
 * It also means the product's actual loop — add a seat, a workflow runs — can
 * be walked end to end, instead of every path ending at "finish the draft
 * first".
 */
export const GENERAL: WorkflowBlock[] = [
  TRIGGER,
  {
    id: "g1",
    kind: "document",
    preset: "sign-contract",
    title: "Sign contract",
    summary: "Ada countersigns",
    owner: PEOPLE.ada.name,
    config: {
      template: "Katalis — standard contract.pdf",
      countersign: PEOPLE.ada.name,
      provider: "docusign",
      acks: ["ip", "nda"],
    },
  },
  {
    id: "g2",
    kind: "document",
    preset: "payroll-details",
    title: "Personal and payroll details",
    summary: "Before the first pay run",
    owner: PEOPLE.ada.name,
    config: {
      fields: ["legal-name", "address", "bank", "tax", "emergency"],
      system: "deel",
      owner: PEOPLE.ada.name,
    },
  },
  {
    id: "g3",
    kind: "task",
    preset: "laptop",
    title: "Issue laptop",
    summary: "Two weeks to arrive — order the day they sign",
    owner: PEOPLE.ada.name,
    config: {
      spec: "MacBook Air 13, M4, 16GB",
      ship: "Their home address",
      owner: PEOPLE.ada.name,
      when: "on-signing",
    },
  },
  {
    id: "g4",
    kind: "task",
    preset: "google-workspace",
    title: "Google Workspace",
    summary: "Email and calendar",
    owner: PEOPLE.jason.name,
    config: {
      domain: "katalis.ai",
      groups: ["everyone"],
      license: "starter",
      owner: PEOPLE.jason.name,
      when: "week-before",
    },
  },
  {
    id: "g5",
    kind: "task",
    preset: "slack",
    title: "Slack",
    summary: "#general and #random — that's the whole company",
    owner: PEOPLE.jason.name,
    config: {
      workspace: "katalis.slack.com",
      channels: ["general", "random"],
      type: "member",
      owner: PEOPLE.jason.name,
      when: "week-before",
    },
  },
  {
    id: "g6",
    kind: "task",
    preset: "mfa",
    title: "Set up MFA",
    summary: "Email and files",
    owner: PEOPLE.jason.name,
    config: {
      systems: ["email", "files"],
      method: "passkey",
      deadline: "day-one",
    },
  },
  {
    id: "g7",
    kind: "task",
    preset: "meet-manager",
    title: "1:1 with Ada",
    summary: "Half an hour, first week",
    owner: PEOPLE.ada.name,
    config: { manager: PEOPLE.ada.name, when: "first-week", length: "30" },
  },
];

/**
 * The empty one.
 *
 * A trigger and nothing else, which is the only honest starting state. It
 * exists so the block library has somewhere to be used from — the Engineer
 * draft arrives pre-written, so it never exercises the picker.
 */
export const BLANK: WorkflowBlock[] = [TRIGGER];

export interface DemoWorkflow {
  id: string;
  name: string;
  role: string;
  blocks: WorkflowBlock[];
  /** Who the current draft was written for, when it was written for someone. */
  forWho?: string;
  startsIn?: string;
  createdBy: string;
  updated: string;
}

export const WORKFLOW: DemoWorkflow = {
  id: "engineer",
  name: "Engineer",
  role: "Engineering hire",
  blocks: INITIAL,
  forWho: NEW_HIRE.name,
  startsIn: NEW_HIRE.startsIn,
  createdBy: "Craig, from your handbook",
  updated: "Just now",
};

export const GENERAL_WORKFLOW: DemoWorkflow = {
  id: "general",
  name: "General hire",
  role: "Anyone outside engineering",
  blocks: GENERAL,
  createdBy: PEOPLE.ada.name,
  updated: "Last week",
};

export const BLANK_WORKFLOW: DemoWorkflow = {
  id: "blank",
  name: "Untitled workflow",
  role: "Not decided yet",
  blocks: BLANK,
  createdBy: "You",
  updated: "Not saved",
};

export const WORKFLOWS: DemoWorkflow[] = [
  WORKFLOW,
  GENERAL_WORKFLOW,
  BLANK_WORKFLOW,
];

export const findWorkflow = (id: string) =>
  WORKFLOWS.find((w) => w.id === id) ?? WORKFLOW;

/** Steps excluding the trigger. */
export const stepCount = (blocks: WorkflowBlock[]) => blocks.length - 1;

/* Derived from the setup fields rather than a stored flag, so the list page,
   the nav counter and the Publish button can't disagree with the canvas. */
export const unconfiguredCount = (blocks: WorkflowBlock[]) =>
  blocks.filter(isUnconfigured).length;
