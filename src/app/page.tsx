"use client";

import * as React from "react";
import {
  AppShell,
  Badge,
  buttonVariants,
  Card,
  ChatTranscript,
  CraigMark,
  PromptBar,
  type AppNotification,
  type ChatMessage,
} from "@/components/ui";
import Link from "next/link";
import { Campaign, Code, Groups, Schedule } from "@/components/ui/icons";
import { ACCOUNT, NEW_HIRE } from "@/lib/demo";
import { SESSION } from "@/lib/demo-session";
import { AdminNav, NavStat } from "@/components/app-nav";

/**
 * The admin's first screen, and then the conversation that follows it.
 *
 * Two states in one route rather than two routes: the first message continues
 * the question, it isn't a navigation. Sending collapses the hero and the
 * templates and pins the composer to the bottom — once there's a transcript,
 * the thing that needs to be in reach is the reply box, not the pitch.
 */

const NOTIFICATIONS: AppNotification[] = [
  {
    id: "h1",
    kind: "info",
    title: "Welcome to Craig",
    description: "Start by describing Katalis below.",
    timestamp: new Date(Date.now() - 3 * 60_000),
  },
];

/**
 * Starting points, not finished workflows. Describing the company in prose is
 * the better path and stays primary, but it's a blank box, and a blank box is
 * where most people stop.
 *
 * Step counts are deliberately small. A twenty-step template for a
 * three-person company is a template nobody finishes.
 */
const TEMPLATES = [
  {
    id: "engineer",
    icon: Code,
    title: "Engineer",
    description:
      "Repo and infra access, a walkthrough of who owns what, and a prod sign-off before anything ships.",
    steps: 8,
    tag: "Most used",
  },
  {
    id: "first-hire",
    icon: Groups,
    title: "First non-founder hire",
    description:
      "For when nothing is written down yet. Heavier on context and introductions than on process.",
    steps: 6,
  },
  {
    id: "contractor",
    icon: Schedule,
    title: "Contractor or part-time",
    description:
      "Scoped access, a clear end date, and an offboarding step that actually fires.",
    steps: 5,
  },
  {
    id: "gtm",
    icon: Campaign,
    title: "Sales and GTM",
    description:
      "CRM access, the pitch, and shadowing calls in the first fortnight.",
    steps: 7,
  },
];

/* The reply Craig gives once the scripted session runs out, so a demo that
   goes off-script degrades honestly instead of repeating itself. */
const FALLBACK =
  "Ah — that's past what I've got scripted. There's no model hooked up behind me yet, so I'd only be making something up.";

