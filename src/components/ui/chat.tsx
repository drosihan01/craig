"use client";

import * as React from "react";
import { Dialog, DialogClose } from "./dialog";
import { AutoAwesome, ContentCopy, Description, Refresh } from "./icons";
import { AgentPhase, AgentQuestion, PersonTurn } from "./agent";
import { CraigMark } from "./craig-mark";
import { DEFAULT_MODEL, type ChatModel } from "./model-picker";
import { PromptBar } from "./prompt-bar";
import { cn } from "@/lib/cn";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Set while the response is still arriving — renders the caret. */
  streaming?: boolean;
  /** Which model produced it. Answers outlive the picker's current value. */
  model?: string;
  /** What the agent did to produce this, shown above the answer. */
  steps?: AgentStep[];
  /** Filename shown as a chip on a user message. */
  attachment?: string;
  /** Highlighted under the answer, so the ask doesn't get lost in the prose. */
  question?: string;
}

/**
 * A thing the agent did on the way to an answer — reading an attachment,
 * drafting, checking something.
 *
 * Only the running one is shown, beside the mark — an agent that goes quiet
 * for several seconds reads as broken, so it says what it's doing. Once the
 * answer lands the row clears: a finished checklist above every response is
 * noise, and the answer is the thing being read.
 *
 * The full list is still on the message, so a "what did this actually use"
 * affordance can be added later without changing the shape of the data.
 */
export interface AgentStep {
  id: string;
  label: string;
  state: "running" | "done";
}

/* -------------------------------------------------------------------------- */
/*  Transcript                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The message list on its own — used inside ChatModal and inline on a page, so
 * a conversation looks the same wherever it happens.
 *
 * Pins to the bottom as content arrives, but only when the reader is already
 * near the bottom. Yanking someone back down while they're scrolled up reading
 * an earlier answer is worse than letting new text arrive off-screen.
 */
