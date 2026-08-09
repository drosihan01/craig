"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ActivityFeed,
  AppShell,
  Avatar,
  Badge,
  buttonVariants,
  CERTAINTY,
  CertaintyPill,
  CraigMark,
  EmptyState,
  Progress,
  Separator,
  WorkflowProgress,
  type ActivityEntry,
  type StepMetric,
  type WorkflowStep,
} from "@/components/ui";
import { Person, Schedule } from "@/components/ui/icons";
import { NavStat } from "@/components/app-nav";
import { V3Nav } from "@/components/v3/v3-nav";
import { V3_ACCOUNT, V3_STARTER } from "@/lib/v3/company";
import { V3_RUN, type V3RunStep } from "@/lib/v3/run";
import { runComplete, runDone, useV3 } from "@/lib/v3/store";

/**
 * One person's onboarding, as the founder watches it happen.
 *
 * The admin's half of the product ends here. Everything before this — the
 * conversation, the builder, the seat — is Theo describing what should happen;
 * this is the only screen that tells him whether it did.
 *
 * Which makes one distinction load-bearing, and it's the reason this page isn't
 * a column of ticks: *how* Craig knows a step is done. He created her Google
 * account and can see it, so that one is verified. Saoirse says she ran the lab
 * induction and there is nothing for him to look at, so that one is confirmed
 * and no amount of green will make it more than somebody's word. At a company
 * whose training records get read by an auditor in March, the difference
 * between those two is the whole value of the record.
 *
 * The right panel is Craig's, and it's live. It's what separates this from a
 * project tracker: things move on it while Theo isn't doing anything.
 */

/* Calder is nine people and Checkmate is a vendor, so first names are
   unambiguous and a full name in a 14px metric line is mostly surname. */
const shortName = (name: string) => name.split(" ")[0];

export default function V3PersonPage() {
  const { id } = useParams<{ id: string }>();
  const { run, feed, seatTaken } = useV3();

  const her = V3_STARTER.name.split(" ")[0];

  if (id !== V3_STARTER.id) {
    return (
      <Nothing
        title="No such person"
        description={`${her} is the only person with a run in this demo.`}
      />
    );
  }

  /* Before the invite the run exists but is a lie: two of its steps are already
     in progress, because the fixture describes the moment *after* Theo gives
     her a seat. Showing it early would have Craig chasing a police check for
     somebody who hasn't been hired. */
  if (!seatTaken) {
    return (
      <Nothing
        title={`${her} hasn't been given a seat yet`}
        description="Her workflow starts the second she has one. Until then there's nothing running and nothing to watch."
      />
    );
  }

  const done = runDone(run);
  const open = run.length - done;
  const finished = runComplete(run);

  /* Two different kinds of "not done". A step somebody is actually sitting on
     is worth naming; one that hasn't come up yet is a count, and listing ten of
     them in a 224px panel buries the two that matter. */
  const withSomeone = run.filter((s) => s.status !== "complete" && s.waitingOn);
  const later = run.filter((s) => s.status !== "complete" && !s.waitingOn);

  return (
    <AppShell
      title={V3_RUN.workflow}
      account={V3_ACCOUNT}
      nav={<RunNav done={done} total={run.length} open={open} />}
      aside={<RunAside feed={feed} withSomeone={withSomeone} later={later} />}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 py-10">
        <header className="flex flex-col gap-5">
          <div className="flex items-start gap-4">
            <Avatar name={V3_RUN.person} size="lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-[-0.02em]">
                  {V3_RUN.person}
                </h1>
                {finished ? (
                  <Badge tone="success" size="sm">
                    Onboarded
                  </Badge>
                ) : (
                  <Badge tone="accent" size="sm">
                    Onboarding
                  </Badge>
                )}
              </div>
              <p className="text-md text-text-muted">{V3_RUN.role}</p>
              <p className="text-sm text-text-subtle">
                Starts {V3_RUN.startDate} · {V3_RUN.location}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Progress
              value={done}
              max={run.length}
              label={`${V3_RUN.person}'s onboarding`}
            />
            {/* Not "9 of 12" — the stepper below already says that, in those
                words. What's left and when it started are the two things it
                doesn't. */}
            <p className="text-xs text-text-subtle">
              {finished
                ? "Everything's done, and her training record is signed and approved."
                : `${open} still open · started ${V3_RUN.startedOn}`}
            </p>
          </div>
        </header>

        <WorkflowProgress
          title="Everything, in order"
          steps={run.map(toCard)}
        />
      </div>
    </AppShell>
  );
}

