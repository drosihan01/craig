"use client";

import * as React from "react";
import {
  AppShell,
  Avatar,
  Badge,
  buttonVariants,
  Card,
  ChatTranscript,
  CraigMark,
  PromptBar,
  Separator,
  type AppNotification,
  type ChatMessage,
} from "@/components/ui";
import Link from "next/link";
import { Campaign, Code, Groups, Schedule } from "@/components/ui/icons";
import { ACCOUNT, COMPANY, NEW_HIRE, PEOPLE } from "@/lib/demo";
import { SESSION } from "@/lib/demo-session";
import { WORKFLOW } from "@/lib/demo-workflow";
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
  const [replies, setReplies] = React.useState<string[]>([]);
  const composerRef = React.useRef<HTMLTextAreaElement | null>(null);
  const timers = React.useRef<number[]>([]);

  const clearTimers = React.useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  React.useEffect(() => clearTimers, [clearTimers]);

  /* Walks the scripted session.
     Typed text is *replaced* by Ada's line for that turn — the demo is driven
     by pressing enter, not by typing her paragraphs out in front of people,
     and it survives any input. A picked reply is sent verbatim, because she
     chose those words and showing her different ones would be a lie about
     what she just said. Past the script, typed text is used as-is. */
  function send(text: string, verbatim = false) {
    const turn = SESSION[turnIndex];
    const replyId = crypto.randomUUID();

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: verbatim ? text : (turn?.ada ?? text),
        attachment: turn?.attachment,
      },
      {
        id: replyId,
        role: "assistant",
        content: "",
        streaming: true,
        question: turn?.question,
        steps: turn ? [{ id: turn.steps[0], label: turn.steps[0], state: "running" }] : [],
      },
    ]);
    setBusy(true);
    setTurnIndex((i) => i + 1);
    setReplies([]);

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
            setReplies(turn?.replies ?? []);
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
      asideTitle="Katalis"
      aside={<HomeAside started={started} />}
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

              {replies.length > 0 && (
                <ReplyOptions
                  replies={replies}
                  onPick={(r) => send(r, true)}
                  onCompose={() => composerRef.current?.focus()}
                />
              )}

              <PromptBar
                autoFocus
                inputRef={composerRef}
                numberHint={replies.length > 0 ? replies.length + 1 : undefined}
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
 * Predicted replies to Craig's question.
 *
 * Numbered, and pickable with the number keys — Ada types fast and shouldn't
 * have to reach for the mouse to answer a yes/no. The options are phrasings of
 * one answer rather than genuinely different answers; the script is linear, and
 * an option that changed what she said would make Craig's next turn incoherent.
 *
 * "Or just type" stays visible because a predicted reply that isn't quite right
 * is worse than no prediction, and the composer is right underneath.
 */
function ReplyOptions({
  replies,
  onPick,
  onCompose,
}: {
  replies: string[];
  onPick: (text: string) => void;
  /** The last option is "write your own" — focuses the composer. */
  onCompose: () => void;
}) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Not while they're typing their own answer.
      const el = document.activeElement;
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= replies.length) {
        e.preventDefault();
        onPick(replies[n - 1]);
      } else if (n === replies.length + 1) {
        e.preventDefault();
        onCompose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [replies, onPick, onCompose]);

  return (
    <div className="flex flex-col gap-1.5">
      {replies.map((r, i) => (
        <button
          key={r}
          type="button"
          onClick={() => onPick(r)}
          className="group flex w-full items-start gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-accent hover:bg-surface-hover"
        >
          <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded bg-surface-sunken text-2xs font-semibold tabular-nums text-text-subtle transition-colors group-hover:bg-accent group-hover:text-accent-fg">
            {i + 1}
          </span>
          <span className="text-sm leading-relaxed text-text-muted transition-colors group-hover:text-text">
            {r}
          </span>
        </button>
      ))}
    </div>
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
        href={`/builder/${WORKFLOW.id}`}
        className={buttonVariants({ size: "sm", className: "shrink-0" })}
      >
        Open the draft
      </Link>
    </Card>
  );
}

/**
 * What Craig knows about Katalis, and what he doesn't.
 *
 * The gaps are listed as prominently as the facts. They're the reason his
 * answers are worth anything, and if the panel only showed what's on file it
 * would flatter a company that has three people and a stale handbook.
 */
function HomeAside({ started }: { started: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Company
        </p>
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-text">{COMPANY.name}</span>
          <span className="leading-relaxed text-text-muted">
            {COMPANY.pitch}
          </span>
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          People
        </p>
        {Object.values(PEOPLE).map((p) => (
          <div key={p.email} className="flex items-center gap-2">
            <Avatar name={p.name} size="xs" />
            <span className="truncate text-sm text-text-muted">{p.name}</span>
            <span className="ml-auto shrink-0 text-2xs text-text-subtle">
              {p.role}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-0.5">
          <Avatar name={NEW_HIRE.name} size="xs" />
          <span className="truncate text-sm text-text-muted">
            {NEW_HIRE.name}
          </span>
          <Badge tone="warning" size="sm" className="ml-auto shrink-0">
            Starts in {NEW_HIRE.startsIn}
          </Badge>
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          What Craig has
        </p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">Katalis Handbook</span>
          <Badge tone="warning" size="sm">
            Feb 2026
          </Badge>
        </div>
        <p className="text-xs leading-relaxed text-text-subtle">
          Five other things the workflow needs aren&apos;t written down
          anywhere.{" "}
          <Link
            href="/resources"
            className="text-accent underline-offset-4 hover:underline"
          >
            Resources
          </Link>
        </p>
      </div>

      {started && (
        <>
          <Separator />
          <p className="text-xs leading-relaxed text-text-subtle">
            Nothing in this conversation has been created. Craig drafts,
            you publish.
          </p>
        </>
      )}
    </div>
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
