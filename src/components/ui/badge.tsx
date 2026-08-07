import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badge = cva(
  "inline-flex items-center gap-1 rounded-sm border font-medium whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "border-border bg-surface-sunken text-text-muted",
        accent: "border-transparent bg-accent-subtle text-accent-subtle-fg",
        success: "border-transparent bg-success-subtle text-success",
        warning: "border-transparent bg-warning-subtle text-warning",
        danger: "border-transparent bg-danger-subtle text-danger",
        info: "border-transparent bg-info-subtle text-info",
        solid: "border-transparent bg-accent text-accent-fg",
      },
      size: {
        sm: "h-4.5 px-1.5 text-2xs",
        md: "h-5.5 px-2 text-xs",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {}

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badge({ tone, size }), className)} {...props} />;
}

/* --- Status pill ----------------------------------------------------------- */
/* The workflow states an onboarding task moves through. Kept in one place so
   the admin builder and the new-starter view can never drift apart. */

export const TASK_STATUS = {
  not_started: { label: "Not started", tone: "neutral", dot: "bg-text-subtle" },
  in_progress: { label: "In progress", tone: "info", dot: "bg-info" },
  blocked: { label: "Blocked", tone: "danger", dot: "bg-danger" },
  awaiting: { label: "Awaiting review", tone: "warning", dot: "bg-warning" },
  complete: { label: "Complete", tone: "success", dot: "bg-success" },
} as const;

export type TaskStatus = keyof typeof TASK_STATUS;

export function StatusPill({
  status,
  size,
  className,
}: {
  status: TaskStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  const s = TASK_STATUS[status];
  return (
    <Badge tone={s.tone} size={size} className={className}>
      <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden />
      {s.label}
    </Badge>
  );
}
