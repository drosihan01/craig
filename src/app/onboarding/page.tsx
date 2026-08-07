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
  Textarea,
  useToast,
  ToastProvider,
  WorkflowProgress,
  type WorkflowStep,
} from "@/components/ui";
import { Check, Schedule } from "@/components/ui/icons";
import { COMPANY, NEW_HIRE, PEOPLE } from "@/lib/demo";
import {
  CERTAINTY,
  RUN,
  RUN_STEPS,
  runSummary,
  type RunStep,
} from "@/lib/demo-run";
import { ACTIVITY, ACTIVITY_VERB } from "@/lib/craig-activity";

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
                else, and I&apos;m on those.
              </>
            ) : (
              <>
                {mine.length} {mine.length === 1 ? "thing" : "things"} for you
                to do. {waiting.length}{" "}
                {waiting.length === 1 ? "is" : "are"} with someone else and
                I&apos;m chasing {waiting.length === 1 ? "it" : "them"}. Nothing
                here is urgent.
              </>
            )}
          </p>
        </div>

        {done === total ? <Finished name={firstName} /> : null}

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
            You don&apos;t need to chase anyone. I&apos;ve already asked, and
            I&apos;ll keep asking until it moves.
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
                    Asked again
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-fit"
                    onClick={() => onNudge(s)}
                  >
                    Chase again now
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* What Craig did on his own. The whole difference between an agent and
          a checklist is whether anything happened without somebody clicking,
          and this is where Nils can see that it did. */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <CraigMark className="size-4 text-accent" />
          <p className="text-sm font-medium">What I&apos;ve been doing</p>
        </div>
        <ul className="flex flex-col gap-2">
          {ACTIVITY.slice(0, 4).map((a) => (
            <li key={a.id} className="flex flex-col gap-0.5">
              <span className="text-xs leading-relaxed text-text-muted">
                <span className="text-text-subtle">{ACTIVITY_VERB[a.kind]}</span>{" "}
                {a.what.replace(/^\w+ /, "")}
              </span>
              <span className="text-2xs text-text-subtle">
                {a.when}
                {a.outstanding && " · still waiting"}
              </span>
            </li>
          ))}
        </ul>
      </div>

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
  /* Craig's line goes first, because it's the part that isn't a checklist. On
     a finished step it says how he knows; on a stuck one it says what he's
     already done about it. */
  const lead = step.craigNote
    ? step.craigNote
    : step.certainty
      ? CERTAINTY[step.certainty].note + "."
      : null;

  const description = lead
    ? `${lead}${step.description ? ` ${step.description}` : ""}`
    : step.description;

  if (step.status === "complete") return { ...step, description };

  if (step.waitingOn) {
    return {
      ...step,
      description,
      /* Craig has already chased. The button is an override, not the
         mechanism — a new starter who has to decide to ask is a new starter
         who doesn't ask. */
      primaryAction: nudged
        ? undefined
        : {
            label: "Chase again now",
            onClick: on.onNudge,
          },
    };
  }

  return {
    ...step,
    description,
    primaryAction: {
      label: step.primaryAction?.label ?? "Mark done",
      onClick: on.onComplete,
    },
  };
}

/**
 * The end.
 *
 * Not "100% complete" with confetti. He's *set up* — the admin is done and the
 * job hasn't started, and claiming otherwise would be Craig taking credit for
 * something he didn't do.
 *
 * The ask is the part that matters. A new starter is the only person who can
 * see the gaps, because everyone else stopped noticing years ago — and they
 * can only see them for about a week before they stop noticing too. Catching
 * that is how the next person's onboarding gets better, which is the only
 * reason Craig is worth keeping between hires.
 */
function Finished({ name }: { name: string }) {
  const [written, setWritten] = React.useState(false);
  const [note, setNote] = React.useState("");

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-accent bg-accent-subtle/30 p-5">
      <div className="flex items-start gap-3">
        <CraigMark className="mt-0.5 size-6 shrink-0 text-accent" />
        <div className="flex flex-col gap-1">
          <p className="text-md font-semibold tracking-[-0.01em]">
            That&apos;s you set up, {name}.
          </p>
          <p className="text-sm leading-relaxed text-text-muted">
            Accounts, paperwork, the lot. You&apos;re not onboarded — that takes
            a few months and isn&apos;t my department — but nothing is in your
            way now.
          </p>
        </div>
      </div>

      {written ? (
        <p className="flex items-center gap-2 text-sm text-text-muted">
          <Check className="size-4 shrink-0 text-success" />
          Filed. The next person gets that for free.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm leading-relaxed text-text-muted">
            One thing before I go. You waited two days on the Slack channel list
            because nobody had written it down — and you&apos;re the only person
            here who noticed, because everyone else already knew. Want to write
            it down while it&apos;s fresh?
          </p>
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="#general, #engineering, #incidents, #deploys…"
          />
          <Button
            size="sm"
            className="w-fit"
            disabled={note.trim() === ""}
            onClick={() => setWritten(true)}
          >
            Write it down
          </Button>
        </div>
      )}

      <p className="border-t border-border pt-3 text-xs leading-relaxed text-text-subtle">
        That&apos;s me done — I&apos;ll stop emailing you. I&apos;m here if you
        want to ask about anything. Otherwise, go and do the job.
      </p>
    </div>
  );
}
