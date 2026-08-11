import "server-only";

import type { AgentInputItem } from "@openai/agents";

import { accountIdFor } from "@/lib/craig/accounts";
import { compactionBoundary, withSummary } from "@/lib/craig/compaction";
import { saveSummary, storedSummary, summariseTurns } from "@/lib/craig/summarise";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Assembling the conversation Craig is actually shown.
 *
 * Two sources, because neither one is the whole story:
 *
 * - **The browser** holds the newest turns and is the only place the turn
 *   being answered right now exists — it has not been synced yet, and will not
 *   be until after this request. It is also trimmed to `MAX_MESSAGES`, so on a
 *   long conversation it is missing the beginning.
 * - **The database** holds everything that has settled, in order, and is
 *   missing only the last exchange or two when somebody replies fast.
 *
 * So the stored rows come first and the browser's list is laid over the end of
 * them. The join needs no id matching and no de-duplication, because of one
 * property: the browser's list is always a *suffix* of the conversation, and
 * the stored rows are always a *prefix*. Overlap is resolved by length alone —
 * whatever the browser still holds, it holds the most recent version of.
 */

/** A turn as stored, with the position the database gave it. */
interface StoredTurn {
  seq: number;
  role: string;
  content: string;
}

const asItem = (role: string, content: string): AgentInputItem =>
  role === "user"
    ? { role: "user", content }
    : {
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: content }],
      };

async function storedTurns(
  accountId: string,
  threadId: string,
): Promise<StoredTurn[]> {
  const { data } = await supabaseAdmin()
    .from("messages")
    .select("seq, role, content, threads!inner(account_id)")
    /* Joined and filtered on the thread's owner rather than checked
       afterwards, so a thread id belonging to somebody else returns nothing
       instead of returning rows that then have to be thrown away. */
    .eq("thread_id", threadId)
    .eq("threads.account_id", accountId)
    .order("seq", { ascending: true });

  return (data ?? []).map((row) => ({
    seq: Number(row.seq),
    role: String(row.role),
    content: String(row.content),
  }));
}

/**
 * The history for this turn: a summary of what is too old to show, then every
 * turn that is not.
 *
 * Falls back to `live` unchanged whenever anything is missing or fails — no
 * thread id, a thread that is not theirs, a summariser that is down. Craig
 * then behaves exactly as he did before any of this existed, which is the
 * right failure: a slightly forgetful assistant, not a broken one.
 */
export async function historyFor({
  accountEmail,
  threadId,
  live,
}: {
  accountEmail: string;
  threadId?: string;
  live: AgentInputItem[];
}): Promise<AgentInputItem[]> {
  if (!threadId) return live;

  try {
    const accountId = await accountIdFor(accountEmail);
    if (!accountId) return live;

    const stored = await storedTurns(accountId, threadId);
    if (stored.length === 0) return live;

    /* The stored rows the browser has already forgotten. Length is the whole
       calculation: `live` is the tail, so anything beyond its length, counting
       from the front, is what fell off. */
    const dropped = Math.max(0, stored.length - live.length);
    const full: AgentInputItem[] = [
      ...stored.slice(0, dropped).map((t) => asItem(t.role, t.content)),
      ...live,
    ];

    const boundary = compactionBoundary(full);
    if (boundary === null) return full;

    const { summary: previous, throughSeq } = await storedSummary(threadId);

    /* Which of the stored rows the summary on file already covers. Everything
       between there and the cut is what still needs describing — re-reading
       the whole prefix each time would pay for the same turns repeatedly and
       give the model a chance to lose a detail it had already recorded. */
    const covered = throughSeq
      ? stored.filter((t) => t.seq <= throughSeq).length
      : 0;

    if (boundary <= covered) return withSummary(full.slice(covered), previous ?? "");

    const summary = await summariseTurns(
      full.slice(covered, boundary),
      previous,
    );
    if (!summary) return full;

    /* Only cached when the cut lands on a turn that has actually been stored.
       Past that it is describing something with no durable position to record,
       and a summary whose watermark is a guess is worse than one recomputed. */
    if (boundary <= stored.length) {
      await saveSummary(accountId, threadId, summary, stored[boundary - 1].seq);
    }

    return withSummary(full.slice(boundary), summary);
  } catch {
    /* Memory is an improvement to a conversation, never a precondition for
       one. Nothing in here is allowed to be the reason somebody cannot talk to
       Craig. */
    return live;
  }
}
