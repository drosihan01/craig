import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/types";

/**
 * Conversations, and which one you are in.
 *
 * Craig held exactly one transcript before this. It lived in the browser and
 * every screen wrote to it, so asking after a new starter on Home appended to
 * the same conversation that had built a workflow last week — and the model was
 * handed both as though they were one train of thought. `store.ts` argued for
 * that deliberately, and the argument was right about the thing it was solving:
 * discovery and editing genuinely are one conversation. It was wrong that
 * *every* pair of screens is.
 *
 * Three kinds, and the difference between them is what a thread is scoped to:
 *
 * - **god** — many per account, ChatGPT-shaped. Scoped to a *moment*. Arriving
 *   Home starts a fresh one; last night's is in history rather than in your
 *   face, because "what's outstanding" on Tuesday is not a follow-up to
 *   Monday's version of the same question.
 * - **workflow** — one per workflow, forever. Scoped to a *thing*. Coming back
 *   to a workflow after a month should find the conversation that built it,
 *   which is the whole reason it is not a moment.
 * - **draft** — a conversation whose purpose is producing a workflow. As many
 *   as somebody starts, each beginning empty, and each *graduating* into the
 *   workflow it produced rather than ending. See `graduateThread`.
 *
 *   It was `onboarding`, one per account, until that met somebody building a
 *   second workflow: get-or-create handed them the account's original first-run
 *   conversation, and Craig carried on discussing a company they had finished
 *   describing weeks earlier. A first run is a draft conversation that happened
 *   to be first, which is not a category of its own.
 *
 * The database enforces all three: partial unique indexes for the two that are
 * singular, nothing for the one that is not, and a check constraint tying
 * `kind = 'workflow'` to having a `workflow_id`. None of that is convention.
 */

type ThreadRow = Tables<"threads">;
type MessageRow = Tables<"messages">;

export type ThreadKind = "god" | "workflow" | "draft";

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: { url: string; title: string }[];
}

/**
 * Something Craig wrote down mid-conversation — a gap or a fact.
 *
 * Durable because the conversation is: these are what the strength meter
 * measures and what travels back to him each turn as "what you already know",
 * and while they lived only in the browser a reload silently lobotomised him.
 * They ride the thread row, so graduation carries them into the workflow's
 * conversation for free and deleting a thread deletes what it learned.
 */
export interface StoredNote {
  kind: "gap" | "fact";
  text: string;
}

export interface StoredThread {
  id: string;
  kind: ThreadKind;
  workflowId?: string;
  title?: string;
  createdAt: string;
  lastMessageAt: string;
  /** The conversation this one continues, if it was handed over from another. */
  parentThreadId?: string;
  parentMessageId?: string;
}

const db = () => supabaseAdmin();
const normalise = (email: string) => email.trim().toLowerCase();

function toThread(row: ThreadRow): StoredThread {
  return {
    id: row.id,
    kind: row.kind as ThreadKind,
    workflowId: row.workflow_id ?? undefined,
    title: row.title ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
    lastMessageAt: new Date(row.last_message_at).toISOString(),
    parentThreadId: row.parent_thread_id ?? undefined,
    parentMessageId: row.parent_message_id ?? undefined,
  };
}

function toMessage(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    role: row.role === "user" ? "user" : "assistant",
    content: row.content,
    sources: Array.isArray(row.sources)
      ? (row.sources as unknown as { url: string; title: string }[])
      : undefined,
  };
}

/** The account's row id, or null because there isn't one. */
async function accountIdFor(email: string): Promise<string | null> {
  const { data, error } = await db()
    .from("accounts")
    .select("id")
    .eq("email", normalise(email))
    .maybeSingle();
  if (error) throw new Error(`Looking up the account failed: ${error.message}`);
  return data?.id ?? null;
}

/**
 * Every thread this account has, newest conversation first.
 *
 * What Home's history reads. Ordered by `last_message_at` rather than
 * `created_at`, because a thread you replied to this morning is more use to you
 * than one you opened last week and abandoned.
 */
export async function listThreads(
  accountEmail: string,
  kind?: ThreadKind,
): Promise<StoredThread[]> {
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) return [];

  let query = db()
    .from("threads")
    .select()
    .eq("account_id", accountId)
    .order("last_message_at", { ascending: false });
  if (kind) query = query.eq("kind", kind);

  const { data, error } = await query;
  if (error) throw new Error(`Listing threads failed: ${error.message}`);
  return data.map(toThread);
}

/**
 * One thread's turns, oldest first.
 *
 * Scoped through the account rather than taken on trust, so a caller holding
 * somebody else's thread id reads nothing rather than reading theirs. The id is
 * a UUID minted in a browser, which makes guessing one impractical rather than
 * impossible — and "impractical" is not the standard a read of somebody's
 * conversation should be held to.
 */
