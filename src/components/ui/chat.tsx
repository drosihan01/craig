"use client";

import * as React from "react";
import { Dialog, DialogClose } from "./dialog";
import { AutoAwesome, ContentCopy, Description, Refresh } from "./icons";
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
        <h2 className="text-base font-semibold tracking-[-0.01em]">Ask Craig</h2>
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
        <div className="max-w-[85%] whitespace-pre-wrap rounded-xl rounded-br-sm bg-accent-subtle px-3.5 py-2.5 text-base leading-relaxed text-accent-subtle-fg">
          {message.content}
        </div>
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
        {running && (
          /* Keyed on the step id so swapping states remounts this and the
             phase animation replays, rather than the label snapping. */
          /* No spinner. The mark is already beside it and the label already
             changes as it works — a spinning circle on top of both is a third
             thing saying the same thing. */
          <span
            key={running.id}
            className="text-sm text-text-muted motion-safe:animate-[step-phase_260ms_cubic-bezier(0.25,1,0.5,1),soft-pulse_2.2s_ease-in-out_260ms_infinite]"
          >
            {running.label}
          </span>
        )}
      </div>

      <div className="whitespace-pre-wrap text-base leading-relaxed text-text">
        {message.content}
        {message.streaming && (
          <span
            aria-hidden
            className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-accent align-baseline motion-safe:animate-[caret-blink_1s_steps(1)_infinite]"
          />
        )}
      </div>

      {/* The question sits apart from the prose. Buried at the end of four
          paragraphs it gets skimmed past, and then the reply options below
          look like they belong to nothing.

          Dotted outline, no fill — it's an aside asking something, not a card
          announcing something, and dotted is already the system's language for
          "this line is provisional". A filled block read as heavier than the
          answer above it. */}
      {message.question && !message.streaming && (
        <p className="mt-1.5 rounded-lg border border-dotted border-accent px-3.5 py-2.5 text-base leading-relaxed text-text">
          {message.question}
        </p>
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
