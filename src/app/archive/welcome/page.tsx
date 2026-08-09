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
import { ProgressActivity } from "@/components/ui/icons";
import { ACCOUNT } from "@/lib/demo";
import { SESSION_V2 } from "@/lib/demo-session";
import { DraftSession } from "@/components/draft-session";

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

  /* Three phases, one current at a time. "Upload" is the blank composer —
     she's giving Craig the handbook and the brain-dump. "Discovery" is the
     conversation that follows it. `started` flips on her first message, which
     is exactly the boundary between the two. */
  const steps: Step[] = [
    {
      id: "1",
      title: "Upload",
      state: started ? "complete" : "current",
    },
    {
      id: "2",
      title: "Discovery",
      state:
        phase === "build" ? "complete" : started ? "current" : "upcoming",
    },
    {
      id: "3",
      title: "Build workflow",
      state: phase === "build" ? "current" : "upcoming",
    },
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
      <Stepper steps={steps} compact className="px-2" />

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
  const [at, setAt] = React.useState(0);

  React.useEffect(() => {
    /* The conversation above was scrolled; the build screen isn't a
       continuation of it. Without this you land halfway down an empty page. */
    window.scrollTo(0, 0);

    const timers = BUILD_STEPS.map((_, i) =>
      window.setTimeout(() => setAt(i), 1000 * i),
    );
    const finish = window.setTimeout(onDone, 1000 * BUILD_STEPS.length + 900);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(finish);
    };
  }, [onDone]);

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col items-center justify-center gap-4 text-center">
      <CraigMark className="size-14 text-accent motion-safe:animate-[soft-pulse_2.4s_ease-in-out_infinite]" />
      <h1 className="text-3xl font-semibold tracking-[-0.03em]">
        Give me a second
      </h1>
      <p className="max-w-sm text-md leading-relaxed text-text-muted">
        Writing it now. You&apos;ll be able to change every bit of it, and
        nothing runs until you say so.
      </p>

      {/* One line at a time rather than a checklist. A list of ticks invites
          you to read ahead and count how much is left; a single changing line
          is just something happening. Keyed so each one re-enters. */}
      <div className="flex h-6 items-center gap-2 pt-4 text-base text-text-muted">
        <ProgressActivity className="size-4 shrink-0 animate-spin text-text-subtle" />
        <span
          key={BUILD_STEPS[at]}
          className="motion-safe:animate-[step-phase_260ms_ease-out]"
        >
          {BUILD_STEPS[at]}
        </span>
      </div>
    </div>
  );
}
