"use client";

import * as React from "react";
import {
  AgentPhase,
  CraigMark,
  MessageBody,
  PersonTurn,
  PromptBar,
} from "@/components/ui";
import type { CraigChat } from "@/lib/craig/use-craig-chat";
import { cn } from "@/lib/cn";
import { CraigFault } from "./craig-fault";
import { SourceChips } from "./source-chips";

/**
 * A conversation with Craig: transcript that scrolls, composer that doesn't.
 *
 * This existed three times before it existed once. The editor's panel and Home
 * each had their own copy of the same twenty lines — the same scroller, the same
 * pinned-reader rule, the same decision to drop an assistant turn that never
 * produced a word — and Home's had drifted far enough that it read as a
 * different product. Two spellings of one thread is how they start disagreeing
 * about what a conversation looks like.
 *
 * So the mechanics live here and the *chrome* is passed in. What differs
 * between a 300px panel beside a canvas and a page-wide column on Home is which
 * things sit above the composer and how big the composer is — not how a turn is
 * drawn, and not what happens when a stream drops halfway.
 *
 * The welcome screen is deliberately still its own component. It carries quick
 * replies, attachments and the hand-off to the editor, and folding a first-run
 * flow into the everyday one would mean every change to either being a change
 * to both.
 *
 * **The column owns no height of its own.** It is `flex-1` inside whatever it
 * is given, which must be a box with a real height — `AppShell`'s `fill`, or the
 * editor's panel. Sized here instead, it would be right until the transcript
 * grew past it.
 */

export function CraigThread({
  chat,
  size = "lg",
  turnSize,
  placeholder,
  footnote,
  header,
  empty,
  above,
  gap = "gap-6",
  scrollerClassName,
  attachments = false,
  dictation = false,
  modelPicker = false,
}: {
  chat: CraigChat;
  /** The composer's size. `sm` is the narrow column beside the canvas. */
  size?: "sm" | "lg";
  turnSize?: "sm";
  placeholder: string;
  footnote?: React.ReactNode;
  /**
   * Above the transcript and *inside* the scroller.
   *
   * Inside rather than above it, because a header on a conversation is
   * something you read once — Home's greeting answers "what should I do", which
   * is the question somebody has before they have asked one. Held outside, it
   * would be a permanent band that every later message passes behind.
   */
  header?: React.ReactNode;
  /** When nothing has been said yet. His opening line, usually. */
  empty?: React.ReactNode;
  /**
   * Between the transcript and the composer, pinned.
   *
   * For the things somebody might act on. They hold still deliberately: the
   * editor's publish blockers were briefly a turn of Craig's, which read well
   * and behaved badly — the one thing standing between somebody and publishing
   * ended up wherever they had last left the scrollbar.
   */
  above?: React.ReactNode;
  gap?: string;
  scrollerClassName?: string;
  attachments?: boolean;
  dictation?: boolean;
  modelPicker?: boolean;
}) {
  const { messages, phase, busy, error, send } = chat;

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const pinnedRef = React.useRef(true);

  /* Only for a reader who was already at the bottom. Yanking somebody back
     while they re-read an earlier turn is worse than text arriving off-screen.
     Runs on mount too: coming back to a workflow lands at the top of a
     transcript that may already be long. */
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, phase]);

  /* A send is an intention to see the answer, whatever the scrollbar was doing
     when it was typed. */
  const onSubmit = React.useCallback(
    (text: string) => {
      pinnedRef.current = true;
      send(text);
    },
    [send],
  );

  return (
    /* No gap on the column: the transcript runs straight into the composer,
       because space between them reads as a gap in the conversation rather than
       as breathing room. Anything wanting clearance carries its own. */
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (!el) return;
          pinnedRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        /* Padding on the scroller rather than the column around it: it belongs
           to the scrollable content, so it holds the first line off the header
           while you are at the top and then scrolls away, instead of being a
           permanent band later messages pass behind. */
        className={cn(
          "scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto",
          gap,
          scrollerClassName,
        )}
      >
        {header}

        {messages.length === 0
          ? empty
          : messages.map((m) =>
              m.role === "user" ? (
                <PersonTurn key={m.id} size={turnSize}>
                  {m.content}
                </PersonTurn>
              ) : /* A turn that failed before a word arrived is dropped rather
                     than drawn — a mark with nothing under it reads as Craig
                     having said nothing, which is a worse claim than the failure
                     notice above the composer, which says what happened. */
              !m.streaming && m.content.trim() === "" ? null : (
                <div key={m.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <CraigMark className="size-5 shrink-0 text-accent" />
                    <AgentPhase
                      label={
                        m.streaming
                          ? (phase ?? (m.content ? null : "Thinking"))
                          : null
                      }
                    />
                  </div>
                  {m.content.trim() !== "" && (
                    <MessageBody content={m.content} streaming={m.streaming} />
                  )}
                  <SourceChips sources={m.sources} />
                </div>
              ),
            )}
      </div>

      {/* The narrow column carries no bottom padding of its own. It sits inside
          a panel that already has its own inset, so `pb-6` was that inset twice
          — a band of empty panel under the composer, in the one layout where
          vertical space is scarcest and every pixel of it is a line of
          conversation. The page-wide column does need it: there is nothing
          below it but the window. */}
      <div
        className={cn(
          "flex shrink-0 flex-col gap-3",
          size === "sm" ? "pb-0" : "pb-6",
        )}
      >
        <CraigFault error={error} />
        {above}
        <PromptBar
          size={size}
          busy={busy}
          placeholder={placeholder}
          onSubmit={onSubmit}
          footnote={footnote}
          attachments={attachments}
          dictation={dictation}
          modelPicker={modelPicker}
        />
      </div>
    </div>
  );
}
