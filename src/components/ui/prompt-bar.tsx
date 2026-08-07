"use client";

import * as React from "react";
import { Add, ArrowUpward, Mic, StopCircle } from "./icons";
import { DEFAULT_MODEL, ModelPicker, type ChatModel } from "./model-picker";
import { cn } from "@/lib/cn";

/**
 * The composer, on its own. Used standalone as a page-level prompt and inside
 * ChatModal as its footer — one implementation so the two can't drift.
 *
 * Enter sends, Shift+Enter breaks the line. The textarea grows with content up
 * to a ceiling, then scrolls.
 */
export interface PromptBarProps {
  onSubmit: (text: string) => void;
  model?: ChatModel;
  onModelChange?: (model: ChatModel) => void;
  placeholder?: string;
  busy?: boolean;
  onStop?: () => void;
  /** Speech-to-text into this field. Not a live-voice mode. */
  dictation?: boolean;
  /** Larger padding and radius for standalone page-level use. */
  size?: "sm" | "lg";
  /** Line under the bar — disclaimer, hint, character count. */
  footnote?: React.ReactNode;
  autoFocus?: boolean;
  className?: string;
}

export function PromptBar({
  onSubmit,
  model: controlledModel,
  onModelChange,
  placeholder = "Type / for skills",
  busy,
  onStop,
  dictation = true,
  size = "lg",
  footnote,
  autoFocus,
  className,
}: PromptBarProps) {
  const [value, setValue] = React.useState("");
  const [internalModel, setInternalModel] = React.useState(DEFAULT_MODEL);

  const model = controlledModel ?? internalModel;
  const setModel = onModelChange ?? setInternalModel;

  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, size === "lg" ? 220 : 160)}px`;
  }, [value, size]);

  function submit() {
    const text = value.trim();
    if (!text || busy) return;
    onSubmit(text);
    setValue("");
  }

  const lg = size === "lg";

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div
        className={cn(
          "bg-surface shadow-e1 transition-[border-color,box-shadow] focus-within:border-accent-ring focus-within:ring-[3px] focus-within:ring-accent-ring/20",
          "border border-border",
          lg ? "rounded-2xl" : "rounded-xl",
        )}
      >
        <textarea
          ref={ref}
          // Two lines at page level — a single-line box reads as a search
          // field, and this is asking for a paragraph.
          rows={lg ? 2 : 1}
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          aria-label="Message"
          className={cn(
            "scrollbar-thin w-full resize-none bg-transparent text-text outline-none placeholder:text-text-subtle",
            lg
              ? "px-4 pt-3.5 text-md leading-relaxed"
              : "px-3.5 pt-3 text-base leading-relaxed",
          )}
        />

        <div className={cn("flex items-center gap-1", lg ? "p-2.5" : "px-2 pb-2")}>
          <IconButton label="Add context">
            <Add className="size-4" />
          </IconButton>

          <div className="ml-auto flex items-center gap-0.5">
            <ModelPicker value={model} onChange={setModel} />

            {/* Dictation, i.e. speech to text in this field. Deliberately not a
                live-voice mode — that's a different interaction with different
                expectations, and this bar is for composing a message. */}
            {dictation && (
              <IconButton label="Dictate">
                <Mic className="size-4" />
              </IconButton>
            )}

            {busy && onStop ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop generating"
                className="ml-0.5 inline-flex size-7 items-center justify-center rounded-md bg-surface-sunken text-text-muted transition-colors hover:text-text"
              >
                <StopCircle className="size-4" />
              </button>
            ) : (
              value.trim() && (
                <button
                  type="button"
                  onClick={submit}
                  aria-label="Send"
                  className="ml-0.5 inline-flex size-7 items-center justify-center rounded-md bg-accent text-accent-fg transition-colors hover:bg-accent-hover"
                >
                  <ArrowUpward className="size-4" />
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {footnote && (
        <p className="px-1 text-2xs text-text-subtle">{footnote}</p>
      )}
    </div>
  );
}

function IconButton({
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
      className="inline-flex size-7 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-hover hover:text-text"
    >
      {children}
    </button>
  );
}
