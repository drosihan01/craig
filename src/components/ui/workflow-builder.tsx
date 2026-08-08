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
  TaskAlt,
  Warning,
} from "./icons";
import { Badge } from "./badge";
import { Skeleton } from "./feedback";
import { BlockPicker } from "./block-picker";
import { DropdownMenu } from "./dropdown";
import {
  findPreset,
  missingRequired,
  type BlockPreset,
  type SetupField,
} from "@/lib/workflow/library";
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
  "trigger" | "task" | "approval" | "notify" | "branch" | "document";

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
    /* There is exactly one trigger and it is not a choice. Craig runs
       onboarding, onboarding starts when somebody gets a seat, and a trigger
       picker would only offer wrong answers. */
    label: "Trigger",
    description: "Fires when a new seat is added. Every workflow starts here",
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
  /** Answers to the preset's setup fields, keyed by field id. */
  config?: Record<string, string | string[]>;
  /**
   * A gap the admin has to close that isn't a missing field — "nobody owns
   * this yet", "the doc it points at is out of date". Sits alongside the
   * derived setup warning rather than replacing it.
   */
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

/**
 * The setup fields this block still needs.
 *
 * Derived rather than stored, so "unconfigured" can't drift from what's
 * actually missing — the badge, the nav count and the disabled Publish button
 * all read from the same answer. The rule itself is in the library, where the
 * server can reach it too: Craig drafts these blocks and has to leave the same
 * holes this reads back.
 */
export function missingSetup(block: WorkflowBlock): SetupField[] {
  return missingRequired(block.preset, block.config);
}

export function isUnconfigured(block: WorkflowBlock) {
  return Boolean(block.incomplete) || missingSetup(block).length > 0;
}

/** What the warning badge says. */
export function setupWarning(block: WorkflowBlock) {
  if (block.incomplete) return block.incomplete;
  const missing = missingSetup(block);
  if (missing.length === 0) return null;
  return missing.length === 1
    ? `Needs ${missing[0].label.toLowerCase()}`
    : `${missing.length} things to set up`;
}

/* -------------------------------------------------------------------------- */
/*  Builder                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A workflow arriving rather than having always been there.
 *
 * Purely a delay on each block's entrance, and deliberately nothing else. The
 * blocks are all rendered and all clickable from the first frame — what is
 * staggered is when each becomes visible, so somebody who clicks a card
 * halfway through gets the card they clicked. A reveal that withheld the
 * blocks would also make the counter and the Publish gate briefly describe a
 * workflow that doesn't exist, which is a lie told by an animation.
 *
 * `backwards` is what makes the delay mean anything: without it a card with a
 * 700ms delay sits fully visible for 700ms and then fades in from nothing.
 * `motion-safe` because somebody who has asked for less movement is asking for
 * this, and the workflow is entirely legible without it.
 */
const ARRIVING =
  "motion-safe:animate-[step-phase_420ms_cubic-bezier(0.25,1,0.5,1)_backwards]";

/**
 * How long the column sits as placeholders before the first one resolves.
 *
 * The reveal used to be a fade and nothing else, which meant a two-block draft
 * — which is what Craig writes most of the time — was over in about four
 * hundred milliseconds. Not slow enough to read as anything, so the workflow
 * simply appeared and the conversation's whole payoff went past unnoticed.
 *
 * A beat of empty cards first gives the sequence a shape: you see how many
 * steps are coming before you can read any of them, which is the part worth
 * watching, and it means the animation is telling you something rather than
 * just taking time.
 */
const REVEAL_START = 340;

/**
 * Between one block resolving and the next.
 *
 * Scaled to the length, not fixed. A fixed beat has to be chosen for one size
 * of workflow and is wrong for the other: slow enough to notice on a two-step
 * draft is four seconds of waiting on a twelve-step one, and quick enough for
 * twelve is invisible on two. So short lists get the full beat and long ones
 * compress, which holds the whole reveal to roughly two seconds either way.
 */
const revealBeat = (count: number) =>
  Math.max(120, Math.min(300, Math.round(1800 / Math.max(count, 1))));

/**
 * How long a reveal of `count` blocks takes, end to end.
 *
 * Exported because the editor draws a "laying it out" line for exactly as long
 * as this runs, and it used to guess — a hardcoded ceiling with a comment
 * admitting a long workflow would outrun it. Two places deriving the same
 * duration from the same numbers cannot disagree about when it finished.
 */
export const revealDuration = (count: number) =>
  REVEAL_START + count * revealBeat(count) + 420;

