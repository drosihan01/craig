"use client";

import * as React from "react";
import Link from "next/link";
import { ExpandMore } from "./icons";
import { cn } from "@/lib/cn";

/**
 * A nav item with children under it.
 *
 * The dotted rule down the left of the nested items is doing the work here.
 * Indentation alone gets ambiguous the moment two groups are open at once —
 * you can see that something is nested but not what it's nested *under*, and
 * the eye has to travel back up counting pixels. The rule draws the
 * relationship rather than implying it.
 *
 * Dotted rather than solid on purpose, and it's the same rule the workflow
 * canvas uses: a solid line means flow, one thing leading to another. Nothing
 * flows here — Evidence doesn't come after Discovery, it's part of it. Dotted
 * is the system's mark for "related, not sequential".
 *
 * Uncontrolled by default because a nav that forgets which section you opened
 * the moment you navigate is worse than one that never collapsed. Pass `open`
 * to drive it from outside.
 */

export interface NavTreeItemProps {
  label: string;
  href?: string;
  icon?: React.ReactNode;
  /** Marks the row as the page you're on. */
  current?: boolean;
  onClick?: () => void;
  trailing?: React.ReactNode;
  className?: string;
}

export function NavTreeItem({
  label,
  href,
  icon,
  current,
  onClick,
  trailing,
  className,
}: NavTreeItemProps) {
  const inner = (
    <>
      {icon && (
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-md border border-border text-text-subtle [&_svg]:size-3.5",
            current &&
              "border-transparent bg-accent-subtle text-accent-subtle-fg",
          )}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </>
  );

  const classes = cn(
    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
    current
      ? "font-medium text-text"
      : "text-text-muted hover:bg-surface-hover hover:text-text",
    className,
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-current={current ? "page" : undefined}
        className={classes}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes}>
      {inner}
    </button>
  );
}

export function NavTreeGroup({
  label,
  icon,
  open: controlledOpen,
  defaultOpen = true,
  onOpenChange,
  children,
  className,
}: {
  label: string;
  icon?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const id = React.useId();

  return (
    <div className={cn("flex flex-col", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
      >
        {icon && (
          <span className="flex size-6 shrink-0 items-center justify-center text-text-subtle [&_svg]:size-4">
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {/* Rotates rather than swapping glyphs. Two different arrows for one
            control reads as two controls that happen to sit in the same
            place. */}
        <ExpandMore
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-text-subtle transition-transform duration-200 ease-out-quart",
            !open && "-rotate-90",
          )}
        />
      </button>

      {open && (
        <div
          id={id}
          /* The rule is a border on the container, not a pseudo-element per
             row: one line that spans the whole group, so it can't develop gaps
             between items when they have different heights. It starts inside
             the parent's icon column so it reads as descending from the
             group rather than sitting beside it. */
          className="ml-[1.4rem] flex flex-col gap-0.5 border-l border-dotted border-border pl-2.5 pt-0.5"
        >
          {children}
        </div>
      )}
    </div>
  );
}
