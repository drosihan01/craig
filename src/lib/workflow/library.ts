import {
  AltRoute,
  Apps,
  Badge,
  Description,
  Draw,
  Forum,
  Handshake,
  HowToReg,
  Key,
  Lock,
  Mail,
  RocketLaunch,
  School,
  Schedule,
  TaskAlt,
} from "@/components/ui/icons";
import type { BlockKind, WorkflowBlock } from "@/components/ui";

/**
 * The block library — what an admin actually picks from.
 *
 * Two layers, deliberately.
 *
 * `BlockKind` (in workflow-builder) is the *mechanism*: what the engine does
 * with a block. There are seven and there should stay seven — a task, an
 * approval, a wait, a document, and so on.
 *
 * A `BlockPreset` is a *named piece of onboarding* sitting on one of those
 * mechanisms. "Set up MFA & security" and "Get tools & access" are both tasks
 * as far as the engine is concerned, but nobody builds an onboarding by
 * thinking "I need three tasks". They think "they need MFA".
 *
 * Keeping them separate is what stops the block list growing a new kind every
 * time onboarding practice changes. Adding a preset is data; adding a kind is
 * a change to the engine.
 *
 * Presets carry a `gap` when the thing they describe is genuinely
 * company-specific and can't be guessed — the country's identity check, which
 * apps count as "tools". Those land unconfigured on purpose: a block that
 * looks finished but points at nothing is worse than one that says so.
 */

export interface BlockPreset {
  id: string;
  label: string;
  /** One line, shown in the picker. */
  description: string;
  /** Which mechanism the engine runs. */
  kind: BlockKind;
  icon: React.ComponentType<{ className?: string }>;
  /** Prefilled onto the block. */
  title: string;
  summary?: string;
  /** Why this can't be finished until the admin says something. */
  gap?: string;
}

export interface BlockCategory {
  id: string;
  label: string;
  /** Shown under the category heading in the picker. */
  description: string;
  presets: BlockPreset[];
}

export const BLOCK_LIBRARY: BlockCategory[] = [
  {
    id: "paperwork",
    label: "Paperwork",
    description: "The parts that have to happen before anyone can start.",
    presets: [
      {
        id: "sign-contract",
        label: "Sign contract",
        description:
          "Employment agreement, offer letter and any acknowledgements that go with it.",
        kind: "document",
        icon: Draw,
        title: "Sign contract",
        summary: "Employment agreement and required acknowledgements",
      },
      {
        id: "payroll-details",
        label: "Personal & payroll details",
        description:
          "Legal name, address, bank and tax details, emergency contact.",
        kind: "document",
        icon: Badge,
        title: "Personal and payroll details",
        summary: "Legal name, address, bank, tax, emergency contact",
      },
      {
        id: "verify-identity",
        label: "Verify employment eligibility",
        description:
          "Right to work or identity check. What's required depends on the country.",
        kind: "document",
        icon: HowToReg,
        title: "Verify employment eligibility",
        summary: "Right-to-work or identity check",
        gap: "Which check applies isn't set",
      },
    ],
  },
  {
    id: "access",
    label: "Access",
    description:
      "Identity first, then security, then the tools. That order is the point.",
    presets: [
      {
        id: "join-workspace",
        label: "Join workspace",
        description:
          "Company email and chat. Everything else keys off this account existing.",
        kind: "task",
        icon: Forum,
        title: "Join workspace",
        summary: "Company email, Slack and calendar",
      },
      {
        id: "mfa",
        label: "Set up MFA & security",
        description:
          "Multi-factor on email, files and remote access. Phishing-resistant where it's offered.",
        kind: "task",
        icon: Lock,
        title: "Set up MFA and security",
        summary: "Email, file storage and remote access",
      },
      {
        id: "tools",
        label: "Get tools & access",
        description:
          "The apps and permission levels this role actually needs — and nothing beyond them.",
        kind: "task",
        icon: Key,
        title: "Tools and access",
        summary: "One entry per app, with the permission level",
        gap: "No apps listed yet",
      },
      {
        id: "access-approval",
        label: "Approve production access",
        description:
          "Hold anything sensitive until a named person signs it off.",
        kind: "approval",
        icon: Apps,
        title: "Approve production access",
        summary: "Nothing sensitive is granted until this clears",
        gap: "Nobody owns this yet",
      },
    ],
  },
  {
    id: "learning",
    label: "Learning",
    description: "What they have to read, and what they have to be told.",
    presets: [
      {
        id: "training",
        label: "Training & required reading",
        description:
          "Security awareness, policies, and anything specific to the role.",
        kind: "document",
        icon: School,
        title: "Training and required reading",
        summary: "Security awareness, policies, role-specific material",
        gap: "No material attached",
      },
    ],
  },
  {
    id: "people",
    label: "People & role",
    description:
      "The half of onboarding that isn't paperwork — and the half people skip.",
    presets: [
      {
        id: "meet-manager",
        label: "Manager 1:1",
        description:
          "A first conversation with whoever they report to, booked rather than hoped for.",
        kind: "task",
        icon: Handshake,
        title: "Manager 1:1",
        summary: "30 minutes in the first week",
      },
      {
        id: "first-task",
        label: "First task",
        description:
          "Something small, real and shippable. Confidence comes from finishing, not reading.",
        kind: "task",
        icon: RocketLaunch,
        title: "First task",
        summary: "Small, real, and done in the first week",
        gap: "No task picked",
      },
    ],
  },
  {
    id: "flow",
    label: "Flow",
    description: "Shape, not content. These control when the rest happens.",
    presets: [
      {
        id: "task",
        label: "Task",
        description: "Anything the library doesn't cover.",
        kind: "task",
        icon: TaskAlt,
        title: "New task",
        gap: "Not configured",
      },
      {
        id: "wait",
        label: "Wait",
        description: "Pause, relative to the start date.",
        kind: "delay",
        icon: Schedule,
        title: "Wait until day one",
      },
      {
        id: "condition",
        label: "Condition",
        description: "Only run what follows if this is true.",
        kind: "branch",
        icon: AltRoute,
        title: "New condition",
        gap: "No condition set",
      },
      {
        id: "notify",
        label: "Notification",
        description: "Email or message someone.",
        kind: "notify",
        icon: Mail,
        title: "Send a message",
        gap: "No recipient",
      },
      {
        id: "document",
        label: "Document",
        description: "Collect or issue a document the library doesn't name.",
        kind: "document",
        icon: Description,
        title: "New document",
        gap: "Not configured",
      },
    ],
  },
];

export const ALL_PRESETS: BlockPreset[] = BLOCK_LIBRARY.flatMap(
  (c) => c.presets,
);

export const findPreset = (id: string) => ALL_PRESETS.find((p) => p.id === id);

/** Turns a picked preset into the block that goes on the canvas. */
export function blockFromPreset(
  preset: BlockPreset,
  id: string,
): WorkflowBlock {
  return {
    id,
    kind: preset.kind,
    preset: preset.id,
    title: preset.title,
    summary: preset.summary,
    incomplete: preset.gap,
  };
}
