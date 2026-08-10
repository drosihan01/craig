"use client";

import * as React from "react";
import {
  Add,
  AltRoute,
  ArrowDownward,
  ArrowUpward,
  Bolt,
  Check,
  ContentCopy,
  Delete,
  Description,
  DragIndicator,
  HowToReg,
  Mail,
  TaskAlt,
  Warning,
} from "./icons";
import { Badge } from "./badge";
import { dueLabel } from "@/lib/workflow/library";
import { Skeleton } from "./feedback";
import { BlockPicker } from "./block-picker";
import { DropdownMenu, type DropdownItem } from "./dropdown";
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
   * When this step is due, in days relative to the person's first day.
   *
   * Negative is before day one, `0` is day one, positive is after. Absent
   * means no date was set, which is different from being due on day one and
   * has to stay different — most steps genuinely have no deadline, and giving
   * them all a default would fill the canvas with dates nobody chose.
   *
   * An offset rather than a date, because a workflow is a template. It is run
   * again for the next hire and the one after, so a real date on a block would
   * be the same day for everybody and wrong for all but the first. The date
   * only exists once there is a person: `dueDateFrom` resolves it against
   * their start date, which is why their screen can say "due Thursday" and the
   * builder can only say "the day before".
   */
  due?: number;
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
  onReorder,
  onDuplicate,
  reveal,
  warningFor,
  noteFor,
  className,
}: {
  blocks: WorkflowBlock[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** index is the position the new block should occupy. */
  onInsert?: (preset: BlockPreset, index: number) => void;
  onRemove?: (id: string) => void;
  onMove?: (id: string, direction: -1 | 1) => void;
  /**
   * Move a block anywhere, not just one place. `to` is the index it should
   * occupy once it has landed, counted in the array it ends up in — so a
   * block travelling downwards gets a number that already accounts for its
   * own absence.
   *
   * Separate from `onMove` rather than replacing it because they answer
   * different questions. `onMove` is "swap with your neighbour", which is what
   * the menu items mean and what a keyboard user gets; a drag can cross six
   * steps in one gesture and there is no honest way to express that as a
   * direction. Passing this is also what turns dragging on at all: a call site
   * that can't reorder shouldn't offer a grip that does nothing.
   */
  onReorder?: (id: string, to: number) => void;
  onDuplicate?: (id: string) => void;
  /** Land the blocks one after another instead of all at once. */
  reveal?: boolean;
  /**
   * A warning the block cannot work out for itself.
   *
   * `setupWarning` answers "is anything missing *on this block*", which is the
   * whole story for a step whose readiness is its own fields. It is not the
   * whole story for a step that depends on something outside the canvas — a
   * Google Workspace step is complete in every way this file can see and still
   * unable to run, because nobody has connected a Workspace.
   *
   * A callback rather than a Google-shaped prop: this component is the design
   * system's, used by three demos that have never heard of Google, and the
   * screen that knows about connections is the one that should say so.
   */
  warningFor?: (block: WorkflowBlock) => string | null;
  /**
   * The good news about a block, from the same outside knowledge as
   * `warningFor` and drawn in the same slot.
   *
   * The pair exists because the canvas could only ever report faults. A step
   * waiting on a connection nobody has made wore a warning; a step whose
   * connection is live wore nothing at all — the same nothing as a step that
   * reaches outside the product entirely and the same nothing as a plain
   * "fill this in yourself" task. Somebody assembling a workflow is asking
   * "which of these will Craig actually do", and three unlike answers drawn
   * identically is not an answer.
   *
   * A second callback rather than a `tone` on the first, because the two are
   * not alternatives: a block can be connected *and* still missing a required
   * field, and both facts belong on the card. Kept as a plain string for the
   * reason `warningFor` is one — this component must not learn what a
   * connection is.
   */
  noteFor?: (block: WorkflowBlock) => string | null;
  className?: string;
}) {
  /**
   * How far down the column the reveal has got. Everything at or past it is
   * still a placeholder.
   *
   * A count, not a headcount: it ends at infinity rather than at
   * `blocks.length`, and that is the whole point of it. It used to stop at the
   * number of blocks there were when the reveal ran, which quietly turned it
   * into a cap on how many blocks the column would ever draw — add a step
   * afterwards and it fell outside the count, so it rendered as a pulsing
   * placeholder with no timer left running to ever resolve it. The step you
   * had just asked for was the one thing on the canvas that never arrived.
   *
   * Once the sequence is done, nothing is ever withheld again. Infinity says
   * that in a way a number can't, because there is no later insert that can
   * outgrow it.
   */
  const [landed, setLanded] = React.useState(() =>
    reveal ? 0 : Number.POSITIVE_INFINITY,
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
      if (i < blocks.length) {
        setLanded(i);
        timer = setTimeout(step, beat);
      } else {
        /* The last one lands and the gate comes off for good. Setting the
           count here instead would leave it exactly one insert away from the
           bug above. */
        setLanded(Number.POSITIVE_INFINITY);
      }
    };
    timer = setTimeout(step, REVEAL_START);

    return () => clearTimeout(timer);
  }, [reveal, blocks.length]);

  /**
   * The drag, held here rather than on the cards.
   *
   * Two facts: which block is in your hand, and where in the column it has
   * provisionally moved to. A card that only knew about itself could express
   * the first and never the second, and the second is the whole feature.
   */
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = React.useState<number | null>(null);

  const columnRef = React.useRef<HTMLDivElement>(null);
  const rowTopsRef = React.useRef(new Map<string, number>());

  /**
   * The blocks travel to their new positions rather than appearing in them.
   *
   * Reordering an array repaints the column in its new arrangement instantly,
   * which reads as the list redrawing rather than as one step moving past
   * another — and what the drag is for is watching an order change, so a cut
   * between two orders throws away the thing you were trying to see.
   *
   * The old position of each row is remembered, and any row that has since
   * moved is put back where it was and then released, so the browser animates
   * the difference. Transform only: the layout has already happened and is
   * correct, this is purely how the pixels get there, which keeps it off the
   * layout path no matter how long the workflow is.
   *
   * `offsetTop`, not `getBoundingClientRect()`. The builder sits on a canvas
   * that zooms, and rects come back in painted pixels — a translate computed
   * from them would overshoot at any zoom but 100%. Offsets are layout pixels
   * and don't know the canvas is scaled.
   *
   * Only while a drag is running. The column moves for other reasons — a step
   * is inserted, the reveal swaps a placeholder for a card — and those bring
   * their own entrance animation, which sets `transform` too; two animations
   * writing the same property is one of them silently winning.
   */
  React.useLayoutEffect(() => {
    const column = columnRef.current;
    if (!column) return;

    if (!draggingId) {
      rowTopsRef.current.clear();
      return;
    }

    const previous = rowTopsRef.current;
    const current = new Map<string, number>();

    for (const row of column.querySelectorAll<HTMLElement>("[data-row-id]")) {
      const id = row.dataset.rowId;
      if (!id) continue;
      const top = row.offsetTop;
      current.set(id, top);

      const was = previous.get(id);
      if (was === undefined || was === top) continue;

      row.style.transition = "none";
      row.style.transform = `translateY(${was - top}px)`;
      /* Read something layout-dependent so the browser commits to that as the
         starting position. Without it both style writes land in the same frame
         and there is nothing to animate from. */
      void row.offsetHeight;
      row.style.transition = "";
      row.style.transform = "";
    }

    rowTopsRef.current = current;
  });

  /* Where the carried block really lives, in the stored order. -1 when nothing
     is in flight, which every guard below reads as "there is nothing to drop". */
  const origin = draggingId ? blocks.findIndex((b) => b.id === draggingId) : -1;

  /**
   * The column as it would be if you let go now.
   *
   * This is the whole preview, and it is deliberately not a separate ghost
   * element drawn alongside the real ones. A placeholder shape at the drop
   * position plus the held card still sitting at its origin is two objects
   * where the reader has one: it makes you work out which of them is the block
   * and which is the space, and it can only ever approximate the result
   * because the placeholder has to guess a height the real card already knows.
   *
   * Moving the block within the rendered order instead means the answer is
   * exact by construction — the arrangement on screen during the drag is the
   * arrangement you get, drawn by the same cards, at their own heights, with
   * their own numbering. There is one block, it is dimmed, and it is where it
   * would land.
   */
  const view = React.useMemo(() => {
    if (origin < 1 || previewIndex === null || previewIndex === origin) {
      return blocks;
    }
    const next = [...blocks];
    const [moved] = next.splice(origin, 1);
    next.splice(previewIndex, 0, moved);
    return next;
  }, [blocks, origin, previewIndex]);

  /* Where the held block sits in what's on screen — which is the preview
     position once there is one, and its real one until then. Everything below
     reasons in these coordinates, because these are the ones the pointer is
     actually over. */
  const held = origin < 1 ? -1 : (previewIndex ?? origin);

  /**
   * Gaps are numbered the way the connectors already are: gap `g` is the space
   * between the block at `g - 1` and the block at `g`, so gap 1 sits directly
   * under the trigger and gap `view.length` is the bottom of the column.
   *
   * Gap 0 — above the trigger — is deliberately not a number this accepts. The
   * trigger is structural and nothing may precede it, and the refusal has to
   * happen while you are still holding the block: a drop that quietly corrects
   * itself to position 1 teaches that the rule doesn't exist, and the same
   * person tries it again next week.
   */
  const droppable = (gap: number) =>
    held >= 1 && gap >= 1 && gap <= view.length;

  /* Which index the held block takes if released into `gap`. Landing in either
     of its own two gaps leaves it exactly where it is, and the arithmetic says
     so on its own — no special case needed. */
  const landing = (gap: number) => (gap > held ? gap - 1 : gap);

  function startDrag(id: string, e: React.DragEvent<HTMLElement>) {
    /* Firefox refuses to start a drag at all unless the transfer carries
       something, so this is load-bearing even though nothing reads it back —
       the drop handler knows the block from `draggingId`, because dataTransfer
       is write-only until the drop and the preview has to move before that. */
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";

    /* Deferred one frame. The browser photographs the element as this handler
       returns and tows that picture around under the pointer — so fading the
       card in the same tick fades the photograph too, and you spend the drag
       carrying a rectangle you can no longer read. */
    requestAnimationFrame(() => setDraggingId(id));
  }

  function endDrag() {
    setDraggingId(null);
    setPreviewIndex(null);
  }

  function overGap(gap: number, e: React.DragEvent) {
    if (!droppable(gap)) {
      /* Withholding preventDefault is the refusal: the browser keeps the
         no-entry cursor and never fires a drop here. */
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    /* Settling on the position it already holds is the same value, so React
       drops the update and the column doesn't re-render on every dragover. */
    setPreviewIndex(landing(gap));
  }

  function dropInGap(gap: number, e: React.DragEvent) {
    e.preventDefault();
    const id = draggingId;
    const to = landing(gap);
    const ok = droppable(gap) && to !== origin;
    endDrag();
    if (id && ok) onReorder?.(id, to);
  }

  /* A card is two drop zones, not one: its top half means "above me" and its
     bottom half "below me". A whole-card target can only ever say one of
     those, which would leave the other only reachable by aiming at the 56px
     connector — and the gap between two steps is not a thing anyone aims at.

     This is also what keeps the preview from oscillating. Once the held block
     has moved into the position you pointed at, the thing under the pointer is
     the held block itself, and both of its own gaps resolve to the position it
     already occupies — so the arrangement settles instead of the two cards
     trading places for as long as you hold still. */
  const gapAt = (i: number, e: React.DragEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return e.clientY < box.top + box.height / 2 ? i : i + 1;
  };

  return (
    <div
      ref={columnRef}
      className={cn("mx-auto flex w-full max-w-xl flex-col", className)}
      /* Leaving the column puts the block back where it came from. Moving
         between two cards also fires a leave for the one behind you, so
         anything still inside has to be ignored or the preview collapses and
         re-forms the whole way down. A null relatedTarget — the pointer left
         the window — counts as outside. */
      onDragLeave={
        onReorder
          ? (e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setPreviewIndex(null);
              }
            }
          : undefined
      }
    >
      {view.map((block, i) => {
        const isTrigger = block.kind === "trigger";
        const isLast = i === view.length - 1;
        const at = reveal ? i * revealBeat(view.length) : undefined;
        /* The trigger has no grip. It cannot be moved by any route, and a
           handle that refuses on pickup is worse than no handle. */
        const canDrag = Boolean(onReorder) && !isTrigger;

        /* Not yet resolved, so it's drawn as its own outline. Keyed the same as
           the real card so React swaps the contents rather than remounting the
           row — the connector below it stays put and the column doesn't jump
           as each one lands.

           `reveal` is checked as well as the count because a reveal can be
           called off half-way: the editor stops it dead the moment you select
           or insert anything, which leaves the effect returning early and
           `landed` frozen wherever the timer had got to. Read on its own that
           number would hold the rest of the column as placeholders forever.
           Nobody is revealing anything, so nothing is withheld. */
        if (reveal && i >= landed) {
          return (
            <Row key={block.id} id={block.id}>
              <BlockSkeleton />
              <Connector
                onInsert={undefined}
                index={i + 1}
                last={isLast}
                arrival={undefined}
              />
            </Row>
          );
        }

        return (
          <Row key={block.id} id={block.id}>
            <BlockCard
              block={block}
              index={i}
              selected={selectedId === block.id}
              onSelect={onSelect}
              onRemove={isTrigger ? undefined : onRemove}
              onDuplicate={isTrigger ? undefined : onDuplicate}
              onMove={isTrigger ? undefined : onMove}
              warning={warningFor?.(block) ?? undefined}
              note={noteFor?.(block) ?? undefined}
              canMoveUp={i > 1}
              canMoveDown={!isLast && i > 0}
              dragging={draggingId === block.id}
              onDragStart={canDrag ? (e) => startDrag(block.id, e) : undefined}
              onDragEnd={canDrag ? endDrag : undefined}
              /* Every card is a landing site, including the trigger — its
                 bottom half is gap 1, the only legal place directly beside
                 it. Its top half resolves to gap 0 and is refused. */
              onDragOver={
                onReorder ? (e) => overGap(gapAt(i, e), e) : undefined
              }
              onDrop={onReorder ? (e) => dropInGap(gapAt(i, e), e) : undefined}
              arrival={arriving(at)}
            />

            {/* Half a beat behind its card, so the thread grows out of the
                block above rather than arriving ahead of it. */}
            <Connector
              onInsert={onInsert}
              index={i + 1}
              last={isLast}
              dragActive={draggingId !== null}
              onDragOver={onReorder ? (e) => overGap(i + 1, e) : undefined}
              onDrop={onReorder ? (e) => dropInGap(i + 1, e) : undefined}
              arrival={arriving(at === undefined ? undefined : at + 55)}
            />
          </Row>
        );
      })}
    </div>
  );
}

