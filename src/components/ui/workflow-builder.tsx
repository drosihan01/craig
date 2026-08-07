"use client";

import * as React from "react";
import {
  Add,
  AltRoute,
  ArrowDownward,
  ArrowUpward,
  Bolt,
  ContentCopy,
  Delete,
  Description,
  HowToReg,
  Mail,
  MoreHoriz,
  Schedule,
  TaskAlt,
  Warning,
} from "./icons";
import { Badge } from "./badge";
import { DropdownMenu } from "./dropdown";
import { cn } from "@/lib/cn";

/**
 * The vertical workflow builder — one column, top to bottom, the way the
 * workflow actually runs. A canvas with free positioning would let an admin
 * draw a shape that doesn't correspond to any execution order; a single column
 * can only express what the engine can actually do.
 *
 * Structure mirrors that constraint: the first block is always the trigger and
 * can't be moved or removed, everything after it is a step, and inserting
 * happens *between* blocks via the connector rather than from a palette.
 */

/* -------------------------------------------------------------------------- */
/*  Block types                                                               */
/* -------------------------------------------------------------------------- */

export type BlockKind =
  | "trigger"
  | "task"
  | "approval"
  | "notify"
  | "delay"
  | "branch"
  | "document";

export interface BlockTypeDef {
  kind: BlockKind;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Trigger is structural — exactly one, always first. */
  structural?: boolean;
}

export const BLOCK_TYPES: Record<BlockKind, BlockTypeDef> = {
  trigger: {
    kind: "trigger",
    label: "Trigger",
    description: "What starts this workflow",
    icon: Bolt,
    structural: true,
  },
  task: {
    kind: "task",
    label: "Task",
    description: "Something a person has to do",
    icon: TaskAlt,
  },
  approval: {
    kind: "approval",
    label: "Approval",
    description: "Hold until someone signs off",
    icon: HowToReg,
  },
  notify: {
    kind: "notify",
    label: "Notification",
    description: "Email or message someone",
    icon: Mail,
  },
  delay: {
    kind: "delay",
    label: "Wait",
    description: "Pause, relative to the start date",
    icon: Schedule,
  },
  branch: {
    kind: "branch",
    label: "Condition",
    description: "Only run the rest if this is true",
    icon: AltRoute,
  },
  document: {
    kind: "document",
    label: "Document",
    description: "Collect or issue a document",
    icon: Description,
  },
};

/** Everything an admin can insert — the trigger is excluded by design. */
export const INSERTABLE = Object.values(BLOCK_TYPES).filter(
  (t) => !t.structural,
);

export interface WorkflowBlock {
  id: string;
  kind: BlockKind;
  title: string;
  summary?: string;
  owner?: string;
  /** Shown as an unresolved-configuration warning on the card. */
  incomplete?: string;
}

/* -------------------------------------------------------------------------- */
/*  Builder                                                                   */
/* -------------------------------------------------------------------------- */

