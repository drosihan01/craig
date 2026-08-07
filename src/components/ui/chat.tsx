"use client";

import * as React from "react";
import { Dialog, DialogClose } from "./dialog";
import { AutoAwesome, ContentCopy, Refresh } from "./icons";
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
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl rounded-br-sm bg-accent-subtle px-3.5 py-2.5 text-base leading-relaxed text-accent-subtle-fg">
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant turns run full width with no bubble, so long answers read as
  // prose rather than as a wall inside a box.
  return (
    <div className="group/msg flex flex-col gap-1.5">
      <div className="text-base leading-relaxed text-text">
        {message.content}
        {message.streaming && (
          <span
            aria-hidden
            className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-accent align-baseline motion-safe:animate-[caret-blink_1s_steps(1)_infinite]"
          />
        )}
      </div>

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
