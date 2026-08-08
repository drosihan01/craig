"use client";

import * as React from "react";
import {
  AgentPhase,
  AgentQuestion,
  Button,
  CraigMark,
  PersonTurn,
  PromptBar,
  useAgentWork,
} from "@/components/ui";
import { V3_SESSION } from "@/lib/v3/session";
import {
  setDraft,
  setThinking,
  setTurn,
  typeDraft,
  useV3,
} from "@/lib/v3/store";
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
  const { turn, thinking, draft } = useV3();
  /* The phase lives in the store rather than in this component, because the
     director drives the same conversation and both have to be looking at one
     copy of it. */
  const work = useAgentWork({ beat: BEAT, onPhase: setThinking });
  const endRef = React.useRef<HTMLDivElement>(null);

  /* The reply lands below the fold from the second turn on. */
  React.useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turn, thinking]);

  const shown = V3_SESSION.slice(0, turn);
  const next = V3_SESSION[turn];
  const done = turn >= V3_SESSION.length;

  /**
   * Fill the composer, then send it.
   *
   * Two beats rather than one. Jumping straight to the message skips the only
   * moment that shows what the box is for, and the demo had the composer
   * sitting unused underneath a conversation it was supposedly driving.
   */
  function say() {
    if (!next || thinking) return;
    work.cancel();
    typeDraft(next.ada);
    work.after(send, 2000);
  }

  /**
   * Say it, then let him work before he answers.
   *
   * The phases aren't decoration — each names a document he'd have to open,
   * and Theo gave him three that disagree. Showing the reconciliation as work
   * is the difference between an assistant that read your files and one that
   * claims to have.
   */
  function send() {
    if (!next || thinking) return;

    setDraft("");
    setTurn(turn + 0.5);
    work.run(next.steps, () => setTurn(turn + 1));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto pb-8">
        {shown.map((t, i) => (
          <Turn key={i} turn={t} />
        ))}

        {/* Half a turn: what he just said is on screen, Craig hasn't answered
            yet. Rendered from the fractional counter so the director and a click
            produce the same intermediate state. */}
        {turn % 1 !== 0 && next && (
          <div className="flex flex-col gap-4">
            <Said text={next.ada} attachment={next.attachment} />
            <AgentPhase label={thinking} mark />
          </div>
        )}

        {/* Offered rather than typed. Nobody is writing four paragraphs about
            ISO 13485 to see a demo — but clicking it puts the words in the
            composer instead of posting them, so the box is still the thing that
            sends messages. */}
        {!done && turn % 1 === 0 && !draft && (
          <button
            type="button"
            onClick={say}
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

      {/* Pinned. The conversation scrolls; the thing you talk with doesn't
          wander down the page as it fills. */}
      <div className="shrink-0 pb-6" data-v3-composer>
        <V3Composer onSend={send} />
      </div>
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
        {t.question && (
          <AgentQuestion className="mt-1">{t.question}</AgentQuestion>
        )}
      </div>
    </div>
  );
}

function Said({ text, attachment }: { text: string; attachment?: string }) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      {attachment && (
        <span className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-muted">
          {attachment}
        </span>
      )}
      <PersonTurn>{text}</PersonTurn>
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

/**
 * The composer, wired to the same draft the director types into.
 *
 * Controlled rather than uncontrolled precisely so it can be driven — the
 * play button and a person clicking the suggested reply both end up putting
 * text in this box and pressing send, which is what makes watching it and
 * doing it the same thing.
 */
export function V3Composer({ onSend }: { onSend: () => void }) {
  const { draft, thinking } = useV3();

  return (
    <PromptBar
      value={draft}
      onValueChange={setDraft}
      busy={Boolean(thinking)}
      placeholder="Tell Craig about your company…"
      onSubmit={onSend}
      footnote="Attach whatever you already have — however out of date it is."
    />
  );
}
