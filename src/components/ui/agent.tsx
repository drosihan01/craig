"use client";

import * as React from "react";
import { CraigMark } from "./craig-mark";
import { cn } from "@/lib/cn";

/**
 * Craig working, and the person talking back.
 *
 * Four pieces, and they belong together because they're one idea: a
 * conversation with an agent looks different from a chat with a bot. He says
 * what he's doing while he does it, the doing takes time, the person's turns
 * are asides rather than the substance, and the thing he needs answering is
 * lifted out of his prose so it can't be skimmed past.
 *
 * Every demo had its own copy of all four. They agreed on the important parts
 * and had already drifted on the rest, which is the failure mode this file
 * exists to stop: the builder panel and Home are the same product, and Craig
 * should not read as a slightly different person depending on which screen
 * you found him on.
 */

/* --- What he's doing right now --------------------------------------------- */

/**
 * Two animations, and they say different things.
 *
 * `step-phase` plays once as a label arrives, so a new phase reads as a new
 * thing rather than as text being swapped underneath you. `soft-pulse` then
 * runs forever, because the gap between phases is long enough that a static
 * line starts to look like a process that has stopped.
 *
 * No spinner anywhere near this. The mark is beside it and the label changes
 * as he works — a spinning circle on top of both is a third thing saying what
 * two things already say.
 */
const PHASE_ANIMATION =
  "motion-safe:animate-[step-phase_260ms_cubic-bezier(0.25,1,0.5,1),soft-pulse_2.2s_ease-in-out_260ms_infinite]";

export function AgentPhase({
  label,
  mark = false,
  className,
}: {
  /** What he's doing. Null or empty renders nothing. */
  label?: string | null;
  /** Draw the mark beside it. Off where the caller already has one on screen. */
  mark?: boolean;
  className?: string;
}) {
  if (!label) return null;

  /* Keyed on the label so a new phase remounts this and the entry animation
     replays. Without it React reuses the element and the text snaps. */
  const line = (
    <span
      key={label}
      className={cn("text-sm text-text-muted", PHASE_ANIMATION, className)}
    >
      {label}
    </span>
  );

  if (!mark) return line;

  return (
    <div className="flex items-center gap-2">
      <CraigMark className="size-5 shrink-0 text-accent" />
      {line}
    </div>
  );
}

/* --- Doing it -------------------------------------------------------------- */

export interface AgentWorkOptions {
  /** How long each phase holds. */
  beat?: number;
  /** Extra time after the last phase before the change lands. */
  hold?: number;
  /** Leave the last phase on screen rather than clearing it at the end. */
  keepLast?: boolean;
  /**
   * Where the label goes when the phase doesn't live in this component — the
   * v3 store, which the demo director drives. Must be stable across renders.
   */
  onPhase?: (label: string | null) => void;
}

export interface AgentWork {
  /** The current phase, or null. Always null when `onPhase` owns the label. */
  phase: string | null;
  /** Run the labels on the beat, then commit the change. */
  run: (phases: string[], done?: () => void) => void;
  /** Drop everything pending and clear the phase. */
  cancel: () => void;
  /** Schedule something on the same timers, so `cancel` takes it with it. */
  after: (fn: () => void, ms: number) => void;
}

/**
 * Say what you're doing, take the time it would take, then do it.
 *
 * The phases aren't decoration and they aren't a progress bar. Each label
 * names a thing Craig would actually have to do, in the order he'd do it, so
 * the wait explains itself — and the change lands with the *last* phase rather
 * than the first, because a panel that updates while he's still "checking"
 * gives the game away.
 *
 * The timer array is created once and mutated, never replaced. The unmount
 * cleanup closes over it, so swapping in a fresh array on every run — which
 * every hand-rolled copy of this did — left the cleanup clearing timers nobody
 * was waiting on while the live ones fired into a dead component.
 */
export function useAgentWork({
  beat = 620,
  hold = 0,
  keepLast = false,
  onPhase,
}: AgentWorkOptions = {}): AgentWork {
  const [phase, setOwnPhase] = React.useState<string | null>(null);
  const timersRef = React.useRef<number[]>([]);

  React.useEffect(() => {
    const pending = timersRef.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const setPhase = onPhase ?? setOwnPhase;

  const clear = React.useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current.length = 0;
  }, []);

  const cancel = React.useCallback(() => {
    clear();
    setPhase(null);
  }, [clear, setPhase]);

  const after = React.useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);

  const run = React.useCallback(
    (phases: string[], done?: () => void) => {
      clear();
      /* The first label lands with the click rather than a tick after it —
         otherwise there's a frame where he's working with nothing to show for
         it, which on a full-screen build reads as a blank line. */
      if (phases.length > 0) setPhase(phases[0]);
      phases.slice(1).forEach((label, i) => {
        timersRef.current.push(
          window.setTimeout(() => setPhase(label), (i + 1) * beat),
        );
      });
      timersRef.current.push(
        window.setTimeout(
          () => {
            if (!keepLast) setPhase(null);
            done?.();
          },
          phases.length * beat + hold,
        ),
      );
    },
    [beat, hold, keepLast, clear, setPhase],
  );

  return { phase, run, cancel, after };
}

/* --- The other half of the conversation ------------------------------------ */

/**
 * What the person said.
 *
 * A bubble, right-aligned and capped well short of the column width, because
 * their turns are short and Craig's are prose. The asymmetry is deliberate:
 * two matching columns of speech bubbles is a messaging app, and this is
 * somebody briefing an agent that then goes and does something.
 *
 * `md` inside a full-width conversation, `sm` in a ~300px panel where the same
 * padding would leave the text nowhere to go.
 */
export function PersonTurn({
  children,
  size = "md",
  className,
}: {
  children: React.ReactNode;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "ml-auto max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-sm bg-accent-subtle text-accent-subtle-fg",
        size === "sm"
          ? "px-3 py-2 text-sm"
          : "px-3.5 py-2.5 text-base leading-relaxed",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The one thing he needs answering, lifted out of his prose.
 *
 * Buried at the end of four paragraphs it gets skimmed past, and then the
 * reply options underneath look like they belong to nothing.
 *
 * Dotted outline and no fill — it's an aside asking something, not a card
 * announcing something, and dotted is already this system's language for "this
 * line is provisional". A filled block read as heavier than the answer above
 * it, which put the question ahead of the work.
 */
export function AgentQuestion({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "rounded-lg border border-dotted border-accent px-3.5 py-2.5 text-base leading-relaxed text-text",
        className,
      )}
    >
      {children}
    </p>
  );
}
