/**
 * How retrieved text is handed to Craig, and the sentence that always follows it.
 *
 * ## The rule this module exists to make structural
 *
 * **A constraint on how to use a piece of retrieved text belongs with the text,
 * not in the preamble.** That is the single most transferable thing learned on
 * this project, and it was learned expensively: asked about *parental* leave
 * against a notebook documenting only *annual* leave, Craig reported four weeks
 * as the parental policy — twice, the second time after the system prompt had
 * been told in bold not to. The instruction was two thousand tokens behind him
 * by the time he answered. Moving one sentence into the tool result fixed it.
 *
 * Every retrieval tool has since had to remember to append that sentence by
 * hand, which is a convention, and a convention is a thing the next tool
 * forgets. `search_resources` already had: it returned bare snippets from
 * somebody's handbook to a new starter with nothing attached, which is the
 * highest-stakes result in the product and the one with no caveat on it.
 *
 * ## Why this is not a guardrail
 *
 * The SDK's tool-output guardrails looked like the answer and are not. A
 * guardrail may `allow`, `rejectContent` — which *replaces* the output with a
 * message — or `throwException`. None of those is "append", so the only way to
 * use one here would be to throw the retrieved text away and return a sentence
 * about it instead. Enforcement therefore lives in the type and the tests: the
 * builders below are the only way to wrap retrieved text, every one of them
 * takes a `caveat`, and `retrieval.test.ts` fails if any result carrying text
 * comes back without one.
 *
 * ## What a caveat is for
 *
 * Not hedging. Each one names the *specific* wrong move available from this
 * particular text — carrying a figure between kinds of leave, reading a
 * fragment as the whole policy, concluding from the first half of a document
 * that the second half says nothing. A generic "this may be incomplete" would
 * be worse than nothing, because it is ignorable in a way a named mistake is
 * not.
 */

/** Marks the line Craig reads last. Every result carrying text ends with one. */
export const CAVEAT_MARK = "—";

/**
 * Retrieved text, framed and qualified.
 *
 * `from` names the source in Craig's own words, because the answer he gives
 * should be able to cite it. `caveat` is the last thing in the string, which is
 * the whole point — it is the last thing he reads before he answers.
 */
export function retrieved({
  from,
  body,
  caveat,
}: {
  from: string;
  body: string;
  caveat: string;
}): string {
  return [`From ${from}:`, "", body.trim(), "", `${CAVEAT_MARK} ${caveat}`].join(
    "\n",
  );
}

/**
 * One section of the notebook.
 *
 * The caveat names the heading back to him, because that is the comparison
 * that matters: he chose this section from a list, and choosing the nearest
 * one is not the same as finding the answer.
 */
export function notebookSection(section: string, body: string): string {
  return retrieved({
    from: `the notebook, under "${section}"`,
    body,
    caveat: `That section is titled "${section}". If it does not answer what they asked, do not settle for it: look at the heading list again and read a better one before you conclude anything — a notebook with sixty headings usually has a closer match than the first one you picked. Only when nothing covers it, say the notebook has "${section}" but not what they asked, and call note_gap. Never move a figure from one kind of leave, notice or payment to another.`,
  });
}

/**
 * One of the account's own documents.
 *
 * Two caveats, because truncation makes a different mistake available: from a
 * whole document, "it isn't in here" is a conclusion; from the first eight
 * thousand characters of one, it is a guess.
 */
export function documentBody(
  name: string,
  body: string,
  truncated: boolean,
): string {
  return retrieved({
    from: `"${name}"`,
    body,
    caveat: truncated
      ? `That is the beginning of "${name}" and it is longer than this. If what they asked about is not here, say you could not find it in the part you read — do not conclude the document does not cover it.`
      : `That is the whole of "${name}". If it does not answer what they asked, check the document list for a better one before you conclude anything. Only when nothing covers it, say what this document does cover but not what they asked, and call note_gap.`,
  });
}

/**
 * Fragments matched across the documents somebody may read.
 *
 * The caveat this one needed and did not have. A snippet is a couple of
 * sentences lifted out of the middle of a policy, with the sentence that
 * qualifies it left behind — and it arrives looking exactly like an answer. A
 * new starter is the worst person to receive that confidently, because they
 * have no way to know what the fragment left out.
 */
export function resourceSnippets(
  hits: { name: string; snippet: string }[],
): string {
  return retrieved({
    from: "what they shared",
    body: hits.map((hit) => `"${hit.name}": ${hit.snippet}`).join("\n\n"),
    caveat:
      "Those are fragments matched on wording, not whole sections, and the sentence that qualifies one is often the sentence next to it. Answer only what the fragment actually says, name the document it came from, and if it looks like it is part of a longer rule say so rather than presenting it as the complete answer.",
  });
}