export function WorkflowBuilder({
  blocks,
  selectedId,
  onSelect,
  onInsert,
  onRemove,
  onMove,
  onDuplicate,
  className,
}: {
  blocks: WorkflowBlock[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** index is the position the new block should occupy. */
  onInsert?: (kind: BlockKind, index: number) => void;
  onRemove?: (id: string) => void;
  onMove?: (id: string, direction: -1 | 1) => void;
  onDuplicate?: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto flex w-full max-w-xl flex-col", className)}>
      {blocks.map((block, i) => {
        const isTrigger = block.kind === "trigger";
        const isLast = i === blocks.length - 1;

        return (
          <React.Fragment key={block.id}>
            <BlockCard
              block={block}
              index={i}
              selected={selectedId === block.id}
              onSelect={onSelect}
              onRemove={isTrigger ? undefined : onRemove}
              onDuplicate={isTrigger ? undefined : onDuplicate}
              onMove={isTrigger ? undefined : onMove}
              canMoveUp={i > 1}
              canMoveDown={!isLast && i > 0}
            />

            <Connector onInsert={onInsert} index={i + 1} last={isLast} />
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Connector                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The line between two blocks, and the only place a step can be inserted.
 * The button is always in the DOM so it's reachable by keyboard — hover just
 * fades it in for the mouse.
 */
function Connector({
  index,
  onInsert,
  last,
}: {
  index: number;
  onInsert?: (kind: BlockKind, index: number) => void;
  last?: boolean;
}) {
  return (
    <div className="group/conn relative flex h-9 items-center justify-center">
      <span
        aria-hidden
        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border-strong"
      />

      {onInsert && (
        <DropdownMenu
          label={last ? "Add a step" : "Insert a step here"}
          align="start"
          width="w-64"
          className={cn(
            "relative z-10 transition-opacity duration-150",
            // Always visible at the end of the chain; between blocks it only
            // appears on hover or focus, so the column stays quiet.
            last
              ? "opacity-100"
              : "opacity-0 group-hover/conn:opacity-100 focus-within:opacity-100",
          )}
          trigger={
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full border border-border bg-surface text-text-muted shadow-e1",
                "transition-colors hover:border-accent hover:bg-accent hover:text-accent-fg",
              )}
            >
              <Add className="size-3.5" />
            </span>
          }
          items={INSERTABLE.map((t) => ({
            id: t.kind,
            label: t.label,
            description: t.description,
            icon: <t.icon />,
          }))}
          onSelect={(kind) => onInsert(kind as BlockKind, index)}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Block card                                                                */
/* -------------------------------------------------------------------------- */

function BlockCard({
  block,
  index,
  selected,
  onSelect,
  onRemove,
  onDuplicate,
  onMove,
  canMoveUp,
  canMoveDown,
}: {
  block: WorkflowBlock;
  index: number;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onRemove?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onMove?: (id: string, direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const type = BLOCK_TYPES[block.kind];
  const Icon = type.icon;
  const isTrigger = block.kind === "trigger";

  return (
    <div
      // The card is a button, so the whole thing selects — but the menu inside
      // is a real button too, so clicks there must not also select.
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onSelect?.(block.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(block.id);
        }
      }}
      className={cn(
        "group/card relative flex cursor-pointer items-start gap-3 rounded-xl border bg-surface px-3.5 py-3 text-left shadow-e1",
        "transition-[border-color,box-shadow] duration-150 ease-out-quart",
        selected
          ? "border-accent ring-[3px] ring-accent-ring/25"
          : "border-border hover:border-border-strong hover:shadow-e2",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          isTrigger
            ? "bg-accent text-accent-fg"
            : "bg-accent-subtle text-accent-subtle-fg",
        )}
      >
        <Icon className="size-4.5" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
            {isTrigger ? type.label : `${index}. ${type.label}`}
          </span>
          {block.owner && (
            <>
              <span aria-hidden className="text-text-subtle">
                ·
              </span>
              <span className="truncate text-2xs text-text-subtle">
                {block.owner}
              </span>
            </>
          )}
        </div>

        <p className="truncate text-base font-medium text-text">
          {block.title}
        </p>

        {block.summary && (
          <p className="truncate text-sm text-text-muted">{block.summary}</p>
        )}

        {block.incomplete && (
          <Badge tone="warning" size="sm" className="mt-1 w-fit">
            <Warning />
            {block.incomplete}
          </Badge>
        )}
      </div>

      {/* Stop clicks bubbling to the card so opening the menu doesn't also
          change the selection. */}
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="shrink-0"
      >
        <DropdownMenu
          label={`${block.title} actions`}
          align="end"
          width="w-48"
          trigger={
            <span
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-md text-text-subtle transition-[color,opacity] hover:bg-surface-hover hover:text-text",
                "opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100",
                selected && "opacity-100",
              )}
            >
              <MoreHoriz className="size-4" />
            </span>
          }
          items={[
            ...(onMove
              ? [
                  {
                    id: "up",
                    label: "Move up",
                    icon: <ArrowUpward />,
                    disabled: !canMoveUp,
                    onSelect: () => onMove(block.id, -1),
                  },
                  {
                    id: "down",
                    label: "Move down",
                    icon: <ArrowDownward />,
                    disabled: !canMoveDown,
                    onSelect: () => onMove(block.id, 1),
                  },
                ]
              : []),
            ...(onDuplicate
              ? [
                  {
                    id: "duplicate",
                    label: "Duplicate",
                    icon: <ContentCopy />,
                    onSelect: () => onDuplicate(block.id),
                  },
                ]
              : []),
            ...(onRemove
              ? [
                  {
                    id: "remove",
                    label: "Delete step",
                    icon: <Delete />,
                    destructive: true,
                    separatorBefore: true,
                    onSelect: () => onRemove(block.id),
                  },
                ]
              : []),
          ]}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Inspector                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * What the right panel shows for the selected block. Kept here rather than in
 * the page so the builder ships with its own editing surface.
 */
export function BlockInspector({
  block,
  children,
}: {
  block?: WorkflowBlock | null;
  children?: React.ReactNode;
}) {
  if (!block) {
    return (
      <p className="text-sm leading-relaxed text-text-subtle">
        Select a block to configure it.
      </p>
    );
  }

  const type = BLOCK_TYPES[block.kind];
  const Icon = type.icon;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent-subtle-fg">
          <Icon className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
            {type.label}
          </span>
          <span className="truncate text-base font-medium">{block.title}</span>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-text-muted">
        {type.description}.
      </p>

      {children}
    </div>
  );
}
