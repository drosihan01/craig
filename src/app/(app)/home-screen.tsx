"use client";

import * as React from "react";
import Link from "next/link";
import {
  AgentPhase,
  AppShell,
  buttonVariants,
  CraigMark,
  MessageBody,
  PersonTurn,
  PromptBar,
} from "@/components/ui";
import { NavStat } from "@/components/app-nav";
import { CraigFault } from "@/components/showcase/craig-fault";
import { SourceChips } from "@/components/showcase/source-chips";
import {
  ShowcaseNav,
  ShowcaseNavRail,
} from "@/components/showcase/showcase-nav";
import type { Session } from "@/lib/showcase/contract";
import type { OutstandingItem } from "@/lib/showcase/outstanding";
import { useCraigChat } from "@/lib/showcase/use-craig-chat";
import { cn } from "@/lib/cn";

/**
 * Home: what is going on, and a way to ask about it.
 *
 * The screen this product was missing. Signing in landed you in the workflow
 * builder, which meant Craig only ever had one thing to say — "let's make
 * something" — on a product whose actual promise is that he is keeping track
 * while you are not looking.
 *
 * **The column is the editor's Craig panel, at page width.** Transcript in a
 * scroller that grows, composer pinned underneath it, and nothing between them.
 * The first version of this screen put the whole conversation *including its
 * composer* inside the scroll area, which meant the one control somebody came
 * to the page to use scrolled away with the page — you had to chase the input
 * down to type in it. `workflow-craig.tsx` had already solved this and the
 * shape is copied from it deliberately.
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
}: {
  user: Session;
  outstanding: OutstandingItem[];
  workflowCount: number;
  peopleCount: number;
}) {
  const greeting = useTimeOfDay();
  const first = user.name.trim().split(/\s+/)[0] || user.name;

  /**
   * The same conversation the rest of the product holds.
   *
   * Worth being honest about rather than dressing up: `useCraigChat` writes
   * into one transcript shared by every screen, so what is typed here is the
   * same thread as the workflow builder's panel. That is not the design — Home
   * should be its own standing conversation about the company — it is what
   * exists until threads have a table to live in.
   */
  const chat = useCraigChat();
  const { messages, phase, busy, error, send } = chat;
  const started = messages.length > 0;

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const pinnedRef = React.useRef(true);

  /* Only for a reader who was already at the bottom. Yanking somebody back
     while they re-read an earlier turn is worse than text arriving off-screen.
     Same rule as the editor's panel. */
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, phase]);

  return (
    <AppShell
      account={{ name: user.name, email: user.email }}
      fill
      navRail={<ShowcaseNavRail />}
      nav={
        <ShowcaseNav>
          <div className="flex flex-col gap-1 px-1">
            <NavStat label="Workflows" value={workflowCount} />
            <NavStat label="People" value={peopleCount} />
          </div>
        </ShowcaseNav>
      }
    >
      {/* No gap on the column: the transcript runs straight into the composer,
          because space between them reads as a gap in the conversation rather
          than as breathing room. */}
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col">
        <div
          ref={scrollRef}
          onScroll={() => {
            const el = scrollRef.current;
            if (!el) return;
            pinnedRef.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 60;
          }}
          /* Padding on the scroller rather than the column around it: it
             belongs to the scrollable content, so it holds the first line off
             the header while you are at the top and then scrolls away, instead
             of being a permanent band later messages pass behind. */
          className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pb-4 pt-10"
        >
          {/* Collapsed rather than unmounted, so it goes away rather than
              vanishing. `grid-rows` is the honest way to animate to and from
              content height — a max-height guess is either a clipped list or a
              slow start, depending on how many things need doing. */}
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

          {/* The transcript. Same rendering as the editor's panel, because it
              is the same conversation and two spellings of one thread is how
              they start drifting apart. */}
          {messages.map((m) =>
            m.role === "user" ? (
              <PersonTurn key={m.id}>{m.content}</PersonTurn>
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
          )}
        </div>

        {/* Pinned. This is the control somebody arrived wanting, and the whole
            reason the column is a flex column rather than a page that scrolls. */}
        <div className="flex shrink-0 flex-col gap-3 pb-6">
          <CraigFault error={error} />
          <PromptBar
            busy={busy}
            placeholder="Ask Craig about your company, your people, or what's outstanding…"
            onSubmit={send}
          />
        </div>
      </div>
    </AppShell>
  );
}
