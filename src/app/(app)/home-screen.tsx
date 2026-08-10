"use client";

import * as React from "react";
import Link from "next/link";
import {
  AppShell,
  buttonVariants,
  CraigMark,
  Separator,
} from "@/components/ui";
import { NavStat } from "@/components/app-nav";
import { CraigConversation } from "@/components/craig/craig-conversation";
import { ThreadHistory } from "@/components/craig/thread-history";
import {
  ShowcaseNav,
  ShowcaseNavRail,
} from "@/components/craig/nav";
import type { Session } from "@/lib/craig/contract";
import type { OutstandingItem } from "@/lib/craig/outstanding";
import { useShowcase } from "@/lib/craig/store";
import { useCraigChat } from "@/lib/craig/use-craig-chat";
import { useCraigThread } from "@/lib/craig/use-craig-thread";
import { cn } from "@/lib/cn";

/**
 * Home: what is going on, and a way to ask about it.
 *
 * The screen this product was missing. Signing in landed you in the workflow
 * builder, which meant Craig only ever had one thing to say — "let's make
 * something" — on a product whose actual promise is that he is keeping track
 * while you are not looking.
 *
 * **This is the same conversation component the first-run screen uses**, at the
 * same width, with the same composer — `CraigConversation`. It had its own copy
 * of a transcript for a while, and a copy is how one screen ends up feeling
 * like a different product: Home's turns, composer and quick replies had all
 * quietly drifted from the ones somebody had just used to build a workflow.
 *
 * Two things are turned off rather than reimplemented. The hand-off card, which
 * offers to build a workflow, has no business on the screen you come back to;
 * and the draft it would carry is always null here.
 *
 * The narrow panel beside the canvas is deliberately *not* this component — see
 * `craig-thread.tsx`. A 300px column and a page-wide one want different
 * composers, and the thing worth sharing between them is the transcript
 * mechanics, which is what that file is.
 *
 * The greeting and the outstanding list live at the top of the transcript and
 * collapse the moment there is a conversation. They are an answer to "what
 * should I do", which is the question somebody has *before* they have asked
 * one — after that they are a header in the way of the thing being read.
 */

/** Nothing to subscribe to — the greeting is read once, on mount. */
const NO_UPDATES = () => () => {};

function useTimeOfDay(): string | null {
  /* `useSyncExternalStore` rather than state set from an effect, which is the
     pattern this shell already uses for the things React cannot render on the
     server — panel widths, `matchMedia`. It states the server's answer
     explicitly instead of rendering a wrong one and correcting it, and the
     snapshot is a string, so React's identity check settles immediately.

     The server has no idea what time it is where somebody is standing: it runs
     in Sydney and this account's timezone is not something Craig stores. So a
     server-rendered "Good morning" is wrong for a third of the world, and the
     greeting simply omits the time-of-day half until the browser answers. */
  return React.useSyncExternalStore(
    NO_UPDATES,
    () => {
      const hour = new Date().getHours();
      return hour < 12
        ? "Good morning"
        : hour < 18
          ? "Good afternoon"
          : "Good evening";
    },
    () => null,
  );
}

/** The tone a row is read in. Colour is the second signal, never the only one —
    the wording of each `ask` already says how worried to be. */
const TONE: Record<OutstandingItem["tone"], string> = {
  urgent: "bg-danger",
  waiting: "bg-warning",
  tidy: "bg-border-strong",
};

function OutstandingRow({ item }: { item: OutstandingItem }) {
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-lg bg-surface-sunken px-3.5 py-3">
      <span
        aria-hidden
        className={cn("mt-2 size-1.5 shrink-0 rounded-full", TONE[item.tone])}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-base">{item.ask}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-text-subtle">
          {item.detail}
        </span>
      </span>
      {item.href && (
        <Link
          href={item.href}
          className={cn(
            "shrink-0",
            buttonVariants({ variant: "secondary", size: "sm" }),
          )}
        >
          {item.cta ?? "Open"}
        </Link>
      )}
    </div>
  );
}