export function ChatTranscript({
  messages,
  className,
}: {
  messages: ChatMessage[];
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const pinned = React.useRef(true);

  React.useEffect(() => {
    const el = ref.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className={cn("scrollbar-thin overflow-y-auto", className)}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        {messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Modal                                                                     */
/* -------------------------------------------------------------------------- */

export function ChatModal({
  open,
  onClose,
  messages,
  onSend,
  onStop,
  busy,
  model: controlledModel,
  onModelChange,
  suggestions,
}: {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSend: (text: string, model: ChatModel) => void;
  onStop?: () => void;
  busy?: boolean;
  model?: ChatModel;
  onModelChange?: (m: ChatModel) => void;
  suggestions?: string[];
}) {
  const [internalModel, setInternalModel] = React.useState(DEFAULT_MODEL);
  const model = controlledModel ?? internalModel;
  const setModel = onModelChange ?? setInternalModel;

  const empty = messages.length === 0;

  return (
    <Dialog open={open} onClose={onClose} size="chat" bare className="p-0">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="flex size-6 items-center justify-center rounded-md bg-accent-subtle text-accent-subtle-fg">
          <AutoAwesome className="size-3.5" />
        </span>
        <h2 className="text-base font-semibold tracking-[-0.01em]">
          Ask Craig
        </h2>
        <span className="ml-auto" />
        <DialogClose onClose={onClose} />
      </header>

      {empty ? (
        <div className="flex-1 overflow-y-auto px-4 py-5">
          <EmptyChat
            suggestions={suggestions}
            onPick={(text) => onSend(text, model)}
          />
        </div>
      ) : (
        <ChatTranscript messages={messages} className="flex-1 px-4 py-5" />
      )}

      <div className="border-t border-border p-3">
        <PromptBar
          size="sm"
          autoFocus
          placeholder="Ask anything about this workflow…"
          model={model}
          onModelChange={setModel}
          onSubmit={(text) => onSend(text, model)}
          onStop={onStop}
          busy={busy}
          footnote={
            model.internal
              ? `${model.name} can make mistakes. Check anything that affects someone's record.`
              : `${model.name} is hosted by ${model.vendor} — this conversation leaves your tenancy.`
          }
        />
      </div>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Messages                                                                  */
/* -------------------------------------------------------------------------- */

function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  if (isUser) {
    // User turns are bubbles, right-aligned — they're short and scannable.
    return (
      <div className="flex flex-col items-end gap-1.5">
        {message.attachment && (
          <span className="flex items-center gap-1.5 rounded-md border border-border bg-surface-sunken py-1 pl-1.5 pr-2 text-xs text-text-muted">
            <Description className="size-3.5 shrink-0 text-text-subtle" />
            {message.attachment}
          </span>
        )}
        <PersonTurn>{message.content}</PersonTurn>
      </div>
    );
  }

  // Assistant turns run full width with no bubble, so long answers read as
  // prose rather than as a wall inside a box.
  const running = message.steps?.find((s) => s.state === "running");

  return (
    <div className="group/msg flex flex-col gap-1.5">
      {/* The mark alone attributes it — a name label beside every answer is
          chrome repeating something obvious. While the agent is working, the
          step it's on sits next to the mark; when it finishes, the row goes
          back to just the mark and the answer stands on its own. */}
      <div className="flex items-center gap-2">
        <CraigMark className="size-5 shrink-0 text-accent" />
        {/* Keyed on the step id as well as the label: two consecutive steps
            could name the same thing, and the animation should still replay. */}
        {running && <AgentPhase key={running.id} label={running.label} />}
      </div>

      <MessageBody content={message.content} streaming={message.streaming} />

      {message.question && !message.streaming && (
        <AgentQuestion className="mt-1.5">{message.question}</AgentQuestion>
      )}

      {!message.streaming && (
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/msg:opacity-100">
          <MessageAction label="Copy">
            <ContentCopy className="size-3.5" />
          </MessageAction>
          <MessageAction label="Regenerate">
            <Refresh className="size-3.5" />
          </MessageAction>
          {message.model && (
            <span className="ml-1 text-2xs text-text-subtle">
              {message.model}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function MessageAction({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="inline-flex size-6 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-hover hover:text-text"
    >
      {children}
    </button>
  );
}

function EmptyChat({
  suggestions,
  onPick,
}: {
  suggestions?: string[];
  onPick: (text: string) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-4 text-center">
      <span className="flex size-10 items-center justify-center rounded-xl bg-accent-subtle text-accent-subtle-fg">
        <AutoAwesome className="size-5" />
      </span>
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-md font-semibold">Ask about this workflow</p>
        <p className="text-base text-text-muted">
          Draft a step, explain a policy, or check what a new starter still has
          outstanding.
        </p>
      </div>

      {suggestions && suggestions.length > 0 && (
        <div className="flex w-full max-w-md flex-col gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPick(s)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-left text-base text-text-muted transition-colors hover:border-border-strong hover:bg-surface-hover hover:text-text"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Craig's prose, rendered as the markdown he actually writes.
 *
 * He answers in a lead sentence and then bullets, because that's how the person
 * reading it actually reads. Lines beginning "- " become a real <ul> rather
 * than hyphens in a paragraph — the markup should say what the shape says, and
 * a screen reader shouldn't have to guess from punctuation.
 *
 * **Bullets used to be all it understood**, which meant everything else arrived
 * as punctuation: `**Regulatory compliance**:` rendered with the asterisks
 * showing, and `### Best practices` as a line beginning with three hashes. The
 * model was writing markdown because it is a model; the transcript was printing
 * it because it only knew one shape. That is worse than plain text would have
 * been — plain text is merely unformatted, whereas visible syntax reads as the
 * product having broken.
 *
 * Still line-based, and still not a markdown library. The reason is streaming:
 * this renders text that is *half arrived*, so it has to have an opinion about
 * `**Regu` — a parser either throws on that or waits for the delimiter to
 * close, and both of those are worse than showing the characters that exist.
 * Every rule below degrades to literal text when its closing marker hasn't
 * turned up yet, which is exactly the behaviour a half-written word wants.
 *
 * Underscores are deliberately not italics. `_` shows up in identifiers Craig
 * quotes back — `account_id`, `current_period_end` — and eating a pair of them
 * to italicise the middle of a column name is a worse failure than never
 * italicising at all. Asterisks are unambiguous in prose, so they are what it
 * reads.
 *
 * Exported because the showcase builds its own transcript — it interleaves
 * things `ChatMessage` has no field for — but Craig's prose must look the same
 * wherever it lands. A second copy of this would drift on the first bullet.
 */

/**
 * Inline runs: bold, italic, code, links.
 *
 * One pass, one alternation, and every branch requires its *closing* marker to
 * match. That is the whole streaming story: an unterminated `**` simply does
 * not match, so the asterisks fall through to the literal text and get replaced
 * by real bold the moment the rest arrives.
 *
 * Links are restricted to http(s). A transcript renders text a model produced,
 * and `[click here](javascript:…)` is a thing a model can be talked into
 * writing — so the scheme is checked here rather than trusted.
 */
const INLINE =
  /\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;

function inline(text: string): React.ReactNode {
  const out: React.ReactNode[] = [];
  let at = 0;
  let key = 0;

  /* `lastIndex` is stateful on a module-level regex, so it is reset per call —
     otherwise the second message rendered would start scanning from wherever
     the first one happened to stop. */
  INLINE.lastIndex = 0;

  for (let m = INLINE.exec(text); m !== null; m = INLINE.exec(text)) {
    if (m.index > at) out.push(text.slice(at, m.index));

    const [, bold, italic, code, linkText, href] = m;
    if (bold !== undefined) {
      out.push(<strong key={key++}>{bold}</strong>);
    } else if (italic !== undefined) {
      out.push(<em key={key++}>{italic}</em>);
    } else if (code !== undefined) {
      out.push(
        <code
          key={key++}
          className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[0.9em]"
        >
          {code}
        </code>,
      );
    } else if (href !== undefined) {
      out.push(
        <a
          key={key++}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-accent underline underline-offset-2"
        >
          {linkText}
        </a>,
      );
    }
    at = m.index + m[0].length;
  }

  if (at < text.length) out.push(text.slice(at));
  /* A string when nothing matched, so the common case adds no array or keys. */
  return out.length === 0 ? text : out.length === 1 ? out[0] : out;
}

/** `##`-style headings, and how big each one is allowed to be. */
const HEADING = /^(#{1,6})\s+(.*)$/;

/** `1. ` — a list whose numbering is part of what it says. */
const ORDERED = /^(\d+)\.\s+(.*)$/;
export function MessageBody({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  /* Runs, not blocks. Craig writes a lead line and then bullets under it in
     the same paragraph, so splitting on blank lines alone would leave the
     hyphens sitting in prose. This walks the lines and starts a new run
     whenever the shape changes.

     A heading is always its own run of one, because two consecutive headings
     are two headings rather than a two-line one. */
  type Kind = "bullet" | "ordered" | "heading" | "para";
  const runs: { kind: Kind; lines: string[] }[] = [];

  for (const line of content.split("\n")) {
    if (line.trim() === "") {
      /* A blank line ends whatever was open. The next line starts a run even if
         it is the same shape, which is what keeps two bulleted lists separated
         by a blank line from merging into one. */
      if (runs.length > 0 && runs[runs.length - 1].lines.length > 0) {
        runs.push({ kind: "para", lines: [] });
      }
      continue;
    }

    const kind: Kind = HEADING.test(line)
      ? "heading"
      : line.startsWith("- ") || line.startsWith("* ")
        ? "bullet"
        : ORDERED.test(line)
          ? "ordered"
          : "para";

    const current = runs[runs.length - 1];
    const canExtend =
      current &&
      current.lines.length > 0 &&
      current.kind === kind &&
      kind !== "heading";

    if (canExtend) current.lines.push(line);
    else if (current && current.lines.length === 0) {
      current.kind = kind;
      current.lines.push(line);
    } else runs.push({ kind, lines: [line] });
  }

  const filled = runs.filter((r) => r.lines.length > 0);

  return (
    <div className="flex flex-col gap-3 text-base leading-relaxed text-text">
      {filled.map((run, i) => {
        const last = i === filled.length - 1;

        if (run.kind === "heading") {
          const [, hashes, text] = run.lines[0].match(HEADING) ?? [];
          /* One step down per level, floored quickly. This sits inside a
             transcript where the turn itself is not a document — an `<h1>` from
             Craig is a heading within his answer, not a heading of the page, so
             the visual range is deliberately narrow. */
          const level = Math.min(hashes?.length ?? 3, 3);
          return (
            <p
              key={i}
              className={cn(
                "font-semibold text-text",
                level === 1 ? "text-lg" : level === 2 ? "text-md" : "text-base",
              )}
            >
              {inline(text ?? "")}
            </p>
          );
        }

        if (run.kind === "bullet" || run.kind === "ordered") {
          const ordered = run.kind === "ordered";
          const List = ordered ? "ol" : "ul";
          return (
            <List key={i} className="flex flex-col gap-1.5">
              {run.lines.map((line, j) => {
                const body = ordered
                  ? (line.match(ORDERED)?.[2] ?? line)
                  : line.slice(2);
                return (
                  <li key={j} className="flex gap-2.5">
                    {ordered ? (
                      /* The number he wrote, not one this list counted for
                         itself. A step "3." that arrives before "2." is a
                         streaming artefact, and renumbering it to 1 would make
                         the text disagree with itself mid-sentence. */
                      <span className="mt-0 shrink-0 tabular-nums text-text-subtle">
                        {line.match(ORDERED)?.[1]}.
                      </span>
                    ) : (
                      <span
                        aria-hidden
                        className="mt-[0.6em] size-1 shrink-0 rounded-full bg-text-subtle"
                      />
                    )}
                    <span className="min-w-0 flex-1">{inline(body)}</span>
                  </li>
                );
              })}
            </List>
          );
        }

        return (
          <p key={i} className="whitespace-pre-wrap">
            {inline(run.lines.join("\n"))}
            {last && streaming && (
              <span
                aria-hidden
                className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-accent align-baseline motion-safe:animate-[caret-blink_1s_steps(1)_infinite]"
              />
            )}
          </p>
        );
      })}
    </div>
  );
}