/**
 * A running step, in the shape the stepper card wants.
 *
 * The metrics row is doing the work here. On a finished step it carries how
 * Craig knows — the badge, and beside it the plain-English version, because
 * "Confirmed" on its own looks like a synonym for done rather than the caveat
 * it is. On an unfinished one it carries whose turn it is. Either way it's the
 * line Theo reads after the title, which is why neither is buried in prose.
 */
function toCard(step: V3RunStep): WorkflowStep {
  const metrics: StepMetric[] = [];

  if (step.status === "complete") {
    if (step.certainty) {
      metrics.push({
        value: <CertaintyPill certainty={step.certainty} size="sm" />,
        label: CERTAINTY[step.certainty].note,
      });
    }
  } else {
    metrics.push({
      value: shortName(step.waitingOn ?? step.owner),
      label: "has it",
    });
  }

  /* Craig's own line, under his mark. It survives the step completing because
     what he did unprompted — starting the police check the second her seat
     existed — is the part of the record worth keeping. */
  if (step.craigNote) {
    metrics.push({
      value: <CraigMark className="size-3.5 text-accent" />,
      label: step.craigNote,
    });
  }

  return {
    id: step.id,
    title: step.title,
    description: step.description,
    status: step.status,
    metrics,
  };
}

/**
 * The right panel: what Craig has done, then what's still with somebody.
 *
 * In that order, and the order is the argument. A tracker shows you a list of
 * outstanding work and waits; the feed above it is the evidence that things
 * moved while Theo was doing something else, which is the only reason to leave
 * this page open.
 */
function RunAside({
  feed,
  withSomeone,
  later,
}: {
  feed: ActivityEntry[];
  withSomeone: V3RunStep[];
  later: V3RunStep[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <CraigMark className="size-4 text-accent" />
          <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
            What I&apos;ve done
          </p>
        </div>

        <ActivityFeed
          items={feed}
          stamp="newest"
          empty="Nothing yet. Everything I do to her onboarding lands here as I do it, whether or not you asked for it."
        />
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Waiting on
        </p>

        {withSomeone.length === 0 && later.length === 0 ? (
          <p className="text-xs leading-relaxed text-text-subtle">
            Nothing. Every step is done and the record is approved.
          </p>
        ) : (
          <>
            {withSomeone.map((s) => (
              <div key={s.id} className="flex items-start gap-2">
                <Schedule className="mt-0.5 size-3.5 shrink-0 text-text-subtle" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs leading-relaxed text-text-muted">
                    {s.title}
                  </span>
                  <span className="block text-2xs text-text-subtle">
                    with {shortName(s.waitingOn ?? s.owner)}
                  </span>
                </span>
              </div>
            ))}

            {later.length > 0 && (
              <p className="text-2xs leading-relaxed text-text-subtle">
                {later.length} more {later.length === 1 ? "hasn't" : "haven't"}{" "}
                come up yet.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RunNav({
  done,
  total,
  open,
}: {
  done: number;
  total: number;
  open: number;
}) {
  return (
    <V3Nav>
      <div className="flex flex-col gap-2 px-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          This run
        </p>
        <NavStat label="Done" value={`${done} of ${total}`} />
        <NavStat
          label="Open"
          value={open}
          tone={open > 0 ? "warning" : "neutral"}
        />
      </div>

      <Separator />

      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        SOP-014 §5.2 gives you five working days from her start date to have the
        training record signed and approved. It&apos;s the last step for that
        reason.
      </p>
    </V3Nav>
  );
}

/**
 * The page with nobody on it.
 *
 * Rendered in the shell rather than as a bare message: arriving here means a
 * URL was wrong or the demo hasn't got that far, and in both cases the useful
 * thing is the nav, not an apology on an empty canvas.
 */
function Nothing({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <AppShell title="People" account={V3_ACCOUNT} nav={<V3Nav />}>
      <div className="mx-auto w-full max-w-2xl py-10">
        <EmptyState
          icon={<Person />}
          title={title}
          description={description}
          action={
            <Link
              href="/v3/people"
              className={buttonVariants({ size: "sm", variant: "secondary" })}
            >
              Back to People
            </Link>
          }
        />
      </div>
    </AppShell>
  );
}
