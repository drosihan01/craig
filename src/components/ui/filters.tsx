"use client";

import * as React from "react";
import {
  ArrowDownward,
  ArrowUpward,
  Check,
  Close,
  ExpandMore,
  FilterList,
  Search,
  SwapVert,
} from "./icons";
import { cn } from "@/lib/cn";

/**
 * Narrowing a list: search, filter chips, sort.
 *
 * Two rules the whole thing is built around.
 *
 * A chip shows its *value*, not just its name — "Role: Admin", not "Role ▾".
 * The state of a filtered list has to be readable without opening anything,
 * because the expensive mistake is looking at a filtered list and believing
 * it's the whole list.
 *
 * The count says "showing 2 of 4" rather than "2 results", for the same
 * reason: a filter that hides most of the data should say so.
 */

/* -------------------------------------------------------------------------- */
/*  Bar                                                                       */
/* -------------------------------------------------------------------------- */

export function FilterBar({
  shown,
  total,
  noun = "results",
  onClear,
  children,
  className,
}: {
  shown?: number;
  total?: number;
  /** Pluralised by the caller — "people", "documents". */
  noun?: string;
  /** Renders "Clear" when passed and something is filtered. */
  onClear?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const filtered = shown !== undefined && total !== undefined && shown < total;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">{children}</div>

      {shown !== undefined && total !== undefined && (
        <div className="flex items-center gap-2 text-xs text-text-subtle">
          <span>
            {filtered ? (
              <>
                Showing <span className="text-text-muted">{shown}</span> of{" "}
                {total} {noun}
              </>
            ) : (
              <>
                {total} {noun}
              </>
            )}
          </span>

          {filtered && onClear && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-sm text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Search                                                                    */
/* -------------------------------------------------------------------------- */

export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-subtle" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          "h-8 w-full rounded-md border border-border bg-surface pl-8 text-base text-text shadow-e1",
          "placeholder:text-text-subtle transition-[border-color,box-shadow]",
          "hover:border-border-strong",
          "focus:border-accent-ring focus:outline-none focus:ring-[3px] focus:ring-accent-ring/20",
          // The native clear button is unstyleable, so we draw our own.
          "[&::-webkit-search-cancel-button]:appearance-none",
          value ? "pr-8" : "pr-2.5",
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-text-subtle transition-colors hover:text-text"
        >
          <Close className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Filter chip                                                               */
/* -------------------------------------------------------------------------- */

export interface FilterOption {
  id: string;
  label: string;
}

export function FilterChip({
  label,
  options,
  selected,
  onChange,
  className,
}: {
  label: string;
  options: FilterOption[];
  /** Empty means "no filter" rather than "nothing matches". */
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const active = selected.length > 0;

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id],
    );
  }

  /* The value, not a count, while there's room for it. "Role: Admin" can be
     read at a glance; "Role: 1" has to be opened. */
  const summary =
    selected.length === 0
      ? null
      : selected.length === 1
        ? (options.find((o) => o.id === selected[0])?.label ?? null)
        : `${selected.length} selected`;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-base transition-colors",
          active
            ? "border border-accent bg-accent-subtle text-accent-subtle-fg"
            : "border border-dashed border-border-strong text-text-muted hover:border-border-strong hover:bg-surface-hover hover:text-text",
        )}
      >
        {!active && <FilterList className="size-4 shrink-0" />}
        <span className="truncate">
          {label}
          {summary && (
            <>
              <span className="opacity-60">: </span>
              <span className="font-medium">{summary}</span>
            </>
          )}
        </span>

        {active ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Clear ${label} filter`}
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onChange([]);
              }
            }}
            className="-mr-1 inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded transition-colors hover:bg-accent hover:text-accent-fg"
          >
            <Close className="size-3.5" />
          </span>
        ) : (
          <ExpandMore className="size-4 shrink-0 text-text-subtle" />
        )}
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={label}
          aria-multiselectable
          className="absolute left-0 top-full z-30 mt-1.5 w-56 overflow-hidden rounded-lg border border-border bg-surface-raised p-1 shadow-e3 motion-safe:animate-[dialog-in_140ms_cubic-bezier(0.32,0.72,0,1)]"
        >
          {options.map((o) => {
            const on = selected.includes(o.id);
            return (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => toggle(o.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-base transition-colors hover:bg-surface-hover"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                      on
                        ? "border-accent bg-accent text-accent-fg"
                        : "border-border-strong",
                    )}
                  >
                    {on && <Check className="size-3" />}
                  </span>
                  <span className="truncate">{o.label}</span>
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
/*  Sort                                                                      */
/* -------------------------------------------------------------------------- */

export type SortDirection = "asc" | "desc";

export interface SortState {
  field: string;
  direction: SortDirection;
}

export function SortControl({
  value,
  options,
  onChange,
  className,
}: {
  value: SortState;
  options: FilterOption[];
  onChange: (value: SortState) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.id === value.field);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const Direction = value.direction === "asc" ? ArrowUpward : ArrowDownward;

  return (
    <div ref={rootRef} className={cn("relative flex items-center", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex h-8 items-center gap-1.5 rounded-l-md border border-r-0 border-border bg-surface px-2.5 text-base text-text-muted shadow-e1 transition-colors hover:bg-surface-hover hover:text-text"
      >
        <SwapVert className="size-4 shrink-0 text-text-subtle" />
        <span className="truncate">{current?.label ?? "Sort"}</span>
      </button>

      {/* Direction is its own button. It's the control people reach for most,
          and burying it inside the menu costs two clicks every time. */}
      <button
        type="button"
        onClick={() =>
          onChange({
            ...value,
            direction: value.direction === "asc" ? "desc" : "asc",
          })
        }
        aria-label={
          value.direction === "asc"
            ? "Sorted ascending — switch to descending"
            : "Sorted descending — switch to ascending"
        }
        className="inline-flex size-8 items-center justify-center rounded-r-md border border-border bg-surface text-text-muted shadow-e1 transition-colors hover:bg-surface-hover hover:text-text"
      >
        <Direction className="size-4" />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Sort by"
          className="absolute left-0 top-full z-30 mt-1.5 w-48 overflow-hidden rounded-lg border border-border bg-surface-raised p-1 shadow-e3 motion-safe:animate-[dialog-in_140ms_cubic-bezier(0.32,0.72,0,1)]"
        >
          {options.map((o) => {
            const on = o.id === value.field;
            return (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => {
                    onChange({ ...value, field: o.id });
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-base transition-colors hover:bg-surface-hover"
                >
                  <span className="flex-1 truncate">{o.label}</span>
                  <Check
                    className={cn(
                      "size-4 shrink-0 text-accent",
                      !on && "invisible",
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
