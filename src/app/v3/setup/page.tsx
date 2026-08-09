"use client";

import { useRouter } from "next/navigation";
import {
  AppShell,
  CraigMark,
  Separator,
  Stepper,
  useAgentWork,
  type Step,
} from "@/components/ui";
import { V3_ACCOUNT, V3_COMPANY, V3_FOUNDER } from "@/lib/v3/company";
import { V3_SESSION } from "@/lib/v3/session";
import { setScene, useV3 } from "@/lib/v3/store";
import { V3Conversation } from "@/components/v3/v3-conversation";

/**
 * Scenes two and three — the conversation, then Craig writing it.
 *
 * Not a setup wizard. A wizard asks a fixed set of questions and can only ever
 * learn what it already knew to ask; the most important fact about Calder is
 * that three of its documents disagree, and no wizard has a field for that.
 *
 * The left column carries the one thing a wizard was good for — where you are
 * and how much of this there is. Vertical, because the three phases aren't the
 * same size: one is uploading files, one is a five-minute conversation, one is
 * Craig reading.
 */

/* What Craig does while the screen says he's doing it. Written as work rather
   than reassurance — "Reconciling SOP-014 against the checklist" is a claim
   you can check; "Setting things up" is a spinner with words on it. */
const BUILD_STEPS = [
  "Taking SOP-014 as authoritative",
  "Ordering by lead time, not by convention",
  "Putting the lab induction on a day Saoirse is in",
  "Writing the training record as the last step",
  "Marking the two things nobody has written down",
];

export default function V3SetupPage() {
  const router = useRouter();
  const { turn, scene } = useV3();
  /* The last line stays up while the router does its bit. Clearing it would
     leave him finished and silent on a screen that says he's still writing. */
  const writing = useAgentWork({ beat: 1100, hold: 600, keepLast: true });

  const building = scene === "building";

  function build() {
    setScene("building");
    writing.run(BUILD_STEPS, () => {
      setScene("builder");
      router.push("/v3/workflows/qsa");
    });
  }

  const steps: Step[] = [
    {
      id: "upload",
      title: "Upload",
      state: turn > 0 ? "complete" : "current",
    },
    {
      id: "discovery",
      title: "Discovery",
      state: building
        ? "complete"
        : turn > 0
          ? turn >= V3_SESSION.length
            ? "complete"
            : "current"
          : "upcoming",
    },
    {
      id: "build",
      title: "Build workflow",
      state: building ? "current" : "upcoming",
    },
  ];

  return (
    <AppShell
      title={V3_COMPANY.name}
      account={V3_ACCOUNT}
      fill
      nav={
        <div className="flex flex-col gap-5">
          <Stepper steps={steps} compact />
          <Separator />
          <p className="px-1 text-xs leading-relaxed text-text-subtle">
            Craig drafts, you edit. Nothing runs against anyone until you
            publish it and give somebody a seat.
          </p>
        </div>
      }
    >
      <div className="mx-auto flex h-[calc(100vh-3rem)] w-full max-w-2xl flex-col pt-10">
        {building ? (
          /* The director puts the scene into "building" itself rather than
             pressing the button, so the phases never start and there's nothing
             for the screen to stand on. It holds the first line instead, which
             is what it did before any of this ran on a timer. */
          <Building label={writing.phase ?? BUILD_STEPS[0]} />
        ) : (
          <>
            <header className="flex shrink-0 flex-col gap-2 pb-8">
              <CraigMark className="size-8 text-accent" />
              <h1 className="text-3xl font-semibold tracking-[-0.02em]">
                Hello {V3_FOUNDER.name.split(" ")[0]} — what does{" "}
                {V3_COMPANY.name} do?
              </h1>
              <p className="text-md leading-relaxed text-text-muted">
                Give me whatever you already have, however out of date. The
                out-of-date parts are usually the most useful thing you own.
              </p>
            </header>

            <V3Conversation onFinish={build} />
          </>
        )}
      </div>
    </AppShell>
  );
}

/**
 * Craig working.
 *
 * One line at a time rather than a checklist that fills in. A checklist
 * implies the steps are separable and that you could have done them yourself;
 * a single changing line reads as one continuous act of attention, which is
 * closer to what's actually being claimed.
 */
function Building({ label }: { label: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center">
      <CraigMark className="size-10 text-accent" />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">
          Writing your workflow
        </h1>
        {/* Not the inline `AgentPhase`. That one pulses because it sits beside
            an answer arriving; this is the whole screen, and a heading-sized
            line breathing under it is a page that won't settle. */}
        <p
          key={label}
          className="text-md text-text-muted motion-safe:animate-[step-phase_300ms_cubic-bezier(0.25,1,0.5,1)]"
        >
          {label}
        </p>
      </div>
    </div>
  );
}
