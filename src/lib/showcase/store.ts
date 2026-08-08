"use client";

import * as React from "react";
import { isUnconfigured, type WorkflowBlock } from "@/components/ui";
import type { ActivityEntry } from "@/components/ui";
import {
  MAX_MESSAGES,
  type ChatTurn,
  type OpenWorkflow,
  type WorkflowEdit,
} from "@/lib/showcase/contract";
import { missingRequired } from "@/lib/workflow/library";

/**
 * Everything the showcase knows, which to begin with is nothing.
 *
 * This is the difference between the showcase and the three demos, and it is
 * the whole reason it exists. A demo is a story with the ending already
 * written: Katalis has a stale handbook, Calder has three contradictory
 * procedures, Nils is already halfway through his onboarding. Fixtures are
 * correct there — the point is to show what the product looks like in motion.
 *
 * A showcase starts empty and only contains what actually happened. Until
 * somebody is invited, People shows only whoever signed up. If Craig has not
 * drafted a workflow, Workflows is empty. If nothing has run, the activity ledger is
 * blank. Seeding any of that would make the product a liar in the one place
 * it is supposed to be honest, and it would hide the empty states — which are
 * the screens a real first user actually sees and the hardest ones to get
 * right.
 *
 * So there are no fixtures in this file. Everything below starts at zero and
 * is written to by something the user did.
 *
 * In-memory, like the demo stores, because there is still no database. That
 * is a real limitation and it belongs on screen rather than hidden: a refresh
 * loses the account, and the UI should say so rather than pretending.
 */

export interface ShowcasePerson {
  id: string;
  name: string;
  email: string;
  role: string;
  /** The founder holds the account; everyone else arrives by invitation. */
  owner?: boolean;
  invitedAt?: string;
  /** `YYYY-MM-DD`, and the same date the invitation gave them — People showing
      a day the email didn't is the sort of disagreement nobody catches. */
  startDate?: string;
}

export interface ShowcaseWorkflow {
  id: string;
  name: string;
  blocks: WorkflowBlock[];
  /** Set when Craig drafted it, so the UI can say where it came from. */
  draftedBy?: string;
  createdAt: string;
  published?: boolean;
  /**
   * When the editor first drew it, or absent if nobody has seen it yet.
   *
   * Craig's draft appears in the account before anybody opens it, so without
   * this the workflow that took a whole conversation to produce arrives as a
   * finished page — you never see it get made. The editor reads it once to
   * decide whether to lay the blocks out one at a time, and sets it, because
   * watching a workflow you already know reassemble itself is a party trick
   * that costs you two seconds every time you come back to it.
   */
  revealedAt?: string;
}

/**
 * One turn of the conversation.
 *
 * Here rather than beside the hook that streams it, because the thread outlives
 * every screen that shows it. Discovery happens on one page and the editing
 * happens on another, and they are one conversation — his last question is
 * still on screen when the workflow opens, and what they type next answers it.
 * A transcript in a component's state ends at the first navigation.
 *
 * `useCraigPanel` in `workflow-assistant.tsx` made the same move a level down:
 * selecting a block swapped the panel out and took the conversation with it, so
 * the lines had to live above the thing rendering them. This is that, once more.
 */
export interface CraigMessage extends ChatTurn {
  /** Stable across the streaming appends, so React keeps the same node. */
  id: string;
  /** True while deltas are still landing on this message. */
  streaming?: boolean;
  /** Pages the search used, on the turn that used them. One per site. */
  sources?: { url: string; title: string }[];
}

interface ShowcaseState {
  /** Whoever signed up, and nobody else until they invite somebody. */
  people: ShowcasePerson[];
  workflows: ShowcaseWorkflow[];
  activity: ActivityEntry[];
  /** What Craig found that nobody had written down. */
  gaps: { id: string; text: string }[];
  /** Concrete things he learned about the company. */
  facts: { id: string; text: string }[];
  /** The one conversation, across every screen it's held on. */
  messages: CraigMessage[];
  /**
   * Force every draft to the one-step test workflow. On by default.
   *
   * Not showcase data — it's the sandbox's switch, kept here because that's the
   * one place the sandbox and the chat client can both reach. Which is also why
   * clearing the showcase leaves it alone: it says how the next test should
   * run, not what happened in the last one.
   */
  simpleDraft: boolean;
}

/**
 * Genuinely nothing.
 *
 * Not even the account holder: whoever signed up is known to the server, not
 * to this module, and hardcoding a person here would put a name on screen
 * before anybody had typed one. `identify()` fills it in once the session is
 * known, which is the only moment it's true.
 */
const initial = (): ShowcaseState => ({
  people: [],
  workflows: [],
  activity: [],
  gaps: [],
  facts: [],
  messages: [],
  simpleDraft: true,
});

let state: ShowcaseState = initial();

const listeners = new Set<() => void>();

