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
 * - **onboarding** — one per account, and it *graduates* rather than ending.
 *   See `graduateOnboarding`.
 *
 * The database enforces all three: partial unique indexes for the two that are
 * singular, nothing for the one that is not, and a check constraint tying
 * `kind = 'workflow'` to having a `workflow_id`. None of that is convention.
 */

type ThreadRow = Tables<"threads">;
type MessageRow = Tables<"messages">;

export type ThreadKind = "god" | "workflow" | "onboarding";

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: { url: string; title: string }[];
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
): Promise<{ thread: StoredThread; messages: StoredMessage[] } | null> {
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

  return { thread: toThread(row), messages: turns.map(toMessage) };
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

  /**
   * A first workflow inherits the onboarding conversation rather than starting
   * blank.
   *
   * Graduation is *also* fired explicitly when Craig's draft tool produces a
   * workflow, and that call is the fast path — it happens while the canvas is
   * still animating. But it is a fetch, and the editor mounts and asks for this
   * thread within a few hundred milliseconds of the same event. Whichever
   * arrived second used to lose: if the editor got here first it inserted an
   * empty thread, and the explicit graduation then found the slot taken and
   * silently did nothing, leaving the conversation that produced the workflow
   * orphaned as an `onboarding` row nothing would ever open again.
   *
   * Doing it here as well removes the race rather than narrowing it: the server
   * decides, at the one moment the answer is actually needed, and both paths
   * are idempotent. Whoever gets here first performs the flip and the other
   * finds it done.
   */
  const graduated = await graduateOnboarding(accountEmail, workflowId);
  if (graduated) return graduated;

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
 * The account's onboarding thread, made on first use.
 *
 * Only ever one, and only before there is a workflow — once `graduateOnboarding`
 * has run, the row's `kind` is no longer `onboarding` and this makes a fresh one
 * for an account starting over with nothing. That is correct: a second first
 * run is a second first conversation.
 */
export async function onboardingThread(
  accountEmail: string,
  id: string,
): Promise<StoredThread | null> {
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) return null;

  const existing = await db()
    .from("threads")
    .select()
    .eq("account_id", accountId)
    .eq("kind", "onboarding")
    .maybeSingle();
  if (existing.data) return toThread(existing.data);

  const { data, error } = await db()
    .from("threads")
    .insert({ id, account_id: accountId, kind: "onboarding" })
    .select()
    .maybeSingle();

  if (error) {
    const raced = await db()
      .from("threads")
      .select()
      .eq("account_id", accountId)
      .eq("kind", "onboarding")
      .maybeSingle();
    if (raced.data) return toThread(raced.data);
    throw new Error(`Opening the onboarding thread failed: ${error.message}`);
  }
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
 * The onboarding thread becomes the first workflow's thread.
 *
 * This is the answer to a question that was left open, and it is the one the
 * rest of the product already implied. The onboarding conversation *is* the
 * workflow's origin story: every step in that draft exists because of something
 * said in it. Abandoning it would mean opening the workflow you just spent a
 * conversation producing and finding an empty transcript beside it — and
 * `store.ts` had already argued, for the single-transcript design, that
 * discovery and editing are one conversation. They are. That was the half of
 * the old behaviour worth keeping.
 *
 * A flip rather than a copy: same row, same messages, `kind` and `workflow_id`
 * changed together. Copying the turns into a new thread would leave the same
 * sentences in two places with no way to say which was edited.
 *
 * Nothing happens if this account never had an onboarding thread, or if that
 * workflow already has one of its own — both are ordinary, and neither is worth
 * failing a draft over.
 */
export async function graduateOnboarding(
  accountEmail: string,
  workflowId: string,
): Promise<StoredThread | null> {
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) return null;

  const { data: onboarding } = await db()
    .from("threads")
    .select()
    .eq("account_id", accountId)
    .eq("kind", "onboarding")
    .maybeSingle();
  if (!onboarding) return null;

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
    .eq("id", onboarding.id)
    .eq("account_id", accountId)
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
export async function saveMessages(
  accountEmail: string,
  threadId: string,
  messages: { id: string; role: string; content: string; seq: number; sources?: unknown }[],
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
        seq: m.seq,
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
