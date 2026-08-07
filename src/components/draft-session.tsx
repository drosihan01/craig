"use client";

import * as React from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  buttonVariants,
  Card,
  ChatTranscript,
  CraigMark,
  List,
  ListIcon,
  ListItem,
  PromptBar,
  type ChatMessage,
} from "@/components/ui";
import { AutoAwesome, Code, Groups } from "@/components/ui/icons";
import { NEW_HIRE } from "@/lib/demo";
import { SESSION, type SessionTurn } from "@/lib/demo-session";
import { WORKFLOW, stepCount, unconfiguredCount } from "@/lib/demo-workflow";

/**
 * Drafting a workflow by describing the company, and the conversation that
 * follows.
 *
 * Lives here rather than inside a page because it has two homes: it's the
 * whole of Home while an account has nothing in it, and it's one of three ways
 * to start a workflow once it does. Two mounts, one implementation — a second
 * copy would drift the first time the script changed.
 *
 * Two states in one component rather than two routes: the first message
 * continues the question, it isn't a navigation. Sending collapses the hero
 * and the templates and pins the composer to the bottom, because once there's
 * a transcript the thing that needs to be in reach is the reply box.
 */

/* Counted from the blocks rather than typed in, so the hand-off card, the
   workflows list and the canvas can't disagree about how big the draft is. */
const DRAFT_STEPS = stepCount([...WORKFLOW.blocks]);
const DRAFT_UNCONFIGURED = unconfiguredCount([...WORKFLOW.blocks]);

/**
 * Starting points, not finished workflows. Describing the company in prose is
 * the better path and stays primary, but it's a blank box, and a blank box is
 * where most people stop.
 *
 * Four cards, because they're a 2x2 rather than a list: engineering or not,
 * employed or contracted. Those are the two questions that actually change the
 * shape of an onboarding. The icon says which kind of person and repeats down
 * each column on purpose — that repetition is what makes the grid read as a
 * matrix instead of four unrelated options.
 */
const TEMPLATES = [
  {
    id: "engineer",
    icon: Code,
    title: "Engineer",
    description:
      "One step per account, a quiz instead of “read the handbook”, and a 1:1 with whoever owns the system.",
    steps: DRAFT_STEPS,
    tag: { label: "Most used", tone: "accent" as const },
  },
  {
    id: "general",
    icon: Groups,
    title: "General hire",
    description:
      "Anyone outside engineering. Fewer consoles, more context — most of what they need isn’t written down anywhere yet.",
    steps: 9,
  },
  {
    id: "engineer-contract",
    icon: Code,
    title: "Engineer, contract",
    description:
      "The same access, scoped and dated. Read-only where it can be, and an offboarding step that actually fires.",
    steps: 10,
    tag: { label: "Contract", tone: "neutral" as const },
  },
  {
    id: "general-contract",
    icon: Groups,
    title: "General contractor",
    description:
      "Same shape, less kit. A contract, a way to invoice, and the two or three tools they’ll actually open.",
    steps: 6,
    tag: { label: "Contract", tone: "neutral" as const },
  },
];

/* The reply Craig gives once the scripted session runs out, so a demo that
   goes off-script degrades honestly instead of repeating itself. */
const FALLBACK =
  "Ah — that's past what I've got scripted. There's no model hooked up behind me yet, so I'd only be making something up.";

