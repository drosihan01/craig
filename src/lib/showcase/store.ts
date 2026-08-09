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
import { blankTrigger } from "@/lib/showcase/draft";
import { forgetSync, hydrate, scheduleSync } from "@/lib/showcase/workflow-sync";
import {
  forgetThreadSync,
  scheduleThreadSync,
} from "@/lib/showcase/thread-sync";

/**
 * Everything the showcase knows, which to begin with is nothing.
 *
 * This is the difference between the showcase and the three demos, and it is
 * the whole reason it exists. A demo is a story with the ending already
 * written: Katalis has a stale handbook, Calder has three contradictory
 * procedures, Nils is already halfway through his onboarding. Fixtures are
 * correct there — the point is to show what the product looks like in motion.
 *
 * A showcase starts empty and only contains what actually happened. If Craig
 * has not drafted a workflow, Workflows is empty. If nothing has run, the
 * activity ledger is blank. Seeding any of that would make the product a liar
 * in the one place it is supposed to be honest, and it would hide the empty
 * states — which are the screens a real first user actually sees and the
 * hardest ones to get right.
 *
 * So there are no fixtures in this file. Everything below starts at zero and
 * is written to by something the user did.
 *
 * One thing is deliberately *not* here: who holds a seat. That lives on the
 * server, in `joiners.ts`, because it is the only part of the showcase that two
 * different people write to — the new starter answers their own steps on their
 * own device, and the admin who invited them is somewhere else entirely. This
 * module used to keep a parallel list of invitees beside that one, and it did
 * exactly what a second answer to one question always does: a seat removed on
 * the server carried on being counted in the browser, because nothing on the
 * server can reach in here to say otherwise. Screens that need seats are handed
 * them by the server component that renders them, the way People already is.
 *
 * In-memory, like the demo stores, because there is still no database. That
 * is a real limitation and it belongs on screen rather than hidden: a refresh
 * loses the account, and the UI should say so rather than pretending.
 */

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
  /**
   * Started from the blank button and not yet touched.
   *
   * A blank workflow is created the instant somebody presses "Start blank",
   * because the editor renders from the store and there has to be something for
   * it to render. That is fine right up until they change their mind: pressing
   * back is confirmed and throws it away, but closing the tab, using the
   * browser's own back button, or simply wandering off is not — and every one
   * of those used to leave a row called "New workflow" in the list, holding
   * nothing but the trigger every workflow starts with.
   *
   * So it exists locally and is not durable. Nothing pending is ever synced, so
   * it is gone on the next load however somebody leaves; the first real edit
   * clears the flag and it becomes an ordinary workflow that saves like any
   * other.
   *
   * A flag rather than "has no steps", which is the tempting test and is wrong:
   * deleting the last step of a real, published workflow would look identical,
   * and this would quietly stop saving the one workflow somebody is actively
   * emptying on purpose.
   */
  pending?: boolean;
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
  workflows: ShowcaseWorkflow[];
  activity: ActivityEntry[];
  /** What Craig found that nobody had written down. */
  gaps: { id: string; text: string }[];
  /** Concrete things he learned about the company. */
  facts: { id: string; text: string }[];
  /**
   * The conversation currently open, and which one it is.
   *
   * This used to be *the* conversation — one transcript, written to by every
   * screen. The argument for that was real and is worth keeping half of:
   * discovery and the editing that follows it genuinely are one conversation,
   * and a thread that restarts when you open your own workflow is two
   * conversations pretending to be one.
   *
   * What it got wrong is that *every* pair of screens is like that. Asking
   * after a new starter on Home appended to the conversation that had built a
   * workflow last week, and Craig was handed both as one train of thought. So
   * the transcript is now per thread — see `threads.ts` for the three kinds —
   * and this holds whichever one is on screen.
   *
   * `threadId` is null before a conversation has been opened, and on Home
   * before the first thing is said: a god thread is made on the first send
   * rather than on arrival, so opening Home and leaving does not litter the
   * history with empty conversations.
   */
  threadId: string | null;
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
  /**
   * Whose data this is.
   *
   * Everything above belongs to one account and none of it is on the server, so
   * without this there is nothing tying the two together — sign up as somebody
   * new and the browser keeps the last person's conversation and workflows,
   * because signing up is a fetch and a client navigation rather than a page
   * load and module state survives it. Craig then reads a transcript addressed
   * to the previous account and carries on calling them by that name.
   *
   * Null before anyone has claimed it, and on the signed-out screens.
   */
  accountEmail: string | null;
}

