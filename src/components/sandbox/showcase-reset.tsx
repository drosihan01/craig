"use client";

import * as React from "react";
import Link from "next/link";
import {
  Button,
  buttonVariants,
  Callout,
  ControlRow,
  Switch,
} from "@/components/ui";
import { ArrowForward, Refresh } from "@/components/ui/icons";
import { AFTER_SIGN_IN } from "@/lib/showcase/contract";
import {
  resetShowcase,
  setSimpleDraft,
  useShowcase,
} from "@/lib/showcase/store";

/**
 * Wipe the showcase back to nothing.
 *
 * The showcase is the one surface here that accumulates: an account somebody
 * created, a conversation they had, whatever Craig worked out from it. All of
 * which is exactly right for a real user and exactly wrong for the next person
 * who wants to see the empty state — which is the state that matters most,
 * because it's the one a first-time visitor actually gets.
 *
 * So this exists to make the interesting screen reachable again, and it lives
 * in the sandbox rather than in the product because it is a builder's tool.
 * Nobody deletes their own company; only the person demonstrating it does.
 *
 * Two halves, and both are needed. The server holds the accounts and the
 * sessions; the browser holds everything Craig found. Clearing one without the
 * other leaves you signed in to an account that no longer exists, or looking
 * at a stranger's gaps.
 */
export function ShowcaseReset() {
  const [state, setState] = React.useState<"idle" | "working" | "done">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const { simpleDraft } = useShowcase();

  async function nuke() {
    setState("working");
    setError(null);
    try {
      const response = await fetch("/api/showcase/reset", { method: "POST" });
      if (!response.ok) throw new Error(`Reset failed (${response.status})`);
      /* Server first, then the browser's copy — if the request fails there's
         nothing to undo, and clearing locally first would show an empty
         product still holding a live session. */
      resetShowcase();
      setState("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Reset failed.");
      setState("idle");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-semibold tracking-[-0.01em]">Showcase</h2>
        <p className="text-md leading-relaxed text-text-muted">
          The showcase keeps whatever happens in it — the account somebody
          signed up with, the conversation they had, and everything Craig worked
          out from it. This puts it back to nothing.
        </p>
      </div>

      {/* The thing you usually want, first. Clearing it is the rarer act and
          the destructive one, so it sits below rather than sharing the row —
          two buttons side by side is how somebody nukes an account they meant
          to open. */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href={AFTER_SIGN_IN} className={buttonVariants()}>
          Open the showcase
          <ArrowForward />
        </Link>
        <span className="text-sm text-text-muted">
          Signed out, this lands on sign-up — a showcase with no account has
          nothing to sign into.
        </span>
      </div>

      {/* Above the destructive half, because it's the one you touch often and
          the switch belongs next to the run it changes rather than under the
          button that ends one. */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <ControlRow
          control={
            <Switch
              checked={simpleDraft}
              onChange={(e) => setSimpleDraft(e.target.checked)}
            />
          }
          label="Simple test workflow"
          description="Whatever Craig drafts comes out as one step, Details, with a single required field — date of birth or middle name. Pick one and it publishes. It's the whole draft-configure-publish path without six turns of conversation first. Turn it off to get the workflow he actually wrote."
        />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-col gap-1">
          <span className="text-base font-medium">What this clears</span>
          <ul className="flex flex-col gap-1 pt-1">
            {[
              "Every account, and every session with it — you'll be signed out.",
              "The conversation, and the facts and gaps Craig recorded.",
              "Any workflow he drafted, and the activity log.",
            ].map((line) => (
              <li
                key={line}
                className="flex gap-2 text-sm leading-relaxed text-text-muted"
              >
                <span aria-hidden className="text-text-subtle">
                  ·
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button
            variant="danger"
            onClick={nuke}
            loading={state === "working"}
            disabled={state === "working"}
          >
            <Refresh />
            {state === "working" ? "Clearing" : "Clear the showcase"}
          </Button>

          {state === "done" && (
            <span className="text-sm text-text-muted">
              Cleared. Sign up again to start over.
            </span>
          )}
        </div>
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      <p className="text-xs leading-relaxed text-text-subtle">
        There is no undo, and there is nothing here worth keeping — the showcase
        has no database behind it yet, so a server restart clears it anyway.
      </p>
    </div>
  );
}
