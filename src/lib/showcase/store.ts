"use client";

import * as React from "react";
import type { WorkflowBlock } from "@/components/ui";
import type { ActivityEntry } from "@/components/ui";

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
}

export interface ShowcaseWorkflow {
  id: string;
  name: string;
  blocks: WorkflowBlock[];
  /** Set when Craig drafted it, so the UI can say where it came from. */
  draftedBy?: string;
  createdAt: string;
  published?: boolean;
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

export const resetShowcase = () => {
  state = initial();
  listeners.forEach((l) => l());
};

/* ---------------------------------------------------------------------- */
/*  Derived                                                               */
/* ---------------------------------------------------------------------- */

/** True until the account holder has done anything. Drives first-run screens. */
export const isUntouched = (s: ShowcaseState) =>
  s.workflows.length === 0 && s.people.length <= 1 && s.activity.length === 0;

export const invited = (s: ShowcaseState) => s.people.filter((p) => !p.owner);
