"use client";

import * as React from "react";
import { ACTIVITY, type Activity, type ActivityKind } from "@/lib/craig-activity";

/**
 * What Craig has done, including just now.
 *
 * The fixture was a record of things that happened before you arrived. This
 * makes it the record of everything, which is what lets the conversation be
 * thrown away.
 *
 * That's the trade the whole design rests on. Craig's transcript is scaffolding
 * — she says "#general #engineering", he writes it into a block, and the block
 * is the record. But if leaving the page erased every trace that the exchange
 * happened, throwing the transcript away would read as losing something. It
 * doesn't, because the thing he did lands here, dated and linked, and shows up
 * in his next briefing.
 *
 * In-memory, same as the workflow store, and reset on reload for the same
 * reason.
 */

let log: Activity[] = [...ACTIVITY];

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => log;

export function useActivity() {
  return React.useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * Records something Craig just did.
 *
 * Newest first, because the brief shows the top few and "what he did a minute
 * ago" is the part worth the space. The fixture is ordered oldest-first for
 * reading, so this goes on the front rather than the back.
 */
export function logActivity(entry: {
  kind: ActivityKind;
  what: string;
  step?: string;
  who?: string;
}) {
  log = [{ id: crypto.randomUUID(), when: "Just now", ...entry }, ...log];
  listeners.forEach((l) => l());
}