/**
 * One step's worth of column: the card and the gap beneath it, as a single
 * thing that can be moved.
 *
 * They were two siblings until the drag preview needed them to travel
 * together — a card that slid to a new position leaving its own connector
 * behind would tear the thread in half. The wrapper is also what the reorder
 * animation measures and moves, which is why it carries the block's id.
 */
function Row({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div
      data-row-id={id}
      className="motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out-quart"
    >
      {children}
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
 * The space between two blocks: the only place a step can be inserted, and one
 * of the places a dragged block can be dropped. Both meanings are the same
 * fact — this is the space between step `index - 1` and step `index` — so one
 * element carries the add button and the drop target rather than two things
 * that have to be kept in agreement about where a step goes.
 *
 * The button is always in the DOM so it's reachable by keyboard — hover just
 * fades it in for the mouse.
 */
function Connector({
  index,
  onInsert,
  last,
  dragActive,
  onDragOver,
  onDrop,
  arrival,
}: {
  index: number;
  onInsert?: (preset: BlockPreset, index: number) => void;
  last?: boolean;
  /** Somebody is carrying a block somewhere in the column. */
  dragActive?: boolean;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
  arrival?: Arrival;
}) {
  const [picking, setPicking] = React.useState(false);

  return (
    <div
      className={cn("group/conn relative h-14", arrival?.className)}
      style={arrival?.style}
      onDragOver={onDragOver}
      onDrop={onDrop}
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
          className={cn(
            "absolute top-1/2 z-10 -translate-y-1/2 transition-opacity",
            /* Out of the way for the length of a drag. It sits right where the
               ghost opens, and an "insert step" button under the pointer while
               your hands are full offers an action you can't take and clutters
               the preview of the one you're taking. */
            dragActive && "pointer-events-none opacity-0",
          )}
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
  dragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  arrival,
  warning: given,
  note,
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
  /** This is the block being carried, not merely one a drag is passing over. */
  dragging?: boolean;
  /** Given only when this block may be dragged — it also arms the grip. */
  onDragStart?: React.DragEventHandler<HTMLButtonElement>;
  onDragEnd?: React.DragEventHandler<HTMLButtonElement>;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
  arrival?: Arrival;
  /** Overrides the derived one — see `warningFor` above. */
  warning?: string;
  /** See `noteFor` above. Sits beside the warning, never in place of it. */
  note?: string;
}) {
  const type = blockLabel(block);
  const Icon = type.icon;
  const isTrigger = block.kind === "trigger";
  /* The given one wins. A step can be missing a field *and* be waiting on a
     connection, and the connection is the one that stops it running at all —
     telling somebody to answer a field on a step that could not run either way
     sends them to fix the smaller of two problems. */
  const warning = given ?? setupWarning(block);
  /* Null when nobody set one, which is most steps — a deadline is a decision
     somebody made, not a field every block has to carry. */
  const due = dueLabel(block.due);

  /**
   * What the grip's menu offers, gathered before the render so an empty one
   * can be dropped rather than drawn.
   *
   * This matters more than it used to. The grip is now permanent rather than
   * a thing that fades in under the mouse, and the trigger has no actions at
   * all — it can't be moved, copied or deleted — so leaving the control in
   * place for it would put a permanent handle on the one block that cannot be
   * handled, opening onto a menu with nothing in it.
   */
  const actions: DropdownItem[] = [
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
  ];

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
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "group/card relative flex cursor-pointer items-start gap-3.5 rounded-xl border bg-surface px-4 py-3.5 text-left shadow-e1",
        "transition-[border-color,box-shadow,opacity] duration-150 ease-out-quart",
        selected
          ? "border-accent ring-[3px] ring-accent-ring/25"
          : "border-border hover:border-border-strong hover:shadow-e2",
        /* The block in your hand, drawn where it would land rather than where
           it came from — this dimmed card *is* the preview, not a copy of it.
           There is deliberately no second one left behind at the origin: two
           renderings of one step, one solid and one faint, make the reader
           work out which is the block and which is the hole, and the column
           would be a step longer than any arrangement it could actually
           produce. Dimming rather than outlining keeps it legible as the thing
           it is — its own title, icon and new number — and keeps it distinct
           from the reveal's skeleton, which is a solid card of empty bars. */
        dragging && "opacity-40 shadow-none",
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

          {/* On the eyebrow beside the owner, not down with the warning. Who
              does it and when it's due are the two facts you scan a column of
              these for, and a badge below the title would have pushed every
              card taller for something four words long. */}
          {due && (
            <>
              <span aria-hidden className="text-text-subtle">
                ·
              </span>
              <span className="shrink-0 text-2xs text-text-subtle">{due}</span>
            </>
          )}
        </div>

        <p className="truncate text-base font-medium text-text">
          {block.title}
        </p>

        {block.summary && (
          <p className="truncate text-sm text-text-muted">{block.summary}</p>
        )}

        {/* One row for both, wrapping rather than truncating. A step can be
            connected and still short of a required answer, and those are two
            separate facts about it — "Slack connected" next to "2 to set up"
            is the honest reading, where picking one to show would make the
            card claim the other had been dealt with.

            Never both a warning *and* a note, though: `note` is only given
            when a connection is live and `warning` outranks `setupWarning`
            only when it is not, so the two connection states cannot both be
            true at once. The wrap is for note + setup warning. */}
        {(warning || note) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {note && (
              <Badge tone="success" size="sm">
                <Check />
                {note}
              </Badge>
            )}
            {warning && (
              <Badge tone="warning" size="sm">
                <Warning />
                {warning}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Stop clicks bubbling to the card so opening the menu doesn't also
          change the selection. */}
      {actions.length > 0 && (
        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="shrink-0"
        >
          {/**
           * One control, two gestures: drag it and the step moves, click it
           * and the menu opens.
           *
           * It reads as a grip rather than a three-dot menu because dragging
           * is the thing you'd never guess was there — a "more" glyph
           * announces a menu and nothing else, so the reordering underneath it
           * stayed undiscovered. The six dots are the one shape that means
           * "pick this up" without a label, and the menu is still one click
           * away underneath.
           *
           * Permanently visible, unlike the menu it replaces. A handle that
           * only exists once the mouse is already on the card can't advertise
           * that the column can be rearranged, which is exactly what a
           * first-time reader needs told; and a hover-only drag affordance is
           * unusable to anyone whose pointer isn't a mouse.
           *
           * It stays a real button, so Tab reaches it and Enter or Space opens
           * the menu — where Move up and Move down do by keyboard what the
           * drag does by hand. Dragging must never be the only route to an
           * order, and this is why those two items stay.
           */}
          <DropdownMenu
            label={`Reorder or edit ${block.title}`}
            align="end"
            width="w-48"
            triggerClassName={cn(
              "select-none rounded-md",
              onDragStart &&
                /* Safari won't drag an arbitrary element from a `draggable`
                   attribute alone; this is the property that actually makes a
                   button pick up there. Harmless everywhere else. */
                "cursor-grab active:cursor-grabbing [-webkit-user-drag:element]",
            )}
            triggerProps={{
              draggable: Boolean(onDragStart),
              onDragStart,
              onDragEnd,
              /* Says the part the icon can't. The menu is discoverable by
                 clicking; that this thing lifts is not. */
              title: onDragStart ? "Drag to reorder" : undefined,
            }}
            trigger={
              <span className="inline-flex size-7 items-center justify-center rounded-md text-text-subtle transition-colors group-hover/card:text-text-muted hover:bg-surface-hover hover:text-text">
                <DragIndicator className="size-4" />
              </span>
            }
            items={actions}
          />
        </div>
      )}
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