export async function readThread(
  accountEmail: string,
  threadId: string,
): Promise<{
  thread: StoredThread;
  messages: StoredMessage[];
  notes: StoredNote[];
} | null> {
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) return null;

  const { data: row, error } = await db()
    .from("threads")
    .select()
    .eq("id", threadId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw new Error(`Reading the thread failed: ${error.message}`);
  if (!row) return null;

  const { data: turns, error: turnsError } = await db()
    .from("messages")
    .select()
    .eq("thread_id", threadId)
    .order("seq", { ascending: true })
    .order("id", { ascending: true });
  if (turnsError)
    throw new Error(`Reading the transcript failed: ${turnsError.message}`);

  const { data: noted, error: notesError } = await db()
    .from("thread_notes")
    .select("kind, text")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (notesError)
    throw new Error(`Reading the notes failed: ${notesError.message}`);

  return {
    thread: toThread(row),
    messages: turns.map(toMessage),
    notes: noted.map((n) => ({
      kind: n.kind === "gap" ? ("gap" as const) : ("fact" as const),
      text: n.text,
    })),
  };
}

/**
 * Write the conversation's notes, keeping only what is new.
 *
 * The client re-sends its whole note list on every flush — the list is small
 * and append-only, and "send what changed" bookkeeping on the client is how a
 * note recorded during a dropped sync never arrives. So the diff happens here,
 * against what the thread already has, and the unique index stands behind it:
 * two flushes racing on the same new note resolve to one row and one harmless
 * duplicate-key error, which is swallowed because the note *is* stored, which
 * is all the caller ever asked.
 *
 * Scoped through the account like every other write in this file: a caller
 * holding somebody else's thread id writes nothing.
 */
export async function saveNotes(
  accountEmail: string,
  threadId: string,
  notes: StoredNote[],
): Promise<void> {
  if (notes.length === 0) return;
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) return;

  const { data: owned } = await db()
    .from("threads")
    .select("id")
    .eq("id", threadId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!owned) return;

  const { data: existing, error: readError } = await db()
    .from("thread_notes")
    .select("kind, text")
    .eq("thread_id", threadId);
  if (readError)
    throw new Error(`Reading the notes failed: ${readError.message}`);

  const seen = new Set(existing.map((n) => `${n.kind}\u0000${n.text}`));
  const fresh = notes.filter((n) => !seen.has(`${n.kind}\u0000${n.text}`));
  if (fresh.length === 0) return;

  const { error } = await db()
    .from("thread_notes")
    .insert(
      fresh.map((n) => ({ thread_id: threadId, kind: n.kind, text: n.text })),
    );
  /* 23505 is the unique index catching a racing flush that inserted the same
     note first. The note exists; that is success wearing an error code. */
  if (error && error.code !== "23505") {
    throw new Error(`Saving the notes failed: ${error.message}`);
  }
}

/**
 * The thread for a workflow, made if this is the first time it is asked for.
 *
 * Get-or-create rather than create-on-draft, because a workflow can arrive
 * without a conversation ever having happened — a blank one started from the
 * button, or a draft opened on a second machine. The unique index means two
 * tabs racing produce one thread rather than two, and the loser reads what the
 * winner wrote instead of failing.
 */
export async function threadForWorkflow(
  accountEmail: string,
  workflowId: string,
  id: string,
): Promise<StoredThread | null> {
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) return null;

  const existing = await db()
    .from("threads")
    .select()
    .eq("account_id", accountId)
    .eq("workflow_id", workflowId)
    .maybeSingle();
  if (existing.data) return toThread(existing.data);

  const { data, error } = await db()
    .from("threads")
    .insert({
      id,
      account_id: accountId,
      kind: "workflow",
      workflow_id: workflowId,
    })
    .select()
    .maybeSingle();

  /* The other tab won. Its thread is the right answer and this one is a
     duplicate that was correctly refused, so read rather than throw. */
  if (error) {
    const raced = await db()
      .from("threads")
      .select()
      .eq("account_id", accountId)
      .eq("workflow_id", workflowId)
      .maybeSingle();
    if (raced.data) return toThread(raced.data);
    throw new Error(`Opening the workflow's thread failed: ${error.message}`);
  }
  return data ? toThread(data) : null;
}

/**
 * A new workflow-building conversation, always empty, always new.
 *
 * Create rather than get-or-create, and that is the fix rather than a
 * simplification. This was `onboardingThread`, one per account: the second time
 * anybody opened the builder they were handed the first run's transcript, and
 * Craig answered a question about a new role by continuing a discussion about
 * the company somebody had described the first time.
 *
 * Nothing is lost by starting fresh. The old conversation graduated into the
 * workflow it produced and is reachable from that workflow, which is where
 * somebody looking for it would go.
 */
export async function startDraftThread(
  accountEmail: string,
  id: string,
  /* The Home conversation this was handed over from, when Craig offered the
     door rather than the person navigating there themselves. Recorded, never
     copied — see `parent_thread_id` in the migration. */
  parentThreadId?: string,
): Promise<StoredThread | null> {
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) return null;

  const { data, error } = await db()
    .from("threads")
    .insert({
      id,
      account_id: accountId,
      kind: "draft",
      parent_thread_id: parentThreadId ?? null,
    })
    .select()
    .maybeSingle();
  if (error) throw new Error(`Starting the draft failed: ${error.message}`);
  return data ? toThread(data) : null;
}

