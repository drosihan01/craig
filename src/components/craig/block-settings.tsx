"use client";

import { GitHubStep } from "@/components/craig/github";
import { GoogleStep } from "@/components/craig/google-workspace";
import type { WorkspaceAccount } from "@/components/craig/google-workspace";
import { LinearStep } from "@/components/craig/linear";
import { SlackStep } from "@/components/craig/slack-connect";
import {
  GITHUB_PRESET,
  GOOGLE_WORKSPACE_PRESET,
  LINEAR_PRESET,
  SLACK_PRESET,
} from "@/lib/workflow/library";

/**
 * Which settings panel a block shows, keyed by the same preset id as
 * `blocks.ts`.
 *
 * The companion to that registry and deliberately a **separate module**.
 * `blocks.ts` is imported by server code — the invite route asks it which
 * providers a workflow needs — and a React component reference sitting in that
 * record would pull the client bundle along behind it into the runner. So the
 * facts about a block live there, its UI lives here, and the two are joined by
 * the preset id rather than by an import in either direction.
 *
 * The editor previously mounted `GoogleStep` behind
 * `selected.preset === GOOGLE_WORKSPACE_PRESET`, which is the same arrangement
 * as the publish gate it sat beside: correct for one block, and a second `if`
 * for every block after. A lookup means the editor stops knowing which blocks
 * exist — adding a block's panel is a line here, not a branch there.
 *
 * A static map rather than a `register()` call, on purpose. Registration by
 * import side-effect only works if something imports the registering module,
 * and the moment nothing does — a refactor, tree-shaking, a lazy route — the
 * panel silently vanishes with no error anywhere. An import list is a small
 * price for a panel that provably exists at build time.
 *
 * A block with no entry renders nothing extra, which is the common case — most
 * presets are answered entirely by their own fields.
 */

export interface BlockSettingsProps {
  /** The signed-in admin, for panels that name the company or its domain. */
  account: WorkspaceAccount;
}

export type BlockSettingsComponent = (
  props: BlockSettingsProps,
) => React.ReactNode;

const PANELS: Record<string, BlockSettingsComponent> = {
  [GOOGLE_WORKSPACE_PRESET]: ({ account }) => <GoogleStep account={account} />,
  /* The lines the registry's design was paid for: the editor learns nothing,
     the publish gate learns from `blocks.ts`, and each panel exists because
     its entry here does. Adding a block is a row, not a branch. */
  [SLACK_PRESET]: ({ account }) => <SlackStep account={account} />,
  [LINEAR_PRESET]: ({ account }) => <LinearStep account={account} />,
  /* Four rows now, and the editor still knows none of their names. That is
     the whole return on the registry: the fourth block cost one import and one
     line here, where the second would have cost a branch in the canvas, a
     clause in the publish gate and a boolean threaded through the component
     tree. */
  [GITHUB_PRESET]: ({ account }) => <GitHubStep account={account} />,
};

/** The panel for a preset, or `null` when the block needs no extra settings. */
export function blockSettingsFor(
  preset: string | undefined,
): BlockSettingsComponent | null {
  if (!preset) return null;
  return Object.hasOwn(PANELS, preset) ? PANELS[preset] : null;
}
