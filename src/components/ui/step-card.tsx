import * as React from "react";
import { Check, ChevronRight } from "./icons";
import { StatusPill, type TaskStatus } from "./badge";
import { cn } from "@/lib/cn";

/**
 * The stage list for the new-starter view: each step is a card rather than a
 * row, so it has room for what the step actually produced.
 *
 * The numbered marker sits on the card's left edge and the connector runs
 * behind it — dotted where it crosses a card, solid across the gap between
 * them, so the thread reads as continuous without drawing a line through
 * content.
 */

export interface StepMetric {
  value: React.ReactNode;
  label: string;
}

export interface StepAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface WorkflowStep {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  metrics?: StepMetric[];
  primaryAction?: StepAction;
  secondaryAction?: StepAction;
}

export function WorkflowProgress({
  title,
  steps,
  className,
}: {
  title?: string;
  steps: WorkflowStep[];
  className?: string;
}) {
  const done = steps.filter((s) => s.status === "complete").length;

  return (
    <section className={cn("flex flex-col gap-3", className)}>
      {title && (
        <header className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-[-0.01em]">{title}</h2>
          <span className="text-sm text-text-subtle">
            {done} of {steps.length} complete
          </span>
        </header>
      )}

      <ol className="flex flex-col">
        {steps.map((step, i) => (
          <StepCard
            key={step.id}
            step={step}
            index={i + 1}
            isLast={i === steps.length - 1}
          />
        ))}
      </ol>
    </section>
  );
}

function StepCard({
  step,
  index,
  isLast,
}: {
  step: WorkflowStep;
  index: number;
  isLast: boolean;
}) {
  const complete = step.status === "complete";

  const hasActions = Boolean(step.primaryAction || step.secondaryAction);

  return (
    <li className="relative pb-3 last:pb-0">
      {/* The gap segment. Solid here, dashed inside the card below — one
          thread, two treatments, so it reads as continuous without drawing a
          hard line through the card's content.

          37px, not 36: this span is positioned against the <li>, which sits
          outside the card's 1px border, while the dashed run is positioned
          against the <article>'s padding box, which that border shifts right
          by one. Same axis, two boxes — miss this and the two segments render
          a pixel apart. */}
      {!isLast && (
        <span
          aria-hidden
          className="absolute bottom-0 left-[37px] h-3 w-px bg-border-strong"
        />
      )}

      <article className="relative rounded-xl border border-border bg-surface px-5 py-4 shadow-e1 transition-[border-color,box-shadow] duration-150 ease-out-quart hover:border-border-strong hover:shadow-e2">
        {/* Dashed run: ball to the card's bottom edge. Absolute rather than a
            flex child so it reaches the edge itself, not just where the
            content stops. left-9 = px-5 (20px) + half the marker (16px);
            top-14 = py-4 (16px) + marker (32px) + 8px breathing room. */}
        {!isLast && (
          <span
            aria-hidden
            className="absolute bottom-0 left-9 top-14 w-px border-l border-dashed border-border-strong"
          />
        )}

        <div className="flex gap-4">
          <div className="flex w-8 shrink-0 flex-col items-center">
            <span
              aria-hidden
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-xs font-semibold",
                step.status === "not_started"
                  ? "bg-surface-sunken text-text-subtle"
                  : "bg-accent text-accent-fg",
              )}
            >
              {complete ? <Check className="size-4" /> : index}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-md font-semibold tracking-[-0.01em]">
                {step.title}
              </h3>
              <StatusPill status={step.status} className="mt-0.5 shrink-0" />
            </div>

            {step.description && (
              <p className="mt-1.5 max-w-prose text-base leading-relaxed text-text-muted">
                {step.description}
              </p>
            )}

            {step.metrics && step.metrics.length > 0 && (
              <dl className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
                {step.metrics.map((m) => (
                  <div key={m.label} className="flex items-baseline gap-1.5">
                    <dt className="sr-only">{m.label}</dt>
                    <dd className="text-base font-semibold tabular-nums text-text">
                      {m.value}
                    </dd>
                    <span aria-hidden className="text-base text-text-subtle">
                      {m.label}
                    </span>
                  </div>
                ))}
              </dl>
            )}

            {hasActions && (
              <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border pt-3">
                {step.primaryAction && (
                  <Action action={step.primaryAction} primary />
                )}
                {step.secondaryAction && (
                  <Action action={step.secondaryAction} />
                )}
              </div>
            )}
          </div>
        </div>
      </article>
    </li>
  );
}

function Action({
  action,
  primary,
}: {
  action: StepAction;
  primary?: boolean;
}) {
  const className = cn(
    "group/a inline-flex items-center gap-0.5 rounded-sm text-base transition-colors duration-150",
    primary
      ? "font-semibold text-accent hover:text-accent-hover"
      : "text-text-subtle hover:text-text",
  );

  const content = (
    <>
      {action.label}
      {primary && (
        <ChevronRight className="size-4 transition-transform duration-150 ease-out-quart group-hover/a:translate-x-0.5" />
      )}
    </>
  );

  if (action.href) {
    return (
      <a href={action.href} className={className}>
        {content}
      </a>
    );
  }

  return (
    <button type="button" onClick={action.onClick} className={className}>
      {content}
    </button>
  );
}
