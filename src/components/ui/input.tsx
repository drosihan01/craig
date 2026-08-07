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

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(fieldBase, "min-h-20 px-2.5 py-2 text-base", className)}
      {...props}
    />
  );
});

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