/**
 * Genuinely nothing.
 *
 * Not even the account holder: whoever signed up is known to the server, not
 * to this module, and hardcoding a person here would put a name on screen
 * before anybody had typed one. Every screen reads the session for that, so
 * there is nothing here to seed.
 */
const initial = (): ShowcaseState => ({
  workflows: [],
  activity: [],
  gaps: [],
  facts: [],
  threadId: null,
  messages: [],
  simpleDraft: true,
  accountEmail: null,
});

/**
 * Where a browser keeps its half of the showcase.
 *
 * Per account, because two people using one browser must not read each other's
 * conversation — the same reason `claimAccount` exists at all.
 */
const keyFor = (email: string) => `craig-showcase:${email}`;

/**
 * localStorage rather than the server, deliberately.
 *
 * Everything in this state is already client-owned and already serialisable,
 * and the alternative — posting each change to an endpoint — would put a
 * network round trip in front of Craig recording a fact mid-sentence. What it
 * buys is the thing that was actually painful: a reload no longer throws away
 * the workflow you just spent a conversation producing.
 *
 * The switch is left out on purpose. It belongs to whoever is driving the
 * sandbox, not to the account being demonstrated, and restoring it per account
 * would mean a test run inheriting a setting from whoever signed in last.
 *
 * **The conversation is left out too, and that is a change.** It used to be
 * saved here, which was right while a transcript existed nowhere else. Now that
 * threads are rows, a local copy is a second answer to "what was said", and it
 * lost: arriving at Home is meant to start a fresh conversation, and the
 * restore raced `clearThread` and put the previous one back on screen. Whoever
 * won that race decided what Craig believed you had just been talking about.
 *
 * What replaces it is not nothing. A workflow's thread is re-read when the
 * screen opens, and Home's history lists the god threads — both from the
 * server, which is the copy every device can see.
 */
function persist() {
  if (typeof window === "undefined" || !state.accountEmail) return;
  try {
    /* Listed rather than spread-minus-one, so this and `restore` below name
       the same fields in the same order — a saver that quietly picks up every
       new key and a loader that checks each one is how the two drift. */
    localStorage.setItem(
      keyFor(state.accountEmail),
      JSON.stringify({
        workflows: state.workflows,
        activity: state.activity,
        gaps: state.gaps,
        facts: state.facts,
      }),
    );
  } catch {
    /* Quota, or a browser refusing storage. Losing the saved copy is not worth
       breaking the write that was actually asked for — the app carries on with
       what's in memory, which is what it did before any of this existed. */
  }
}

function restore(email: string): ShowcaseState {
  const fresh = {
    ...initial(),
    simpleDraft: state.simpleDraft,
    accountEmail: email,
  };
  if (typeof window === "undefined") return fresh;

  try {
    const raw = localStorage.getItem(keyFor(email));
    if (!raw) return fresh;
    const parsed = JSON.parse(raw) as Partial<ShowcaseState>;

    /* Shape-checked rather than trusted. This is a string a user can edit, and
       it outlives any one version of the state — a field added next week is a
       field the stored copy won't have. Anything unrecognised falls back to
       the empty value for that key instead of failing the load. */
    return {
      ...fresh,
      workflows: Array.isArray(parsed.workflows) ? parsed.workflows : [],
      activity: Array.isArray(parsed.activity) ? parsed.activity : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
      facts: Array.isArray(parsed.facts) ? parsed.facts : [],
    };
  } catch {
    return fresh;
  }
}

let state: ShowcaseState = initial();

const listeners = new Set<() => void>();

