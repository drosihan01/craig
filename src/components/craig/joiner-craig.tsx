"use client";

import * as React from "react";
import {
  AgentPhase,
  CraigMark,
  MessageBody,
  PersonTurn,
  PromptBar,
} from "@/components/ui";
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
    /* No frame of its own. It fills a room now rather than sitting in a
       corner of one: the shell draws the edges, and a card inside a panel is
       two frames around one thing.

       `min-h-0` on a flex child that scrolls is the load-bearing bit — the
       default `min-height: auto` floors it at its content, so without it this
       grows with the transcript instead of scrolling inside it, and the
       composer walks off the bottom of the window.

       The heading and the scope line went with the panel. A room whose nav row
       says "Ask Craig" does not also need a heading saying "Ask me", and the
       scope now lives in the nav where it can be read before you type rather
       than only while the screen is empty. */
    <section
      className="flex min-h-0 flex-1 flex-col gap-4"
      aria-label="Ask Craig"
    >

      {/* The body, and it is always here — that is the fix rather than an
          incidental tidy-up. This region used to render only once there were
          messages, so an empty conversation had nothing between the openers and
          the composer to take up the slack: the composer sat wherever the
          content ended and only snapped to the bottom after the first reply,
          which reads as the panel settling into place a beat late.

          Now the region exists in both states and grows in both, so the
          composer is against the bottom edge from the first paint.

          It also scrolls rather than growing the panel: a column that outgrows
          the viewport pins its composer somewhere past the bottom edge — the
          one control that must never scroll away. `scrollIntoView(nearest)` on
          the tail targets the nearest scrolling ancestor, which is this. */}
      <div
        className={cn(
          "scrollbar-thin flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto pb-8",
          /* Centred while there is nothing to read. A room this tall with three
             chips pinned to the top of it and a composer at the bottom reads as
             a page that failed to load its content; the same three chips in the
             middle read as an invitation. Once there is a transcript the
             content starts at the top, where a conversation belongs. */
          empty && "justify-center",
        )}
      >
        {!empty && (
          <>
            {/* Clearance under the header as an *element*, not padding. Padding
                on the scroller cannot be scrolled into, so the first line never
                reaches the top of the box and a long transcript feels stuck an
                inch below the rule. A spacer is content: it holds the first
                line clear on arrival and then scrolls away like anything else.
                The admin's conversation makes this argument at length. */}
            <div aria-hidden className="h-10 shrink-0" />

            {turns.map((turn, i) =>
              turn.role === "user" ? (
                <PersonTurn key={i}>{turn.content}</PersonTurn>
              ) : (
                <div key={i} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <CraigMark className="size-5 shrink-0 text-accent" />
                    {/* An empty turn with no words yet is a mark on its own,
                        which reads as Craig having said nothing. "Thinking" is
                        the least he is doing. */}
                    <AgentPhase
                      label={
                        streaming && i === turns.length - 1 && !turn.content
                          ? "Thinking"
                          : null
                      }
                    />
                  </div>

                  {turn.content.trim() !== "" && (
                    <MessageBody
                      content={turn.content}
                      streaming={streaming && i === turns.length - 1}
                    />
                  )}
                </div>
              ),
            )}
            <div ref={endRef} />
          </>
        )}

        {/* Inside the scrolling region so a long list of them cannot push the
            composer off the bottom on a short window. */}
        {empty && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <CraigMark className="size-8 text-accent" />
            <div className="flex flex-col gap-1">
              <p className="text-lg font-semibold tracking-[-0.01em]">
                Ask me anything, {firstName}.
              </p>
              {/* What he can see, said once, where somebody reads it before
                  typing rather than after being told he does not know. */}
              <p className="text-sm text-text-muted">
                I know your plan and whatever your company has shared with new
                starters.
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
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
          </div>
        )}
      </div>

      {/* The same footer block the admin's conversation uses: a shrink-0
          column holding whatever has to stay above the composer, with the
          bottom clearance on it rather than on the scroller. Outside the
          scrolling region on purpose — a failure you have to scroll back up to
          find is a failure the person never sees. */}
      <div className="flex shrink-0 flex-col gap-3 pb-6">
        {error && (
          <p role="status" className="text-sm text-text-muted">
            {error}
          </p>
        )}

        <PromptBar
          autoFocus
          onSubmit={(text) => void send(text)}
          placeholder={`Ask me anything, ${firstName}`}
          busy={streaming}
          onStop={() => abortRef.current?.abort()}
          /* Both off for the same reason, and it is the reason Home gives:
             neither is wired. There is no speech to text behind the
             microphone, and nothing on the joiner's chat route accepts a file
             — a control that takes something and drops it is worse than no
             control. The microphone shipped on because `dictation` defaults
             to true and nothing here said otherwise, which is exactly how the
             model picker got here. */
          dictation={false}
          attachments={false}
          /* The same slot Home uses to say what Craig can see. It sits under
             the composer rather than over the conversation, so it is readable
             at the moment somebody is deciding what to type and does not
             scroll away with the greeting. */
          footnote="Craig knows your plan and whatever your company has shared with new starters."
          /* Off, and the component's own doc is the argument: the route
             behind this bar is fixed to one model, so a picker here is a
             control the server ignores — "the one control in this system that
             must never ship". It shipped anyway, because the default is on and
             nothing here said otherwise; a screenshot caught what the diff
             could not. */
          modelPicker={false}
        />
      </div>
    </section>
  );
}
