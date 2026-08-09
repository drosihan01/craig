"use client";

import * as React from "react";
import { Warning } from "@/components/ui/icons";
import {
  AgentPhase,
  CraigMark,
  type WorkflowBlock,
} from "@/components/ui";
import { stepCount, unconfiguredCount } from "@/lib/showcase/store";
import type { CraigChat } from "@/lib/showcase/use-craig-chat";
import { CraigThread } from "./craig-thread";

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
  const steps = stepCount(blocks);
  const open = unconfiguredCount(blocks);

  return (
    /* `sm` throughout, and no attachments: this is a ~300px column and there is
       nothing on this screen a file would answer. The placeholder is short for
       the same reason — `PromptBar` takes its resting height from it, so the
       longer wording opened the composer at two lines and pushed the transcript
       up. */
    <CraigThread
      chat={chat}
      size="sm"
      turnSize="sm"
      gap="gap-4"
      scrollerClassName="-mr-2 pb-4 pr-2 pt-6"
      placeholder="Tell him what's missing…"
      footnote={footnote(steps, open, attention.length, published)}
      /* No standing header. A column that says CRAIG above a conversation with
         Craig in it spends its first line telling you what the next one already
         shows — every turn of his carries the mark anyway.

         What's left is the part that isn't always true: while the canvas is
         still laying itself out, a workflow assembling with nothing said about
         it reads as the page having loaded badly. */
      header={
        revealing ? (
          <div className="flex items-center gap-2">
            <CraigMark className="size-5 shrink-0 text-accent" />
            <AgentPhase label="Laying it out" />
          </div>
        ) : undefined
      }
      empty={
        <p className="text-sm leading-relaxed text-text-muted">
          {opening(steps, open, published, seats)}
        </p>
      }
      above={
        attention.length > 0 ? (
          <Attention attention={attention} onSelect={onSelect} />
        ) : undefined
      }
    />
  );
}

/**
 * What is standing between this workflow and being published.
 *
 * Pinned above the composer rather than said in the transcript. It was briefly
 * a turn of Craig's, which read well and behaved badly: it scrolled away with
 * the conversation, so the one thing standing between somebody and publishing
 * was wherever they had last left the scrollbar. What stays in the dialogue is
 * Craig *saying* it — the list itself is a standing fact about the workflow,
 * not something he said once.
 *
 * It disappears entirely when there is nothing outstanding rather than saying
 * so: a permanent strip reading "nothing needs your attention" is furniture to
 * be scanned every time to discover it is empty.
 */
function Attention({
  attention,
  onSelect,
}: {
  attention: { id: string | null; label: string }[];
  onSelect?: (id: string) => void;
}) {
  return (
    /* The same card the welcome screen uses to hand a draft over — same slot
       above the composer, same shape — in warning rather than accent, because
       that one is an invitation and this one is a hold-up. */
    <div className="flex flex-col gap-1.5 rounded-lg border border-warning bg-warning-subtle/30 p-2.5">
      {/* One line, not a heading and a sentence. This sits permanently above
          the composer in a ~300px column, so every line it takes is a line of
          conversation it costs. */}
      <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
        {attention.length === 1
          ? "Before you can publish"
          : `Before you can publish · ${attention.length}`}
      </p>

      <div className="flex flex-col gap-0.5">
        {attention.map((item) => {
          const line = (
            <span className="flex items-start gap-1.5">
              <Warning className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <span className="min-w-0 flex-1">{item.label}</span>
            </span>
          );

          /* A button only when pressing it goes somewhere. An item with nowhere
             to open is still worth listing — it is why the workflow cannot be
             published — but dressing it as a control teaches somebody these are
             pressable and then breaks that on the one that is not. */
          return item.id && onSelect ? (
            <button
              key={item.label}
              type="button"
              onClick={() => onSelect(item.id as string)}
              className="-mx-1 rounded px-1 py-0.5 text-left text-sm text-text transition-colors hover:bg-surface-hover"
            >
              {line}
            </button>
          ) : (
            <span key={item.label} className="px-1 text-sm text-text">
              {line}
            </span>
          );
        })}
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

/**
 * The line under the composer, which must not disagree with him.
 *
 * `blocked` is anything outstanding, not merely unanswered fields. Without it
 * this said "Nothing is missing. Ready to publish." directly beneath Craig
 * saying one thing had to happen first — the count it was derived from knows
 * about steps and knows nothing about whether Google is connected.
 */
function footnote(
  steps: number,
  open: number,
  blocked: number,
  published?: boolean,
) {
  if (published) return "Published. Changes here apply to the next person.";
  if (steps === 0) return "No steps yet.";
  if (open > 0)
    return `${count(open, "step")} still ${open === 1 ? "needs" : "need"} an answer.`;
  return blocked > 0
    ? "Not ready to publish yet."
    : "Nothing is missing. Ready to publish.";
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
