"use client";

import * as React from "react";
import { Add, ArrowUpward, Close, Description, Mic, StopCircle } from "./icons";
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
  /** Enables the attach button. Fires with the full list after every change. */
  onAttach?: (files: File[]) => void;
  /** Passed straight to the file input. */
  accept?: string;
  /** Shows a numbered chip in the composer, continuing a list of quick replies
      above it — so "type your own" reads as the last option rather than a
      separate mechanism. */
  numberHint?: number;
  /** Lets a parent focus the composer, e.g. when its number is pressed. */
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
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
  numberHint,
  inputRef,
  onAttach,
  accept = ".pdf,.doc,.docx,.md,.txt,.rtf",
  size = "lg",
  footnote,
  autoFocus,
  className,
}: PromptBarProps) {
  const [value, setValue] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [internalModel, setInternalModel] = React.useState(DEFAULT_MODEL);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const model = controlledModel ?? internalModel;
  const setModel = onModelChange ?? setInternalModel;

  const ref = React.useRef<HTMLTextAreaElement>(null);

  /* The resting height is the floor, and typing only ever grows from it.
     A placeholder long enough to wrap makes the empty box two or three lines
     tall; without a floor the first character you type collapses it to one,
     which reads as the composer flinching away from you. Re-measured when the
     placeholder or size changes, since either moves the resting height. */
  const floorRef = React.useRef(0);

  React.useLayoutEffect(() => {
    floorRef.current = 0;
  }, [placeholder, size]);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.style.height = "auto";
    // Empty on this pass, so scrollHeight is the resting height.
    if (!floorRef.current && !value) floorRef.current = el.scrollHeight;

    el.style.height = `${Math.max(
      floorRef.current,
      Math.min(el.scrollHeight, size === "lg" ? 220 : 160),
    )}px`;
  }, [value, size, placeholder]);

  // Hand the node up so a parent can focus it.
  React.useEffect(() => {
    if (inputRef) inputRef.current = ref.current;
  }, [inputRef]);

  function submit() {
    const text = value.trim();
    if (!text || busy) return;
    onSubmit(text);
    setValue("");
  }

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const next = [...files, ...Array.from(list)];
    setFiles(next);
    onAttach?.(next);
  }

  function removeFile(index: number) {
    const next = files.filter((_, i) => i !== index);
    setFiles(next);
    onAttach?.(next);
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
        <div
          className={cn(
            "flex items-start gap-2.5",
            lg ? "px-4 pt-3.5" : "px-3.5 pt-3",
          )}
        >
          {numberHint !== undefined && (
            <span
              aria-hidden
              className="mt-px flex size-5 shrink-0 items-center justify-center rounded bg-surface-sunken text-2xs font-semibold tabular-nums text-text-subtle"
            >
              {numberHint}
            </span>
          )}
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
              "scrollbar-thin w-full flex-1 resize-none bg-transparent text-text outline-none placeholder:text-text-subtle",
              lg ? "text-md leading-relaxed" : "text-base leading-relaxed",
            )}
          />
        </div>

        {files.length > 0 && (
          <ul
            className={cn(
              "flex flex-wrap gap-1.5 pt-2",
              lg ? "px-4" : "px-3.5",
            )}
          >
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex max-w-56 items-center gap-1.5 rounded-md border border-border bg-surface-sunken py-1 pl-1.5 pr-1 text-xs"
              >
                <Description className="size-3.5 shrink-0 text-text-subtle" />
                <span className="truncate text-text-muted">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  aria-label={`Remove ${f.name}`}
                  className="inline-flex size-4 shrink-0 items-center justify-center rounded text-text-subtle transition-colors hover:text-text"
                >
                  <Close className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div
          className={cn("flex items-center gap-1", lg ? "p-2.5" : "px-2 pb-2")}
        >
          {/* A real file input, kept out of the layout and driven by the button
              — styling an <input type="file"> directly is not portable, and the
              button needs to look like the rest of the bar. */}
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={accept}
            onChange={(e) => {
              addFiles(e.target.files);
              // Reset so picking the same file twice still fires a change.
              e.target.value = "";
            }}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
          />
          <IconButton
            label="Attach a file"
            onClick={() => fileRef.current?.click()}
          >
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

      {footnote && <p className="px-1 text-2xs text-text-subtle">{footnote}</p>}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex size-7 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-hover hover:text-text"
    >
      {children}
    </button>
  );
}
