"use client";

import * as React from "react";
import { Warning } from "@/components/ui/icons";
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
  attention = [],
  onSelect,
}: {
  chat: CraigChat;
  blocks: WorkflowBlock[];
  published?: boolean;
  /** People invited so far, which is what "has it run yet" comes down to. */
  seats: number;
  /** The canvas is still laying itself out. */
  revealing?: boolean;
  /**
   * What is standing between this workflow and being publishable.
   *
   * Given rather than derived, because the two kinds don't come from the same
   * place: a step missing an answer is knowable from the blocks, and a missing
   * Google connection is a fact about the account. Working one out here and
   * being handed the other would leave this list quietly wrong about half of
   * what it claims to cover.
   *
   * `id` is a block to open, or null for something with nowhere to go.
   */
  attention?: { id: string | null; label: string }[];
  onSelect?: (id: string) => void;
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
    /* No gap on the column. The transcript runs straight into the composer —
       the space between them was reading as a gap in the conversation rather
       than as breathing room, and the composer's own border is separation
       enough. Anything that does want clearance carries it itself. */
    <div className="flex min-h-0 flex-1 flex-col">
      {/* No standing header. A column that says CRAIG above a conversation
          with Craig in it spends its first line telling you what the next one
          already shows — every turn of his carries the mark anyway, so the
          label was the same claim made twice.

          What's left is the part that isn't always true: while the canvas is
          still laying itself out, a workflow assembling with nothing said
          about it reads as the page having loaded badly. That line appears for
          exactly as long as it's honest and then the column starts with his
          first message, which is what you came to read. */}
      {revealing && (
        <div className="flex items-center gap-2 pb-4">
          <CraigMark className="size-5 shrink-0 text-accent" />
          <AgentPhase label="Laying it out" />
        </div>
      )}

      {/* Above the conversation, because it is the answer to the question
          somebody arrives with — "what is left" — and making them read a
          transcript to find it is making them do his job. It disappears
          entirely when there is nothing outstanding rather than saying so:
          a permanent panel reading "nothing needs your attention" is a row of
          furniture that has to be scanned every time to discover it is empty. */}
      {attention.length > 0 && (
        <div className="mb-4 flex shrink-0 flex-col gap-1.5 rounded-lg border border-border bg-surface-sunken p-3">
          <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
            Needs your attention
          </p>

          {attention.map((item) => {
            const line = (
              <span className="flex items-start gap-1.5">
                <Warning className="mt-0.5 size-3.5 shrink-0 text-warning" />
                <span className="min-w-0 flex-1">{item.label}</span>
              </span>
            );

            /* A button only when pressing it goes somewhere. An item with
               nowhere to open is still worth listing — it is why the workflow
               cannot be published — but dressing it as a control teaches
               somebody that these are pressable and then breaks that on the
               one that is not. */
            return item.id && onSelect ? (
              <button
                key={item.label}
                type="button"
                onClick={() => onSelect(item.id as string)}
                className="-mx-1 rounded-md px-1 py-0.5 text-left text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
              >
                {line}
              </button>
            ) : (
              <span key={item.label} className="px-1 text-sm text-text-muted">
                {line}
              </span>
            );
          })}
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (!el) return;
          pinnedRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        /* `pt-6` on the scroller rather than on the column around it, which is
           the invisible bar. Padding on a scroll container belongs to the
           scrollable content, so it holds the first message off the rule while
           you're at the top and then scrolls away with everything else — where
           the same 24px on the panel would be a permanent band that later
           messages pass behind and never occupy. */
        className="scrollbar-thin -mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4 pr-2 pt-6"
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
            nothing on this screen a file would answer. The flag is new — the
            button used to draw regardless of what this said, which left the
            control row holding one orphaned plus.

            The placeholder is short for the same reason the column is narrow.
            The longer version wrapped to two lines here, and PromptBar takes
            its resting height from the placeholder, so a composer that should
            be one line tall opened at two and pushed the transcript up. */}
        <PromptBar
          size="sm"
          busy={busy}
          dictation={false}
          modelPicker={false}
          attachments={false}
          placeholder="Tell him what's missing…"
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