function set(next: Partial<ShowcaseState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const snapshot = () => state;

export function useShowcase() {
  return React.useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * The current state, without subscribing to it.
 *
 * For callers that need to *read* at the moment something happens rather than
 * re-render when it changes — the chat hook sends Craig's existing notes back
 * to him with each turn, and subscribing would rebuild its `send` callback on
 * every unrelated store write.
 */
export const showcaseState = snapshot;

/* ---------------------------------------------------------------------- */
/*  Writes — each one is something that actually happened                 */
/* ---------------------------------------------------------------------- */

export function recordGap(text: string) {
  if (state.gaps.some((g) => g.text === text)) return;
  set({ gaps: [...state.gaps, { id: crypto.randomUUID(), text }] });
}

export function recordFact(text: string) {
  if (state.facts.some((f) => f.text === text)) return;
  set({ facts: [...state.facts, { id: crypto.randomUUID(), text }] });
}

export function addWorkflow(workflow: ShowcaseWorkflow) {
  set({ workflows: [...state.workflows, workflow] });
  logActivity({
    verb: "Drafted",
    what: `${workflow.name} from what you told me`,
  });
}

/**
 * The editor writing the canvas back.
 *
 * The whole list rather than one block, because the editor owns order,
 * insertion and deletion as well as field values — three narrower writers that
 * each knew part of the shape is how a count in the nav ends up disagreeing
 * with the canvas it was counting.
 */
export function setWorkflowBlocks(id: string, blocks: WorkflowBlock[]) {
  set({
    workflows: state.workflows.map((w) => (w.id === id ? { ...w, blocks } : w)),
  });
}

/**
 * Craig changing a workflow while somebody watches.
 *
 * Through `setWorkflowBlocks` rather than beside it, so an edit he makes and an
 * edit made by hand on the canvas are the same write — the badge, the counter
 * and the Publish gate read one list either way.
 *
 * Each edit is checked against the workflow as it is now rather than as the
 * server last saw it. A step removed by hand between the request and the answer
 * is simply not there, and an edit naming it does nothing, which is the right
 * outcome and the reason these arrive as changes rather than as a replacement
 * list of blocks.
 */
export function applyEdit(id: string, edit: WorkflowEdit) {
  const workflow = state.workflows.find((w) => w.id === id);
  if (!workflow) return;
  const blocks = workflow.blocks;

  if (edit.type === "step-added") {
    if (blocks.some((b) => b.id === edit.block.id)) return;
    const at = edit.after
      ? blocks.findIndex((b) => b.id === edit.after) + 1
      : blocks.length;
    const index = at > 0 ? at : blocks.length;
    setWorkflowBlocks(id, [
      ...blocks.slice(0, index),
      edit.block,
      ...blocks.slice(index),
    ]);
    return;
  }

  if (edit.type === "step-set") {
    setWorkflowBlocks(
      id,
      blocks.map((b) =>
        b.id === edit.stepId
          ? { ...b, config: { ...b.config, ...edit.config } }
          : b,
      ),
    );
    return;
  }

  /* The trigger is the event rather than a step, and no workflow works without
     it. He is never shown it, so asking for it is a mistake rather than a wish. */
  if (edit.stepId === "trigger") return;
  setWorkflowBlocks(
    id,
    blocks.filter((b) => b.id !== edit.stepId),
  );
}

/**
 * The moment it stops being a draft and becomes what runs.
 *
 * Nothing here checks whether the workflow is complete. That rule is derived
 * from the blocks and enforced where it can be seen — the Publish button is
 * disabled while any step is unconfigured — and repeating it as a silent
 * refusal in the store would mean a button that looks live and does nothing.
 */
export function publishWorkflow(id: string) {
  const workflow = state.workflows.find((w) => w.id === id);
  if (!workflow || workflow.published) return;

  set({
    workflows: state.workflows.map((w) =>
      w.id === id ? { ...w, published: true } : w,
    ),
  });
  logActivity({
    verb: "Published",
    what: `${workflow.name} — it runs the next time somebody is given a seat`,
  });
}

export function invitePerson(person: Omit<ShowcasePerson, "id">) {
  set({
    people: [...state.people, { ...person, id: crypto.randomUUID() }],
  });
  logActivity({
    verb: "Invited",
    what: `${person.name} and sent their first step`,
  });
}

export function logActivity(entry: { verb: string; what: string }) {
  set({
    activity: [
      { id: crypto.randomUUID(), when: "Just now", ...entry },
      ...state.activity,
    ],
  });
}

/**
 * Tell the store who signed in.
 *
 * Called once the session is known. They hold the account rather than having
 * been invited to it, which is why this is separate from `invitePerson` and
 * why the row is marked `owner` — People should show them from the first load
 * and never show them as somebody's onboarding.
 */
export function identify(person: { name: string; email: string }) {
  if (state.people.some((p) => p.owner)) return;
  set({
    people: [
      {
        id: "owner",
        name: person.name,
        email: person.email,
        role: "Founder",
        owner: true,
      },
      ...state.people,
    ],
  });
}

/* ---------------------------------------------------------------------- */
/*  The conversation                                                      */
/* ---------------------------------------------------------------------- */

/**
 * The person's turn, and the empty reply about to be streamed into it.
 *
 * Returns the transcript as the server should see it, because the two have to
 * be decided together: what gets sent is everything settled plus the turn just
 * typed, and building that anywhere else means reading the store a moment after
 * it changed.
 *
 * Trimmed to the newest `MAX_MESSAGES`. Dropping the oldest is safe in a way
 * dropping the newest would not be — the early facts already travel separately
 * in `known`, and it's the last exchange his next answer has to follow from.
 */
export function beginTurn(question: string): {
  answerId: string;
  history: ChatTurn[];
} {
  const answerId = crypto.randomUUID();
  /* Anything still marked streaming was interrupted by this send. It stays on
     screen — it was really said — but it is no longer arriving. */
  const settled = state.messages.map((m) => ({ ...m, streaming: false }));
  const asked: CraigMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: question,
  };

  set({
    messages: [
      ...settled,
      asked,
      { id: answerId, role: "assistant", content: "", streaming: true },
    ],
  });

  return {
    answerId,
    history: [...settled, asked]
      .filter((m) => m.content.trim() !== "")
      .map(({ role, content }) => ({ role, content }))
      .slice(-MAX_MESSAGES),
  };
}

/** A chunk of the answer, as it arrives. */
export function appendAnswer(answerId: string, text: string) {
  set({
    messages: state.messages.map((m) =>
      m.id === answerId ? { ...m, content: m.content + text } : m,
    ),
  });
}

/** Seen. Only the first view of a draft is worth an entrance. */
export function markRevealed(id: string) {
  const workflow = state.workflows.find((w) => w.id === id);
  if (!workflow || workflow.revealedAt) return;
  set({
    workflows: state.workflows.map((w) =>
      w.id === id ? { ...w, revealedAt: new Date().toISOString() } : w,
    ),
  });
}

/** A page the search used, hung on the answer that used it. */
export function addSource(
  answerId: string,
  source: { url: string; title: string },
) {
  set({
    messages: state.messages.map((m) =>
      m.id === answerId && !m.sources?.some((s) => s.url === source.url)
        ? { ...m, sources: [...(m.sources ?? []), source] }
        : m,
    ),
  });
}

/** Nothing is still arriving, whatever the last event said. */
export function settleAnswers() {
  if (!state.messages.some((m) => m.streaming)) return;
  set({ messages: state.messages.map((m) => ({ ...m, streaming: false })) });
}

/* ---------------------------------------------------------------------- */

export const setSimpleDraft = (on: boolean) => set({ simpleDraft: on });

export const resetShowcase = () => {
  /* The switch survives, because it isn't part of what's being cleared. */
  state = { ...initial(), simpleDraft: state.simpleDraft };
  listeners.forEach((l) => l());
};

/* ---------------------------------------------------------------------- */
/*  Derived                                                               */
/* ---------------------------------------------------------------------- */

/** Steps excluding the trigger, which is the event rather than work anybody does. */
export const stepCount = (blocks: WorkflowBlock[]) =>
  blocks.filter((b) => b.kind !== "trigger").length;

/**
 * How many steps still need an answer.
 *
 * Derived from the presets' required fields rather than stored on the
 * workflow, so the list's badge, the editor's nav counter, the warnings on the
 * canvas and the disabled Publish button are four readings of one answer and
 * cannot drift apart.
 */
export const unconfiguredCount = (blocks: WorkflowBlock[]) =>
  blocks.filter(isUnconfigured).length;

/**
 * A workflow as Craig needs to see it to change it.
 *
 * Derived at send time from the same blocks the canvas is drawing, so what he
 * is told is open is what the badges say is open — there is no second answer to
 * keep in step. The trigger is left out: it is the event, it has nothing to
 * configure, and offering it would only give him a way to get it wrong.
 */
export function openWorkflow(id: string): OpenWorkflow | undefined {
  const workflow = state.workflows.find((w) => w.id === id);
  if (!workflow) return undefined;

  return {
    id: workflow.id,
    steps: workflow.blocks.flatMap((b) =>
      b.kind === "trigger" || !b.preset
        ? []
        : [
            {
              id: b.id,
              preset: b.preset,
              title: b.title,
              owner: b.owner,
              open: missingRequired(b.preset, b.config).map((f) => f.id),
            },
          ],
    ),
  };
}

/** True until the account holder has done anything. Drives first-run screens. */
export const isUntouched = (s: ShowcaseState) =>
  s.workflows.length === 0 && s.people.length <= 1 && s.activity.length === 0;

export const invited = (s: ShowcaseState) => s.people.filter((p) => !p.owner);
