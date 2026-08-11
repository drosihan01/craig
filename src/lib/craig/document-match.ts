/**
 * Choosing a document by the name somebody used for it.
 *
 * Split out of `documents.ts` for the reason `notebook-text.ts` was split out
 * of `notebook.ts`: the whole risk here is *which of several similar names
 * wins*, and that module is `server-only`, so testing this in place would mean
 * standing up a Supabase client to check a string comparison.
 *
 * It fails the same quiet way `sectionOf` did before it was scored. Craig asks
 * for a document by name, gets a different one, names it correctly in his
 * answer, and answers out of the wrong file. Nothing raises.
 */

/**
 * The best match for a name, or null.
 *
 * Scored rather than first-past-the-post, which is the bug `sectionOf` had:
 * taking the first loose match lets a short name early in a list shadow the
 * longer one that was actually asked for, because the longer name *contains*
 * the shorter. "Handbook" would win a request for "Remote working handbook".
 *
 * Exact, then a name containing what was asked for, then — last — a name
 * contained *by* it, and among those the longest, because the longest is the
 * most specific thing that could have been meant.
 */
export function bestDocumentMatch<T extends { name: string }>(
  rows: T[],
  wanted: string,
): T | null {
  const want = wanted.trim().toLowerCase();
  if (!want) return null;

  let best: T | null = null;
  let bestScore = 0;

  for (const row of rows) {
    const name = row.name.toLowerCase();
    /* The length tie-break only ever separates candidates of the same kind, so
       a long partial can never beat an exact match. */
    const score =
      name === want
        ? 4_000_000
        : name.includes(want)
          ? 2_000_000 + name.length
          : want.includes(name)
            ? 1_000_000 + name.length
            : 0;

    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }

  return best;
}
