"use client";

import * as React from "react";
import { clearThread, setThread, showcaseState } from "./store";
import { openThread, readThread } from "./thread-sync";

/**
 * Which conversation this screen is holding.
 *
 * One hook per screen, called once, and the store holds the result — the same
 * arrangement the transcript itself has, and for the same reason: what a
 * conversation *is* outlives the component drawing it.
 *
 * The three kinds differ in when the thread comes into existence, and that
 * difference is the whole design rather than an implementation detail:
 *
 * - **workflow** and **onboarding** are opened on arrival, because they already
 *   exist or are about to and there is a transcript to read back. Coming to a
 *   workflow you built last month should find the conversation that built it.
 * - **god** is *not*. Home clears the screen and makes the thread on the first
 *   send. Opening a thread on arrival would mean an empty conversation in the
 *   history for every time somebody glanced at Home and left, and a history
 *   full of blanks is a history nobody opens.
 *
 * Nothing here fails loudly. A conversation that could not reach the server is
 * still a usable conversation on this device; what is lost is the other device
 * seeing it, and putting a network error over Craig mid-sentence would be a
 * worse trade than that.
 */

export function useCraigThread(
  kind: "god" | "workflow" | "onboarding",
  workflowId?: string,
) {
  React.useEffect(() => {
    let live = true;

    if (kind === "god") {
      /* A god thread is scoped to a moment. Arriving is a new conversation;
         last night's is in history rather than in front of you. */
      clearThread();
      return () => {
        live = false;
      };
    }

    /* Already showing the right one — a re-render, or coming back to a workflow
       whose thread this browser opened a moment ago. Re-opening would replace a
       live transcript with a fetch of the same thing. */
    const open = showcaseState().threadId;

    void (async () => {
      const result = await openThread(kind, { workflowId });
      if (!live || !result) return;

      /* `openThread` returns the *server's* answer, which for these two kinds
         may be a thread that already existed rather than the id just minted. */
      if (result.id === open) return;
      setThread(result.id, result.messages);
    })();

    return () => {
      live = false;
    };
  }, [kind, workflowId]);
}

/**
 * Show a conversation somebody picked out of history.
 *
 * Separate from the hook above because it is an act rather than a state: it
 * happens when a row is clicked, not when a screen mounts.
 */
export async function showThread(threadId: string) {
  const messages = await readThread(threadId);
  setThread(threadId, messages);
}
