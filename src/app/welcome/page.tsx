"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AppShell,
  CraigMark,
  Separator,
  Stepper,
  type Step,
} from "@/components/ui";
import { Check } from "@/components/ui/icons";
import { ACCOUNT } from "@/lib/demo";
import { SESSION_V2 } from "@/lib/demo-session";
import { DraftSession } from "@/components/draft-session";
import { cn } from "@/lib/cn";

/**
 * The first thing after signing up.
 *
 * Not a setup wizard. A wizard asks a fixed set of questions in a fixed order
 * and gets a fixed answer back, which means it can only ever learn what it
 * already knew to ask. Ada's company is one person, no written process, and a
 * handbook from February — no wizard would have a field for that, and it's the
 * most important thing about her.
 *
 * So the middle of the screen is a conversation and the workflow falls out of
 * it. The left panel carries the one thing a wizard was ever good for: where
 * you are, and how much of this there is. Vertical, because the three steps
 * aren't the same size — one is a five-minute conversation and one is Craig
 * thinking — and a horizontal strip implies they're equal.
 *
 * **No right panel.** Nothing to show alongside yet; the account is empty
 * until the conversation fills it. An empty panel reads as broken, an absent
 * one reads as focus.
 *
 * **No template cards either.** They're a shortcut past a blank box for a
 * returning user, and a second decision to make before you've made the first
 * one for somebody who signed up ninety seconds ago.
 */

type Phase = "talk" | "build";

/* What Craig does while the screen says he's doing it. Written as work rather
   than as reassurance — "Reading your handbook" is a claim you can check;
   "Setting things up" is a spinner with words on it. */
const BUILD_STEPS = [
  "Reading your handbook",
  "Working out what an infra hire needs",
  "Writing the steps",
  "Checking what you haven't told me",
];

export default function WelcomePage() {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("talk");
  const [started, setStarted] = React.useState(false);

  const steps: Step[] = [
    {
      id: "1",
      title: "Discovery",
      state: phase === "talk" ? "current" : "complete",
    },
    {
      id: "2",
      title: "Build workflow",
      state: phase === "build" ? "current" : "upcoming",
    },
    { id: "3", title: "Onboard person", state: "upcoming" },
  ];

  return (
    <AppShell
      title="Setting up"
      account={ACCOUNT}
      fill={started}
      nav={<SetupNav steps={steps} />}
    >
      {phase === "build" ? (
        <BuildScreen onDone={() => router.push("/?fresh=1")} />
      ) : (
        <DraftSession
          session={SESSION_V2}
          placeholder="it's just me, building AI infra…"
          showTemplates={false}
          onStart={() => setStarted(true)}
          onFinish={() => setPhase("build")}
        />
      )}
    </AppShell>
  );
}

/**
 * The left panel during setup.
 *
 * Nav proper doesn't appear yet — there's nowhere to go. What sits here
 * instead is the shape of the thing you've started, so it's obvious this is
 * three steps and not an open-ended interview.
 */
function SetupNav({ steps }: { steps: Step[] }) {
  return (
    <div className="flex flex-col gap-5">
      <Stepper steps={steps} compact />

      <Separator />

      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        Nothing you say here is published, and nothing runs until you add
        somebody to it.
      </p>
    </div>
  );
}

/**
 * Craig actually writing it.
 *
 * Replaces what used to be a hand-off card at the end of the conversation. A
 * card saying "here's your workflow, click to view" asks for a fifth decision
 * at the moment someone has finished making them; watching it get made is a
 * better ending, and it's honest that something is happening.
 *
 * The steps are real work with real names, and they tick rather than spin. A
 * progress bar that isn't measuring anything is a lie told with a shape.
 */
function BuildScreen({ onDone }: { onDone: () => void }) {
  const [done, setDone] = React.useState(0);

  React.useEffect(() => {
    const timers = BUILD_STEPS.map((_, i) =>
      window.setTimeout(() => setDone(i + 1), 900 * (i + 1)),
    );
    const finish = window.setTimeout(onDone, 900 * BUILD_STEPS.length + 1200);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(finish);
    };
  }, [onDone]);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-2xl flex-col justify-center py-16">
      <div className="flex flex-col items-center gap-4 text-center">
        <CraigMark className="size-14 text-accent motion-safe:animate-[soft-pulse_2.4s_ease-in-out_infinite]" />
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">
          Give me a second
        </h1>
        <p className="max-w-sm text-md leading-relaxed text-text-muted">
          Writing it now. You&apos;ll be able to change every bit of it, and
          nothing runs until you say so.
        </p>
      </div>

      <ol className="mx-auto flex w-full max-w-sm flex-col gap-2.5 pt-10">
        {BUILD_STEPS.map((label, i) => {
          const complete = i < done;
          const current = i === done;
          return (
            <li
              key={label}
              className={cn(
                "flex items-center gap-2.5 text-base transition-colors duration-300",
                complete
                  ? "text-text-muted"
                  : current
                    ? "text-text"
                    : "text-text-subtle",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                  complete
                    ? "border-transparent bg-success-subtle text-success"
                    : current
                      ? "border-accent"
                      : "border-border",
                )}
              >
                {complete && <Check className="size-3" />}
              </span>
              {label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
