"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Close } from "./icons";
import { cn } from "@/lib/cn";

/**
 * Hand-rolled rather than pulled from Radix: we need exactly one dialog
 * behaviour and owning it keeps the dependency list at zero. It covers what
 * a modal actually owes the user —
 *
 *   - Escape closes, backdrop click closes, content click doesn't
 *   - focus moves in on open and returns to the trigger on close
 *   - Tab is trapped inside while open
 *   - the page behind can't scroll
 *   - aria-modal + labelled by its own title
 *
 * If we ever need nested dialogs or collision-aware popovers, swap in Radix.
 */

/* Mount detection without setState-in-effect: the server snapshot is false and
   the client snapshot is true, so the portal renders only after hydration. */
const neverChanges = () => () => {};
function useMounted() {
  return React.useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Sizes the panel. `chat` is tall and fixed so the composer stays put. */
  size?: "sm" | "md" | "lg" | "chat";
  className?: string;
  /** Hide the default header entirely — the content supplies its own. */
  bare?: boolean;
}

const sizes = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  chat: "max-w-2xl h-[min(42rem,calc(100vh-4rem))]",
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
  bare,
}: DialogProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descId = React.useId();

  const mounted = useMounted();

  React.useEffect(() => {
    if (!open) return;

    const restoreTo = document.activeElement as HTMLElement | null;
    const { overflow, paddingRight } = document.body.style;

    // Compensate for the vanishing scrollbar so the page doesn't jump.
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;

    // Focus the first control inside, falling back to the panel itself.
    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    };
    const raf = requestAnimationFrame(focusFirst);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      restoreTo?.focus?.();
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-accent-950/40 backdrop-blur-[2px] motion-safe:animate-[fade-in_150ms_ease-out]"
        onClick={onClose}
        aria-hidden
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "relative flex w-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-e4 outline-none",
          "motion-safe:animate-[dialog-in_180ms_cubic-bezier(0.32,0.72,0,1)]",
          sizes[size],
          className,
        )}
      >
        {!bare && (
          <header className="flex items-start gap-3 border-b border-border px-5 py-3.5">
            <div className="flex min-w-0 flex-col gap-0.5">
              {title && (
                <h2
                  id={titleId}
                  className="text-md font-semibold tracking-[-0.01em]"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p id={descId} className="text-sm text-text-muted">
                  {description}
                </p>
              )}
            </div>
            <DialogClose onClose={onClose} className="ml-auto" />
          </header>
        )}

        {children}

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-border bg-surface-sunken/50 px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function DialogClose({
  onClose,
  className,
}: {
  onClose: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-hover hover:text-text",
        className,
      )}
    >
      <Close className="size-4" />
    </button>
  );
}
