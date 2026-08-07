"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle,
  DoneAll,
  HowToReg,
  Notifications,
  NotificationsOff,
  Schedule,
  Warning,
} from "./icons";
import { Avatar } from "./avatar";
import { cn } from "@/lib/cn";

/**
 * Notifications persist; toasts don't. Anything the user has to act on later —
 * an approval waiting on them, a step gone overdue — belongs here, because a
 * toast that's missed is gone. Toasts are for confirming what just happened.
 *
 * Read state is owned by the caller. The panel never marks anything read on
 * its own: "I opened the list" is not "I dealt with it", and quietly clearing
 * the badge loses the one signal telling someone they still owe something.
 *
 * Unread uses `info`, not the accent. The accent means "this is the action to
 * take"; unread means "this is new" — different claims, so different colours.
 * It's also the one cool hue in a warm palette, which is what makes a 6px dot
 * findable at all.
 */

export type NotificationKind =
  | "approval"
  | "complete"
  | "overdue"
  | "assigned"
  | "info";

const KIND = {
  approval: { icon: HowToReg, className: "text-warning bg-warning-subtle" },
  complete: { icon: CheckCircle, className: "text-success bg-success-subtle" },
  overdue: { icon: Warning, className: "text-danger bg-danger-subtle" },
  assigned: { icon: Schedule, className: "text-info bg-info-subtle" },
  info: { icon: Notifications, className: "text-text-subtle bg-surface-sunken" },
} as const;

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: React.ReactNode;
  description?: string;
  /** Absolute. Rendered as relative text, with the exact time in the tooltip. */
  timestamp: Date;
  read?: boolean;
  /** Whose action produced this, when there is one. */
  actor?: string;
  href?: string;
}

/* --- relative time --------------------------------------------------------- */

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["week", 604_800_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "3 hours ago". Intl handles the pluralisation and the wording per locale. */
export function relativeTime(date: Date, now = new Date(), locale = "en-AU") {
  const diff = date.getTime() - now.getTime();
  const abs = Math.abs(diff);
  if (abs < 60_000) return "just now";

  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, ms] of UNITS) {
    if (abs >= ms) return fmt.format(Math.round(diff / ms), unit);
  }
  return "just now";
}

/* --- item ------------------------------------------------------------------ */

export function NotificationItem({
  notification: n,
  onSelect,
  className,
}: {
  notification: AppNotification;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const kind = KIND[n.kind];
  const Icon = kind.icon;

  return (
    <li>
      <a
        href={n.href ?? "#"}
        onClick={() => onSelect?.(n.id)}
        className={cn(
          "flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left transition-colors hover:bg-surface-hover",
          className,
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full",
            kind.className,
          )}
        >
          <Icon className="size-4" />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={cn(
              "text-base leading-snug",
              n.read ? "text-text-muted" : "font-medium text-text",
            )}
          >
            {n.title}
          </span>

          {n.description && (
            <span className="line-clamp-2 text-sm leading-snug text-text-subtle">
              {n.description}
            </span>
          )}

          <span className="flex items-center gap-1.5 pt-0.5">
            {n.actor && (
              <>
                <Avatar name={n.actor} size="xs" />
                <span className="truncate text-2xs text-text-subtle">
                  {n.actor}
                </span>
                <span aria-hidden className="text-2xs text-text-subtle">
                  ·
                </span>
              </>
            )}
            <time
              dateTime={n.timestamp.toISOString()}
              title={n.timestamp.toLocaleString()}
              className="text-2xs text-text-subtle"
            >
              {relativeTime(n.timestamp)}
            </time>
          </span>
        </span>

        {!n.read && (
          <span
            className="mt-2 size-1.5 shrink-0 rounded-full bg-info"
            aria-label="Unread"
          />
        )}
      </a>
    </li>
  );
}

/* --- list ------------------------------------------------------------------ */

export function NotificationList({
  items,
  onSelect,
  onMarkAllRead,
  className,
}: {
  items: AppNotification[];
  onSelect?: (id: string) => void;
  onMarkAllRead?: () => void;
  className?: string;
}) {
  const unread = items.filter((n) => !n.read).length;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <span className="flex size-9 items-center justify-center rounded-lg bg-surface-sunken text-text-subtle">
          <NotificationsOff className="size-4.5" />
        </span>
        <p className="text-base font-medium">You&apos;re all caught up</p>
        <p className="text-sm text-text-muted">
          Approvals and overdue steps will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">
          Notifications
          {unread > 0 && (
            <span className="ml-1.5 font-normal text-text-subtle">
              {unread} unread
            </span>
          )}
        </span>
        {onMarkAllRead && unread > 0 && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
          >
            <DoneAll className="size-3.5" />
            Mark all read
          </button>
        )}
      </div>

      <ul className="scrollbar-thin max-h-96 overflow-y-auto p-1">
        {items.map((n) => (
          <NotificationItem key={n.id} notification={n} onSelect={onSelect} />
        ))}
      </ul>
    </div>
  );
}

/* --- bell ------------------------------------------------------------------ */

/**
 * Header trigger. Hand-rolled rather than a DropdownMenu because the panel is
 * a list of links with their own structure, not a menu of commands — putting
 * menuitem roles on it would lie to a screen reader about what it is.
 *
 * The panel is portalled to <body> and positioned from the trigger's rect. It
 * can't be an absolutely-positioned child: the app header carries a
 * backdrop-filter, which creates a stacking context the panel would be trapped
 * inside, so the part of it hanging below the header gets painted over by the
 * page. Portalling takes it out of that context entirely.
 */
export function NotificationBell({
  items,
  onSelect,
  onMarkAllRead,
  className,
}: {
  items: AppNotification[];
  onSelect?: (id: string) => void;
  onMarkAllRead?: () => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelId = React.useId();

  const unread = items.filter((n) => !n.read).length;

  // Re-anchor on open, and follow the trigger if the page scrolls or resizes.
  React.useEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = triggerRef.current;
      if (el) setRect(el.getBoundingClientRect());
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      // The panel is portalled, so it isn't inside rootRef — check both.
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
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

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
        className="relative inline-flex size-7 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-hover hover:text-text"
      >
        <Notifications className="size-4" />
        {unread > 0 && (
          /* A dot, not a count. The exact number doesn't change what you do —
             you open the panel either way — and it reads as quieter chrome.
             The count is still announced through the button's label. */
          <span
            aria-hidden
            /* 4px, tucked into the bell's own top-right rather than the
               button's corner. The halo is the same hue at low alpha, which
               separates it from the glyph without a hard canvas-coloured ring
               punching a hole in the icon. */
            className="absolute right-1.5 top-1.5 size-1 rounded-full bg-info ring-1 ring-info/30"
          />
        )}
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label="Notifications"
            style={{
              position: "fixed",
              top: rect.bottom + 6,
              right: Math.max(8, window.innerWidth - rect.right),
            }}
            className="z-[70] w-[22rem] overflow-hidden rounded-lg border border-border bg-surface-raised shadow-e4 motion-safe:animate-[dialog-in_140ms_cubic-bezier(0.32,0.72,0,1)]"
          >
            <NotificationList
              items={items}
              onSelect={onSelect}
              onMarkAllRead={onMarkAllRead}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
