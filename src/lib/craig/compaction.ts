/**
 * Deciding what of a long conversation Craig still gets to see.
 *
 * No database and no `server-only`, for the reason `notebook-text.ts` gives:
 * the whole risk here is *where a list gets cut*, and a pure function is the
 * only version of that anybody can test. The turn that carries "we're twelve
 * people and fully remote" is either in front of him or it is not, and nothing
 * about the failure is visible — he simply asks again, or answers as though it
 * were never said.
 *
 * ## Why this replaces trimming rather than tuning it
 *
 * Craig kept the newest `MAX_MESSAGES` turns and dropped the rest. That is the
 * documented right technique for conversations whose useful context is *local*
 * — independent tasks, where turn forty owes nothing to turn three. Discovery
 * is the opposite shape: one interview toward a single goal, where the size of
 * the company, who does payroll and what nobody has written down are all said
 * early and load-bearing late. Trimming is the technique for the other job.
 *
 * So the recent turns stay verbatim and everything older is replaced by one
 * summary, written once and stored on the thread. Two costs, both accepted:
 * a summary can lose a detail, and a wrong detail in one persists. Against
 * that, the alternative currently loses *every* detail past the cut.
 */

import type { AgentInputItem } from "@openai/agents";

/**
 * How many turns of real conversation to keep verbatim.
 *
 * A turn is a user message and everything after it — Craig's reply, his tool
 * calls, their results — up to the next user message. Counting turns rather
 * than messages is what stops a cut landing between a tool call and its
 * result, which is a shape the model is entitled to reject.
 */
export const KEEP_TURNS = 8;

/**
 * How many turns may accumulate before any of it is summarised.
 *
 * Deliberately above `KEEP_TURNS`, so summarising is not a thing that happens
 * on every single turn once the threshold is passed: crossing the limit
 * compacts down to `KEEP_TURNS` and buys `LIMIT_TURNS - KEEP_TURNS` turns of
 * quiet before the next one. A limit equal to the keep count would mean a
 * model call per turn, forever.
 */
export const LIMIT_TURNS = 14;

/** The shadow question the stored summary is attached to. */
export const SUMMARY_PROMPT_TEXT = "Remind me what we have covered so far.";

const isUserTurn = (item: AgentInputItem): boolean =>
  "role" in item && item.role === "user";

/**
 * Where each turn begins.
 *
 * Exported because the summariser needs the same notion of a boundary the cut
 * uses — two different ideas of where a turn starts is how a summary comes to
 * describe turns that are also still present verbatim.
 */
export function turnStarts(items: AgentInputItem[]): number[] {
  return items.reduce<number[]>((starts, item, i) => {
    if (isUserTurn(item)) starts.push(i);
    return starts;
  }, []);
}

/**
 * The index everything before which should be summarised, or `null` to leave
 * the conversation alone.
 *
 * Returns the start of the earliest turn being *kept*, so the caller can slice
 * cleanly in both directions: `[0, boundary)` is summarised, `[boundary, end)`
 * survives word for word.
 */
export function compactionBoundary(
  items: AgentInputItem[],
  { keep = KEEP_TURNS, limit = LIMIT_TURNS } = {},
): number | null {
  const starts = turnStarts(items);
  if (starts.length <= limit) return null;

  const boundary = starts[starts.length - keep];

  /* Nothing before the first kept turn means nothing to summarise. Reachable
     when `keep` is at least the number of turns, and worth returning null for
     rather than producing an empty summary somebody has to read past. */
  return boundary > 0 ? boundary : null;
}

/**
 * The history to hand the model: a summary of what was dropped, then the
 * recent turns untouched.
 *
 * The summary goes back as a **question and an answer** rather than as a note
 * from nowhere. A bare assistant message describing a conversation that is not
 * in evidence reads, to the model, as something it said unprompted; asked for,
 * it reads as what it is. That the question was never typed costs nothing —
 * nobody sees this list.
 */
export function withSummary(
  kept: AgentInputItem[],
  summary: string,
): AgentInputItem[] {
  if (!summary.trim()) return kept;

  return [
    { role: "user", content: SUMMARY_PROMPT_TEXT },
    {
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: summary }],
    },
    ...kept,
  ];
}
