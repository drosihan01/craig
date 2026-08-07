"use client";

import * as React from "react";
import { Callout } from "./feedback";
import { Dialog } from "./dialog";
import { SelectMenu } from "./dropdown";
import { Schedule, Warning } from "./icons";
import { describeSetup, timingOf } from "@/lib/workflow/library";
import {
  blockLabel,
  missingSetup,
  type WorkflowBlock,
} from "./workflow-builder";
import { cn } from "@/lib/cn";

/**
 * A dry run.
 *
 * The question a test button has to answer is "what would this actually do to
 * a person", and the answer is not "it ran successfully". So this doesn't
 * simulate a run with a progress bar — it lays out every step in order, in the
 * admin's own words, with the timing and the owner and what each one would
 * touch. If a step can't run because something isn't set, it says so where the
 * step is rather than in a summary at the top.
 *
 * Nothing fires. That's stated once, prominently, and never contradicted:
 * a test that might send a real invite to a real person is not a test.
 */

export function TestRun({
  open,
  onClose,
  workflowName,
  blocks,
  /** Who the dry run is written against. */
  candidates,
  defaultCandidate,
}: {
  open: boolean;
  onClose: () => void;
  workflowName: string;
  blocks: WorkflowBlock[];
  candidates: string[];
  defaultCandidate?: string;
}) {
  const [who, setWho] = React.useState(defaultCandidate ?? candidates[0] ?? "");

  const steps = blocks.filter((b) => b.kind !== "trigger");
  const blocked = steps.filter(
    (b) => Boolean(b.incomplete) || missingSetup(b).length > 0,
  );
  /* The first blocked step is the one that matters. A workflow runs in order,
     so everything after it is waiting on it — reporting "3 blocked" without
     saying which one comes first buries the lede. */
  const firstBlockedIndex = steps.findIndex((b) => blocked.includes(b));
  const wouldRun =
    firstBlockedIndex === -1 ? steps.length : firstBlockedIndex;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title={`Test run — ${workflowName}`}
      description="Nothing here fires. No invites are sent, no accounts are created, nobody is emailed."
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-3.5">
        <span className="shrink-0 text-sm text-text-subtle">As if it were</span>
        <div className="w-56">
          <SelectMenu
            label="Run as"
            value={who}
            onChange={setWho}
            options={candidates.map((c) => ({ id: c, label: c }))}
          />
        </div>
      </div>

      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        {steps.length === 0 ? (
          <p className="py-10 text-center text-base text-text-subtle">
            Nothing to run. The workflow is a trigger and nothing else.
          </p>
        ) : (
          <>
            {blocked.length === 0 ? (
              <Callout
                tone="success"
                title={`All ${steps.length} would run`}
              >
                Every step has what it needs. Publishing is the only thing
                left.
              </Callout>
            ) : (
              <Callout
                tone="warning"
                title={
                  wouldRun === 0
                    ? "It would stop at the first step"
                    : `It would get ${wouldRun} ${
                        wouldRun === 1 ? "step" : "steps"
                      } in and stop`
                }
              >
                {blocked.length === 1
                  ? "One step is missing something it needs. "
                  : `${blocked.length} steps are missing something they need, and the workflow runs in order, so the first one holds up the rest. `}
                {who} would be sitting there waiting.
              </Callout>
            )}

            <ol className="flex flex-col gap-2.5">
              {steps.map((block, i) => (
                <TestStep
                  key={block.id}
                  block={block}
                  index={i + 1}
                  who={who}
                  reached={firstBlockedIndex === -1 || i <= firstBlockedIndex}
                />
              ))}
            </ol>
          </>
        )}
      </div>
    </Dialog>
  );
}

function TestStep({
  block,
  index,
  who,
  reached,
}: {
  block: WorkflowBlock;
  index: number;
  who: string;
  /** False once an earlier step has stopped the run. */
  reached: boolean;
}) {
  const type = blockLabel(block);
  const Icon = type.icon;
  const missing = missingSetup(block);
  const stuck = Boolean(block.incomplete) || missing.length > 0;
  const timing = timingOf(block.preset, block.config);
  const detail = describeSetup(block.preset, block.config).filter(
    (d) => d.field.kind !== "when",
  );

  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-xl border bg-surface p-3.5",
        stuck ? "border-warning/40" : "border-border",
        // Never reached, so it's shown but not pretended about.
        !reached && "opacity-45",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          stuck
            ? "bg-warning-subtle text-warning"
            : "bg-accent-subtle text-accent-subtle-fg",
        )}
      >
        <Icon className="size-4" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
            {index}. {type.label}
          </span>
          {timing && (
            <span className="inline-flex items-center gap-1 text-2xs text-text-subtle">
              <Schedule className="size-3" />
              {timing}
            </span>
          )}
          {/* A dry run "as Nils" should say Nils. "The new hire" is the
              template's word for a person the run has already named. */}
          {block.owner && (
            <span className="text-2xs text-text-subtle">
              · {block.owner === "The new hire" ? who : block.owner}
            </span>
          )}
        </div>

        <span className="text-base font-medium">{block.title}</span>

        {/* What it would actually touch, in the words the admin chose. This is
            the whole point — "would create GitHub account" tells you nothing
            you didn't already know from the block's name. */}
        {detail.length > 0 && (
          <dl className="flex flex-col gap-0.5">
            {detail.map((d) => (
              <div key={d.field.id} className="flex gap-2 text-xs">
                <dt className="shrink-0 text-text-subtle">{d.field.label}</dt>
                <dd className="min-w-0 flex-1 text-text-muted">{d.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {stuck && (
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-warning">
            <Warning className="mt-px size-3.5 shrink-0" />
            <span>
              {block.incomplete ??
                `Can't run — ${missing
                  .map((f) => f.label.toLowerCase())
                  .join(", ")} ${missing.length === 1 ? "isn't" : "aren't"} set.`}
            </span>
          </p>
        )}

        {!stuck && !reached && (
          <p className="text-xs text-text-subtle">
            Never reached — an earlier step stops first.
          </p>
        )}
      </div>
    </li>
  );
}