/**
 * A new conversation on Home.
 *
 * Made rather than resumed, because a god thread is scoped to a moment. The
 * parent is recorded when one exists and nothing is copied out of it — see
 * `handOff` for why.
 */
export async function startGodThread(
  accountEmail: string,
  id: string,
  from?: { threadId: string; messageId?: string },
): Promise<StoredThread | null> {
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) return null;

  const { data, error } = await db()
    .from("threads")
    .insert({
      id,
      account_id: accountId,
      kind: "god",
      parent_thread_id: from?.threadId ?? null,
      parent_message_id: from?.messageId ?? null,
    })
    .select()
    .maybeSingle();
  if (error) throw new Error(`Starting a conversation failed: ${error.message}`);
  return data ? toThread(data) : null;
}

/**
 * The conversation that produced a workflow becomes that workflow's own.
 *
 * Every step in a draft exists because of something said in the turns above it,
 * so opening the workflow and finding an empty transcript beside it would throw
 * away the only record of why it looks like that. A flip of the same row —
 * `kind` and `workflow_id` together — never a copy: copying the turns would
 * leave the same sentences in two places with no way to say which was edited.
 *
 * Takes the thread *by id*. It used to take the account and find "the"
 * onboarding thread, which worked precisely while there could only be one of
 * those and became a coin toss the moment there could be several. The caller
 * always knows which conversation it is in; asking the database to guess was
 * the mistake.
 *
 * Silent about a thread that is already a workflow's, or belongs to somebody
 * else, or has gone: all three are ordinary, and none is worth failing a draft
 * over.
 */
export async function graduateThread(
  accountEmail: string,
  threadId: string,
  workflowId: string,
): Promise<StoredThread | null> {
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) return null;

  const { data: taken } = await db()
    .from("threads")
    .select("id")
    .eq("account_id", accountId)
    .eq("workflow_id", workflowId)
    .maybeSingle();
  if (taken) return null;

  const { data, error } = await db()
    .from("threads")
    .update({ kind: "workflow", workflow_id: workflowId })
    .eq("id", threadId)
    .eq("account_id", accountId)
    .eq("kind", "draft")
    .select()
    .maybeSingle();
  if (error)
    throw new Error(`Handing the conversation over failed: ${error.message}`);
  return data ? toThread(data) : null;
}

/**
 * Write a batch of turns, replacing each whole.
 *
 * The browser is the author here for the same reason it is for workflows: a
 * round trip in front of Craig recording a fact mid-sentence is the one latency
 * this product cannot afford. So turns are minted, streamed into and rendered
 * locally, and this is the durable copy that lands a beat later.
 *
 * Whole-row upsert rather than appending deltas. An assistant turn is rewritten
 * as it streams, so "insert once, then patch" would be two write paths for one
 * object; and the browser is holding the finished text either way.
 *
 * `seq` is the turn's index in the transcript, which is what order means here.
 * Timestamps cannot do it — `beginTurn` writes the question and the empty answer
 * in the same millisecond.
 */
/**
 * Store a batch of settled turns.
 *
 * **No `seq` is written.** The column defaults from a sequence, so a row takes
 * its position when it is first inserted and keeps it forever: absent from the
 * payload, `seq` is neither in the insert column list nor in the conflict
 * update, so re-storing an edited turn cannot move it. The browser used to
 * supply the position and could not do it correctly — it numbers from a list
 * it trims, so past `MAX_MESSAGES` every index shifts and a new turn is
 * numbered over an older one.
 *
 * What this does rely on: the batch arriving in conversation order, since that
 * is the order the sequence is drawn in.
 */
export async function saveMessages(
  accountEmail: string,
  threadId: string,
  messages: { id: string; role: string; content: string; sources?: unknown }[],
): Promise<void> {
  if (messages.length === 0) return;
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) return;

  /* Scoped, so a caller cannot write turns into a thread that is not theirs by
     knowing an id. */
  const { data: owned } = await db()
    .from("threads")
    .select("id")
    .eq("id", threadId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!owned) return;

  const { error } = await db()
    .from("messages")
    .upsert(
      messages.map((m) => ({
        id: m.id,
        thread_id: threadId,
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
        sources: (m.sources ?? null) as Json,
      })),
      { onConflict: "id" },
    );
  if (error) throw new Error(`Saving the transcript failed: ${error.message}`);

  /* What the history list sorts on, so a thread rises the moment it is used
     rather than the moment it was made. */
  await db()
    .from("threads")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", threadId)
    .eq("account_id", accountId);
}

/**
 * Give a thread a name, once there is enough said to name it.
 *
 * Titled from the first thing the person typed rather than from anything Craig
 * generated: it is what they came to ask, it is already written, and a title
 * that costs a model call is a title that sometimes fails to arrive.
 */
export async function titleThread(
  accountEmail: string,
  threadId: string,
  title: string,
): Promise<void> {
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) return;

  const trimmed = title.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!trimmed) return;

  await db()
    .from("threads")
    .update({ title: trimmed })
    .eq("id", threadId)
    .eq("account_id", accountId)
    .is("title", null);
}
