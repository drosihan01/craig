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
 */
export function sectionOf(content: string, heading: string): string | null {
  const wanted = heading.trim().toLowerCase();
  if (!wanted) return null;

  const lines = content.split("\n");
  let start = -1;
  let level = 0;

  for (const [i, line] of lines.entries()) {
    const found = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
    if (!found) continue;
    const text = found[2].toLowerCase();
    if (text === wanted || text.includes(wanted) || wanted.includes(text)) {
      start = i;
      level = found[1].length;
      break;
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
