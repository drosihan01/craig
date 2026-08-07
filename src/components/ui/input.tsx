"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

const fieldBase = [
  "w-full rounded-md bg-surface text-text",
  "border border-border shadow-e1",
  "placeholder:text-text-subtle",
  "transition-[border-color,box-shadow] duration-150 ease-out-quart",
  "hover:border-border-strong",
  "focus:outline-none focus:border-accent-ring focus:ring-[3px] focus:ring-accent-ring/20",
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface-sunken",
  "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20",
];

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Rendered inside the field, left of the text. */
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, icon, ...props }, ref) {
    const field = (
      <input
        ref={ref}
        className={cn(
          fieldBase,
          "h-8 px-2.5 text-base",
          icon && "pl-8",
          className,
        )}
        {...props}
      />
    );

    if (!icon) return field;

    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle [&_svg]:size-4">
          {icon}
        </span>
        {field}
      </div>
    );
  },
);

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Grow with the content instead of showing a drag handle. Default on. */
  autoResize?: boolean;
  minRows?: number;
  /** Stop growing here and scroll instead. */
  maxRows?: number;
}

/**
 * Grows to fit its content and then scrolls, so short answers get a short box
 * and long ones don't need dragging. The native resize grabber is hidden while
 * auto-resizing — leaving it would let you drag to a height the next keystroke
 * overwrites.
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { className, autoResize = true, minRows = 3, maxRows = 12, ...props },
    forwardedRef,
  ) {
    const innerRef = React.useRef<HTMLTextAreaElement>(null);

    // Merge the forwarded ref so callers still get the node.
    const setRef = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    const fit = React.useCallback(() => {
      const el = innerRef.current;
      if (!el || !autoResize) return;

      const cs = getComputedStyle(el);
      const line = parseFloat(cs.lineHeight) || 20;
      const chrome =
        parseFloat(cs.paddingTop) +
        parseFloat(cs.paddingBottom) +
        parseFloat(cs.borderTopWidth) +
        parseFloat(cs.borderBottomWidth);

      // Reset first — scrollHeight only shrinks if the box isn't already
      // holding the taller size open.
      el.style.height = "auto";
      const max = line * maxRows + chrome;
      const next = Math.min(el.scrollHeight, max);
      el.style.height = `${next}px`;
      el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
    }, [autoResize, maxRows]);

    // Re-fit when a controlled value changes from outside.
    React.useEffect(fit, [fit, props.value]);

    return (
      <textarea
        ref={setRef}
        rows={minRows}
        onInput={(e) => {
          fit();
          props.onInput?.(e);
        }}
        className={cn(
          fieldBase,
          "px-2.5 py-2 text-base leading-relaxed",
          autoResize ? "resize-none" : "min-h-20 resize-y",
          className,
        )}
        {...props}
      />
    );
  },
);

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          fieldBase,
          "h-8 appearance-none pl-2.5 pr-8 text-base",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-subtle"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m4 6 4 4 4-4" />
      </svg>
    </div>
  );
});
