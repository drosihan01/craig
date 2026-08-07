"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Close, PlayArrow, Refresh } from "@/components/ui/icons";
import { V3_STARTER } from "@/lib/v3/company";
import { V3_ANSWERS } from "@/lib/v3/workflow";
import { V3_SCRIPT } from "@/lib/v3/run";
import { V3_SESSION } from "@/lib/v3/session";
import {
  advanceRun,
  answerBlock,
  inviteStarter,
  logBeat,
  publish,
  resetV3,
  setPlaying,
  setScene,
  setThinking,
  setTurn,
  useV3,
} from "@/lib/v3/store";
import { cn } from "@/lib/cn";

/**
 * The play button.
 *
 * Every v3 page renders from the store and nothing else, which is what makes
 * this possible: the director drives the demo by doing exactly what a person
 * clicking would do — change store state, change route — and the pages can't
 * tell the difference. There is no auto-play branch anywhere in a page.
 *
 * The alternative, a director that reaches into pages and clicks their
 * buttons, breaks the first time a button moves. This breaks only if the
 * *story* changes, which is the right coupling.
 *
 * Pacing is the whole craft here. Too fast and it reads as a loading bar; too
 * slow and nobody watches it twice. Each act carries its own hold, and the
 * long ones are deliberate — Craig reading three contradictory documents
 * should visibly cost him something, and the police check clearing is the
 * moment the ordering pays off, so it gets room.
 */

interface Act {
  /** Where this act has to happen. The director navigates first if it isn't there. */
  at?: string;
  /** What the act does. Same calls a click would make. */
  run?: () => void;
  /** Milliseconds to hold *after* it, before the next act. */
  hold: number;
  /** Shown in the pill while it runs, so the viewer knows what they're watching. */
  caption: string;
}

function script(): Act[] {
  const acts: Act[] = [
    {
      at: "/v3",
      hold: 1400,
      caption: "Signing up",
    },
    {
      at: "/v3/setup",
      run: () => setScene("setup"),
      hold: 1200,
      caption: "Theo brings what he already has",
    },
  ];

  /* The conversation. Each turn is his message, Craig's phases, then the
     reply — the fractional turn is the half-state where he's spoken and Craig
     hasn't answered, which is where the reading actually happens. */
  V3_SESSION.forEach((t, i) => {
    acts.push({
      at: "/v3/setup",
      run: () => setTurn(i + 0.5),
      hold: 900,
      caption: i === 0 ? "Uploading three documents" : "Answering Craig",
    });
    t.steps.forEach((label, j) => {
      acts.push({
        at: "/v3/setup",
        run: () => setThinking(label),
        hold: j === t.steps.length - 1 ? 1100 : 850,
        caption: label,
      });
    });
    acts.push({
      at: "/v3/setup",
      run: () => {
        setThinking(null);
        setTurn(i + 1);
      },
      /* Long. This is the reply, and the first one is the whole argument of
         the demo — three documents that don't agree, named by clause. */
      hold: i === 0 ? 6500 : 5200,
      caption: "Craig reads it back",
    });
  });

  acts.push(
    {
      at: "/v3/setup",
      run: () => setScene("building"),
      hold: 6200,
      caption: "Writing the workflow",
    },
    {
      at: "/v3/workflows/qsa",
      run: () => setScene("builder"),
      hold: 2600,
      caption: "Two questions Craig wouldn't guess at",
    },
  );

  /* Scene four — Theo answers both, one at a time so each lands. */
  Object.entries(V3_ANSWERS).forEach(([id, a]) => {
    acts.push({
      at: "/v3/workflows/qsa",
      run: () => answerBlock(id, a.config),
      hold: 2200,
      caption: "Theo answers",
    });
  });

  acts.push(
    {
      at: "/v3/workflows/qsa",
      run: publish,
      hold: 2400,
      caption: "Published",
    },
    {
      at: "/v3/workflows/qsa",
      run: inviteStarter,
      hold: 1800,
      caption: `Inviting ${V3_STARTER.name.split(" ")[0]}`,
    },
    {
      at: `/v3/people/${V3_STARTER.id}`,
      run: () => setScene("progress"),
      hold: 2400,
      caption: "Watching it run",
    },
  );

  /* Scene six — the week, compressed. */
  V3_SCRIPT.forEach((beat) => {
    acts.push({
      at: `/v3/people/${V3_STARTER.id}`,
      run: () => {
        advanceRun(beat.step, beat.status, beat.certainty);
        logBeat(beat.note);
      },
      hold: beat.hold ?? 1000,
      caption: beat.note,
    });
  });

  acts.push(
    {
      at: "/v3/home",
      run: () => setScene("celebrate"),
      hold: 5000,
      caption: "She's in",
    },
    {
      at: "/v3/home",
      run: () => setScene("paywall"),
      hold: 4000,
      caption: `Adding ${"Aaron"} — the second seat`,
    },
    {
      run: () => setScene("done"),
      hold: 0,
      caption: "That's the flow",
    },
  );

  return acts;
}

