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

/**
 * A typed date, or null.
 *
 * Deliberately narrow about years: four digits, always. A two-digit year is
 * the one place this could guess wrong in a way nobody notices — `24` is 1924
 * or 2024 depending on a pivot somebody chose, and on a date of birth that is
 * a hundred-year error printed as a plausible date. Refusing is honest and
 * costs two keystrokes.
 *
 * Formats, in the order people actually type them:
 *
 *   24/8/1994   24-8-1994   24.8.1994    day first, per the note in `commit`
 *   1994-08-24                            ISO, which is unambiguous
 *   24 Aug 1994   24 August 1994          month by name, in any case
 *   Aug 24 1994                           and the other way round
 *
 * Month names are matched against the locale's own, so this follows the
 * formatting rather than hardcoding English — the same list the field prints
 * with is the list it reads back.
 */
function parseTyped(raw: string, locale: string): Date | null {
  const text = raw.trim().replace(/,/g, " ").replace(/\s+/g, " ");

  /* ISO first: it is the only form where a leading four-digit number is the
     year, so testing it before the day-first patterns keeps them simple. */
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return build(+iso[1], +iso[2], +iso[3]);

  const numeric = text.match(/^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{4})$/);
  if (numeric) return build(+numeric[3], +numeric[2], +numeric[1]);

  /* Month by name, either order. Built from the locale so "août" works
     wherever the field would have printed "août". */
  const months = monthNames(locale);
  const named = text.match(/^(\d{1,2}) ([^\d\s]+) (\d{4})$/);
  if (named) {
    const m = matchMonth(named[2], months);
    if (m) return build(+named[3], m, +named[1]);
  }
  const namedFirst = text.match(/^([^\d\s]+) (\d{1,2}) (\d{4})$/);
  if (namedFirst) {
    const m = matchMonth(namedFirst[1], months);
    if (m) return build(+namedFirst[3], m, +namedFirst[2]);
  }

  return null;
}

/**
 * A real date, or null if those numbers don't make one.
 *
 * The round-trip check is what rejects 31 February: `new Date(1994, 1, 31)`
 * rolls forward to 3 March rather than failing, so a date that comes back
 * describing a different day than it was given never existed.
 */
function build(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function monthNames(locale: string): string[] {
  const long = new Intl.DateTimeFormat(locale, { month: "long" });
  return Array.from({ length: 12 }, (_, i) =>
    long.format(new Date(2024, i, 1)),
  );
}

/** Prefix match, so both "Aug" and "August" find the same month. */
function matchMonth(input: string, months: string[]): number | null {
  const needle = input.toLocaleLowerCase();
  const i = months.findIndex((m) => m.toLocaleLowerCase().startsWith(needle));
  return i === -1 ? null : i + 1;
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
  const fieldRef = React.useRef<HTMLInputElement>(null);
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

  const label = React.useCallback(
    (d: Date) =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(d),
    [locale],
  );

  /**
   * What's in the box, which is not always what's been chosen.
   *
   * Typing is the fast way to give a date and the only tolerable way to give a
   * date of birth — nobody pages a grid back thirty years to their own
   * birthday, and the pattern people expect from every form they have ever
   * filled in is that you type it. So the field is a real text input and the
   * calendar is the second way in, not the only one.
   *
   * Held separately from `value` because a half-typed date is not a date. The
   * field has to show "24/0" while somebody is still typing, and `value` must
   * not change until there is something real to change it to.
   */
  const [text, setText] = React.useState(() => (value ? label(value) : ""));
  const [bad, setBad] = React.useState(false);

  /* Follows the value when it changes from outside — the calendar, or a form
     being reset. Keyed on the timestamp rather than the object, or every
     re-render with a fresh `new Date` would overwrite what somebody is typing. */
  const stamp = value ? value.getTime() : null;
  const lastStampRef = React.useRef(stamp);
  if (lastStampRef.current !== stamp) {
    lastStampRef.current = stamp;
    setText(value ? label(value) : "");
    setBad(false);
  }

  /**
   * Take what they typed, if it is a date.
   *
   * Ambiguous numeric dates are read **day first** — `03/04/1994` is 3 April —
   * because the whole product formats in `en-AU` and a field that reads dates
   * in a different order from the one it prints them in is a field that
   * silently records the wrong day twice a year. The parsed date is echoed
   * back in the canonical format, so what was understood is visible
   * immediately rather than at the point somebody's payroll is wrong.
   */
  function commit() {
    const raw = text.trim();
    if (!raw) {
      setBad(false);
      return;
    }

    const parsed = parseTyped(raw, locale);
    const outOfRange =
      parsed &&
      ((min && parsed.getTime() < startOfDay(min).getTime()) ||
        (max && parsed.getTime() > startOfDay(max).getTime()));

    if (!parsed || outOfRange) {
      /* Left exactly as typed. Clearing somebody's input because it wasn't
         understood is how you lose a date they now have to look up again. */
      setBad(true);
      return;
    }

    setBad(false);
    setText(label(parsed));
    onChange?.(parsed);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div
        data-invalid={invalid || bad || undefined}
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-md border border-border bg-surface pl-2.5 pr-1 text-base shadow-e1",
          "transition-[border-color,box-shadow] hover:border-border-strong",
          "focus-within:border-accent-ring focus-within:ring-[3px] focus-within:ring-accent-ring/20",
          "data-[invalid]:border-danger data-[invalid]:ring-danger/20",
        )}
      >
        <input
          ref={fieldRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          aria-describedby={describedBy}
          aria-invalid={invalid || bad || undefined}
          onChange={(e) => {
            setText(e.target.value);
            if (bad) setBad(false);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-text outline-none placeholder:text-text-subtle"
        />

        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Choose from a calendar"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded text-text-subtle transition-colors hover:bg-surface-hover hover:text-text"
        >
          <CalendarToday className="size-4" />
        </button>
      </div>

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
                setText(label(d));
                setBad(false);
                setOpen(false);
                fieldRef.current?.focus();
              }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
