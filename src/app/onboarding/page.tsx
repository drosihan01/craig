"use client";

import * as React from "react";
import {
  Avatar,
  Badge,
  Button,
  CraigMark,
  PromptBar,
  Separator,
  useToast,
  ToastProvider,
  WorkflowProgress,
  type WorkflowStep,
} from "@/components/ui";
import { Check, Schedule } from "@/components/ui/icons";
import { COMPANY, PEOPLE } from "@/lib/demo";
import {
  RUN,
  RUN_STEPS,
  runSummary,
  type RunStep,
} from "@/lib/demo-run";

/**
 * The new starter's view. The half of the product the whole thing is for.
 *
 * Deliberately *not* the AppShell. Nils has no nav, no notification bell, no
 * account menu and nothing to administer — giving him admin chrome with every
 * item greyed out would tell him, on day one, that he's in someone else's
 * tool. This page belongs to him.
 *
 * Three decisions it's built on:
 *
 * 1. He sees the whole path, not the next step. "Twelve things, eight done,
 *    two waiting on Jason" is what kills the day-one anxiety. Revealing one
 *    step at a time feels like being led around a building blindfolded.
 *
 * 2. Steps that aren't his are visibly not his, and say whose they are. Half
 *    of any onboarding is other people's homework, and a checklist that
 *    doesn't distinguish makes someone feel behind on things they can't touch.
 *
 * 3. He can nudge without composing a message. Nils is nine hours ahead of
 *    Jason and by his own account won't ask twice — so the asking has to be
 *    one button, and it has to come from Craig rather than from him. That's
 *    the single most important control on this page.
 */

export default function OnboardingPage() {
  return (
    <ToastProvider>
      <StarterView />
    </ToastProvider>
  );
}

function StarterView() {
  const [steps, setSteps] = React.useState<RunStep[]>(RUN_STEPS);
  const [nudged, setNudged] = React.useState<Set<string>>(new Set());
  const { toast } = useToast();

  const { done, total, mine, waiting } = runSummary(steps);
  const firstName = RUN.person.split(" ")[0];

  function nudge(step: RunStep) {
    setNudged((prev) => new Set(prev).add(step.id));
    toast({
      title: `${step.waitingOn} has been asked about “${step.title}”`,
      description: "From Craig, not from you. Nothing else you need to do.",
      tone: "success",
    });
  }

  function complete(step: RunStep) {
    setSteps((prev) =>
      prev.map((s) => (s.id === step.id ? { ...s, status: "complete" } : s)),
    );
    toast({ title: `“${step.title}” marked done`, tone: "success" });
  }

  return (
    <main className="min-h-screen bg-canvas">
      {/* His chrome, not the admin's: who this is and who it's from. */}
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3.5">
          <CraigMark className="size-6 text-accent" />
          <span className="text-base font-medium">{COMPANY.name}</span>
          <span className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-text-subtle sm:inline">
              {RUN.person}
            </span>
            <Avatar name={RUN.person} size="sm" />
          </span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10">
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-[-0.02em]">
              Morning, {firstName}
            </h1>
            <p className="text-md leading-relaxed text-text-muted">
              {mine.length === 0 ? (
                <>
                  Nothing needs you right now — {waiting.length}{" "}
                  {waiting.length === 1 ? "thing is" : "things are"} with
                  someone else.
                </>
              ) : (
                <>
                  {mine.length} {mine.length === 1 ? "thing" : "things"} for you
                  to do, and {waiting.length}{" "}
                  {waiting.length === 1 ? "thing" : "things"} waiting on someone
                  else. Nothing here is urgent.
                </>
              )}
            </p>
          </div>

          <ProgressBar done={done} total={total} />
        </section>

        {/* Waiting-on comes above the list, because it's the thing he can't
            see from a checklist and the thing he'd otherwise sit on. */}
        {waiting.length > 0 && (
          <WaitingOn
            steps={waiting}
            nudged={nudged}
            onNudge={nudge}
          />
        )}

        {/* The stepper card from the design system, which is what it was
            built for: the numbered marker, the dashed run inside a card and
            the solid segment between them. It has room for what a step
            actually produced, which a row doesn't. */}
        <WorkflowProgress
          title="Everything, in order"
          steps={steps.map((s) => toCard(s, nudged.has(s.id), {
            onComplete: () => complete(s),
            onNudge: () => nudge(s),
          }))}
        />

        <Separator />

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <CraigMark className="size-5 text-accent" />
            <h2 className="text-base font-medium">Ask me anything</h2>
          </div>
          <p className="text-sm leading-relaxed text-text-muted">
            I know how {COMPANY.name} works, who owns what, and everything
            they&apos;ve written down. Ask me before you ask a person — I
            don&apos;t mind being asked the same thing twice, and I&apos;m
            awake when {PEOPLE.jason.name.split(" ")[0]} isn&apos;t.
          </p>
          <PromptBar
            placeholder="Who do I talk to about…"
            onSubmit={() => {}}
            footnote={`You're in ${RUN.timezone}. Most of the team isn't.`}
          />
        </section>
      </div>
    </main>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out-quart"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>
      <span className="text-xs text-text-subtle">
        {done} of {total} done · started {RUN.startedOn}
      </span>
    </div>
  );
}

/**
 * The steps somebody else is sitting on.
 *
 * Pulled out of the list rather than only marked inside it. From Nils's side
 * these are indistinguishable from "things I've forgotten to do" unless you
 * say otherwise, and the difference between those two states is whether he
 * spends the morning feeling behind.
 */
function WaitingOn({
  steps,
  nudged,
  onNudge,
}: {
  steps: RunStep[];
  nudged: Set<string>;
  onNudge: (step: RunStep) => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-dashed border-border-strong p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">Not on you</h2>
        <p className="text-sm leading-relaxed text-text-muted">
          These are someone else&apos;s to do. You don&apos;t have to chase
          anyone — but if it&apos;s been a while, I will.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {steps.map((s) => (
          <div
            key={s.id}
            className="flex flex-wrap items-center gap-2 rounded-lg bg-surface px-3 py-2.5"
          >
            <Schedule className="size-4 shrink-0 text-text-subtle" />
            <span className="min-w-0 flex-1 text-base">
              <span className="font-medium">{s.title}</span>
              <span className="text-text-muted"> · {s.waitingOn}</span>
            </span>

            {nudged.has(s.id) ? (
              <Badge tone="success" size="sm">
                <Check />
                Asked
              </Badge>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => onNudge(s)}>
                Nudge
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * A running step, in the shape the stepper card wants.
 *
 * The actions are the only real translation. A step that's his gets a button
 * that finishes it; one that's waiting on somebody gets a nudge instead, and
 * once nudged it gets nothing — a second identical button is an invitation to
 * pester, which is the opposite of what this is for.
 */
function toCard(
  step: RunStep,
  nudged: boolean,
  on: { onComplete: () => void; onNudge: () => void },
): WorkflowStep {
  const done = step.status === "complete";

  if (done) return step;

  if (step.waitingOn) {
    return {
      ...step,
      primaryAction: nudged
        ? undefined
        : {
            label: `Nudge ${step.waitingOn.split(" ")[0]}`,
            onClick: on.onNudge,
          },
    };
  }

  return {
    ...step,
    primaryAction: {
      label: step.primaryAction?.label ?? "Mark done",
      onClick: on.onComplete,
    },
  };
}
