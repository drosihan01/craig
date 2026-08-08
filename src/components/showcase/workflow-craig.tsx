"use client";

import * as React from "react";
import {
  AgentPhase,
  CraigMark,
  MessageBody,
  PersonTurn,
  PromptBar,
  type WorkflowBlock,
} from "@/components/ui";
import { stepCount, unconfiguredCount } from "@/lib/showcase/store";
import type { CraigChat } from "@/lib/showcase/use-craig-chat";
import { CraigFault } from "./craig-fault";
import { SourceChips } from "./source-chips";

/**
 * Craig, inside the editor.
 *
 * The canvas is a good editor and a bad conversation, which is the argument
 * `workflow-assistant.tsx` made for the scripted demo and the reason this
 * exists with a real model behind it. Naming Priya as the person who provisions
 * Slack means selecting the block, finding the field and typing — three
 * deliberate acts for six words, repeated once per account. Saying it is one.
 *
 * What replaced a static summary of his findings. That panel was true and it
 * was finished: it told you four steps were open and you went and opened them.
 * The count is still here, on the composer where it belongs, but the panel's
 * job is now the half the canvas is bad at — the answer that closes four gaps
 * at once, and the step you want that isn't there yet.
 *
 * The conversation is the same one he had on the welcome screen, continued.
 * Nothing about the thread lives here: the store holds it, the hook streams it,
 * and this renders it. That's what lets selecting a block swap the panel out
 * mid-sentence without taking the conversation with it.
 */

export function WorkflowCraig({
  chat,
  blocks,
  published,
  seats,
  revealing,
}: {
  chat: CraigChat;
  blocks: WorkflowBlock[];
  published?: boolean;
  /** People invited so far, which is what "has it run yet" comes down to. */
  seats: number;
  /** The canvas is still laying itself out. */
  revealing?: boolean;
}) {
  const { messages, phase, busy, error, send } = chat;

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const pinnedRef = React.useRef(true);

  /* Coming back from a block's settings lands at the top of a transcript that
     may already be long, so this runs on mount as well as on change — and only
     for a reader who was at the bottom, because yanking somebody back while
     they re-read an earlier turn is worse than text arriving off-screen. */
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, phase]);

  const steps = stepCount(blocks);
  const open = unconfiguredCount(blocks);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center gap-2">
        <CraigMark className="size-5 shrink-0 text-accent" />
        {/* His name, or what he's doing instead. The line only appears while
            the blocks are still landing, and it is true for exactly that long
            — a workflow assembling itself with nothing said about it reads as
            the page having loaded badly. */}
        {revealing ? (
          <AgentPhase label="Laying it out" />
        ) : (
          <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
            Craig
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (!el) return;
          pinnedRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        className="scrollbar-thin -mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-2"
      >
        {messages.length === 0 ? (
          <p className="text-sm leading-relaxed text-text-muted">
            {opening(steps, open, published, seats)}
          </p>
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <PersonTurn key={m.id} size="sm">
                {m.content}
              </PersonTurn>
            ) : /* A turn that failed before a word arrived is dropped rather
                  than drawn — a mark with nothing under it reads as Craig
                  having said nothing, which is a worse claim than the failure
                  notice above the composer. */
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
          )
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-3">
        <CraigFault error={error} />

        {/* sm, and no attachments: this is a ~300px column, and there is
            nothing on this screen a file would answer. */}
        <PromptBar
          size="sm"
          busy={busy}
          dictation={false}
          modelPicker={false}
          placeholder="Tell him who does what, or what's missing…"
          onSubmit={send}
          footnote={footnote(steps, open, published)}
        />
      </div>
    </div>
  );
}

/**
 * His first line, when there isn't a conversation to continue.
 *
 * Derived from the workflow rather than written down, so it can't describe a
 * canvas that isn't there. Reachable by opening a workflow in a session that
 * never talked to him — a link followed, or a draft opened after a reload.
 */
function opening(
  steps: number,
  open: number,
  published: boolean | undefined,
  seats: number,
): string {
  if (published)
    return `Published — this is the one I run from now on. ${
      seats === 0
        ? "Nobody has a seat yet, so it hasn't run for anybody."
        : "Anyone given a seat from here starts on it."
    } Tell me what to change and I'll change it.`;

  if (steps === 0)
    return "Nothing in here but the trigger. Tell me what a new starter needs and I'll add it.";

  if (open > 0)
    return `${count(open, "step")} still ${open === 1 ? "needs" : "need"} something before this can run. Tell me the answer — who provisions an account, which check applies — and I'll put it where it goes.`;

  return `All ${steps} steps have what they need, so this one is ready to publish. Say what else it should do and I'll add it.`;
}

function footnote(steps: number, open: number, published?: boolean) {
  if (published) return "Published. Changes here apply to the next person.";
  if (steps === 0) return "No steps yet.";
  return open > 0
    ? `${count(open, "step")} still ${open === 1 ? "needs" : "need"} an answer.`
    : "Nothing is missing. Ready to publish.";
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
