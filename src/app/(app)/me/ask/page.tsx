import type { Metadata } from "next";
import { currentJoiner, requireJoiner } from "@/lib/craig/current-joiner";
import { AskScreen } from "./ask-screen";

export async function generateMetadata(): Promise<Metadata> {
  /* `currentJoiner` rather than `requireJoiner`: this runs before the page and
     must not redirect from inside a title. The lookup is `cache`d for the
     render, so this and the page below share one read. */
  const joiner = await currentJoiner();

  return {
    title: joiner ? `Ask Craig — ${joiner.company}` : "Ask Craig",
    /* Somebody's onboarding, reachable by a long-lived link in their email.
       Nothing about it belongs in a search index. */
    robots: { index: false, follow: false },
  };
}

/**
 * Craig, as a room rather than a panel.
 *
 * He was a column beside the checklist, and before that a section under it.
 * Both were the same mistake in different proportions: a conversation squeezed
 * into whatever space the plan left over. Giving the joiner the product's real
 * shell makes the nav the thing that decides what you are looking at, and a nav
 * points at addresses — so this is one.
 *
 * Being a route buys two things a panel could not have. The conversation
 * survives a reload, and it can be linked to: "ask Craig about it" in an email
 * now has somewhere to point.
 */
export default async function JoinerAskPage() {
  const joiner = await requireJoiner();

  return (
    <AskScreen
      firstName={joiner.name.split(" ")[0] || joiner.name}
      company={joiner.company}
    />
  );
}
