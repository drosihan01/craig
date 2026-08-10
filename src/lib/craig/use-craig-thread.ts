"use client";

import * as React from "react";
import { clearThread, setThread, showcaseState } from "./store";
import { openThread, readThread, rememberHandover } from "./thread-sync";

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
 * - **workflow** is opened on arrival, because it already exists and there is a
 *   transcript to read back. Coming to a workflow you built last month should
 *   find the conversation that built it.
 * - **god** and **draft** are *not*. The screen starts empty and the thread is
 *   made on the first send. Two reasons, and the second is the one that bit:
 *   opening on arrival puts an empty conversation in the history every time
 *   somebody glances and leaves; and for a draft it is the difference between
 *   "a new conversation about a new workflow" and being handed whichever old
 *   one the server happened to find.
 *
 * Nothing here fails loudly. A conversation that could not reach the server is
 * still a usable conversation on this device; what is lost is the other device
 * seeing it, and putting a network error over Craig mid-sentence would be a
 * worse trade than that.
 */

export function useCraigThread(
  kind: "god" | "workflow" | "draft",
  workflowId?: string,
  /**
   * The conversation this one was handed over from, if any.
   *
   * Recorded on the thread and nothing more — no turns are copied. Craig on
   * Home can offer a door into the builder, and what travels through it is that
   * they want a workflow, which the builder's opening question already assumes.
   * The pointer is what lets the two be joined up later without either becoming
   * the other's copy.
   */
  parentThreadId?: string,
) {
  React.useEffect(() => {
    let live = true;

    if (kind === "god" || kind === "draft") {
      /* Both are scoped to a moment somebody started. Arriving is a new
         conversation — last night's, or last week's workflow, is reachable
         from its own place rather than sitting in front of you. */
      clearThread();
      /* Held rather than written: the thread this belongs to does not exist
         until something is typed into it. */
      rememberHandover(parentThreadId ?? null);
      return () => {
        live = false;
      };
    }

    /* Already showing the right one — a re-render, or coming back to a workflow
       whose thread this browser opened a moment ago. Re-opening would replace a
       live transcript with a fetch of the same thing. */
    const open = showcaseState().threadId;

    void (async () => {
      const result = await openThread(kind, {
        workflowId,
        from: parentThreadId ? { threadId: parentThreadId } : undefined,
      });
      if (!live) return;

      /* No thread came back, so this workflow has none — show nothing rather
         than whatever was on screen before.
         
         This is the bug that put one workflow's conversation inside another.
         A workflow lives in the browser first and is pushed to the server on a
         delay, so opening a freshly created one asks for a thread against a row
         the server does not have yet; the request comes back empty, and the
         old code returned early and left the previous workflow's transcript
         sitting there — attributed, silently, to a workflow whose canvas was
         still blank. Clearing is the honest answer to "there is no thread
         here", and the next edit syncs the workflow and gives it one. */
      if (!result) {
        clearThread();
        return;
      }

      /* `openThread` returns the *server's* answer, which for these two kinds
         may be a thread that already existed rather than the id just minted. */
      if (result.id === open) return;
      setThread(result.id, result.messages, result.notes);
    })();

    return () => {
      live = false;
    };
  }, [kind, workflowId, parentThreadId]);
}

/**
 * Show a conversation somebody picked out of history.
 *
 * Separate from the hook above because it is an act rather than a state: it
 * happens when a row is clicked, not when a screen mounts.
 */
export async function showThread(threadId: string) {
  const { messages, notes } = await readThread(threadId);
  setThread(threadId, messages, notes);
}
