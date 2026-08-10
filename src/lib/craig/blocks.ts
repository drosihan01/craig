import { AUTOMATION_BY_PRESET, type StepAutomation } from "@/lib/craig/contract";
import {
  DOCUSIGN_SIGNING_METHOD,
  GITHUB_PRESET,
  GOOGLE_WORKSPACE_PRESET,
  LINEAR_PRESET,
  SIGNING_METHOD_FIELD,
  SIGN_CONTRACT_PRESET,
  SLACK_PRESET,
} from "@/lib/workflow/library";

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
 * A provider in the `connections` table. Each member matches a store's own
 * constant — `GOOGLE_PROVIDER` in `accounts.ts`, `SLACK_PROVIDER` in
 * `src/lib/slack/store.ts`, `LINEAR_PROVIDER` in `src/lib/linear/store.ts`,
 * `GITHUB_PROVIDER` in `src/lib/github/store.ts`, `DOCUSIGN_PROVIDER` in
 * `src/lib/docusign/store.ts`. The table's `provider`
 * column is an open string, so this union is the one place the set is actually
 * closed: a row stored under a spelling this type does not name is a row
 * nothing will ever read, and a name here that no store recognises makes the
 * publish gate demand a connection nobody can record.
 */
export type ConnectionProvider =
  | "google-workspace"
  | "slack"
  | "linear"
  | "github"
  | "docusign";

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
  /**
   * The admin's answers to the preset's setup fields, keyed by field id — the
   * same `config` a `WorkflowBlock` carries, restated structurally for the
   * reason `preset` is.
   *
   * Added for `sign-contract`, whose connection requirement depends on an
   * answer rather than on the block's identity, and optional because most
   * callers have never needed to hand one over. A step with no config asks for
   * no config-dependent connection, which is the right answer for a block
   * nobody has configured yet: it is already unpublishable for its missing
   * required fields, and stacking a second complaint on top of that would tell
   * somebody to go and connect DocuSign before they had said they wanted it.
   */
  config?: Record<string, string | string[]>;
}

export interface BlockDefinition {
  /** The preset id the admin picks in the block library. */
  preset: string;
  /**
   * The connection this block cannot run without *whatever it is set to*, or
   * `null` for a block that needs nothing set up.
   *
   * Unconditional on purpose, and it has to stay that way: `workflow-editor.tsx`
   * reads this field directly, off nothing but a preset id, to decide what
   * warning a block wears on the canvas. Anything here that depended on a
   * step's configuration would be a question that call site cannot ask.
   */
  provider: ConnectionProvider | null;
  /**
   * A connection this block needs only for *some* of its configurations.
   *
   * `sign-contract` is why this exists. It is one preset offering four signing
   * methods, and exactly one of them — DocuSign — reaches outside Craig. A flat
   * `provider: "docusign"` on that row would hold Publish shut on every
   * workflow containing a contract step, including the great majority signing
   * in Craig, and demand a connection those workflows will never use. That is a
   * **false gate**, and a false gate is worse than no gate: a missing
   * requirement fails once, loudly, when somebody first tries to use the thing;
   * a false one fails constantly, for everybody, and teaches people that the
   * publish gate is noise to be worked around.
   *
   * The alternative to this field was to leave `sign-contract` off the registry
   * entirely and let a DocuSign workflow publish with no connection. That fails
   * in the worst possible place — a real starter's employment contract, silently
   * never sent — so the conditional requirement is worth the extra field.
   *
   * Returns `null` when this particular step needs nothing, which is most of
   * them. Called with whatever shape the caller holds; see `HasPreset`.
   */
  providerWhen?: (step: HasPreset) => ConnectionProvider | null;
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

  /**
   * The gate arrives before the runner, deliberately.
   *
   * `automation` is null because nothing runs on a Linear step yet — no
   * runner exists, and writing one into `automation.ts` before a live
   * workspace has proven the invite mutation would be scaffolding wearing a
   * feature's name. What the row does today is smaller and still worth
   * having: the block's meaning is "Craig invites them to Linear", and a
   * workflow published against an account with no Linear connection is a
   * promise the account cannot keep. Requiring the connection now means the
   * day the runner lands, every published workflow already satisfies its
   * prerequisite — instead of a migration hunting for workflows that were
   * published while the gate looked the other way.
   */
  [LINEAR_PRESET]: {
    preset: LINEAR_PRESET,
    provider: "linear",
    automation: null,
    blockedReason: "Connect Linear before publishing this.",
  },

  /**
   * The fourth row, and the first one where `automation: null` is genuinely
   * only about us.
   *
   * Slack's row records a limit of Slack's: `admin.users.invite` is Enterprise
   * Grid only, so on a normal workspace the invite itself is never
   * automatable and never will be. Linear's records an unproven inference.
   * GitHub's records neither — `POST /orgs/{org}/invitations` takes an
   * `email`, a `role` and `team_ids` on any ordinary paid organisation, and it
   * is documented to work with a GitHub App installation or user token holding
   * "Members" write. The whole of what this block promises is one request.
   *
   * So the null here is a fact about this repository rather than about GitHub:
   * there is no runner, and until there is, a joiner's GitHub step behaves
   * exactly like an unwired task — somebody ticks it off — and nothing
   * anywhere may claim otherwise. The temptation with a block whose API
   * genuinely works is to let the copy drift towards the capability; the
   * publish gate and this comment are what stop that.
   *
   * What the row does change today is the gate: a workflow with a GitHub block
   * now waits for a GitHub connection. That is honest the moment a runner
   * exists and merely early until then, where the alternative — adding the
   * provider only when the runner lands — would let a workflow publish against
   * a connection nobody has made, and the person who finds out is a new
   * starter with a step that quietly does nothing.
   *
   * Two things the eventual runner has to handle that no other block here
   * does, recorded where it will be read: an invitation is *pending* until the
   * person accepts it, so "invited" and "in the organisation" are different
   * states and the step cannot settle on the response to the POST; and the
   * teams an admin typed are names, while the API wants numeric `team_ids`, so
   * a lookup against the live organisation stands between the two.
   */
  [GITHUB_PRESET]: {
    preset: GITHUB_PRESET,
    provider: "github",
    automation: null,
    blockedReason: "Connect GitHub before publishing this.",
  },

