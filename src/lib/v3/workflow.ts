import type { WorkflowBlock } from "@/components/ui";
import type { DemoWorkflow } from "@/lib/demo-workflow";
import { V3_PEOPLE, V3_STARTER } from "@/lib/v3/company";

/**
 * What Craig writes after the conversation.
 *
 * Every step here traces to something Theo said, and the ordering is an
 * argument rather than a list. Two steps start before day one because they
 * have lead times longer than her notice period. The lab induction sits on the
 * Tuesday because Saoirse is wall-to-wall on Mondays. Unsupervised access
 * unlocks on a condition, not a date, because SOP-014 §4.1 gates it on the
 * check clearing and a date would let it fire early.
 *
 * It ends on the training record, because that's the artefact. Everything
 * above it is how Priya gets working; the last step is what Calder shows an
 * auditor in March.
 *
 * Two steps are deliberately unconfigured. Craig said he'd leave open what he
 * couldn't know rather than guess, and these are genuinely unknowable from
 * three documents: Calder has never run a police check, so no provider or
 * consent form exists; and SOP-014 says a starter signs off "applicable
 * procedures" without anywhere listing which. Both are one question to Theo
 * and neither is safe to invent.
 */

const HER = V3_STARTER.name.split(" ")[0];
const SAOIRSE = V3_PEOPLE.saoirse.name;
const RAF = V3_PEOPLE.raf.name;
const THEO = V3_PEOPLE.theo.name;

export const V3_BLOCKS: WorkflowBlock[] = [
  {
    id: "v3-trigger",
    kind: "trigger",
    title: "New seat added",
    summary:
      "Runs whenever someone is given a seat in People. Every workflow starts here.",
  },

  /* Before day one. Both of these have lead times, and both of them are the
     reason the workflow exists at all — they're what gets forgotten when
     onboarding is a Slack message on the first morning. */
  {
    id: "v3-police",
    kind: "task",
    preset: "background-check",
    title: "National Police Check",
    summary:
      "Starts now, not on day one — 5 to 15 business days, and she starts in 10 calendar.",
    owner: THEO,
    config: { level: "standard", owner: THEO },
    incomplete:
      "Calder has never run one. No provider, and no consent form to send her.",
  },
  {
    id: "v3-contract",
    kind: "document",
    preset: "sign-contract",
    title: "Sign contract",
    summary:
      "Employment agreement, IP assignment and an NDA. Theo countersigns.",
    owner: V3_STARTER.name,
    config: {
      template: "Calder — employment agreement (2026).pdf",
      countersign: THEO,
      provider: "docusign",
      acks: ["ip", "nda", "code"],
    },
  },

  /* Day one, and none of it needs Theo in the room. That was the ask. */
  {
    id: "v3-payroll",
    kind: "document",
    preset: "payroll-details",
    title: "Personal and payroll details",
    summary: "TFN declaration, super choice, bank details and next of kin.",
    owner: V3_STARTER.name,
    config: {
      fields: ["legal-name", "address", "bank", "tax", "emergency"],
      system: "employment-hero",
      owner: THEO,
    },
  },
  {
    id: "v3-rtw",
    kind: "task",
    preset: "verify-identity",
    title: "Right to work",
    summary: "Passport or visa evidence, checked against VEVO. She uploads it.",
    owner: V3_STARTER.name,
    config: { check: "document", verifier: THEO, deadline: "before-start" },
  },
  {
    id: "v3-laptop",
    kind: "task",
    preset: "laptop",
    title: "Collect your laptop",
    summary: "On the desk on day one. She ticks it herself.",
    owner: V3_STARTER.name,
    config: { spec: "MacBook Air 15", ship: "office", when: "day-one" },
  },
  {
    id: "v3-google",
    kind: "task",
    preset: "google-workspace",
    title: "Google Workspace",
    summary: `${V3_STARTER.email} — everything after this is addressed to it.`,
    owner: V3_STARTER.name,
    config: {
      domain: "calderdx.com",
      groups: ["everyone"],
      license: "standard",
      owner: THEO,
    },
  },
  {
    id: "v3-mfa",
    kind: "task",
    preset: "mfa",
    title: "Set up MFA",
    summary: "On the Google account. Her choice of app.",
    owner: V3_STARTER.name,
    config: { systems: ["google"], method: "app" },
  },

  /* The physical half. This is what a software hire never has, and it's the
     part that can't be rescheduled by an admin at 9pm. */
  {
    id: "v3-induction",
    kind: "task",
    preset: "walkthrough",
    title: "Lab induction",
    summary: `Tuesday with ${SAOIRSE} — she's in Mon, Tue and Thu, and Mondays are her worst day.`,
    owner: SAOIRSE,
    config: {
      topic: "The lab, the analyser and where everything lives",
      host: SAOIRSE,
      when: "day-two",
    },
  },
  {
    id: "v3-docs",
    kind: "document",
    preset: "document",
    title: "Controlled document sign-off",
    summary:
      "The procedures she's read and agreed to work to. Goes in the training record.",
    owner: V3_STARTER.name,
    incomplete:
      "SOP-014 says “applicable procedures” and never lists them. Nobody has written down which ones a QSA signs.",
  },
  {
    id: "v3-access",
    kind: "task",
    preset: "task",
    title: "Unsupervised lab access",
    summary:
      "Unlocks when the police check clears, not on a date — §4.1 gates it on the result.",
    owner: SAOIRSE,
    config: {
      what: "Issue lab badge and update the access register",
      owner: SAOIRSE,
    },
  },
  {
    id: "v3-repo",
    kind: "task",
    preset: "github",
    title: "GitHub",
    summary: `Read-only on the QMS repo. ${RAF} owns it.`,
    owner: V3_STARTER.name,
    config: {
      org: "github.com/calderdx",
      permission: "read",
      owner: RAF,
    },
  },

  /* The artefact. Everything above is how she gets working; this is what
     Calder puts in front of an auditor. */
  {
    id: "v3-record",
    kind: "approval",
    preset: "approval",
    title: "Training record",
    summary: `${HER} signs, then ${THEO} approves. §5.2 wants it inside 5 working days.`,
    owner: THEO,
    config: { what: "Training and competency record", approver: THEO },
  },
];

export const V3_WORKFLOW: DemoWorkflow = {
  id: "qsa",
  name: "Quality Systems Associate",
  role: "On-site, lab access, ISO 13485",
  forWho: V3_STARTER.name,
  startsIn: V3_STARTER.startsIn,
  blocks: V3_BLOCKS,
  createdBy: "Craig, from SOP-014 and your induction checklist",
  updated: "Just now",
};

/** What Theo answers in scene 4, keyed by the block it closes. */
export const V3_ANSWERS: Record<
  string,
  { config: Record<string, string | string[]>; said: string }
> = {
  "v3-police": {
    config: {
      provider: "checkmate",
      consent: "Calder — police check consent.pdf",
    },
    said: "We'll use Checkmate — Raf's already got an account for the contractors. I've uploaded their consent form.",
  },
  "v3-docs": {
    config: {
      doc: "SOP-014, SOP-002, QMS Manual Rev D, Quality Policy",
      direction: "sign",
    },
    said: "SOP-014, SOP-002, the QMS manual at Rev D and the quality policy. That's the set for a QSA.",
  },
};
