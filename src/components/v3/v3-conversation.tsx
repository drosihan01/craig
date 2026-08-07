"use client";

import * as React from "react";
import { Button, CraigMark, PromptBar } from "@/components/ui";
import { V3_SESSION } from "@/lib/v3/session";
import { setThinking, setTurn, useV3 } from "@/lib/v3/store";
import { cn } from "@/lib/cn";

/**
 * Theo and Craig, on the setup screen.
 *
 * A separate component from `DraftSession` rather than a prop on it, for one
 * reason: every piece of this conversation's state lives in the v3 store, so
 * the play button can drive it by doing exactly what a click does. A component
 * that owned its own turn counter would need a second, parallel way in for the
 * director, and the two would drift the first time either changed.
 *
 * Which means there's no auto-play branch in here at all. `advance()` is what
 * the button calls and what the director calls, and neither knows about the
 * other.
 */

const BEAT = 900;

export function V3Conversation({ onFinish }: { onFinish: () => void }) {
  const { turn, thinking } = useV3();
  const timersRef = React.useRef<number[]>([]);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const pending = timersRef.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  /* The reply lands below the fold from the second turn on. */
  React.useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turn, thinking]);

  const shown = V3_SESSION.slice(0, turn);
  const next = V3_SESSION[turn];
  const done = turn >= V3_SESSION.length;

  /**
   * Say the next thing, then let Craig work before he answers.
   *
   * The phases aren't decoration — each names a document he'd have to open,
   * and Theo gave him three that disagree. Showing the reconciliation as work
   * is the difference between an assistant that read your files and one that
   * claims to have.
   */
  function advance() {
    if (!next || thinking) return;

    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    setTurn(turn + 0.5);

    next.steps.forEach((label, i) => {
      timersRef.current.push(
        window.setTimeout(() => setThinking(label), i * BEAT),
      );
    });
    timersRef.current.push(
      window.setTimeout(() => {
        setThinking(null);
        setTurn(turn + 1);
      }, next.steps.length * BEAT),
    );
  }

  return (
    <div className="flex flex-col gap-7">
      {shown.map((t, i) => (
        <Turn key={i} turn={t} />
      ))}

      {/* Half a turn: what he just said is on screen, Craig hasn't answered
          yet. Rendered from the fractional counter so the director and a click
          produce the same intermediate state. */}
      {turn % 1 !== 0 && next && (
        <div className="flex flex-col gap-4">
          <Said text={next.ada} attachment={next.attachment} />
          {thinking && (
            <div className="flex items-center gap-2">
              <CraigMark className="size-5 shrink-0 text-accent" />
              <span
                key={thinking}
                className="text-sm text-text-muted motion-safe:animate-[step-phase_260ms_cubic-bezier(0.25,1,0.5,1),soft-pulse_2.2s_ease-in-out_260ms_infinite]"
              >
                {thinking}
              </span>
            </div>
          )}
        </div>
      )}

      {/* His next line, offered rather than typed. The demo has to be
          drivable without anybody writing four paragraphs about ISO 13485. */}
      {!done && turn % 1 === 0 && (
        <button
          type="button"
          onClick={advance}
          data-v3-say
          className="ml-auto max-w-[85%] rounded-xl rounded-br-sm border border-dashed border-border bg-surface px-3.5 py-2.5 text-left text-base leading-relaxed text-text-muted transition-colors hover:border-border-strong hover:text-text"
        >
          {truncate(V3_SESSION[turn].ada)}
        </button>
      )}

      {done && (
        <div className="flex flex-col gap-3 rounded-xl border border-dotted border-accent p-4">
          <p className="text-base leading-relaxed text-text">
            Ready when you are. I&apos;ll write the workflow from what
            you&apos;ve told me and flag the two things I couldn&apos;t work
            out.
          </p>
          <Button className="w-fit" onClick={onFinish} data-v3-build>
            Build this workflow
          </Button>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}

function Turn({ turn: t }: { turn: (typeof V3_SESSION)[number] }) {
  return (
    <div className="flex flex-col gap-4">
      <Said text={t.ada} attachment={t.attachment} />

      <div className="flex flex-col gap-2">
        <CraigMark className="size-5 text-accent" />
        <Body text={t.craig} />
        {/* The ask, pulled out of the prose. Buried at the end of four
            paragraphs it gets skimmed past, and then the reply below reads as
            answering nothing. */}
        {t.question && (
          <p className="mt-1 rounded-lg border border-dotted border-accent px-3.5 py-2.5 text-base leading-relaxed text-text">
            {t.question}
          </p>
        )}
      </div>
    </div>
  );
}

function Said({ text, attachment }: { text: string; attachment?: string }) {
  return (
    <div className="ml-auto flex max-w-[85%] flex-col items-end gap-1.5">
      {attachment && (
        <span className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-muted">
          {attachment}
        </span>
      )}
      <p className="whitespace-pre-wrap rounded-xl rounded-br-sm bg-accent-subtle px-3.5 py-2.5 text-base leading-relaxed text-accent-subtle-fg">
        {text}
      </p>
    </div>
  );
}

/** Lead line, then bullet runs as a real list. Theo's documents are lists; so
    are Craig's findings about them. */
function Body({ text }: { text: string }) {
  const runs: { bullet: boolean; lines: string[] }[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const bullet = line.startsWith("- ");
    const last = runs[runs.length - 1];
    if (last && last.bullet === bullet)
      last.lines.push(line.replace(/^- /, ""));
    else runs.push({ bullet, lines: [line.replace(/^- /, "")] });
  }

  return (
    <div className="flex flex-col gap-2.5">
      {runs.map((run, i) =>
        run.bullet ? (
          <ul key={i} className="flex flex-col gap-1.5 pl-1">
            {run.lines.map((l, j) => (
              <li key={j} className="flex gap-2 text-base leading-relaxed">
                <span aria-hidden className="text-text-subtle">
                  ·
                </span>
                <span className={cn("min-w-0 flex-1 text-text-muted")}>
                  {l}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          run.lines.map((l, j) => (
            <p key={j} className="text-base leading-relaxed text-text-muted">
              {l}
            </p>
          ))
        ),
      )}
    </div>
  );
}

const truncate = (s: string) =>
  s.length > 190 ? `${s.slice(0, 190).trimEnd()}…` : s;

export function V3Composer() {
  return (
    <PromptBar
      placeholder="Or write your own…"
      onSubmit={() => {}}
      footnote="Pick the suggested reply to move the conversation on."
    />
  );
}