  /**
   * The fifth row, and the first whose requirement is a *decision* rather than
   * an identity.
   *
   * "Sign contract" is one preset with a Signing method field offering four
   * answers. Craig's own signing and "email a PDF back" need nothing from
   * anybody; Dropbox Sign has no module here and so cannot be required; and
   * DocuSign is the one that needs a connection. `provider` is therefore null
   * — a contract step in the abstract needs nothing — and `providerWhen`
   * carries the real rule.
   *
   * Why DocuSign is offered for this block at all, since Craig can already
   * collect a signature: the employment contract is the document that gets
   * disputed, and what DocuSign sells is exactly what a dispute needs — a
   * tamper-evident seal, a certificate of completion, an audit trail that
   * stands up when somebody's lawyer reads it. Craig's own signing is the
   * right tool for the handbook acknowledgement and the code of conduct, where
   * a tick and a timestamp are proportionate and the cost of a heavier process
   * is real. Neither is a lesser version of the other.
   *
   * `automation: null` is a fact, not a placeholder: no runner exists, so a
   * joiner's contract step behaves exactly like an unwired task, and nothing
   * anywhere may claim otherwise. Nothing in this repo has ever sent a DocuSign
   * envelope, and the integration cannot serve a real customer at all until the
   * integration key passes DocuSign's Go-Live review — which for a product in
   * Craig's shape means joining their partner program. See
   * `src/lib/docusign/config.ts`; it is a commercial gate, not a code one.
   *
   * ## What this row cannot fix, stated because it will look like a bug
   *
   * `workflow-editor.tsx` asks two questions off a bare preset id — which
   * warning badge a block wears on the canvas, and which step an unmet
   * prerequisite in the attention list should scroll to — and neither can see a
   * step's config. So a contract step set to DocuSign, in an account with no
   * DocuSign connection, is correctly refused by the publish gate and correctly
   * named in the attention list, and wears **no badge on the canvas**; the
   * attention-list entry has nothing to scroll to.
   *
   * That is a worse gap than it sounds — the editor's own comment says a block
   * must never look publishable on the canvas and be refused by the button —
   * and it is deliberate anyway, because the alternatives are worse. Making
   * `provider` config-dependent would break both of those call sites' types.
   * Setting `provider: "docusign"` outright would badge and block every
   * contract step in the product, which is the false gate this file exists to
   * argue against. The honest fix is one line in the editor — pass the block,
   * not just its preset — and it belongs in a change that is allowed to touch
   * that file.
   */
  [SIGN_CONTRACT_PRESET]: {
    preset: SIGN_CONTRACT_PRESET,
    provider: null,
    providerWhen: (step) =>
      step.config?.[SIGNING_METHOD_FIELD] === DOCUSIGN_SIGNING_METHOD
        ? "docusign"
        : null,
    automation: null,
    blockedReason:
      "This contract is set to be signed with DocuSign — connect DocuSign before publishing, or change the signing method.",
  },
};

/**
 * What connection this particular step needs, given how it is configured.
 *
 * The question every caller below actually has, and the one place the two
 * halves of a block's requirement — the unconditional one and the
 * configuration-dependent one — are put back together. Taking the step rather
 * than the preset id is the whole difference: `blockFor` answers about a *kind*
 * of block, this answers about a block somebody has filled in.
 *
 * The unconditional requirement wins when both are present. Nothing uses both
 * today; the ordering is stated so that the first block which does inherits a
 * decision rather than making one by accident.
 */
export function providerNeededBy(step: HasPreset): ConnectionProvider | null {
  const block = blockFor(step.preset);
  if (!block) return null;
  return block.provider ?? block.providerWhen?.(step) ?? null;
}

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
    const provider = providerNeededBy(step);
    if (provider) needed.add(provider);
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
  /* Deduplicated by provider rather than by sentence: two Google steps are one
     connection and so one complaint. Walked over the steps rather than over
     `BLOCKS`, which is the change `sign-contract` forced — the old version
     found each provider's sentence by searching the registry for the block that
     names it, and a block whose requirement is conditional does not name it.
     Reading the sentence off the step that raised the requirement is also
     simply more correct: it is the block in front of somebody that has to
     explain itself. */
  const seen = new Set<ConnectionProvider>();
  for (const step of steps) {
    const provider = providerNeededBy(step);
    if (!provider || seen.has(provider) || connected.has(provider)) continue;
    seen.add(provider);
    const block = blockFor(step.preset);
    if (block) reasons.push(block.blockedReason);
  }
  return reasons;
}