export function DraftSession({
  heading = "Tell me a little bit about your company",
  placeholder = "we're 3 people doing AI infra…",
  session = SESSION,
  showTemplates = true,
  onStart,
  onFinish,
}: {
  heading?: string;
  /** Should sound like the person, not like a form. */
  placeholder?: string;
  /** Which scripted conversation to walk. */
  session?: SessionTurn[];
  /**
   * Template cards under the composer. On in the returning-user case, where
   * they're a shortcut past a blank box. Off during first-run setup, where
   * they're a second thing to decide about before you've done the first.
   */
  showTemplates?: boolean;
  /** Fired on the first message, so a page can drop its own chrome. */
  onStart?: () => void;
  /**
   * Called when Ada asks for the workflow to be built. When passed, the
   * hand-off card becomes a build prompt and this fires on the button rather
   * than on Craig finishing his sentence.
   */
  onFinish?: () => void;
}) {
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
    const turn = session[turnIndex];
    const replyId = crypto.randomUUID();

    onStart?.();

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
        steps: turn
          ? [{ id: turn.steps[0], label: turn.steps[0], state: "running" }]
          : [],
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
            /* Never builds on its own. The last turn puts the offer on
               screen and waits — Ada might want to add three more things, and
               a workflow that appears while she's still talking is one she
               didn't ask for. */
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

  if (messages.length > 0) {
    return (
      /* Pinned to the viewport so only the transcript scrolls. A composer that
         scrolls away is the single most annoying thing a chat can do. */
      <div className="flex h-[calc(100vh-3rem)] flex-col">
        <ChatTranscript messages={messages} className="-mx-4 flex-1 px-4 py-8" />

        <div className="shrink-0 pb-6">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
            {offerDraft &&
              (onFinish ? <BuildPrompt onBuild={onFinish} /> : <DraftHandoff />)}

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
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-2xl flex-col justify-center py-16">
      <div className="flex flex-col items-center gap-4 text-center">
        <CraigMark className="size-14 text-accent" />
        <h1 className="text-4xl font-semibold tracking-[-0.03em]">{heading}</h1>
      </div>

      <div className="pt-8">
        <PromptBar
          autoFocus
          placeholder={placeholder}
          onSubmit={send}
          footnote="Attach a handbook if you have one — however out of date it is"
        />
      </div>

      {showTemplates && (
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
                    <Badge tone={t.tag.tone} size="sm" className="shrink-0">
                      {t.tag.label}
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
      )}
    </div>
  );
}

/**
 * Predicted replies to Craig's question.
 *
 * Numbered, and pickable with the number keys — Ada types fast and shouldn't
 * have to reach for the mouse to answer a yes/no. The options are phrasings of
 * one answer rather than genuinely different answers; the script is linear, and
 * an option that changed what she said would make Craig's next turn incoherent.
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
 * published workflow — Craig proposes, Ada edits, and the unconfigured steps
 * are the reason she has to look before anything runs.
 */
function DraftHandoff() {
  return (
    <List>
      <ListItem
        leading={
          <ListIcon tone="accent">
            <Code />
          </ListIcon>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {WORKFLOW.name}
            <Badge tone="warning" size="sm">
              Draft
            </Badge>
          </span>
        }
        description={`${DRAFT_STEPS} steps · ${DRAFT_UNCONFIGURED} unconfigured · for ${NEW_HIRE.name}, starts in ${NEW_HIRE.startsIn}`}
        trailing={
          <Link
            href={`/builder/${WORKFLOW.id}`}
            className={buttonVariants({ size: "sm" })}
          >
            Open the draft
          </Link>
        }
      />
    </List>
  );
}

/**
 * The end of the conversation, and a decision rather than an outcome.
 *
 * Craig proposes; Ada decides. He asks whether it's right, and building only
 * happens when she says so — the composer is still there underneath, so
 * "actually, add a background check" is as available as "go on then". A
 * workflow that materialises while somebody is still mid-thought is one they
 * didn't ask for, and they'll spend the next ten minutes undoing it.
 */
function BuildPrompt({ onBuild }: { onBuild: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-accent bg-accent-subtle/30 p-4">
      <div className="flex flex-col gap-1">
        <p className="text-base font-medium">Shall I build it?</p>
        <p className="text-sm leading-relaxed text-text-muted">
          You can change every step afterwards, and nothing runs until you put
          somebody through it. Or keep going below — I&apos;ll add whatever
          else you think of.
        </p>
      </div>
      <Button size="sm" className="w-fit" onClick={onBuild}>
        <AutoAwesome />
        Build this workflow
      </Button>
    </div>
  );
}
