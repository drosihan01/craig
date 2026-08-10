/**
 * Reading a notebook, as text — no database, no `server-only`.
 *
 * Split out from `notebook.ts` because these two are pure string functions and
 * that module is server-only. Keeping them there made them untestable without
 * standing up a Supabase client, which is a poor trade for a pair of functions
 * whose whole risk is *how they slice a string* — and it also put them out of
 * reach of the browser, which has an obvious use for a list of headings.
 *
 * Both fail the same quiet way if they are wrong. A heading missed means Craig
 * says he does not know something he does know. A section sliced wrongly means
 * he answers confidently out of the wrong paragraph. Neither raises anything.
 */

/**
 * The document's headings, which is all Craig carries between turns.
 *
 * The whole notebook in every prompt is the thing to avoid: accuracy falls as
 * input grows — inside the model's limit, and even when the relevant fact is
 * present. Fifteen thousand words of company knowledge in front of a question
 * about expenses makes the expenses answer worse.
 *
 * So this is the index, and the index is free: somebody writing a notebook
 * already writes headings, so there is nothing to generate, embed or keep in
 * step. Roughly sixty tokens buys Craig an accurate answer to "do I know about
 * this", which is the question that decides whether he reads a section, says
 * he does not know, or leaves a note asking.
 */
export function headingsOf(content: string): string[] {
  return content
    .split("\n")
    .map((line) => /^#{1,6}\s+(.*\S)\s*$/.exec(line)?.[1])
    .filter((heading): heading is string => Boolean(heading));
}

/**
 * One section, by heading — everything under it until the next heading of the
 * same level or higher.
 *
 * Matched loosely on purpose. Craig is choosing from a list he was given, but
 * he will still ask for "Expenses" when the heading reads "Expenses and
 * reimbursement", and refusing that would be pedantry dressed as correctness.
 * Case-insensitive, and a prefix or containment match counts.
 *
 * **Ranked rather than first-past-the-post, which is a bug this had.** Taking
 * the first loose match meant a short heading early in the document could
 * shadow the exact one further down: in a notebook containing both "The
 * studio" and "How a job gets into the studio", asking for the second returned
 * the *first*, because the longer name contains the shorter one. Craig then
 * answered a question about briefs with the door-entry paragraph — the same
 * failure #85 addressed in the prompt, except here retrieval itself handed him
 * the wrong text and no wording could have saved it.
 *
 * So every heading is scored and the best one wins: exact, then the heading
 * that contains what was asked for, then — last — a heading contained *by* it,
 * and among those the longest, because the longest is the most specific thing
 * that could have been meant.
 */
export function sectionOf(content: string, heading: string): string | null {
  const wanted = heading.trim().toLowerCase();
  if (!wanted) return null;

  const lines = content.split("\n");

  let start = -1;
  let level = 0;
  let best = 0;

  for (const [i, line] of lines.entries()) {
    const found = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
    if (!found) continue;
    const text = found[2].toLowerCase();

    /* Higher is better. The length tie-break only ever separates candidates of
       the same kind, so a long partial can never beat an exact match. */
    const score =
      text === wanted
        ? 4_000_000
        : text.includes(wanted)
          ? 2_000_000 + text.length
          : wanted.includes(text)
            ? 1_000_000 + text.length
            : 0;

    if (score > best) {
      best = score;
      start = i;
      level = found[1].length;
    }
  }

  if (start === -1) return null;

  const body: string[] = [lines[start]];
  for (const line of lines.slice(start + 1)) {
    const next = /^(#{1,6})\s+/.exec(line);
    /* Stops at a sibling or an uncle, never at a child — a section includes
       its subsections, which is what somebody means by "that bit". */
    if (next && next[1].length <= level) break;
    body.push(line);
  }

  return body.join("\n").trim() || null;
}
