import { requireUser } from "@/lib/craig/current-user";
import { notebookFor, pendingNotes } from "@/lib/craig/notebook";
import { NotebookScreen } from "./notebook-screen";

export const metadata = {
  title: "Notebook — Craig",
};

/**
 * Everything Craig knows about this company, in one document.
 *
 * A child of `/resources` rather than a tab of its own, because the two are
 * the same idea seen from different sides: Resources holds the *files* a
 * company has, the notebook holds what Craig has *understood*. A separate
 * top-level tab would suggest they are unrelated, and a reader who found one
 * would have no reason to look for the other.
 *
 * Read on the server and handed down whole. The document is a single string
 * and the suggestions are a short list, so there is nothing here worth
 * fetching twice or streaming — and a screen whose entire job is "show me
 * everything" should not arrive empty and fill in.
 */
export default async function NotebookPage() {
  const user = await requireUser();
  const [notebook, notes] = await Promise.all([
    notebookFor(user.email),
    pendingNotes(user.email),
  ]);

  return <NotebookScreen user={user} notebook={notebook} notes={notes} />;
}
