"use client";

import * as React from "react";
import Link from "next/link";
import { AppShell, buttonVariants, CraigMark } from "@/components/ui";
import { NavStat } from "@/components/app-nav";
import { CraigConversation } from "@/components/showcase/craig-conversation";
import {
  ShowcaseNav,
  ShowcaseNavRail,
} from "@/components/showcase/showcase-nav";
import type { Session } from "@/lib/showcase/contract";
import type { OutstandingItem } from "@/lib/showcase/outstanding";
import { useCraigChat } from "@/lib/showcase/use-craig-chat";

/**
 * Home: what is going on, and a way to ask about it.
 *
 * The screen this product was missing. Signing in landed you in the workflow
 * builder, which meant Craig only ever had one thing to say — "let's make
 * something" — on a product whose actual promise is that he is keeping track
 * while you are not looking.
 *
 * Three parts, in the order somebody reads them: who you are and what kind of
 * day it is, what is genuinely waiting on you, and then the composer. The list
 * comes before the composer deliberately — a chat box at the top of a screen
 * asks a question, and the answer to "what should I do" is already sitting
 * underneath it.
 */

/**
 * Time of day, computed in the browser and nowhere else.
 *
 * The server has no idea what time it is where somebody is standing — it runs
 * in Sydney and says nothing about the person, and this account's timezone is
 * not a thing Craig stores. So a server-rendered "Good morning" is a guess that
 * is wrong for a third of the world, and rendering one and then correcting it
 * is a hydration mismatch on the first line of the page.
 *
 * `null` until mounted, and the greeting simply omits the time-of-day half
 * until it knows. "Hello, Dzaky" becoming "Good morning, Dzaky" a frame later
 * is a small thing; "Good evening" on somebody's Tuesday morning is not.
 */
/** Nothing to subscribe to — the greeting is read once, on mount. */
const NO_UPDATES = () => () => {};

function useTimeOfDay(): string | null {
  /* `useSyncExternalStore` rather than state set from an effect, which is the
     pattern this shell already uses for the things React cannot render on the
     server — panel widths, `matchMedia`. It states the server's answer
     explicitly instead of rendering a wrong one and correcting it, and the
     snapshot is a string, so React's identity check settles immediately. */
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
        className={`mt-2 size-1.5 shrink-0 rounded-full ${TONE[item.tone]}`}
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
          className={`shrink-0 ${buttonVariants({ variant: "secondary", size: "sm" })}`}
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
   * is meant to be its own standing conversation about the company, with the
   * builder's panel scoped to the workflow it sits beside — it is what exists
   * until threads have a table to live in.
   *
   * Built this way on purpose rather than blocked on that: a Home screen with
   * a working composer is useful now, and moving it onto its own thread later
   * is a change to where the messages are read from rather than to this screen.
   */
  const chat = useCraigChat();

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
      <div className="mx-auto flex h-[calc(100vh-3rem)] w-full max-w-2xl flex-col">
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto py-10">
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

            {/* The transcript sits under the list rather than replacing it.
                Craig having said something is not a reason to stop showing what
                is outstanding — those are the two halves of the same screen. */}
            {chat.messages.length > 0 && (
              <CraigConversation
                messages={chat.messages}
                phase={chat.phase}
                busy={chat.busy}
                error={chat.error}
                draft={null}
                onSend={chat.send}
              />
            )}
          </div>
        </div>

        {/* Pinned, because this is the one control on the screen somebody
            arrives wanting. `fill` above is what lets it sit on the edge of the
            window instead of below a page's worth of padding. */}
        <div className="shrink-0 pb-6 pt-2">
          {chat.messages.length === 0 && (
            <CraigConversation
              messages={[]}
              phase={chat.phase}
              busy={chat.busy}
              error={chat.error}
              draft={null}
              onSend={chat.send}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
