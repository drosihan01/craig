import { AUTOMATION_BY_PRESET, type StepAutomation } from "@/lib/craig/contract";
import { GOOGLE_WORKSPACE_PRESET, SLACK_PRESET } from "@/lib/workflow/library";

/**
 * What a block *is*, in one place, so that a second one is a row rather than a
 * refactor.
 *
 * Google Workspace is currently woven in rather than plugged in. The preset id
 * appears by name in the workflow editor four times, `googleConnected` is
 * threaded through the component tree as a boolean, `googleBlocked` is a
 * hardcoded clause in the publish gate, and `StepAutomation` is a union with one
 * member. None of that is wrong for one integration; all of it is a rewrite for
 * the second, because every one of those places has to learn about it
 * separately and nothing makes them agree.
 *
 * This is the thing they can agree on. It is deliberately **data, not
 * behaviour** — no React, no `server-only`, no imports from the runner — because
 * the two places that most need to make the same decision are a client component
 * (the publish gate) and a server route (the invite), and anything either of
 * them cannot import is not a shared answer.
 *
 * ## What is deliberately not here
 *
 * The settings panel. `GoogleStep` is a React component and this module is
 * imported by server code; putting a component reference in here would drag the
 * client bundle into the runner. A block's *settings UI* is looked up separately
 * in the editor, keyed by the same preset id — one registry for facts, one map
 * for components, joined by the id rather than by a shared import.
 *
 * The runner. What a block does when it fires lives in `automation.ts` and
 * genuinely differs per block; pretending it can be expressed as a row would be
 * the kind of abstraction that has to be undone the moment the second block
 * behaves at all differently from the first.
 *
 * So this carries exactly what has to be *consistent* across blocks: which
 * connection a block needs before a workflow containing it may be published, and
 * what to tell somebody when that connection is missing.
 */

/**
 * A provider in the `connections` table. `"google-workspace"` matches
 * `GOOGLE_PROVIDER` in `accounts.ts`; `"slack"` matches `SLACK_PROVIDER` in
 * `src/lib/slack/store.ts`. The table's `provider` column is an open string,
 * so this union is the one place the set of providers is actually closed —
 * a row stored under a spelling this type doesn't name is a row nothing will
 * ever read.
 */
export type ConnectionProvider = "google-workspace" | "slack";

/**
 * The only thing this module needs to know about a step.
 *
 * Structural on purpose. A workflow block in the editor, a stored joiner step
 * and a draft step are three different shapes that all carry a preset id, and
 * naming any one of them here would tie the registry to whichever screen
 * happened to ask first — then force the other two to convert before they could
 * ask the same question.
 */
export interface HasPreset {
  /**
   * Optional, because a block on the canvas may not have a preset yet — a step
   * Craig drafted freehand carries a title and nothing else. Widening here
   * rather than making every caller narrow first: "a step with no preset needs
   * no connection" is true, and it is this module's answer to give.
   */
  preset?: string;
}

export interface BlockDefinition {
  /** The preset id the admin picks in the block library. */
  preset: string;
  /**
   * The connection this block cannot run without, or `null` for a block that
   * needs nothing set up.
   */
  provider: ConnectionProvider | null;
  /** The automation it produces on a joiner's step, if it produces one. */
  automation: StepAutomation | null;
  /**
   * What the publish gate says when `provider` is not connected.
   *
   * Written per block rather than generated from the provider name, because
   * this sentence is read by somebody who is stuck and the useful version names
   * the thing they have to go and do. "Connect Google Workspace first" is a
   * next step; "provider google-workspace is not connected" is a log line.
   */
  blockedReason: string;
}

export const BLOCKS: Record<string, BlockDefinition> = {
  [GOOGLE_WORKSPACE_PRESET]: {
    preset: GOOGLE_WORKSPACE_PRESET,
    provider: "google-workspace",
    automation: AUTOMATION_BY_PRESET[GOOGLE_WORKSPACE_PRESET] ?? null,
    blockedReason: "Connect Google Workspace before publishing this.",
  },
  /**
   * The second row, and the reason this registry exists. `automation: null` is
   * a fact, not a placeholder: there is no Slack runner, so a joiner's Slack
   * step behaves exactly like an unwired task — somebody ticks it off — and
   * nothing anywhere may claim otherwise. What the row *does* change is the
   * publish gate: a workflow with a Slack block now waits for a Slack
   * connection, which is honest the moment a runner exists and merely early
   * until then. The alternative — adding the provider only when the runner
   * lands — would let a workflow publish against a connection nobody has made,
   * and the person who finds out is a new starter with a step that quietly
   * does nothing.
   *
   * Worth knowing before anybody wires the runner: Slack's API cannot invite
   * somebody to a workspace unless the customer is on Enterprise Grid
   * (`admin.users.invite` is Enterprise-only — see `src/lib/slack/config.ts`).
   * On a normal workspace the automatable half of this block is the channels,
   * after the person has accepted a human-sent invite.
   */
  [SLACK_PRESET]: {
    preset: SLACK_PRESET,
    provider: "slack",
    automation: null,
    blockedReason: "Connect Slack before publishing this.",
  },
};

/** The definition for a preset, or `null` for one that is not a block. */
export function blockFor(preset: string | undefined): BlockDefinition | null {
  if (!preset) return null;
  return Object.hasOwn(BLOCKS, preset) ? BLOCKS[preset] : null;
}

/**
 * Which providers a workflow needs connected before it can be published.
 *
 * Takes the steps rather than a workflow so the publish gate, the invite route
 * and a test can all ask the same question about whatever shape of list they
 * are holding. Deduplicated, because two Google steps are one connection.
 */
export function providersNeededBy(
  steps: readonly HasPreset[],
): ConnectionProvider[] {
  const needed = new Set<ConnectionProvider>();
  for (const step of steps) {
    const block = blockFor(step.preset);
    if (block?.provider) needed.add(block.provider);
  }
  return [...needed];
}

/**
 * What is standing between these steps and being publishable.
 *
 * The generalisation of `googleBlocked`. Returns sentences rather than a
 * boolean: the gate has to *say* why the button is off, and a boolean forces
 * every caller to reconstruct that sentence from the same hardcoded knowledge
 * this module exists to hold.
 *
 * Empty means nothing is missing, which is the only condition the button reads.
 */
export function unmetPrerequisites(
  steps: readonly HasPreset[],
  connected: ReadonlySet<ConnectionProvider>,
): string[] {
  const reasons: string[] = [];
  for (const provider of providersNeededBy(steps)) {
    if (connected.has(provider)) continue;
    const block = Object.values(BLOCKS).find((b) => b.provider === provider);
    if (block) reasons.push(block.blockedReason);
  }
  return reasons;
}
