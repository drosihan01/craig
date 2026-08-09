"use client";

import * as React from "react";
import { Add } from "@/components/ui/icons";
import { clearThread, useShowcase } from "@/lib/showcase/store";
import { listThreads } from "@/lib/showcase/thread-sync";
import { showThread } from "@/lib/showcase/use-craig-thread";
import { cn } from "@/lib/cn";

/**
 * The conversations this account has had on Home.
 *
 * God threads are scoped to a moment rather than to a thing, which is what
 * makes a list like this necessary: arriving Home starts a new conversation, so
 * without somewhere to find it, yesterday's would simply be gone. It is the
 * other half of that decision, not an extra.
 *
 * Only god threads. A workflow's conversation is reachable from the workflow —
 * that is what "scoped to a thing" means — and listing it here would offer two
 * routes to one transcript, one of which drops you somewhere with no canvas
 * beside it.
 *
 * Read once when the panel mounts and again whenever the open conversation
 * changes, which is the only event that can add a row: threads are created by
 * sending the first message. Polling would be a request a minute to notice
 * something this browser did itself.
 */

interface Row {
  id: string;
  title?: string;
  lastMessageAt: string;
}

export function ThreadHistory() {
  const { threadId } = useShowcase();
  const [rows, setRows] = React.useState<Row[] | null>(null);

  React.useEffect(() => {
    let live = true;
    void listThreads("god").then((threads) => {
      if (live) setRows(threads as Row[]);
    });
    return () => {
      live = false;
    };
  }, [threadId]);

  /* Nothing at all on a first visit, rather than a heading over an empty box.
     `null` is still loading and `[]` is genuinely none — both draw nothing,
     because a list that flashes "no conversations yet" before showing four is
     worse than one that appears a moment late. */
  if (!rows || rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      {/* A fixed height rather than one the button decides.

          "New" comes and goes with whether there is a conversation open, and
          while the row sized itself to its contents that made the whole list
          jump a few pixels every time somebody started or left one — a shift
          under the pointer, on the rows you are trying to click. `h-6` is the
          taller of the two states, so the label sits still and the button
          appears inside a space already reserved for it. */}
      <div className="flex h-6 items-center justify-between gap-2 px-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Recents
        </p>
        {/* Only once there is something to come back to. On a screen whose
            conversation is already empty, "New" is a button that does nothing
            visible and invites you to press it to find out. */}
        {threadId && (
          <button
            type="button"
            onClick={clearThread}
            className="-mr-1 flex items-center gap-1 rounded px-1 py-0.5 text-2xs text-text-subtle transition-colors hover:bg-surface-hover hover:text-text"
          >
            <Add className="size-3.5" />
            New
          </button>
        )}
      </div>

      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          onClick={() => void showThread(row.id)}
          className={cn(
            "truncate rounded-md px-2 py-1.5 text-left text-sm transition-colors",
            row.id === threadId
              ? "bg-surface-hover text-text"
              : "text-text-muted hover:bg-surface-hover hover:text-text",
          )}
        >
          {/* Titled from the first thing the person typed, so an untitled row
              means a conversation that never got a question — which is worth
              saying plainly rather than papering over with a date. */}
          {row.title ?? "Untitled"}
        </button>
      ))}
    </div>
  );
}