/* Built once. It's derived entirely from fixtures, so recomputing it per
   render would be work to produce the same array. */
const ACTS = script();

export function V3Director() {
  const router = useRouter();
  const pathname = usePathname();
  const { playing } = useV3();

  const [act, setAct] = React.useState(0);
  const [caption, setCaption] = React.useState<string | null>(null);
  const timerRef = React.useRef<number | null>(null);
  /* Where the director believes it is. Not `usePathname` — that updates a
     frame late, and `step` closes over its value, so reading it here would
     make every act after a navigation think it still needed to navigate. Only
     ever written from a timeout or a click, never during render. */
  const atRef = React.useRef<string | null>(null);

  const stop = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setPlaying(false);
    setCaption(null);
  }, []);

  React.useEffect(() => () => stop(), [stop]);

  /**
   * Run one act, then queue the next.
   *
   * Navigation happens before the act rather than as part of it, so a page
   * always has a frame to mount before anything mutates underneath it.
   *
   * The chain recurses, so it goes through a ref rather than closing over
   * itself — a self-referential useCallback can't see its own binding, and
   * hoisting it into a plain function would recreate it every render and
   * strand the timeouts already queued against the old one.
   */
  const stepRef = React.useRef<(i: number) => void>(() => {});

  const step = React.useCallback(
    (i: number) => {
      if (i >= ACTS.length) {
        stop();
        return;
      }
      const a = ACTS[i];
      setAct(i);
      setCaption(a.caption);

      const go = () => {
        a.run?.();
        timerRef.current = window.setTimeout(
          () => stepRef.current(i + 1),
          a.hold,
        );
      };

      if (a.at && a.at !== atRef.current) {
        router.push(a.at);
        atRef.current = a.at;
        /* A beat for the route to actually render. Mutating the store into a
           page that hasn't mounted works, but you don't see it happen, and
           the whole point is watching it happen. */
        timerRef.current = window.setTimeout(go, 650);
      } else {
        go();
      }
    },
    [router, stop],
  );

  React.useEffect(() => {
    stepRef.current = step;
  }, [step]);

  function play() {
    resetV3();
    setPlaying(true);
    setAct(0);
    /* Already on the opening scene: don't navigate, just start. Pushing the
       route you're on is a no-op that still costs the 650ms settle. */
    atRef.current = pathname;
    timerRef.current = window.setTimeout(() => step(0), 500);
  }

  function restart() {
    stop();
    resetV3();
    atRef.current = "/v3";
    router.push("/v3");
  }

  const total = ACTS.length;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {/* What you're watching, in Craig's words. Without it an auto-playing
          demo is a screen that changes on its own. */}
      {playing && caption && (
        <div className="pointer-events-auto max-w-xs rounded-xl border border-border bg-surface px-3 py-2 shadow-e2 motion-safe:animate-[toast-in_200ms_cubic-bezier(0.25,1,0.5,1)]">
          <p className="text-xs leading-relaxed text-text-muted">{caption}</p>
          <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out-quart"
              style={{ width: `${Math.round(((act + 1) / total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-surface p-1 shadow-e2">
        <button
          type="button"
          onClick={restart}
          aria-label="Start the demo over"
          className="inline-flex size-8 items-center justify-center rounded-full text-text-subtle transition-colors hover:bg-surface-hover hover:text-text"
        >
          <Refresh className="size-4" />
        </button>

        <button
          type="button"
          onClick={playing ? stop : play}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors",
            playing
              ? "bg-surface-sunken text-text hover:bg-surface-hover"
              : "bg-accent text-accent-fg hover:opacity-90",
          )}
        >
          {playing ? (
            <>
              <Close className="size-4" />
              Stop
            </>
          ) : (
            <>
              <PlayArrow className="size-4" />
              Play the flow
            </>
          )}
        </button>
      </div>
    </div>
  );
}
