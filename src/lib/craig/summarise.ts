import "server-only";

import { Agent, run } from "@openai/agents";
import type { AgentInputItem } from "@openai/agents";

import { CHAT_MODEL } from "@/lib/craig/craig-prompt";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Compressing the part of a conversation Craig can no longer be shown.
 *
 * Written once and stored on the thread. The alternative — summarising on
 * every request past the threshold — costs a model call per turn to save
 * tokens on the same turn, which is a trade that only ever loses.
 *
 * ## The prompt is not a support handover, and that matters
 *
 * The obvious template for this is the customer-support one: device, symptom,
 * steps tried, current blocker. It is the wrong shape here and would quietly
 * throw away most of what discovery is for. Craig is not resolving an issue,
 * he is building a picture of a company — and the things worth carrying are
 * the standing facts (how many people, who does payroll, what tools they are
 * on), the questions already asked, and above all **what turned out not to be
 * written down anywhere**, which is the product's whole reason to exist.
 *
 * "Already asked" earns its place separately from the facts: without it he
 * re-asks a question somebody answered thirty turns ago, which reads worse
 * than forgetting the answer did.
 */
const SUMMARY_INSTRUCTIONS = `You are compressing the earlier part of an onboarding discovery conversation between Craig and the person setting up their company's onboarding.

This summary is the ONLY record of these turns. Everything you leave out is gone.

Write under 250 words, under these exact headings, omitting a heading entirely if nothing was said about it:

**The company**
Size, location, how they work, industry. Standing facts that stay true.

**Who does what**
Named roles and responsibilities, especially anyone described as the only person who can do something.

**Tools and systems**
Anything they said they use, and anything they said they do NOT use.

**Gaps found**
What is not written down, out of date, or lives in one person's head. Quote their words where you can. This is the most important section — never drop it to save room.

**Already asked**
Questions Craig has put to them, so he does not ask again. One line each.

**Where it had got to**
What was being discussed when this part of the conversation ended.

Rules:
- Facts only. If something was implied rather than said, leave it out.
- Keep numbers, names and product names exactly as given.
- If they corrected something earlier, record only the corrected version.
- No preamble, no sign-off, no offer to help.`;

const summariser = new Agent({
  name: "Summariser",
  model: CHAT_MODEL,
  /* Lower than the conversation itself. This is a transcription job — anything
     invented here becomes a fact Craig believes for the rest of the thread,
     and there is no later turn that corrects it. */
  modelSettings: { temperature: 0.1, maxTokens: 500 },
  instructions: SUMMARY_INSTRUCTIONS,
});

/** How a turn is written down for the summariser to read. */
function asTranscript(items: AgentInputItem[]): string {
  return items
    .map((item) => {
      if (!("role" in item)) return null;

      if (item.role === "user") {
        return typeof item.content === "string" ? `THEM: ${item.content}` : null;
      }

      if (item.role === "assistant" && Array.isArray(item.content)) {
        const said = item.content
          .map((part) =>
            "text" in part && typeof part.text === "string" ? part.text : "",
          )
          .join("")
          .trim();
        return said ? `CRAIG: ${said}` : null;
      }

      return null;
    })
    .filter((line): line is string => Boolean(line))
    .join("\n\n");
}

/**
 * Summarise a run of turns, folding in whatever was already summarised.
 *
 * `previous` is passed back in rather than discarded, because the second
 * compaction of a thread covers turns the first one already replaced — drop it
 * and the oldest part of the conversation is lost on the second cut, having
 * survived the first.
 */
export async function summariseTurns(
  items: AgentInputItem[],
  previous?: string | null,
): Promise<string | null> {
  const transcript = asTranscript(items);
  if (!transcript) return previous ?? null;

  const input = previous
    ? `Here is the summary of everything before this point. Carry its facts forward, correcting them only where the new turns do.\n\n${previous}\n\n---\n\nAnd here are the turns to fold in:\n\n${transcript}`
    : transcript;

  try {
    const result = await run(summariser, input);
    const summary = result.finalOutput?.trim();
    return summary || previous || null;
  } catch {
    /* Swallowed on purpose, and the caller treats null as "nothing to add".
       A summariser that is rate-limited or down must not take the conversation
       down with it — Craig falls back to the recent turns alone, which is
       exactly the behaviour he had before any of this existed. */
    return previous ?? null;
  }
}

/** What a thread has already had compressed, if anything. */
export async function storedSummary(
  threadId: string,
): Promise<{ summary: string | null; throughSeq: number | null }> {
  const { data } = await supabaseAdmin()
    .from("threads")
    .select("summary, summary_through_seq")
    .eq("id", threadId)
    .maybeSingle();

  return {
    summary: data?.summary ?? null,
    throughSeq: data?.summary_through_seq ?? null,
  };
}

/**
 * Store a summary against the thread it describes.
 *
 * Scoped by account like every other write here, so knowing a thread id is not
 * enough to put words in somebody else's conversation.
 */
export async function saveSummary(
  accountId: string,
  threadId: string,
  summary: string,
  throughSeq: number,
): Promise<void> {
  await supabaseAdmin()
    .from("threads")
    .update({ summary, summary_through_seq: throughSeq })
    .eq("id", threadId)
    .eq("account_id", accountId);
}
