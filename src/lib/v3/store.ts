"use client";

import * as React from "react";
import type { ActivityEntry, Certainty, WorkflowBlock } from "@/components/ui";
import { V3_BLOCKS } from "@/lib/v3/workflow";
import { V3_RUN_STEPS, type V3RunStep } from "@/lib/v3/run";
import { V3_STARTER } from "@/lib/v3/company";

/**
 * All of demo v3's mutable state, in one place.
 *
 * The flow crosses six pages and has to survive every one of them: the answer
 * Theo gives in the builder has to still be true when he looks at Priya's
 * progress two screens later, and the play button has to be able to drive the
 * whole thing without each page resetting what the last one did.
 *
 * `useSyncExternalStore`, same idiom as the workflow store and the shell — it
 * keeps this out of an effect, which React 19 is right to complain about.
 *
 * In-memory. Reloading starts the demo over, which is what you want from a
 * demo; the reset button does the same thing deliberately.
 */

export type Scene =
  | "signup"
  | "setup"
  | "building"
  | "builder"
  | "published"
  | "invited"
  | "progress"
  | "celebrate"
  | "paywall"
  | "done";

interface V3State {
  scene: Scene;
  /** How far through the setup conversation we are. */
  turn: number;
  /** What Craig is doing right now in the conversation, or null. */
  thinking: string | null;
  /** What's in the composer. Typed into, by a person or by the director. */
  draft: string;
  /** The workflow as it stands, including anything Theo has answered. */
  blocks: WorkflowBlock[];
  published: boolean;
  /** Set once he's invited Priya. */
  seatTaken: boolean;
  run: V3RunStep[];
  /** Craig's running commentary on the instance, newest first. */
  feed: ActivityEntry[];
  /** True while the play button is driving. */
  playing: boolean;
}

const initial = (): V3State => ({
  scene: "signup",
  turn: 0,
  thinking: null,
  draft: "",
  blocks: V3_BLOCKS.map((b) => ({ ...b, config: { ...b.config } })),
  published: false,
  seatTaken: false,
  run: V3_RUN_STEPS.map((s) => ({ ...s })),
  feed: [],
  playing: false,
});

let state: V3State = initial();

const listeners = new Set<() => void>();

function set(next: Partial<V3State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => state;

export function useV3() {
  return React.useSyncExternalStore(subscribe, snapshot, snapshot);
}

/* ---------------------------------------------------------------------- */
/*  Writes                                                                */
/* ---------------------------------------------------------------------- */

export const setScene = (scene: Scene) => set({ scene });
export const setPlaying = (playing: boolean) => set({ playing });
export const setTurn = (turn: number) => set({ turn });
export const setThinking = (thinking: string | null) => set({ thinking });
export const setDraft = (draft: string) => set({ draft });

let typing: number | null = null;

/**
 * Put words in the composer the way a person would.
 *
 * The demo was skipping this: a reply appeared as a finished message and the
 * composer sat there unused, which quietly says the box is decorative. Watching
 * the text land in it is most of what makes the screen read as a conversation
 * you're having rather than a transcript you're being shown.
 *
 * Fixed duration rather than fixed speed. Theo's opening message is seven
 * hundred characters and his later ones are two hundred; at a constant
 * per-character rate the first would take twelve seconds and the rest would
 * feel like a different person typing.
 */
export function typeDraft(text: string, ms = 1600) {
  if (typing) clearInterval(typing);
  const frames = 34;
  const step = Math.ceil(text.length / frames);
  let i = 0;
  set({ draft: "" });
  typing = window.setInterval(() => {
    i += step;
    if (i >= text.length) {
      set({ draft: text });
      if (typing) clearInterval(typing);
      typing = null;
      return;
    }
    set({ draft: text.slice(0, i) });
  }, ms / frames);
}

export function stopTyping() {
  if (typing) clearInterval(typing);
  typing = null;
}

export function answerBlock(
  id: string,
  config: Record<string, string | string[]>,
) {
  set({
    blocks: state.blocks.map((b) =>
      b.id === id
        ? /* The flagged gap goes too. It described what was missing, and it
             isn't missing any more. */
          { ...b, config: { ...b.config, ...config }, incomplete: undefined }
        : b,
    ),
  });
}

export const publish = () => set({ published: true, scene: "published" });

export function inviteStarter() {
  set({ seatTaken: true, scene: "invited" });
  logBeat(
    `Invited ${V3_STARTER.name.split(" ")[0]} and started her police check the same second — it's the only step with a lead time you can't make up later.`,
  );
}

export function advanceRun(
  step: string,
  status: V3RunStep["status"],
  certainty?: Certainty,
) {
  set({
    run: state.run.map((s) =>
      s.id === step ? { ...s, status, certainty, waitingOn: undefined } : s,
    ),
  });
}

export function logBeat(what: string) {
  set({
    feed: [{ id: crypto.randomUUID(), what, when: "Just now" }, ...state.feed],
  });
}

export const resetV3 = () => {
  stopTyping();
  state = initial();
  listeners.forEach((l) => l());
};

/* ---------------------------------------------------------------------- */
/*  Derived                                                               */
/* ---------------------------------------------------------------------- */

/** Steps Craig couldn't work out on his own. Drives the publish gate. */
export const openBlocks = (blocks: WorkflowBlock[]) =>
  blocks.filter((b) => Boolean(b.incomplete));

export const runDone = (run: V3RunStep[]) =>
  run.filter((s) => s.status === "complete").length;

export const runComplete = (run: V3RunStep[]) =>
  run.every((s) => s.status === "complete");
