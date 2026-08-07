"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/* Native inputs under the hood — keyboard, form submission and screen-reader
   behaviour come free; the visuals are drawn by a sibling driven off `peer`. */

const box =
  "peer size-4 shrink-0 appearance-none rounded-sm border border-border-strong bg-surface shadow-e1 transition-[background-color,border-color] duration-150 ease-out-quart checked:border-accent checked:bg-accent hover:border-accent-ring disabled:cursor-not-allowed disabled:opacity-45";

export const Checkbox = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Checkbox({ className, ...props }, ref) {
  return (
    <span className="relative inline-flex items-center">
      <input
        ref={ref}
        type="checkbox"
        className={cn(box, "indeterminate:border-accent indeterminate:bg-accent", className)}
        {...props}
      />
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute left-0 size-4 scale-75 text-accent-fg opacity-0 transition-[opacity,transform] duration-150 ease-out-quart peer-checked:scale-100 peer-checked:opacity-100"
      >
        <path d="m3.5 8.5 3 3 6-6.5" />
      </svg>
    </span>
  );
});

export const Radio = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Radio({ className, ...props }, ref) {
  return (
    <span className="relative inline-flex items-center">
      <input
        ref={ref}
        type="radio"
        className={cn(box, "rounded-full", className)}
        {...props}
      />
      {/* Direct sibling of the input — `peer-*` compiles to `~`, so it can't
          reach a nested element. */}
      <span className="pointer-events-none absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-accent-fg transition-transform duration-150 ease-out-quart peer-checked:scale-100" />
    </span>
  );
});

export const Switch = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Switch({ className, ...props }, ref) {
  return (
    <span className="relative inline-flex items-center">
      <input
        ref={ref}
        type="checkbox"
        role="switch"
        className={cn(
          "peer h-4.5 w-8 shrink-0 cursor-pointer appearance-none rounded-full border border-border-strong bg-surface-sunken transition-colors duration-200 ease-out-quart checked:border-accent checked:bg-accent disabled:cursor-not-allowed disabled:opacity-45",
          className,
        )}
        {...props}
      />
      <span className="pointer-events-none absolute left-0.5 size-3.5 rounded-full bg-text-subtle shadow-e1 transition-[transform,background-color] duration-200 ease-spring peer-checked:translate-x-3.5 peer-checked:bg-accent-fg" />
    </span>
  );
});

/** Control + label + optional description, aligned on a shared baseline. */
export function ControlRow({
  control,
  label,
  description,
  className,
}: {
  control: React.ReactNode;
  label: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  const id = React.useId();
  const el = React.isValidElement(control)
    ? React.cloneElement(control as React.ReactElement<Record<string, unknown>>, { id })
    : control;

  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <span className="flex h-5 items-center">{el}</span>
      <div className="flex flex-col gap-0.5">
        <label
          htmlFor={id}
          className="cursor-pointer text-base font-medium leading-5 text-text"
        >
          {label}
        </label>
        {description && (
          <p className="text-sm text-text-subtle">{description}</p>
        )}
      </div>
    </div>
  );
}