const arriving = (delay?: number) =>
  delay === undefined
    ? undefined
    : { className: ARRIVING, style: { animationDelay: `${delay}ms` } };

export function WorkflowBuilder({
  blocks,
  selectedId,
  onSelect,
  onInsert,
  onRemove,
  onMove,
  onDuplicate,
  reveal,
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
  /** Land the blocks one after another instead of all at once. */
  reveal?: boolean;
  className?: string;
}) {
  /* How many blocks have finished arriving. Everything past this is still a
     placeholder. Starts at the full count when there's no reveal to run, so a
     workflow you already know never flickers through skeletons on its way to
     being itself. */
  const [landed, setLanded] = React.useState(() =>
    reveal ? 0 : blocks.length,
  );

  React.useEffect(() => {
    if (!reveal) {
      return;
    }

    const beat = revealBeat(blocks.length);
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;

    /* setTimeout that re-arms rather than setInterval: the first gap is longer
       than the rest, and an interval can only have one period. */
    const step = () => {
      i += 1;
      setLanded(i);
      if (i < blocks.length) timer = setTimeout(step, beat);
    };
    timer = setTimeout(step, REVEAL_START);

    return () => clearTimeout(timer);
  }, [reveal, blocks.length]);

  return (
    <div className={cn("mx-auto flex w-full max-w-xl flex-col", className)}>
      {blocks.map((block, i) => {
        const isTrigger = block.kind === "trigger";
        const isLast = i === blocks.length - 1;
        const at = reveal ? i * revealBeat(blocks.length) : undefined;

        /* Not yet resolved, so it's drawn as its own outline. Keyed the same as
           the real card so React swaps the contents rather than remounting the
           row — the connector below it stays put and the column doesn't jump
           as each one lands. */
        if (i >= landed) {
          return (
            <React.Fragment key={block.id}>
              <BlockSkeleton />
              <Connector
                onInsert={undefined}
                index={i + 1}
                last={isLast}
                arrival={undefined}
              />
            </React.Fragment>
          );
        }

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
              arrival={arriving(at)}
            />

            {/* Half a beat behind its card, so the thread grows out of the
                block above rather than arriving ahead of it. */}
            <Connector
              onInsert={onInsert}
              index={i + 1}
              last={isLast}
              arrival={arriving(at === undefined ? undefined : at + 55)}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
}

/**
 * A block that exists but hasn't been drawn yet.
 *
 * Deliberately the card's own shell — same border, padding, icon square and
 * two lines of text — rather than a generic grey box. The point is that the
 * step is already there and is still resolving, and a placeholder shaped like
 * something else would read as a different kind of thing entirely, then be
 * replaced.
 *
 * No arrival animation. These are what the animation is arriving *to*.
 */
function BlockSkeleton() {
  return (
    <div
      aria-hidden
      className="relative flex items-start gap-3.5 rounded-xl border border-border bg-surface px-4 py-3.5 shadow-e1"
    >
      <span
        aria-hidden
        className="absolute bottom-0 w-px border-l border-dashed border-border-strong"
        style={{ left: THREAD_X_IN_CARD, top: THREAD_TOP_IN_CARD }}
      />
      <Skeleton className="size-10 shrink-0 rounded-lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
        <Skeleton className="h-2 w-16" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

/** How a block is told to make an entrance. Undefined means it's just there. */
interface Arrival {
  className: string;
  style: React.CSSProperties;
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
  arrival,
}: {
  index: number;
  onInsert?: (preset: BlockPreset, index: number) => void;
  last?: boolean;
  arrival?: Arrival;
}) {
  const [picking, setPicking] = React.useState(false);

  return (
    <div
      className={cn("group/conn relative h-14", arrival?.className)}
      style={arrival?.style}
    >
      {/* Solid across the gap; dashed inside the cards above and below. Same
          thread, two treatments — see THREAD_X for why the offset is 33 here
          and 32 inside a card.

          On the last connector the thread stops at the add button instead of
          running past it. A line that continues into nothing reads as "more
          below", and there isn't any. */}
      <span
        aria-hidden
        className={cn(
          "absolute top-0 w-px bg-border-strong",
          last ? "h-1/2" : "bottom-0",
        )}
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
  arrival,
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
  arrival?: Arrival;
}) {
  const type = blockLabel(block);
  const Icon = type.icon;
  const isTrigger = block.kind === "trigger";
  const warning = setupWarning(block);

  return (
    <div
      data-block-card
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
        arrival?.className,
      )}
      style={arrival?.style}
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

        {warning && (
          <Badge tone="warning" size="sm" className="mt-1 w-fit">
            <Warning />
            {warning}
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
