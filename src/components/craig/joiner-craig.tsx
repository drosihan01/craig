"use client";

import * as React from "react";
import { CraigMark, PromptBar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { JOINER_CHAT_ENDPOINT, type ChatEvent } from "@/lib/craig/contract";

/**
 * Craig, on the new starter's own screen.
 *
 * The checklist above this answers "what do I have to do". It cannot answer
 * "what does this step actually mean", "what happens if I miss Monday", "have
 * you got my form" — which are the questions somebody in their first week
 * actually has, and which currently have nowhere to go but an email to a
 * stranger who may be on leave.
 *
 * ## Why this is not `useCraigChat`
 *
 * The admin's hook is 429 lines and speaks a vocabulary this stream does not
 * have: phase lines, tool runs, notes, drafts, canvas edits, citation splitting.
 * All of that exists because Craig-for-the-admin has ten tools. Craig-for-a
 * joiner has **none** — deliberately, because the tools are the access boundary
 * (see `joiner-agent.ts`) — so his stream can only ever carry `delta` and
 * `error`.
 *
 * Bending the hook to serve both would mean an endpoint parameter, a payload
 * builder, and six event branches permanently dead on one of its two callers.
 * The reader of either surface then has to work out which half applies to them.
 * A hundred honest lines here is the cheaper thing to maintain, and it keeps the
 * property that matters: the joiner's client cannot send a field the joiner's
 * route would read, because it does not know how to build one.
 *
 * ## What it deliberately does not do
 *
 * The conversation is not persisted yet — reloading clears it. The `joiner`
 * thread kind exists in the database for exactly this and is not wired up here,
 * because saving somebody's transcript is a decision about *retention* (who can
 * read it later, how long it lives, whether the employer can see it) and that
 * argument deserves its own change rather than arriving as a side effect of a
 * chat box. Until then this is honest about being a conversation rather than a
 * record: nothing here implies a history it does not keep.
 */

interface Turn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Questions he can actually answer, offered rather than guessed at.
 *
 * A blank box invites the questions he has no way to answer — the wifi
 * password, who your manager is, where to park — and every one of those spends a
 * turn to produce a polite "I don't know". These three are drawn from what
 * `briefFor` puts in front of him, so the opening move is one that works.
 */
const OPENERS = [
  "What do I need to do next?",
  "What have I already sent you?",
  "When do I start?",
];

export function JoinerCraig({ firstName }: { firstName: string }) {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [streaming, setStreaming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  /* The tail of the conversation, kept in view as it arrives. `end` rather than
     scrolling the window: this panel sits under a checklist somebody may be
     reading, and yanking the whole page to the bottom mid-sentence would move
     the thing they were looking at. */
  const endRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (turns.length > 0) endRef.current?.scrollIntoView({ block: "nearest" });
  }, [turns]);

  /* Nothing outlives the screen. A stream still running when this unmounts is a
     model generating into a closed tab, which the route cannot know about until
     the connection drops. */
  React.useEffect(() => () => abortRef.current?.abort(), []);

  const send = React.useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || streaming) return;

      setError(null);
      /* Both turns go in together: his empty one is what the typing indicator
         and the streaming text below are attached to, so there is never a frame
         where the answer has nowhere to land. */
      const history: Turn[] = [...turns, { role: "user", content: question }];
      setTurns([...history, { role: "assistant", content: "" }]);
      setStreaming(true);

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const response = await fetch(JOINER_CHAT_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
          signal: abort.signal,
        });

        if (!response.ok && response.status !== 429) {
          /* A JSON body means it failed before the stream started — the route
             validates and rejects there. Anything else is a shape we did not
             agree to, so it gets the generic sentence rather than being shown
             to somebody in their first week. */
          const reason = await response
            .json()
            .then((body: { error?: string }) => body.error)
            .catch(() => null);
          throw new Error(reason ?? "That didn't go through.");
        }

        const body = response.body;
        if (!body) throw new Error("That didn't go through.");

        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        /* NDJSON, one event per line. The buffer holds the partial line at the
           end of every chunk — a delta arriving split across two reads is the
           normal case, not an edge one. */
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const raw of lines) {
            if (!raw.trim()) continue;

            let event: ChatEvent;
            try {
              event = JSON.parse(raw) as ChatEvent;
            } catch {
              /* A line we cannot parse is a line we cannot act on, and throwing
                 here would discard an answer that is otherwise arriving fine. */
              continue;
            }

            if (event.type === "delta") {
              setTurns((current) => {
                const next = [...current];
                const last = next[next.length - 1];
                if (last?.role === "assistant")
                  next[next.length - 1] = {
                    ...last,
                    content: last.content + event.text,
                  };
                return next;
              });
            } else if (event.type === "error" && event.message) {
              setError(event.message);
            }
          }
        }
      } catch (failure) {
        /* An abort is somebody leaving, not a fault. Reporting it would put an
           error on a screen nobody is looking at, and leave one behind for when
           they come back. */
        if (!abort.signal.aborted) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Something went wrong at my end. Try asking again.",
          );
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
        /* An answer that never arrived leaves an empty bubble behind. Dropping
           it is what makes the error message the only thing on screen, rather
           than an error underneath a blank reply from Craig. */
        setTurns((current) => {
          const last = current[current.length - 1];
          return last?.role === "assistant" && last.content === ""
            ? current.slice(0, -1)
            : current;
        });
      }
    },
    [streaming, turns],
  );

  const empty = turns.length === 0;

  return (
    /* A panel rather than a section since Dzaky moved him beside the plan: the
       border is what makes "his column" read as a place rather than as leftover
       margin. `max-h` only ever binds inside the sticky column on a wide
       screen — stacked on a phone there is no height to be viewport-relative
       to, and the page scrolls as it always did. */
    <section
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 lg:max-h-[calc(100vh-3rem)]"
      aria-label="Ask Craig"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Ask me</h2>
        <p className="text-sm text-text-muted">
          {/* Scoped on purpose, and in his voice rather than as a disclaimer.
              Somebody who knows what he can see asks him things he can answer;
              somebody who does not spends their first question finding out. */}
          I know your plan, your start date and what you&apos;ve sent so far. For
          anything else, the person who invited you is the one to ask.
        </p>
      </div>

      {!empty && (
        /* The conversation scrolls inside the panel rather than growing it.
           A sticky panel that outgrows the viewport pins its composer somewhere
           past the bottom edge — the one control that must never scroll away.
           `scrollIntoView(nearest)` on the tail already targets the nearest
           scrolling ancestor, which is now this element. */
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          {turns.map((turn, i) =>
            turn.role === "user" ? (
              <p
                key={i}
                className="self-end rounded-2xl rounded-br-sm bg-surface-raised px-3.5 py-2 text-sm text-text"
              >
                {turn.content}
              </p>
            ) : (
              <div key={i} className="flex gap-2.5">
                <CraigMark className="mt-0.5 size-5 shrink-0 text-accent" />
                <p
                  className={cn(
                    "min-w-0 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-text-muted",
                    /* The cursor only while this is the turn being written. */
                    streaming &&
                      i === turns.length - 1 &&
                      "after:ml-0.5 after:inline-block after:h-4 after:w-px after:animate-pulse after:bg-text-subtle after:align-text-bottom after:content-['']",
                  )}
                >
                  {turn.content}
                </p>
              </div>
            ),
          )}
          <div ref={endRef} />
        </div>
      )}

      {error && (
        <p role="status" className="text-sm text-text-muted">
          {error}
        </p>
      )}

      {empty && (
        <div className="flex flex-wrap gap-2">
          {OPENERS.map((opener) => (
            <button
              key={opener}
              type="button"
              onClick={() => void send(opener)}
              className="rounded-full border border-border px-3 py-1.5 text-sm text-text-muted transition-colors hover:border-border-strong hover:text-text"
            >
              {opener}
            </button>
          ))}
        </div>
      )}

      <PromptBar
        onSubmit={(text) => void send(text)}
        placeholder={`Ask me anything, ${firstName}`}
        busy={streaming}
        onStop={() => abortRef.current?.abort()}
        /* No attachments. There is nowhere to put a file in this product yet,
           and a button that accepts one and drops it is worse than no button. */
        attachments={false}
      />
    </section>
  );
}
