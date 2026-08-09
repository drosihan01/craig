import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * What Craig has done, newest first.
 *
 * The ledger is the answer to "what has this thing actually done for me", and
 * it's the question anyone who has been burned by software asks on day three.
 * It's also what makes a conversation with him disposable: he takes what you
 * said, changes something, and the change is recorded here — so closing the
 * chat throws away scaffolding rather than the only evidence it happened.
 *
 * Verb, what, when. The verb is set apart from the sentence it starts because
 * a column of "Sent / Checked / Chased / Asked" is how the panel gets skimmed,
 * and the time is small and last because it's the least of the three.
 */

export interface ActivityEntry {
  id: string;
  /** First person, past tense. Craig is the subject of every one of these. */
  what: string;
  /** Set apart from the sentence. Omitted where the note already reads as one. */
  verb?: string;
  when: string;
  /** Appended to the stamp — "still waiting", and the like. */
  note?: string;
}

export function ActivityFeed({
  items,
  limit,
  stamp = "each",
  empty,
  className,
}: {
  items: ActivityEntry[];
  /** Newest few. The panel is 260px and the rest is history. */
  limit?: number;
  /**
   * "newest" stamps only the top row. A week compressed into ninety seconds
   * gives every entry the same time, and twelve rows of "Just now" is noise
   * around the one that's true.
   */
  stamp?: "each" | "newest";
  /** Said when he hasn't done anything yet. Nothing renders without it. */
  empty?: React.ReactNode;
  className?: string;
}) {
  const shown = limit === undefined ? items : items.slice(0, limit);

  if (shown.length === 0) {
    return empty ? (
      <p className="text-xs leading-relaxed text-text-subtle">{empty}</p>
    ) : null;
  }

  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {shown.map((entry, i) => (
        <li key={entry.id} className="flex flex-col gap-0.5">
          <span className="text-xs leading-relaxed text-text-muted">
            {entry.verb && (
              <>
                <span className="text-text-subtle">{entry.verb}</span>{" "}
              </>
            )}
            {entry.what}
          </span>
          {(stamp === "each" || i === 0) && (
            <span className="text-2xs text-text-subtle">
              {entry.when}
              {entry.note && ` · ${entry.note}`}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
