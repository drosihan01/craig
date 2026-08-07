"use client";

import * as React from "react";
import { Check, ExpandMore } from "./icons";
import { cn } from "@/lib/cn";

/**
 * Which model answers, and how hard it thinks.
 *
 * Craigopilot is the in-house one and the *intended* default — it's the
 * only model that can see company data, so anything touching a real new hire's
 * record has to run on it. It isn't trained yet, so it's listed and disabled
 * rather than hidden: hiding it would suggest the in-house option was never
 * planned, and the data boundary it exists to enforce still needs designing
 * around.
 */

export interface ChatModel {
  id: string;
  name: string;
  vendor: string;
  description: string;
  /** In-house models can be trusted with employee data; hosted ones can't. */
  internal?: boolean;
  /** Selectable. An unavailable model still appears — hiding it would make the
      in-house option look like it was never planned. */
  available?: boolean;
  /** Why it can't be picked. Shown in place of the description. */
  unavailableReason?: string;
}

export const CHAT_MODELS: ChatModel[] = [
  {
    id: "craigopilot",
    name: "Craigopilot",
    vendor: "In-house",
    description: "Knows your workflows and policies. Data stays internal.",
    internal: true,
    available: false,
    unavailableReason: "Not available yet — in training",
  },
  {
    id: "claude",
    name: "Claude",
    vendor: "Anthropic",
    description: "Strongest at long documents and careful reasoning.",
  },
  {
    id: "gpt",
    name: "GPT",
    vendor: "OpenAI",
    description: "General purpose. Good for drafting and rewriting.",
  },
];

/* The first *available* model, not simply the first. Craigopilot is the intended
   default and the only one that can see company data, but it isn't running
   yet — defaulting to it would mean every request silently failed. */
export const DEFAULT_MODEL =
  CHAT_MODELS.find((m) => m.available !== false) ?? CHAT_MODELS[0];

export const EFFORT_LEVELS = [
  { id: "low", name: "Low", description: "Fastest. Short, direct answers." },
  { id: "medium", name: "Medium", description: "Balanced. The default." },
  { id: "high", name: "High", description: "Slowest. Thinks before answering." },
] as const;

export type Effort = (typeof EFFORT_LEVELS)[number]["id"];

/* -------------------------------------------------------------------------- */
/*  Shared dropdown                                                           */
/* -------------------------------------------------------------------------- */

interface MenuOption {
  id: string;
  name: string;
  description: string;
  tag?: string;
  disabled?: boolean;
}

/**
 * Opens upward — it always sits at the bottom of a composer. Escape is caught
 * in the capture phase and stopped so it closes the menu without also closing
 * the dialog the composer lives in.
 */
function InlineMenu({
  label,
  trigger,
  options,
  selectedId,
  onSelect,
  width = "w-72",
  className,
}: {
  label: string;
  trigger: React.ReactNode;
  options: readonly MenuOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  width?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  React.useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        aria-controls={open ? listId : undefined}
        className="inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 transition-colors hover:bg-surface-hover"
      >
        {trigger}
        <ExpandMore
          className={cn(
            "size-4 shrink-0 text-text-subtle transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className={cn(
            "absolute bottom-full right-0 z-20 mb-1.5 overflow-hidden rounded-lg border border-border bg-surface-raised p-1 shadow-e3 motion-safe:animate-[dialog-in_140ms_cubic-bezier(0.32,0.72,0,1)]",
            width,
          )}
        >
          {options.map((o) => {
            const selected = o.id === selectedId;
            return (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-disabled={o.disabled || undefined}
                  disabled={o.disabled}
                  onClick={() => {
                    onSelect(o.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                    o.disabled
                      ? "cursor-not-allowed opacity-45"
                      : "hover:bg-surface-hover",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-base font-medium text-text">
                        {o.name}
                      </span>
                      {o.tag && (
                        <span className="shrink-0 rounded-sm bg-surface-sunken px-1 py-px text-2xs text-text-subtle">
                          {o.tag}
                        </span>
                      )}
                    </span>
                    <span className="text-xs leading-snug text-text-subtle">
                      {o.description}
                    </span>
                  </span>
                  <Check
                    className={cn(
                      "mt-0.5 size-4 shrink-0 text-accent",
                      !selected && "invisible",
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Pickers                                                                   */
/* -------------------------------------------------------------------------- */

export function ModelPicker({
  value,
  onChange,
  className,
}: {
  value: ChatModel;
  onChange: (model: ChatModel) => void;
  className?: string;
}) {
  return (
    <InlineMenu
      label="Model"
      className={className}
      selectedId={value.id}
      onSelect={(id) => {
        const next = CHAT_MODELS.find((m) => m.id === id);
        if (next && next.available !== false) onChange(next);
      }}
      options={CHAT_MODELS.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.unavailableReason ?? m.description,
        tag: m.vendor,
        disabled: m.available === false,
      }))}
      trigger={
        <span className="max-w-44 truncate text-sm font-medium text-text">
          {value.name}
        </span>
      }
    />
  );
}

export function EffortPicker({
  value,
  onChange,
  className,
}: {
  value: Effort;
  onChange: (effort: Effort) => void;
  className?: string;
}) {
  const current = EFFORT_LEVELS.find((e) => e.id === value);
  return (
    <InlineMenu
      label="Effort"
      className={className}
      width="w-56"
      selectedId={value}
      onSelect={(id) => onChange(id as Effort)}
      options={EFFORT_LEVELS}
      trigger={
        <span className="text-sm text-text-subtle">{current?.name}</span>
      }
    />
  );
}