export default function AdminHomePage() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [turnIndex, setTurnIndex] = React.useState(0);
  const [offerDraft, setOfferDraft] = React.useState(false);
  const timers = React.useRef<number[]>([]);

  const clearTimers = React.useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  React.useEffect(() => clearTimers, [clearTimers]);

  /* Walks the scripted session. Whatever gets typed is *replaced* by Ada's
     scripted line for that turn — the demo is driven by pressing enter, not by
     typing her paragraphs out, and it survives anyone typing anything. Once
     the script runs out the real text is used, so it degrades honestly. */
  function send(text: string) {
    const turn = SESSION[turnIndex];
    const replyId = crypto.randomUUID();

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: turn?.ada ?? text,
        attachment: turn?.attachment,
      },
      {
        id: replyId,
        role: "assistant",
        content: "",
        streaming: true,
        steps: turn ? [{ id: turn.steps[0], label: turn.steps[0], state: "running" }] : [],
      },
    ]);
    setBusy(true);
    setTurnIndex((i) => i + 1);

    const patch = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((prev) => prev.map((m) => (m.id === replyId ? fn(m) : m)));

    const steps = turn?.steps ?? [];
    const reply = turn?.craig ?? FALLBACK;

    // One state at a time — the point of showing them is watching where the
    // time goes, which a finished list doesn't tell you.
    steps.forEach((label, i) => {
      const t = window.setTimeout(
        () => {
          const next = steps[i + 1];
          patch((m) => ({
            ...m,
            steps: next
              ? [{ id: next, label: next, state: "running" }]
              : [{ id: label, label, state: "done" }],
          }));
        },
        800 * (i + 1),
      );
      timers.current.push(t);
    });

    const startAt = 800 * steps.length + 200;
    const words = reply.split(" ");
    words.forEach((_, i) => {
      const t = window.setTimeout(
        () => {
          patch((m) => ({
            ...m,
            content: words.slice(0, i + 1).join(" "),
            streaming: i < words.length - 1,
            steps: [],
          }));
          if (i === words.length - 1) {
            setBusy(false);
            if (turn?.offersWorkflow) setOfferDraft(true);
          }
        },
        startAt + i * 18,
      );
      timers.current.push(t);
    });
  }

  function stop() {
    clearTimers();
    setBusy(false);
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    );
  }

  const started = messages.length > 0;

  return (
    <AppShell
      title="Home"
      nav={<HomeNav started={started} />}
      notifications={NOTIFICATIONS}
      account={ACCOUNT}
      fill={started}
    >
      {started ? (
        /* Pinned to the viewport so only the transcript scrolls. A composer
           that scrolls away is the single most annoying thing a chat can do. */
        <div className="flex h-[calc(100vh-3rem)] flex-col">
          <ChatTranscript
            messages={messages}
            className="-mx-4 flex-1 px-4 py-8"
          />

          <div className="shrink-0 pb-6">
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
              {offerDraft && <DraftHandoff />}

              <PromptBar
                autoFocus
                placeholder="Ask a follow-up…"
                onSubmit={send}
                onStop={stop}
                busy={busy}
                footnote="Craig can make mistakes. Nothing is created until you publish it."
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-2xl flex-col justify-center py-16">
          <div className="flex flex-col items-center gap-4 text-center">
            <CraigMark className="size-14 text-accent" />
            <h1 className="text-4xl font-semibold tracking-[-0.03em]">
              Tell me a little bit about your company
            </h1>
          </div>

          <div className="pt-8">
            <PromptBar
              autoFocus
              placeholder="we're 3 people doing AI infra…"
              onSubmit={send}
              footnote="Attach a handbook if you have one — however out of date it is"
            />
          </div>

          <div className="flex flex-col gap-3 pt-8">
            <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
              Or start from a template
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {TEMPLATES.map((t) => (
                <Card
                  key={t.id}
                  interactive
                  role="button"
                  tabIndex={0}
                  onClick={() => send(`Start from the ${t.title} template`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      send(`Start from the ${t.title} template`);
                    }
                  }}
                  className="flex flex-col gap-2 p-4"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent-subtle-fg">
                      <t.icon className="size-4" />
                    </span>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate text-base font-medium">
                        {t.title}
                      </span>
                      {t.tag && (
                        <Badge tone="accent" size="sm" className="shrink-0">
                          {t.tag}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <p className="text-sm leading-relaxed text-text-muted">
                    {t.description}
                  </p>

                  <span className="mt-auto pt-1 text-2xs text-text-subtle">
                    {t.steps} steps · you edit before anything goes live
                  </span>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

/**
 * The hand-off out of the conversation. Deliberately a draft rather than a
 * published workflow — Craig proposes, Ada edits, and the two unconfigured
 * steps are the reason she has to look before anything runs.
 */
function DraftHandoff() {
  return (
    <Card className="flex items-start gap-3 p-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent-subtle-fg">
        <Code className="size-4" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-medium">Engineer — Katalis</span>
          <Badge tone="warning" size="sm">
            Draft
          </Badge>
        </div>
        <p className="text-sm text-text-muted">
          9 steps · 2 unconfigured · for {NEW_HIRE.name}, starts in{" "}
          {NEW_HIRE.startsIn}
        </p>
      </div>

      <Link
        href="/builder"
        className={buttonVariants({ size: "sm", className: "shrink-0" })}
      >
        Open the draft
      </Link>
    </Card>
  );
}

function HomeNav({ started }: { started: boolean }) {
  return (
    <AdminNav>
      <div className="flex flex-col gap-2 px-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Getting started
        </p>
        <NavStat label="Workflows" value={0} />
        <NavStat label="New hires" value={0} />
        {started && (
          <p className="pt-1 text-xs leading-relaxed text-text-subtle">
            Still zero — nothing in this conversation has been created yet.
          </p>
        )}
      </div>
    </AdminNav>
  );
}