export function HomeScreen({
  user,
  outstanding,
  workflowCount,
  peopleCount,
  documentCount,
}: {
  user: Session;
  outstanding: OutstandingItem[];
  workflowCount: number;
  peopleCount: number;
  /** How many documents this account has uploaded, shared or not. */
  documentCount: number;
}) {
  const greeting = useTimeOfDay();
  const first = user.name.trim().split(/\s+/)[0] || user.name;

  /* Arriving Home is a new conversation, not a continuation of the last one —
     "what's outstanding" on Tuesday does not follow from Monday's version of
     the same question. The thread itself is made on the first send, so glancing
     at Home and leaving does not put an empty conversation in the history. */
  useCraigThread("god");
  const { threadId } = useShowcase();
  /* `home` is the third argument, and the flag that stops Craig treating this
     like discovery — see `HOME_NOTE`. Without it he reads an empty workflow and
     starts interviewing somebody who came to ask about one person. */
  const chat = useCraigChat(undefined, undefined, true);
  const started = chat.messages.length > 0;

  return (
    <AppShell
      account={{ name: user.name, email: user.email }}
      fill
      /* No `notifications` prop. The layout resolves the same list for every
         screen, and Home passing its own meant `outstandingFor` ran twice per
         load — four extra queries, and two derivations of one fact that could
         disagree with each other for a request. The panel below still draws
         from Home's own copy, which is the one this screen actually needs. */
      navRail={<ShowcaseNavRail />}
      nav={
        <ShowcaseNav>
          {/* `gap-2 px-2` with no padding of its own on the eyebrow — the same
              block People and Resources use. Home had `px-1` on the container
              and `px-2` on the heading, so the heading sat one step right of
              the rows it labelled while every other column in the product had
              them flush. */}
          <div className="flex flex-col gap-2 px-2">
            {/* A heading, because the counts were three unlabelled numbers
                floating under a nav and reading as part of it. Every other
                column in the product that carries stats names them —
                Resources says "Documents", People says "Seats" — and Home was
                the one that assumed you would work it out.

                "Overview" rather than "Account": it describes what the numbers
                are, not what they belong to, and Account is a word this
                product already uses for the thing in the bottom-left corner. */}
            <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
              Overview
            </p>
            {/* Same order as the rows in the nav above them — People first. A
                set of counts that disagrees with the list they sit under is a
                small thing read many times. Resources joins them because it
                joined the nav: a room with a row and no number was the only
                one of the four you could not see the size of from here. */}
            <NavStat label="People" value={peopleCount} />
            <NavStat label="Workflows" value={workflowCount} />
            <NavStat label="Resources" value={documentCount} />
          </div>

          {/* Ruled off from the counts above it, because the two are different
              kinds of fact and were reading as one list. The counts say what
              the account *is*; the conversations below say what you have been
              doing in it. Without the rule, "Recents" looked like a third
              statistic with no number next to it. */}
          <Separator />
          <ThreadHistory />
        </ShowcaseNav>
      }
    >
      {/* `flex-1 min-h-0` rather than `h-full`. A percentage height resolves
          against whatever the parent turns out to be, and under the shell's old
          `min-h` row that grew with the transcript — so the composer looked
          pinned until there was enough conversation to scroll, then went with
          it. `fill` makes the row a real height and this column takes its
          share of it. */}
      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
        <CraigConversation
          messages={chat.messages}
          phase={chat.phase}
          busy={chat.busy}
          onStop={chat.stop}
          error={chat.error}
          onSend={chat.send}
          /* Nothing to hand over and nothing to offer. Home is not where a
             workflow gets built — that is the whole point of it being a
             different room — so the draft card and the three-answer heuristic
             behind it are both off. Left on, Craig would interrupt somebody
             asking after a new starter with an offer to build something they
             never mentioned. */
          draft={null}
          offerDraft={false}
          /* The door Craig can offer from here, since he has no way to build a
             workflow on this screen. It carries the conversation it came from,
             so the builder's thread records what it continues — nothing else
             travels; see `parent_thread_id` in the threads migration. */
          offer={chat.offer}
          newWorkflowHref={
            threadId
              ? `/welcome?from=${encodeURIComponent(threadId)}`
              : "/welcome"
          }
          /* What this screen is actually for. Craig on Home is the one keeping
             track while you are not looking, so the prompt asks after people
             and status rather than offering to make something. */
          placeholder="Ask about anyone — has Irena got her visa yet?"
          header={
            /* Collapsed rather than unmounted, so it goes away rather than
               vanishing. `grid-rows` is the honest way to animate to and from
               content height — a max-height guess is either a clipped list or a
               slow start, depending on how many things need doing. */
            <div
              aria-hidden={started}
              className={cn(
                "grid shrink-0 transition-all duration-300 ease-out motion-reduce:transition-none",
                started
                  ? "pointer-events-none grid-rows-[0fr] opacity-0"
                  : "grid-rows-[1fr] opacity-100",
              )}
            >
              <div className="overflow-hidden">
                <div className="flex flex-col gap-8">
                  <div className="flex flex-col gap-3">
                    <CraigMark className="size-8 text-accent" />
                    <h1 className="text-3xl font-semibold tracking-[-0.02em]">
                      {greeting ? `${greeting}, ${first}` : `Hello, ${first}`}
                    </h1>
                    <p className="text-md leading-relaxed text-text-muted">
                      {outstanding.length === 0
                        ? "Nothing needs you right now. Everything that's running is running."
                        : "Here's what I couldn't finish on my own."}
                    </p>
                  </div>

                  {outstanding.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
                        {outstanding.length === 1
                          ? "One thing"
                          : `${outstanding.length} things`}
                      </p>
                      {outstanding.map((item) => (
                        <OutstandingRow key={item.id} item={item} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          }
        />
      </div>
    </AppShell>
  );
}
