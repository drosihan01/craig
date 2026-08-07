"use client";

import * as React from "react";
import { CalendarToday, ChevronLeft, ChevronRight } from "./icons";
import { cn } from "@/lib/cn";

/**
 * Month grid and a date input built on it. No date library: onboarding only
 * ever needs "pick a day", and Date plus Intl covers that. Everything is
 * computed in local time — a UTC-based Date would land on the wrong day for
 * anyone east of Greenwich, which is most of this product's users.
 */

/* --- date helpers ---------------------------------------------------------- */

/** Midnight local, so two dates compare by day rather than by instant. */
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** ISO yyyy-mm-dd built from local parts — never use toISOString here. */
export function toISODate(d: Date) {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromISODate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Six weeks of cells covering `month`, padded with the neighbouring months.
 * Always 42 cells so the grid doesn't change height as you page through.
 */
function buildGrid(month: Date, weekStartsOn: number) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() - weekStartsOn + 7) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { date: d, outside: d.getMonth() !== month.getMonth() };
  });
}

/* --- Calendar -------------------------------------------------------------- */

export interface CalendarProps {
  value?: Date | null;
  onChange?: (date: Date) => void;
  /** Days before this are not selectable. */
  min?: Date;
  max?: Date;
  /** 0 = Sunday, 1 = Monday. Defaults to Monday. */
  weekStartsOn?: 0 | 1;
  locale?: string;
  className?: string;
}

export function Calendar({
  value,
  onChange,
  min,
  max,
  weekStartsOn = 1,
  locale = "en-AU",
  className,
}: CalendarProps) {
  const today = React.useMemo(() => startOfDay(new Date()), []);
  const [month, setMonth] = React.useState(() => {
    const base = value ?? today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const grid = React.useMemo(
    () => buildGrid(month, weekStartsOn),
    [month, weekStartsOn],
  );

  const weekdays = React.useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
    // 2024-01-07 is a Sunday; walk forward from the configured week start.
    return Array.from({ length: 7 }, (_, i) =>
      fmt.format(new Date(2024, 0, 7 + ((weekStartsOn + i) % 7))),
    );
  }, [locale, weekStartsOn]);

  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(month);

  function disabled(d: Date) {
    if (min && d.getTime() < startOfDay(min).getTime()) return true;
    if (max && d.getTime() > startOfDay(max).getTime()) return true;
    return false;
  }

  return (
    <div className={cn("w-64 select-none p-2", className)}>
      <div className="flex items-center justify-between px-1 pb-2">
        <NavButton
          label="Previous month"
          onClick={() => setMonth((m) => addMonths(m, -1))}
        >
          <ChevronLeft className="size-4" />
        </NavButton>
        <span aria-live="polite" className="text-sm font-semibold">
          {monthLabel}
        </span>
        <NavButton
          label="Next month"
          onClick={() => setMonth((m) => addMonths(m, 1))}
        >
          <ChevronRight className="size-4" />
        </NavButton>
      </div>

      <div className="grid grid-cols-7 gap-0.5" role="grid">
        {weekdays.map((w, i) => (
          <div
            key={`${w}-${i}`}
            role="columnheader"
            className="flex h-7 items-center justify-center text-2xs font-medium text-text-subtle"
          >
            {w}
          </div>
        ))}

        {grid.map(({ date, outside }) => {
          const selected = value ? isSameDay(date, value) : false;
          const isToday = isSameDay(date, today);
          const off = disabled(date);

          return (
            <button
              key={date.getTime()}
              type="button"
              role="gridcell"
              disabled={off}
              aria-selected={selected}
              aria-current={isToday ? "date" : undefined}
              onClick={() => onChange?.(date)}
              className={cn(
                "relative flex h-8 items-center justify-center rounded-md text-sm tabular-nums transition-colors",
                "hover:bg-surface-hover",
                outside && "text-text-subtle/60",
                !outside && !selected && "text-text",
                selected &&
                  "bg-accent font-semibold text-accent-fg hover:bg-accent-hover",
                off && "pointer-events-none opacity-30 line-through",
              )}
            >
              {date.getDate()}
              {isToday && !selected && (
                <span
                  aria-hidden
                  className="absolute bottom-1 size-1 rounded-full bg-accent"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex size-7 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-hover hover:text-text"
    >
      {children}
    </button>
  );
}

/* --- DatePicker ------------------------------------------------------------ */

export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "Pick a date",
  locale = "en-AU",
  id,
  className,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: {
  value?: Date | null;
  onChange?: (date: Date) => void;
  min?: Date;
  max?: Date;
  placeholder?: string;
  locale?: string;
  id?: string;
  className?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const label = value
    ? new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(value)
    : placeholder;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={describedBy}
        /* role=button doesn't support aria-invalid, so the invalid state is
           carried on a data attribute and styled from that instead. */
        data-invalid={invalid || undefined}
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-base shadow-e1",
          "transition-[border-color,box-shadow] hover:border-border-strong",
          "focus:border-accent-ring focus:outline-none focus:ring-[3px] focus:ring-accent-ring/20",
          "data-[invalid]:border-danger data-[invalid]:ring-danger/20",
          value ? "text-text" : "text-text-subtle",
        )}
      >
        <CalendarToday className="size-4 shrink-0 text-text-subtle" />
        <span className="truncate">{label}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 rounded-lg border border-border bg-surface-raised shadow-e3 motion-safe:animate-[dialog-in_140ms_cubic-bezier(0.32,0.72,0,1)]">
          <Calendar
            value={value}
            min={min}
            max={max}
            locale={locale}
            onChange={(d) => {
              onChange?.(d);
              setOpen(false);
              triggerRef.current?.focus();
            }}
          />
        </div>
      )}
    </div>
  );
}
