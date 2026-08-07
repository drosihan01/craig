"use client";

import * as React from "react";
import {
  AppShell,
  Badge,
  Button,
  CraigMark,
  Progress,
  PromptBar,
  Separator,
  useToast,
  ToastProvider,
  WorkflowProgress,
  type WorkflowStep,
} from "@/components/ui";
import { Check, Schedule } from "@/components/ui/icons";
import { COMPANY, NEW_HIRE, PEOPLE } from "@/lib/demo";
import { RUN, RUN_STEPS, runSummary, type RunStep } from "@/lib/demo-run";

/**
 * The new starter's view. The half of the product the whole thing is for.
 *
 * Same shell as every other screen. Nils isn't visiting a microsite — he's a
 * Katalis person with an account, and a different frame would make this feel
 * like two products. What changes is what goes *in* the frame: no nav, since
 * there's nowhere for him to go; his own progress on the left; and on the
 * right the two things he'd otherwise have to ask a person for.
 *
 * Three decisions the page is built on:
 *
 * 1. He sees the whole path, not the next step. "Eleven things, seven done"
 *    is what kills the day-one anxiety. Revealing one step at a time feels
 *    like being led around a building blindfolded.
 *
 * 2. Anything waiting on someone else says so, and says who. From his side a
 *    blocked step is indistinguishable from one he's forgotten unless you tell
 *    him, and the difference is whether he spends the morning feeling behind.
 *
 * 3. He can nudge without composing a message. He's nine hours ahead of Jason
 *    and by his own account won't ask twice — so the asking has to be one
 *    button, and it has to come from Craig rather than from him.
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
    <AppShell
      title={COMPANY.name}
      /* His account, not the admin's. Every other screen in the product is
         Ada's; this one is his, and the panel footer is where that shows. */
      account={{
        name: NEW_HIRE.name,
        email: NEW_HIRE.email,
        role: NEW_HIRE.role,
      }}
      nav={<StarterNav done={done} total={total} left={mine.length} />}
      asideTitle="Waiting on"
      aside={<StarterAside waiting={waiting} nudged={nudged} onNudge={nudge} />}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-[-0.02em]">
            Morning, {firstName}
          </h1>
          <p className="text-md leading-relaxed text-text-muted">
            {mine.length === 0 ? (
              <>
                Nothing needs you right now — {waiting.length}{" "}
                {waiting.length === 1 ? "thing is" : "things are"} with someone
                else.
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

        <WorkflowProgress
          title="Everything, in order"
          steps={steps.map((s) =>
            toCard(s, nudged.has(s.id), {
              onComplete: () => complete(s),
              onNudge: () => nudge(s),
            }),
          )}
        />
      </div>
    </AppShell>
  );
}

/**
 * The left panel. No nav — there's nowhere for him to go — so it carries the
 * one number he actually wants, which is how much is left.
 */
function StarterNav({
  done,
  total,
  left,
}: {
  done: number;
  total: number;
  left: number;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 px-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Your onboarding
        </p>
        <Progress value={done} max={total} label="Onboarding progress" />
        <p className="text-xs text-text-subtle">
          {done} of {total} done · started {RUN.startedOn}
        </p>
      </div>

      <Separator />

      <div className="flex flex-col gap-2 px-2">
        <p className="text-sm text-text-muted">
          {left === 0
            ? "Nothing needs you right now."
            : `${left} ${left === 1 ? "thing is" : "things are"} yours to do.`}
        </p>
        <p className="text-xs leading-relaxed text-text-subtle">
          You&apos;re in {RUN.timezone}. Most of the team isn&apos;t, so nothing
          here expects an answer today.
        </p>
      </div>
    </div>
  );
}

/**
 * The right panel: the steps somebody else is sitting on, and Craig.
 *
 * Pulled out of the list rather than only marked inside it. From his side
 * these are indistinguishable from things he's forgotten unless you say
 * otherwise.
 */
function StarterAside({
  waiting,
  nudged,
  onNudge,
}: {
  waiting: RunStep[];
  nudged: Set<string>;
  onNudge: (step: RunStep) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {waiting.length === 0 ? (
        <p className="text-sm leading-relaxed text-text-subtle">
          Nothing is waiting on anyone else. It&apos;s all yours.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-text-muted">
            Someone else&apos;s to do. You don&apos;t have to chase anyone — but
            if it&apos;s been a while, I will.
          </p>

          <div className="flex flex-col gap-2">
            {waiting.map((s) => (
              <div
                key={s.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
              >
                <div className="flex items-start gap-2">
                  <Schedule className="mt-0.5 size-4 shrink-0 text-text-subtle" />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">{s.title}</span>
                    <span className="text-text-muted"> · {s.waitingOn}</span>
                  </span>
                </div>

                {nudged.has(s.id) ? (
                  <Badge tone="success" size="sm" className="w-fit">
                    <Check />
                    Asked
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-fit"
                    onClick={() => onNudge(s)}
                  >
                    Nudge {s.waitingOn?.split(" ")[0]}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Separator />

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <CraigMark className="size-4 text-accent" />
          <p className="text-sm font-medium">Ask me anything</p>
        </div>
        <p className="text-xs leading-relaxed text-text-subtle">
          I know how {COMPANY.name} works and who owns what. Ask me before you
          ask a person — I don&apos;t mind being asked twice, and I&apos;m awake
          when {PEOPLE.jason.name.split(" ")[0]} isn&apos;t.
        </p>
        <PromptBar placeholder="Who do I talk to about…" onSubmit={() => {}} />
      </div>
    </div>
  );
}

/**
 * A running step, in the shape the stepper card wants.
 *
 * The actions are the only real translation. A step that's his gets a button
 * that finishes it; one waiting on somebody gets a nudge instead, and once
 * nudged it gets nothing — a second identical button is an invitation to
 * pester, which is the opposite of what this is for.
 */
function toCard(
  step: RunStep,
  nudged: boolean,
  on: { onComplete: () => void; onNudge: () => void },
): WorkflowStep {
  if (step.status === "complete") return step;

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
