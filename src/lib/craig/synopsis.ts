import "server-only";

import { Agent, run } from "@openai/agents";

import { CHAT_MODEL } from "@/lib/craig/craig-prompt";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * What a document can settle, in a sentence or two.
 *
 * ## This is a routing card, not a summary
 *
 * The distinction decides everything about the prompt below. A summary invites
 * being answered from, and a summary answered from is a confidently wrong
 * answer with a real document sitting one call away — the #85 failure with
 * more rope. A routing card says only *what questions this document could
 * settle*, so the useful thing to do with it is open the document.
 *
 * ## Why it buys semantics without embeddings
 *
 * Lexical search fails on vocabulary the document never used: a handbook
 * headed "Dress code. Smart casual." does not match "what should I wear". The
 * gap is not meaning, it is words — and a synopsis is written in the words
 * somebody would *ask* in rather than the words the document happens to use.
 * Indexed alongside the text (see the `search` generated column), it closes
 * most of that gap for the price of one model call per upload, against a
 * vector store's second copy of every tenant's data.
 */
const SYNOPSIS_INSTRUCTIONS = `You are writing a one-line routing card for a document in a company's onboarding library.

Its only job is to help decide WHETHER TO OPEN this document. It is never quoted as an answer.

Write 25-50 words, one paragraph, no heading and no preamble. Say:
- what kind of document it is
- the specific questions somebody could answer by reading it

Write the questions in the words somebody would actually ask — "what to wear", "how much holiday", "who to tell when off sick" — not the document's own section titles.

Rules:
- Describe the document. Do not answer anything in it.
- No numbers, amounts, dates or policy specifics. Those belong in the document, and repeated here they will be quoted without it.
- If the document turns out to be mostly empty or unreadable, say so plainly in a few words.
- Start with a noun, not "This document".`;

const writer = new Agent({
  name: "Synopsis",
  model: CHAT_MODEL,
  /* Near zero. This is a description of a document that will be reused
     unchanged for the life of the upload; there is nothing here that benefits
     from variety, and anything invented becomes routing that sends Craig to
     the wrong file. */
  modelSettings: { temperature: 0.1, maxTokens: 160 },
  instructions: SYNOPSIS_INSTRUCTIONS,
});

/** How much of a document the writer is shown. */
const SAMPLE_CHARS = 6_000;

/**
 * Write the routing card for one document.
 *
 * Returns `null` when there is nothing to describe — an unsupported file type
 * whose extraction returned nothing, or a document that is genuinely empty.
 * Null is a fine outcome: the filename is still in the search vector, so the
 * document remains findable, it just cannot be routed to as precisely.
 */
export async function writeSynopsis(document: {
  name: string;
  extractedText: string | null;
}): Promise<string | null> {
  const text = document.extractedText?.trim();
  if (!text) return null;

  /* The opening is enough. A routing card describes the shape of a document,
     and the shape is established in its first pages — paying to read a whole
     handbook to write forty words about it is the cost this layer exists to
     avoid. */
  const sample = text.slice(0, SAMPLE_CHARS);

  try {
    const result = await run(
      writer,
      `Filename: ${document.name}\n\n---\n\n${sample}`,
    );
    const synopsis = result.finalOutput?.trim();
    return synopsis || null;
  } catch {
    /* An upload must not fail because the describing step did. The document is
       stored, extracted and searchable; it is only less precisely routable,
       and `backfillSynopses` will pick it up later. */
    return null;
  }
}

/** One document's routing card, as Craig is shown it. */
export interface DocumentCard {
  name: string;
  synopsis: string | null;
  shared: boolean;
}

/**
 * The routing index for an account.
 *
 * Small enough to sit in the prompt rather than behind a tool call, which is
 * the whole latency argument for this layer: routing that costs a round trip
 * is slower than the hosted search it replaces, and routing that costs nothing
 * is faster. Roughly fifty tokens per document, in a stable position, so it
 * comes back from the prompt cache on every turn after the first.
 *
 * That holds while a library is small. Past `INDEX_LIMIT` the index stops
 * being worth carrying on turns that are not about documents, and this should
 * move behind a tool — the cut-over is a size call, not a rewrite.
 */
export const INDEX_LIMIT = 50;

export async function documentIndexFor(
  accountEmail: string,
): Promise<DocumentCard[]> {
  const { data: account } = await supabaseAdmin()
    .from("accounts")
    .select("id")
    .eq("email", accountEmail.trim().toLowerCase())
    .maybeSingle();
  if (!account) return [];

  const { data } = await supabaseAdmin()
    .from("documents")
    .select("name, synopsis, visibility")
    .eq("account_id", account.id)
    .order("uploaded_at", { ascending: false })
    .limit(INDEX_LIMIT);

  return (data ?? []).map((row) => ({
    name: row.name,
    synopsis: row.synopsis,
    shared: row.visibility === "shared",
  }));
}

/**
 * Write cards for documents uploaded before this existed, or whose first
 * attempt failed.
 *
 * Deliberately bounded per call. This runs off the back of somebody's request,
 * so it may cost a model call or two and never a library's worth.
 */
export async function backfillSynopses(
  accountEmail: string,
  limit = 3,
): Promise<number> {
  const { data: account } = await supabaseAdmin()
    .from("accounts")
    .select("id")
    .eq("email", accountEmail.trim().toLowerCase())
    .maybeSingle();
  if (!account) return 0;

  const { data } = await supabaseAdmin()
    .from("documents")
    .select("id, name, extracted_text")
    .eq("account_id", account.id)
    .is("synopsis", null)
    .not("extracted_text", "is", null)
    .limit(limit);

  let written = 0;
  for (const row of data ?? []) {
    const synopsis = await writeSynopsis({
      name: row.name,
      extractedText: row.extracted_text,
    });
    if (!synopsis) continue;

    await supabaseAdmin()
      .from("documents")
      .update({ synopsis })
      .eq("id", row.id)
      .eq("account_id", account.id);
    written += 1;
  }

  return written;
}
