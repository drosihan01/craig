import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/* --- Callout --------------------------------------------------------------- */

const callout = cva("flex gap-2.5 rounded-md border p-3 text-base", {
  variants: {
    tone: {
      neutral: "border-border bg-surface-sunken text-text-muted",
      accent: "border-transparent bg-accent-subtle text-accent-subtle-fg",
      success: "border-transparent bg-success-subtle text-success",
      warning: "border-transparent bg-warning-subtle text-warning",
      danger: "border-transparent bg-danger-subtle text-danger",
      info: "border-transparent bg-info-subtle text-info",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Callout({
  className,
  tone,
  icon,
  title,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof callout> & { icon?: React.ReactNode; title?: string }) {
  return (
    <div className={cn(callout({ tone }), className)} {...props}>
      {icon && <span className="mt-px [&_svg]:size-4 shrink-0">{icon}</span>}
      <div className="flex flex-col gap-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="opacity-90">{children}</div>}
      </div>
    </div>
  );
}

/* --- Empty state ----------------------------------------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <span className="flex size-9 items-center justify-center rounded-lg bg-surface-sunken text-text-subtle [&_svg]:size-4.5">
          {icon}
        </span>
      )}
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-md font-semibold">{title}</p>
        {description && (
          <p className="text-base text-text-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/* --- Tooltip --------------------------------------------------------------- */
/* CSS-only: shows on hover and on keyboard focus of the wrapped trigger.
   Swap for a floating-ui build once we need collision handling. */

export function Tooltip({
  content,
  side = "top",
  children,
}: {
  content: React.ReactNode;
  side?: "top" | "bottom";
  children: React.ReactNode;
}) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-accent-950 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-e3 transition-opacity duration-150",
          "group-hover/tt:opacity-100 group-focus-within/tt:opacity-100",
          "dark:bg-accent-100 dark:text-accent-950",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
        )}
      >
        {content}
      </span>
    </span>
  );
}

/* --- Skeleton -------------------------------------------------------------- */

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-surface-sunken", className)}
      {...props}
    />
  );
}
