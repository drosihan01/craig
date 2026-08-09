"use client";

import * as React from "react";
import { WORKFLOWS as SEED, type DemoWorkflow } from "@/lib/demo-workflow";
import {
  isUnconfigured,
  setupWarning,
  type WorkflowBlock,
} from "@/components/ui";

/**
 * One copy of the workflows, shared by everything that reads or changes them.
 *
 * They used to be a module-level fixture that every page imported and the
 * builder copied into local state on mount. That was survivable while only the
 * builder could edit — you lost your changes on navigation, which was wrong but
 * contained. It stopped being survivable the moment Craig could answer a
 * question from Home: the row would disappear from the list, and the builder
 * would still show the gap, because they were two different objects.
 *
 * A store rather than context because these are read from a dozen places and
 * written from two; threading a provider through every page to serve two
 * callers is the wrong trade. `useSyncExternalStore` is the same idiom the
 * shell uses for panel widths and theme, and it keeps this out of an effect,
 * which React 19 rightly complains about.
 *
 * In-memory and deliberately so. It resets on reload, which is correct for a
 * demo — persistence would mean the first person to try it leaves state behind
 * for the next one.
 */

/* Deep enough. Blocks get replaced wholesale and config is one level down, so
   this is every part that can be written to. */
const clone = (list: DemoWorkflow[]): DemoWorkflow[] =>
  list.map((w) => ({
    ...w,
    blocks: w.blocks.map((b) => ({ ...b, config: { ...b.config } })),
  }));

let workflows: DemoWorkflow[] = clone(SEED);

const listeners = new Set<() => void>();

function emit() {
  /* New array identity, or useSyncExternalStore has nothing to compare. */
  workflows = [...workflows];
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => workflows;

/* The server renders the seed. It's the same data the store starts from, so
   there's nothing to reconcile — this exists only because getServerSnapshot
   must not return a value built during render. */
const serverSnapshot = () => workflows;

export function useWorkflows() {
  return React.useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export function useWorkflow(id: string) {
  const all = useWorkflows();
  return all.find((w) => w.id === id) ?? all[0];
}

/* ---------------------------------------------------------------------- */
/*  Writes                                                                */
/* ---------------------------------------------------------------------- */

export function patchBlock(
  workflowId: string,
  blockId: string,
  changes: Partial<WorkflowBlock>,
) {
  workflows = workflows.map((w) =>
    w.id === workflowId
      ? {
          ...w,
          blocks: w.blocks.map((b) =>
            b.id === blockId ? { ...b, ...changes } : b,
          ),
        }
      : w,
  );
  emit();
}

/** Sets one config field without disturbing the others. */
export function setConfig(
  workflowId: string,
  blockId: string,
  field: string,
  value: string | string[],
) {
  const block = findBlock(workflowId, blockId);
  if (!block) return;
  patchBlock(workflowId, blockId, {
    config: { ...block.config, [field]: value },
  });
}

export function setBlocks(workflowId: string, blocks: WorkflowBlock[]) {
  workflows = workflows.map((w) =>
    w.id === workflowId ? { ...w, blocks } : w,
  );
  emit();
}

/* ---------------------------------------------------------------------- */
/*  Reads that aren't hooks                                               */
/* ---------------------------------------------------------------------- */

export const allWorkflows = () => workflows;

export const findBlock = (workflowId: string, blockId: string) =>
  workflows
    .find((w) => w.id === workflowId)
    ?.blocks.find((b) => b.id === blockId);

export interface Gap {
  workflow: DemoWorkflow;
  block: WorkflowBlock;
  /** What's missing, in the block's own words. */
  missing: string | null;
}

/**
 * Every step that can't run yet, across every workflow.
 *
 * Home's worklist, the builder's counter and Craig's answers all come from
 * here, so they can't disagree about how much is left.
 */
export function gaps(list: DemoWorkflow[] = workflows): Gap[] {
  const out: Gap[] = [];
  for (const workflow of list) {
    for (const block of workflow.blocks) {
      if (!isUnconfigured(block)) continue;
      out.push({ workflow, block, missing: setupWarning(block) });
    }
  }
  return out;
}
