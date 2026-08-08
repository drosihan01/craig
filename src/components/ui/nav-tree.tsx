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

/**
 * The gap between rows, in one place.
 *
 * It was 2px, set independently at every call site, and it was chosen when a
 * row was bare text — at which point the rows were legible as separate things
 * because of the words. Now that the current row is filled, 2px reads as two
 * blocks stuck together, and one of them having a background makes the
 * tightness obvious rather than merely close.
 *
 * Here rather than in each nav so the next one built can't pick its own — the
 * old spacing had already been copied into three navs and the group's own
 * children, which is how a component ends up looking different in each place
 * it's used.
 */
const ROW_GAP = "gap-1";

/**
 * The column rows sit in.
 *
 * Trivial, and worth having: spacing between items belongs to the list rather
 * than the item, and without somewhere to put it every nav re-decided it.
 */
export function NavTree({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", ROW_GAP, className)}>{children}</div>
  );
}

/**
 * The nav with the panel collapsed: icons in a strip, no labels.
 *
 * Collapsing used to take the column to nothing, which is honest but throws
 * away the thing a nav is for — you could no longer see where you were or move
 * without opening it again, so the collapse was only useful if you meant to
 * stop navigating. A strip of icons keeps both and still gives the page back
 * most of the width.
 *
 * Opt-in at the shell rather than automatic, and this is why: a nav is
 * arbitrary content — counts, prose, a stepper — and none of that survives
 * being squeezed to 52px. A screen has to say what its rail is, and the ones
 * that don't keep collapsing to nothing as before.
 */
export function NavRail({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col items-center gap-1 px-2 py-6", className)}
    >
      {children}
    </div>
  );
}

/**
 * One icon in that strip.
 *
 * Labelled by `title` and `aria-label` rather than the `Tooltip` component,
 * which would be the obvious choice and is the wrong one here: the panel
 * clips horizontally so it can slide shut without its contents spilling, and
 * a tooltip wider than the strip would be cut off by that same rule.
 */
export function NavRailItem({
  label,
  icon,
  href,
  current,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  href?: string;
  current?: boolean;
  onClick?: () => void;
}) {
  const classes = cn(
    "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors [&_svg]:size-[1.125rem]",
    current
      ? "bg-accent-subtle text-accent-subtle-fg"
      : "text-text-muted hover:bg-surface-hover hover:text-text",
  );

  if (href) {
    return (
      <Link
        href={href}
        title={label}
        aria-label={label}
        aria-current={current ? "page" : undefined}
        className={classes}
      >
        {icon}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={classes}
    >
      {icon}
    </button>
  );
}

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
      {/* Icon then text, with nothing drawn around the icon. It used to sit in
          a bordered tile, which put a box on every row of a column that is
          already a list of boxes — and made an icon that is a label read as a
          control you could press separately from the row it labels. It also
          didn't match `NavTreeGroup` two functions down, which has always
          drawn its icon bare.

          No colour of its own either: it inherits the row's, so it lifts with
          the label on hover and on the current row instead of staying muted
          against a highlight. */}
      {icon && (
        <span className="flex size-6 shrink-0 items-center justify-center [&_svg]:size-4">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </>
  );

  /* Current fills the whole row rather than tinting the icon and bolding the
     label. A highlight confined to a 24px square is a mark you have to look
     for, and it competed with the hover fill — which does span the row — so
     the page you were on could read as less selected than the one under your
     cursor.

     The accent pair, which is what this product already uses for a selected
     row — the design system's own section nav is `bg-accent-subtle` with
     `accent-subtle-fg`, and has been all along. A neutral step was tried here
     and was simply harsher: a grey fill on a warm canvas reads as a disabled
     band, where the accent tint reads as a place. */
  const classes = cn(
    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
    current
      ? "bg-accent-subtle font-medium text-accent-subtle-fg"
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
          <span className="flex size-6 shrink-0 items-center justify-center [&_svg]:size-4">
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
          className={cn(
            "ml-[1.4rem] flex flex-col border-l border-dotted border-border pl-2.5 pt-0.5",
            ROW_GAP,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
