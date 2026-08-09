"use client";

import type { CraigMessage } from "./store";

/**
 * Keeping a conversation and its durable copy in step.
 *
 * The same shape as `workflow-sync.ts` and for the same reason: the browser
 * stays the author. It mints the turn ids, streams the answer into its own copy
 * and renders from that, because a round trip in front of Craig writing a
 * sentence is the one latency this product cannot afford. This module is what
 * stops that copy being the only one.
 *
 * The differences from the workflow sync are both about streaming:
 *
 * **Only settled turns are sent.** A message still being streamed into changes
 * on every frame, and pushing it would be a request per token for a row that is
 * about to be replaced anyway. The turn lands the moment the stream finishes,
 * which is the first point at which what is stored is what was actually said.
 *
 * **Nothing is ever removed.** A transcript is append-only — turns are not
 * deleted, and a thread that goes away takes its messages with it by cascade.
 * So there is no counterpart to the workflow sync's `remove`.
 */

/** Long enough to swallow a burst of deltas settling, short enough to survive a
    closed tab. */
const PUSH_DELAY_MS = 700;

/** What the server was last told, so an unchanged turn isn't re-sent. */
let pushed = new Map<string, string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: { threadId: string; messages: CraigMessage[] } | null = null;

const serialise = (m: CraigMessage) =>
  JSON.stringify([m.role, m.content, m.sources ?? null]);

/**
 * Ask the server for the thread to use, minting the id here.
 *
 * The id is the browser's, like a workflow's, so a screen can render against it
 * before the round trip lands. For the two singular kinds the server may hand
 * back a *different* thread — the one that already exists — and that answer is
 * the authority.
 */
export async function openThread(
  kind: "god" | "workflow" | "onboarding",
  options: {
    workflowId?: string;
    from?: { threadId: string; messageId?: string };
  } = {},
): Promise<{ id: string; messages: CraigMessage[] } | null> {
  const id = crypto.randomUUID();
  try {
    const response = await fetch("/api/showcase/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ open: { kind, id, ...options } }),
    });
    if (!response.ok) return null;

    const body = (await response.json()) as { thread?: { id?: string } };
    const threadId = body.thread?.id;
    if (!threadId) return null;

    /* A brand-new thread has nothing to read, and asking anyway would put a
       second round trip in front of the first message. Anything else is one we
       were handed rather than given — the workflow's existing conversation,
       say — and its turns are the point. */
    const messages = threadId === id ? [] : await readThread(threadId);
    seed(messages);
    return { id: threadId, messages };
  } catch {
    /* Offline, or the route is unreachable. The screen carries on with a local
       conversation; the next open retries. */
    return null;
  }
}

/** One thread's turns, for opening it or picking it out of history. */
export async function readThread(threadId: string): Promise<CraigMessage[]> {
  try {
    const response = await fetch(
      `/api/showcase/threads?id=${encodeURIComponent(threadId)}`,
    );
    if (!response.ok) return [];
    const body = (await response.json()) as { messages?: CraigMessage[] };
    const messages = Array.isArray(body.messages) ? body.messages : [];
    /* Nothing read back is still arriving: there is no request running to
       append to it, whatever it looked like when the tab closed. */
    return messages.map((m) => ({ ...m, streaming: false }));
  } catch {
    return [];
  }
}

/** What this account has said, newest first. Home's history list. */
export async function listThreads(kind?: "god" | "workflow" | "onboarding") {
  try {
    const response = await fetch(
      `/api/showcase/threads${kind ? `?kind=${kind}` : ""}`,
    );
    if (!response.ok) return [];
    const body = (await response.json()) as {
      threads?: {
        id: string;
        kind: string;
        title?: string;
        lastMessageAt: string;
        workflowId?: string;
      }[];
    };
    return Array.isArray(body.threads) ? body.threads : [];
  } catch {
    return [];
  }
}

/**
 * The onboarding conversation becoming the drafted workflow's own.
 *
 * Fired when Craig's draft tool produces a workflow. Silent about failing: a
 * conversation that does not follow its workflow is a worse product and not a
 * broken one, and surfacing it would put a network error in front of somebody
 * watching their first workflow get built.
 */
export async function graduate(workflowId: string): Promise<void> {
  try {
    await fetch("/api/showcase/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ graduate: { workflowId } }),
    });
  } catch {
    /* See above. */
  }
}

/** Seeded from what was just read, so the first push sends only what changed. */
function seed(messages: CraigMessage[]) {
  pushed = new Map(messages.map((m) => [m.id, serialise(m)]));
}

/**
 * Note the conversation and push whatever settled, shortly.
 *
 * Called from the store's `set`, so every write reaches it without each caller
 * having to remember. Cheap when nothing changed: a string compare per turn.
 */
export function scheduleThreadSync(
  threadId: string | null,
  messages: CraigMessage[],
) {
  if (!threadId) return;
  pending = { threadId, messages };

  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, PUSH_DELAY_MS);
}

function flush() {
  timer = null;
  if (!pending) return;
  const { threadId, messages } = pending;
  pending = null;

  /* Paired with its index before filtering, because `seq` is the turn's
     position in the *whole* transcript — looked up afterwards, an unsettled
     turn earlier in the list would shift every position after it. */
  const save = messages
    .map((m, seq) => ({ m, seq }))
    .filter(
      ({ m }) =>
        /* Settled only. A turn still being written into changes every frame,
           and pushing it would be a request per token for a row about to be
           replaced. It lands when the stream finishes, which is the first point
           at which what is stored is what was actually said. */
        !m.streaming &&
        m.content.trim() !== "" &&
        pushed.get(m.id) !== serialise(m),
    );
  if (save.length === 0) return;

  /* The first thing anybody typed, which is what they came to ask. Titled from
     that rather than from anything Craig generated: it is already written, and
     a title that costs a model call is one that sometimes fails to arrive. */
  const opener = messages.find((m) => m.role === "user")?.content;

  /* Recorded as sent before the request resolves. A failed push is retried by
     the next turn rather than by a queue — this is a cache of a document the
     browser still holds, not an outbox of events that would be lost. */
  for (const { m } of save) pushed.set(m.id, serialise(m));

  void send(threadId, {
    messages: save.map(({ m, seq }) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      seq,
      sources: m.sources,
    })),
    title: opener,
  });
}

async function send(
  threadId: string,
  payload: { messages: unknown[]; title?: string },
) {
  try {
    await fetch("/api/showcase/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId, ...payload }),
    });
  } catch {
    /* Swallowed on purpose. Losing a sync costs the *other* device a stale view
       until the next turn; surfacing it would put a network error in front of
       somebody who is mid-sentence with Craig and whose own screen is
       completely correct. */
  }
}

/** Forget what the server has been told. For sign-out, and switching threads. */
export function forgetThreadSync() {
  pushed = new Map();
  pending = null;
  if (timer) clearTimeout(timer);
  timer = null;
}
