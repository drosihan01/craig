"use client";

import type { ShowcaseWorkflow } from "./store";

/**
 * Keeping the browser's workflows and the server's in step.
 *
 * The browser stays the author — it mints ids, applies edits locally and
 * renders from its own copy, because a round trip in front of Craig drafting a
 * workflow is the one latency this product cannot afford. This module is what
 * makes that copy stop being the *only* copy.
 *
 * Two directions, and they are not symmetrical:
 *
 * **Down, once per account.** On arrival the server's workflows win, because
 * they are the ones every device can see. The exception is the first time a
 * given browser syncs a given account — see `hydrate` below, which is what
 * rescues work made before any of this existed.
 *
 * **Up, debounced.** Every local change is pushed a beat later. Debounced
 * rather than immediate because block edits arrive in bursts while somebody
 * drags things around, and a request per keystroke would be a request per
 * keystroke.
 */

const SYNCED_KEY = (email: string) => `craig-synced:${email}`;

/** Long enough to swallow a drag, short enough to survive a closed tab. */
const PUSH_DELAY_MS = 800;

/** What the server was last told, so an unchanged workflow isn't re-sent. */
let pushed = new Map<string, string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: { email: string; workflows: ShowcaseWorkflow[] } | null = null;

const serialise = (w: ShowcaseWorkflow) =>
  JSON.stringify([w.name, w.blocks, w.published ?? false, w.revealedAt ?? null]);

/**
 * Everything this account has, with the local-only ones rescued exactly once.
 *
 * The first time a browser syncs an account it may be holding workflows the
 * server has never heard of — everything made before workflows were persisted
 * at all. Those get pushed up rather than discarded, which is the whole
 * migration: somebody's existing work appears on their other devices the next
 * time they open the browser that made it.
 *
 * After that first pass the server is simply right. A workflow that is local
 * and not remote is one that was deleted on another device, and resurrecting it
 * would make deleting anything impossible from more than one machine.
 */
export async function hydrate(
  email: string,
  local: ShowcaseWorkflow[],
): Promise<ShowcaseWorkflow[] | null> {
  let remote: ShowcaseWorkflow[];
  try {
    const response = await fetch("/api/showcase/workflows");
    if (!response.ok) return null;
    const body = (await response.json()) as { workflows?: ShowcaseWorkflow[] };
    remote = Array.isArray(body.workflows) ? body.workflows : [];
  } catch {
    /* Offline, or the route is unreachable. The local copy is still perfectly
       usable — this returns null so the caller leaves state alone rather than
       emptying somebody's screen because a fetch failed. */
    return null;
  }

  const firstTime =
    typeof localStorage !== "undefined" &&
    localStorage.getItem(SYNCED_KEY(email)) === null;

  const remoteIds = new Set(remote.map((w) => w.id));
  const strays = firstTime ? local.filter((w) => !remoteIds.has(w.id)) : [];

  const merged = [...remote, ...strays].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  /* Seeded from what we just read, so the first push after hydrating sends only
     what has actually changed since — not the entire account back again. */
  pushed = new Map(merged.map((w) => [w.id, serialise(w)]));

  if (strays.length > 0) {
    void send(email, { save: strays, remove: [] });
    /* Deliberately after the send is fired rather than after it lands. If it
       fails, the mark is still set and those workflows stay local — which is
       the same place they already were, and better than a rescue that runs
       again on every load. The next edit to one of them pushes it anyway. */
  }
  try {
    localStorage.setItem(SYNCED_KEY(email), new Date().toISOString());
  } catch {
    /* Storage refused. Worst case the rescue runs again next time, which is
       idempotent — an upsert by id. */
  }

  return merged;
}

/**
 * Note the current workflows and push whatever changed, shortly.
 *
 * Called from the store's `set`, so every workflow mutation reaches it without
 * five call sites having to remember to. Cheap when nothing changed: the
 * comparison is a string compare against what was last sent.
 */
export function scheduleSync(email: string | null, workflows: ShowcaseWorkflow[]) {
  if (!email) return;
  pending = { email, workflows };

  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, PUSH_DELAY_MS);
}

function flush() {
  timer = null;
  if (!pending) return;
  const { email, workflows } = pending;
  pending = null;

  const save = workflows.filter((w) => pushed.get(w.id) !== serialise(w));
  const live = new Set(workflows.map((w) => w.id));
  const remove = [...pushed.keys()].filter((id) => !live.has(id));

  if (save.length === 0 && remove.length === 0) return;

  /* Recorded as sent before the request resolves. A failed push is retried by
     the next edit rather than by a queue — this is a cache of a document the
     browser still holds, not an outbox of events that would be lost. */
  for (const w of save) pushed.set(w.id, serialise(w));
  for (const id of remove) pushed.delete(id);

  void send(email, { save, remove });
}

async function send(
  email: string,
  payload: { save: ShowcaseWorkflow[]; remove: string[] },
) {
  try {
    await fetch("/api/showcase/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    /* Swallowed on purpose. Losing a sync costs the *other* device a stale
       view until the next edit; surfacing it would put a network error in
       front of somebody who is mid-sentence with Craig and whose own screen is
       completely correct. */
  }
}

/** Forget what the server has been told. For sign-out and the sandbox reset. */
export function forgetSync(email?: string | null) {
  pushed = new Map();
  pending = null;
  if (timer) clearTimeout(timer);
  timer = null;
  if (email) {
    try {
      localStorage.removeItem(SYNCED_KEY(email));
    } catch {}
  }
}