function set(next: Partial<ShowcaseState>) {
  state = { ...state, ...next };
  persist();
  /* One hook for every workflow mutation, rather than a call in each of the
     five that exist. `scheduleSync` is debounced and compares against what was
     last sent, so a `set` that touched only the conversation costs a map
     lookup. */
  if (next.workflows) scheduleSync(state.accountEmail, state.workflows);
  /* Same hook, same reason: every write to the transcript reaches the sync
     without each of the four writers below having to remember to call it. The
     sync itself skips turns that are still streaming, so a `set` per delta
     costs a string compare rather than a request. */
  if (next.messages) scheduleThreadSync(state.threadId, state.messages);
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
    workflows: state.workflows.map((w) =>
      /* The first edit is what makes a blank workflow real — see `pending`.
         Cleared here rather than at each call site because every route into
         changing a workflow comes through this one function, including Craig's
         own edits, and a second place to remember would be a place to forget. */
      w.id === id ? { ...w, blocks, pending: undefined } : w,
    ),
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

/**
 * Throwing one away.
 *
 * Anybody given a seat is left alone. It reads like an oversight — delete the
 * workflow, delete the people it invited — but a person is not a detail of the
 * workflow that invited them: they were emailed, they have a start date, and
 * they exist at the company whether or not the plan that greeted them still
 * does. Tidying up a draft must not quietly un-hire somebody.
 *
 * Seats are the server's now, so this couldn't reach them if it wanted to —
 * which turns a rule somebody had to remember into one the code can't break.
 * `deleteJoiner` is the one deliberate way a seat goes away.
 *
 * The activity line stays too, for the same reason the seats do. It is a record
 * of what happened, and a history that edits itself to match the present is a
 * history you can't use to work out what went wrong.
 */
export function deleteWorkflow(id: string) {
  const workflow = state.workflows.find((w) => w.id === id);
  if (!workflow) return;

  set({ workflows: state.workflows.filter((w) => w.id !== id) });
  logActivity({
    verb: "Deleted",
    what: workflow.published
      ? `${workflow.name} — it stops running for anyone new`
      : workflow.name,
  });
}

/**
 * A workflow with nothing in it but the thing every workflow starts with.
 *
 * The other way in is a conversation, and it is the better one — Craig writes a
 * plan out of how the company actually works, which is not a thing anybody
 * arrives at by staring at an empty canvas. But it is not the only way somebody
 * legitimately wants to start. People who already know exactly what they want
 * do not want to be interviewed about it, and making them talk their way to a
 * blank page is a worse experience than handing them one.
 *
 * So: a trigger and nothing else, which is not really blank. The trigger isn't
 * a choice anywhere in this product, and starting somebody on a canvas with
 * genuinely nothing on it would open with a question that has one answer.
 *
 * `revealedAt` is set here rather than left for the editor. The reveal exists
 * so a draft you didn't watch get written assembles itself in front of you;
 * there is nothing to reveal about a workflow with one block that you just
 * asked for, and animating it in would be a flourish spent on nothing.
 */
export function createBlankWorkflow(): ShowcaseWorkflow {
  const now = new Date().toISOString();
  const workflow: ShowcaseWorkflow = {
    id: crypto.randomUUID(),
    name: "New workflow",
    blocks: [blankTrigger()],
    createdAt: now,
    revealedAt: now,
    pending: true,
  };

  /* Not `addWorkflow` — that one logs "Drafted … from what you told me",
     which is true of Craig's and a lie about this one. Nobody told anybody
     anything; they pressed a button. */
  set({ workflows: [...state.workflows, workflow] });
  logActivity({ verb: "Started", what: `${workflow.name} from blank` });

  return workflow;
}

/**
 * What this account did, in the order it did it.
 *
 * Written from wherever the thing happened rather than only from the writes
 * above, because not everything an account does changes this store any more:
 * inviting somebody writes a seat on the server, and a ledger that recorded
 * only the acts that happened to be client-side would be a history with the
 * most important line missing.
 */
export function logActivity(entry: { verb: string; what: string }) {
  set({
    activity: [
      { id: crypto.randomUUID(), when: "Just now", ...entry },
      ...state.activity,
    ],
  });
}

/**
 * Tie the browser's copy to the account that's signed in, clearing it if that
 * has changed.
 *
 * This replaces an `identify()` that filled in the account holder's row and was
 * never called by anything — People reads the session directly, so the row it
 * added was never needed. What *was* needed is the half it didn't do: noticing
 * when the person in front of it is somebody else.
 *
 * Signing up is a fetch followed by a client navigation, not a page load, so
 * module state survives it. Without this, a second account inherits the first
 * one's workflows and conversation — and Craig, handed a transcript addressed
 * to the previous account, keeps using that person's name. Seats need none of
 * it: they are the server's, and it already knows whose they are.
 *
 * Same account, or a re-render: nothing happens, so a page that renders twice
 * doesn't wipe the conversation it's showing.
 */
export function claimAccount(email: string | null) {
  if (state.accountEmail === email) return;

  /* Restored rather than merely cleared. Signing back in should find the
     workflow and the conversation where you left them; it's the *other*
     account's copy that must not be here, and reading this account's own is
     how both hold at once.
     
     The switch survives for the same reason `resetShowcase` keeps it: it says
     how the next test should run, not what happened in the last one. */
  state = email
    ? restore(email)
    : { ...initial(), simpleDraft: state.simpleDraft, accountEmail: null };
  listeners.forEach((l) => l());

  /* The other account's conversation must not be what the next push writes
     into. Same argument as `forgetSync` beside it. */
  forgetThreadSync();

  if (!email) {
    forgetSync();
    return;
  }

  /* The workflows this account has anywhere, not merely the ones this browser
     happens to remember. Without it, signing in on a second machine finds an
     empty store and Craig — seeing no workflows — starts onboarding somebody
     who has been using this for a week.

     Deliberately after the listeners have already been told about the local
     copy: the screen paints immediately from what is on this device and
     corrects itself a moment later, rather than waiting on the network to show
     anything at all. */
  void hydrate(email, state.workflows).then((merged) => {
    /* Guarded, because a hydrate is a fetch and somebody can sign out or switch
       accounts while it is in flight. Applying it then would drop one account's
       workflows into another's session. */
    if (!merged || state.accountEmail !== email) return;
    state = { ...state, workflows: merged };
    persist();
    listeners.forEach((l) => l());
  });
}

/* ---------------------------------------------------------------------- */
/*  The conversation                                                      */
/* ---------------------------------------------------------------------- */

/**
 * Show a conversation, replacing whatever was open.
 *
 * The two halves are set together on purpose. A thread id that arrives a render
 * before its messages is a screen showing the last conversation's turns under
 * the new one's heading, and the sync — which is keyed on the id — would push
 * them into the wrong thread.
 */
export function setThread(threadId: string, messages: CraigMessage[]) {
  if (state.threadId === threadId && messages === state.messages) return;
  /* What the server has been told belongs to the thread that has just been
     closed. Left in place, the first write to this one would send only the
     turns that happen to differ from the previous conversation's. */
  forgetThreadSync();
  set({ threadId, messages, ...clearedNotes() });
}

/**
 * The notes belong to the conversation, not to the account.
 *
 * `gaps` and `facts` are what Craig worked out *while talking to you*, and they
 * were global for as long as there was only one conversation to be in. With
 * threads that became wrong twice over: the strength meter beside a brand-new
 * discovery showed everything he had ever recorded, so it opened near full and
 * never moved; and the notes travel back to him each turn as "what you already
 * know", so he was handed another conversation's facts about another workflow
 * and answered as though he had been told them here.
 *
 * Cleared on every deliberate change of thread. Not restored, because they are
 * not stored per thread yet — that is a real gap and the honest state of it is
 * an empty meter that fills as you talk, rather than a full one describing a
 * conversation you are not having.
 */
const clearedNotes = () => ({ gaps: [], facts: [] });

/**
 * Attach the conversation already on screen to a thread that has just been made.
 *
 * The counterpart to `setThread`, and the reason it is separate: this one keeps
 * the messages. Home makes its god thread on the *first send* rather than on
 * arrival — so that opening Home and leaving does not litter the history with
 * empty conversations — which means by the time the id lands, a turn has
 * already been typed and is streaming. Replacing the transcript with the
 * server's (empty) copy at that moment would delete the sentence that caused
 * the thread to exist.
 *
 * Re-setting `messages` to the same array is deliberate: it is what tells `set`
 * a transcript write happened, so the turn in flight is pushed to the thread it
 * now belongs to rather than waiting for another one.
 */
export function adoptThread(threadId: string) {
  if (state.threadId === threadId) return;
  forgetThreadSync();
  set({ threadId, messages: state.messages });
}

/**
 * Put the screen back to a conversation that has not started.
 *
 * Home does this on arrival: a god thread is scoped to a moment, so coming back
 * is a new conversation rather than a continuation. The old one is not deleted
 * — it is in history, which is the whole point of it having been a thread.
 */
export function clearThread() {
  if (state.threadId === null && state.messages.length === 0) return;
  forgetThreadSync();
  set({ threadId: null, messages: [], ...clearedNotes() });
}

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
  /* The saved copy goes too, or the next load would put it all back — which is
     precisely what the button promises it won't. */
  if (typeof window !== "undefined" && state.accountEmail) {
    try {
      localStorage.removeItem(keyFor(state.accountEmail));
    } catch {}
  }
  /* And what the sync believes it has told the server, including the mark that
     says this browser has already rescued its local-only workflows. The server
     rows go with the account itself — `clearAccounts` cascades — so leaving the
     mark set would mean the next sign-up on this browser skipped a rescue it
     genuinely needs. */
  forgetSync(state.accountEmail);
  forgetThreadSync();
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
export function openWorkflow(
  id: string,
  /* Passed in rather than derived here, because half of it isn't in this
     store: whether Google Workspace is connected is a fact about the account
     that lives on the server. The screen holding both is the one that can say
     what is outstanding. */
  outstanding?: string[],
): OpenWorkflow | undefined {
  const workflow = state.workflows.find((w) => w.id === id);
  if (!workflow) return undefined;

  return {
    id: workflow.id,
    outstanding: outstanding?.length ? outstanding : undefined,
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
