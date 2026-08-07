import * as React from "react";
import { Check } from "./icons";
import { cn } from "@/lib/cn";

export function Progress({
  value,
  max = 100,
  className,
  label,
}: {
  value: number;
  max?: number;
  className?: string;
  label?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken",
        className,
      )}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out-quart"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* --- Stepper --------------------------------------------------------------- */
/* The spine of the new-starter view: one row per stage of onboarding. */

export type StepState = "complete" | "current" | "upcoming";

export interface Step {
  id: string;
  title: string;
  description?: string;
  state: StepState;
}

export function Stepper({
  steps,
  orientation = "vertical",
  className,
}: {
  steps: Step[];
  orientation?: "vertical" | "horizontal";
  className?: string;
}) {
  if (orientation === "horizontal") {
    return (
      <ol className={cn("flex items-center gap-2", className)}>
        {steps.map((step, i) => (
          <li key={step.id} className="flex flex-1 items-center gap-2">
            <div className="flex items-center gap-2">
              <StepDot state={step.state} index={i} />
              <span
                className={cn(
                  "whitespace-nowrap text-sm font-medium",
                  step.state === "upcoming" ? "text-text-subtle" : "text-text",
                )}
              >
                {step.title}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span
                className={cn(
                  "h-px flex-1",
                  step.state === "complete" ? "bg-accent" : "bg-border",
                )}
              />
            )}
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ol className={cn("flex flex-col", className)}>
      {steps.map((step, i) => (
        <li key={step.id} className="relative flex gap-3 pb-5 last:pb-0">
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className={cn(
                "absolute left-[11px] top-6 h-[calc(100%-1rem)] w-px",
                step.state === "complete" ? "bg-accent" : "bg-border",
              )}
            />
          )}
          <StepDot state={step.state} index={i} />
          <div className="flex flex-col gap-0.5 pt-0.5">
            <span
              className={cn(
                "text-base font-medium",
                step.state === "upcoming" ? "text-text-subtle" : "text-text",
              )}
            >
              {step.title}
            </span>
            {step.description && (
              <span className="text-sm text-text-subtle">
                {step.description}
              </span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function StepDot({ state, index }: { state: StepState; index: number }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border text-2xs font-semibold transition-colors",
        state === "complete" && "border-accent bg-accent text-accent-fg",
        state === "current" &&
          "border-accent bg-surface text-accent ring-[3px] ring-accent-ring/20",
        state === "upcoming" && "border-border bg-surface text-text-subtle",
      )}
    >
      {state === "complete" ? <Check className="size-3.5" /> : index + 1}
    </span>
  );
}
