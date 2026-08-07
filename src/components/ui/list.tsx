"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * Rows of things — people, documents, workflows.
 *
 * Borrowed from Material's list anatomy, which gets two things right that
 * hand-rolled rows usually miss:
 *
 * 1. Dividers are *inset* — they start where the text starts, not at the row
 *    edge. The leading avatars then read as one column instead of each row
 *    looking like a separate boxed card. It's the single change that makes a
 *    list look considered.
 * 2. Every row is the same height for the same line count, so the eye can scan
 *    a column of titles without the rhythm breaking on the one row with a
 *    longer subtitle.
 *
 * Slots, in order: leading · overline / title / description · meta · trailing.
 * Nothing is required except the title.
 */

export function List({
  className,
  bordered = true,
  children,
  ...props
}: React.HTMLAttributes<HTMLUListElement> & {
  /** Wrap the list in a surface. Off when it already sits inside a Card. */
  bordered?: boolean;
}) {
  return (
    <ul
      className={cn(
        bordered && "overflow-hidden rounded-lg border border-border bg-surface",
        // The divider lives on the row's content, so it starts after the
        // leading slot. Suppressed on the first row.
        "[&_[data-list-row]]:border-t [&_[data-list-row]]:border-border",
        "[&>li:first-child_[data-list-row]]:border-t-0",
        className,
      )}
      {...props}
    >
      {children}
    </ul>
  );
}

export interface ListItemProps {
  /** Avatar, icon tile, checkbox. Sits outside the divider inset. */
  leading?: React.ReactNode;
  /** Small label above the title. */
  overline?: React.ReactNode;
  title: React.ReactNode;
  /** Clamped to two lines — a list row isn't a paragraph. */
  description?: React.ReactNode;
  /** Third line, quieter than the description. */
  footnote?: React.ReactNode;
  /** Right-aligned text, e.g. a count or a timestamp. */
  meta?: React.ReactNode;
  /** Controls: a badge, a menu, a select. Clicks here don't select the row. */
  trailing?: React.ReactNode;
  /** Makes the whole row a target. */
  href?: string;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  className?: string;
}

export function ListItem({
  leading,
  overline,
  title,
  description,
  footnote,
  meta,
  trailing,
  href,
  onClick,
  selected,
  disabled,
  className,
}: ListItemProps) {
  const interactive = Boolean(href || onClick);

  const body = (
    <>
      {overline && (
        <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          {overline}
        </span>
      )}
      <span className="truncate text-base font-medium text-text">{title}</span>
      {description && (
        <span className="line-clamp-2 text-sm leading-snug text-text-muted">
          {description}
        </span>
      )}
      {footnote && (
        <span className="truncate text-2xs text-text-subtle">{footnote}</span>
      )}
    </>
  );

  const content = (
    <div
      data-list-row
      className={cn(
        "flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-3.5",
        leading && "ml-3",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">{body}</div>

      {meta && (
        <span className="shrink-0 whitespace-nowrap text-2xs text-text-subtle">
          {meta}
        </span>
      )}

      {trailing && (
        /* Stops a click on a control from also triggering the row. */
        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="flex shrink-0 items-center gap-1.5"
        >
          {trailing}
        </div>
      )}
    </div>
  );

  const row = (
    <div
      className={cn(
        "flex min-h-11 w-full items-center pl-3.5 text-left transition-colors",
        interactive && !disabled && "cursor-pointer hover:bg-surface-hover",
        selected && "bg-accent-subtle/50",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      {leading && <div className="shrink-0">{leading}</div>}
      {content}
    </div>
  );

  if (href && !disabled) {
    return (
      <li>
        <Link href={href} className="block focus-visible:outline-offset-[-2px]">
          {row}
        </Link>
      </li>
    );
  }

  if (onClick && !disabled) {
    return (
      <li>
        <button
          type="button"
          onClick={onClick}
          aria-pressed={selected}
          className="block w-full focus-visible:outline-offset-[-2px]"
        >
          {row}
        </button>
      </li>
    );
  }

  return <li>{row}</li>;
}

/** A titled group of rows, with a count. */
export function ListSection({
  title,
  count,
  children,
  className,
}: {
  title: React.ReactNode;
  count?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline gap-2">
        <h3 className="text-base font-medium">{title}</h3>
        {count !== undefined && (
          <span className="text-xs text-text-subtle">{count}</span>
        )}
      </div>
      {children}
    </section>
  );
}

/** Square tile for a leading icon, so icon rows line up with avatar rows. */
export function ListIcon({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: "default" | "accent" | "muted";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 items-center justify-center rounded-lg [&_svg]:size-4",
        tone === "accent" && "bg-accent-subtle text-accent-subtle-fg",
        tone === "default" && "bg-surface-sunken text-text-subtle",
        tone === "muted" &&
          "border border-dashed border-border-strong text-text-subtle",
        className,
      )}
    >
      {children}
    </span>
  );
}
