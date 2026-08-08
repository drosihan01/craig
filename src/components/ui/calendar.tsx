"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { CalendarToday, ChevronLeft, ChevronRight } from "./icons";
import { cn } from "@/lib/cn";

/* Mount detection without setState-in-an-effect: the server snapshot is false
   and the client's is true, so the portal only renders after hydration. */
const neverChanges = () => () => {};
function useMounted() {
  return React.useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
}

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

/** Years shown at once. Three rows of four fits the 16rem calendar exactly. */
const YEAR_BLOCK = 12;

/** The start of the block a year falls in, so paging is stable either way. */
const yearBlockStart = (year: number) =>
  Math.floor(year / YEAR_BLOCK) * YEAR_BLOCK;

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
    const d = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + i,
    );
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

  /**
   * Days, or the years you'd have to walk through to reach them.
   *
   * A month grid with only month arrows is fine for a start date next
   * fortnight and unusable for a date of birth: 1994 is roughly three hundred
   * and eighty presses of the back chevron. The label is the way out — it was
   * already the one thing on the header saying which year you were in, so
   * making it the control that changes the year costs no new furniture.
   */
  const [view, setView] = React.useState<"days" | "years">("days");

  /* The block of twelve the year view is showing, anchored on wherever the
     calendar currently is rather than on today — paging back and forth must
     not silently jump you home. */
  const [yearPage, setYearPage] = React.useState(() =>
    yearBlockStart(month.getFullYear()),
  );

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
          label={view === "days" ? "Previous month" : "Earlier years"}
          onClick={() =>
            view === "days"
              ? setMonth((m) => addMonths(m, -1))
              : setYearPage((y) => y - YEAR_BLOCK)
          }
        >
          <ChevronLeft className="size-4" />
        </NavButton>

        {/* A button, not a caption. It says which year you're in, so it is
            already where somebody looks when the year is wrong. */}
        <button
          type="button"
          aria-live="polite"
          aria-label={
            view === "days" ? `${monthLabel}. Choose a year` : "Back to days"
          }
          onClick={() => {
            if (view === "days")
              setYearPage(yearBlockStart(month.getFullYear()));
            setView((v) => (v === "days" ? "years" : "days"));
          }}
          className="rounded-md px-2 py-0.5 text-sm font-semibold transition-colors hover:bg-surface-hover"
        >
          {view === "days"
            ? monthLabel
            : `${yearPage}–${yearPage + YEAR_BLOCK - 1}`}
        </button>

        <NavButton
          label={view === "days" ? "Next month" : "Later years"}
          onClick={() =>
            view === "days"
              ? setMonth((m) => addMonths(m, 1))
              : setYearPage((y) => y + YEAR_BLOCK)
          }
        >
          <ChevronRight className="size-4" />
        </NavButton>
      </div>

      {view === "years" && (
        <div className="grid grid-cols-3 gap-1 pb-1">
          {Array.from({ length: YEAR_BLOCK }, (_, i) => yearPage + i).map(
            (year) => {
              /* A whole year is out only when every day in it is. Comparing
                 the year's edges rather than the currently shown month means
                 January isn't offered as unreachable because December is. */
              const out =
                (min && year < startOfDay(min).getFullYear()) ||
                (max && year > startOfDay(max).getFullYear());
              const isCurrent = year === month.getFullYear();

              return (
                <button
                  key={year}
                  type="button"
                  disabled={Boolean(out)}
                  aria-current={isCurrent ? "date" : undefined}
                  onClick={() => {
                    setMonth((m) => new Date(year, m.getMonth(), 1));
                    setView("days");
                  }}
                  className={cn(
                    "h-8 rounded-md text-sm tabular-nums transition-colors",
                    isCurrent
                      ? "bg-accent text-accent-fg"
                      : "hover:bg-surface-hover",
                    out && "cursor-not-allowed opacity-40 hover:bg-transparent",
                  )}
                >
                  {year}
                </button>
              );
            },
          )}
        </div>
      )}

      {view === "days" && (
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
      )}
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
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const mounted = useMounted();

  /**
   * Position the month, in the document rather than in the field.
   *
   * It used to be absolutely positioned inside this component, which works
   * everywhere except the one place it matters most: a dialog panel is
   * `overflow-hidden` so its rounded corners clip its contents, and a calendar
   * hanging below the last field of a form got cut off at the panel's edge. Any
   * scrolling ancestor does the same. So it goes to the body, and the price of
   * that is having to place it by hand.
   *
   * Written straight to the node's style in a layout effect rather than held in
   * state: measuring and then re-rendering is a second pass with the popover
   * visible at the wrong coordinates for one frame, and `PromptBar` sizes its
   * textarea the same way for the same reason.
   */
  React.useLayoutEffect(() => {
    if (!open) return;

    function place() {
      const trigger = triggerRef.current;
      const el = popoverRef.current;
      if (!trigger || !el) return;

      const rect = trigger.getBoundingClientRect();
      const { offsetHeight: h, offsetWidth: w } = el;
      const GAP = 6;
      const EDGE = 8;

      /* Above when there isn't room below and there is room above — a month
         is tall, and the field it belongs to is usually near the bottom of
         whatever contains it. */
      const roomBelow = window.innerHeight - rect.bottom;
      const flip = roomBelow < h + GAP && rect.top > roomBelow;

      el.style.top = `${
        flip
          ? Math.max(EDGE, rect.top - h - GAP)
          : Math.min(rect.bottom + GAP, window.innerHeight - h - EDGE)
      }px`;
      /* Clamped to the viewport so a field near the right edge doesn't push
         the month off it. */
      el.style.left = `${Math.min(
        Math.max(EDGE, rect.left),
        window.innerWidth - w - EDGE,
      )}px`;
    }

    place();
    /* Capture, so a scroll inside any ancestor moves it and not just a scroll
       of the window. An open popover left behind by its field is worse than
       one that closes. */
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      /* Both, now that the month is no longer a descendant of the field —
         checking only the root would treat every click on a date as a click
         outside and close before the click landed. */
      if (
        !rootRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setOpen(false);
      }
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

      {open &&
        mounted &&
        createPortal(
          <div
            ref={popoverRef}
            /* `fixed`, and above the dialog's own layer — it is now a sibling
               of the dialog rather than a child, so it no longer inherits a
               stacking context that would keep it on top. */
            className="fixed z-[60] rounded-lg border border-border bg-surface-raised shadow-e3 motion-safe:animate-[dialog-in_140ms_cubic-bezier(0.32,0.72,0,1)]"
          >
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
          </div>,
          document.body,
        )}
    </div>
  );
}
