"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/* Roving-tabindex tablist: arrows move between tabs, only the active tab is
   in the page tab order. */

interface TabItem {
  value: string;
  label: React.ReactNode;
  badge?: React.ReactNode;
}

export function Tabs({
  items,
  value,
  onValueChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent) {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = items.findIndex((t) => t.value === value);
    const next = (i + dir + items.length) % items.length;
    onValueChange(items[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      onKeyDown={onKeyDown}
      className={cn(
        "relative flex items-center gap-0.5 border-b border-border",
        className,
      )}
    >
      {items.map((tab, i) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onValueChange(tab.value)}
            className={cn(
              "relative -mb-px flex h-8 items-center gap-1.5 rounded-t-sm px-2.5 text-base font-medium transition-colors duration-150",
              active
                ? "text-text"
                : "text-text-subtle hover:bg-surface-hover hover:text-text-muted",
            )}
          >
            {tab.label}
            {tab.badge}
            {active && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Compact segmented control — for switching a view, not a page. */
export function SegmentedControl({
  items,
  value,
  onValueChange,
  className,
}: {
  items: { value: string; label: React.ReactNode }[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-sunken p-0.5",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "h-6 rounded-sm px-2 text-sm font-medium transition-colors duration-150",
              active
                ? "bg-surface text-text shadow-e1"
                : "text-text-subtle hover:text-text",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
