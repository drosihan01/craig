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
import { BlockPicker } from "./block-picker";
import { DropdownMenu } from "./dropdown";
import { findPreset, type BlockPreset } from "@/lib/workflow/library";
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

/* The thread runs down the block icons, not down the middle of the column.
   Measured from the card's border box: 1px border + 16px padding (px-4) +
   20px (half of the size-10 icon) = 37. Inside a card the line is positioned
   against the *padding* box, which excludes that border — so it sits at 36.
   Miss this and the dashed and solid segments render a pixel apart. */
const THREAD_X = 37;
const THREAD_X_IN_CARD = THREAD_X - 1;
/* Where the dashed run starts: py-3.5 (14) + the icon (40), so it leaves the
   icon block's bottom edge rather than floating below it. */
const THREAD_TOP_IN_CARD = 54;

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
  /**
   * Which library preset this came from, when it came from one. Only affects
   * how the block is labelled and iconed — the engine runs `kind`.
   */
  preset?: string;
  title: string;
  summary?: string;
  owner?: string;
  /** Shown as an unresolved-configuration warning on the card. */
  incomplete?: string;
}

/** What a block calls itself: its preset if it has one, otherwise its kind. */
export function blockLabel(block: WorkflowBlock) {
  const preset = block.preset ? findPreset(block.preset) : undefined;
  const type = BLOCK_TYPES[block.kind];
  return {
    label: preset?.label ?? type.label,
    description: preset?.description ?? `${type.description}.`,
    icon: preset?.icon ?? type.icon,
  };
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
  onInsert?: (preset: BlockPreset, index: number) => void;
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
  onInsert?: (preset: BlockPreset, index: number) => void;
  last?: boolean;
}) {
  const [picking, setPicking] = React.useState(false);

  return (
    <div className="group/conn relative h-14">
      {/* Solid across the gap; dashed inside the cards above and below. Same
          thread, two treatments — see THREAD_X for why the offset is 33 here
          and 32 inside a card. */}
      <span
        aria-hidden
        className="absolute inset-y-0 w-px bg-border-strong"
        style={{ left: THREAD_X }}
      />

      {onInsert && (
        <span
          className="absolute top-1/2 z-10 -translate-y-1/2"
          style={{ left: THREAD_X - 14 }}
        >
          {/* Always visible — a hover-only affordance hides the single most
              important action in the builder. It stays small and quiet at rest
              and grows a label on hover. */}
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-label={last ? "Add a step" : "Insert a step here"}
            className={cn(
              "flex h-7 items-center gap-1 rounded-full border border-dashed border-border-strong bg-surface px-1.5 text-2xs font-medium text-text-subtle shadow-e1",
              "transition-[background-color,border-color,color,padding] duration-150 ease-out-quart",
              "hover:border-solid hover:border-accent hover:bg-accent hover:pl-2 hover:pr-2.5 hover:text-accent-fg",
              "focus-visible:border-solid focus-visible:border-accent",
            )}
          >
            <Add className="size-4 shrink-0" />
            <span className="hidden whitespace-nowrap group-hover/conn:inline">
              {last ? "Add step" : "Insert step"}
            </span>
          </button>

          <BlockPicker
            open={picking}
            onClose={() => setPicking(false)}
            onPick={(preset) => onInsert(preset, index)}
          />
        </span>
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
  const type = blockLabel(block);
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
        "group/card relative flex cursor-pointer items-start gap-3.5 rounded-xl border bg-surface px-4 py-3.5 text-left shadow-e1",
        "transition-[border-color,box-shadow] duration-150 ease-out-quart",
        selected
          ? "border-accent ring-[3px] ring-accent-ring/25"
          : "border-border hover:border-border-strong hover:shadow-e2",
      )}
    >
      {/* Dashed from just under the icon to the card's bottom edge, where the
          solid gap segment picks it up. Absolute rather than a flex child so
          it reaches the edge itself, not just where the content stops. */}
      <span
        aria-hidden
        className="absolute bottom-0 w-px border-l border-dashed border-border-strong"
        style={{ left: THREAD_X_IN_CARD, top: THREAD_TOP_IN_CARD }}
      />
      <span
        aria-hidden
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg",
          isTrigger
            ? "bg-accent text-accent-fg"
            : "bg-accent-subtle text-accent-subtle-fg",
        )}
      >
        <Icon className="size-5" />
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

  const type = blockLabel(block);
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
        {type.description}
      </p>

      {/* Named blocks sit on a generic mechanism, and which one decides what
          the engine does with it. Worth saying once, quietly. */}
      {block.preset && (
        <p className="text-xs text-text-subtle">
          Runs as a {BLOCK_TYPES[block.kind].label.toLowerCase()}.
        </p>
      )}

      {children}
    </div>
  );
}
