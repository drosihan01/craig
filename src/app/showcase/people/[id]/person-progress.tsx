"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AppShell,
  Avatar,
  BackLink,
  Badge,
  Button,
  buttonVariants,
  Callout,
  Dialog,
  EmptyState,
  Separator,
  WorkflowProgress,
  type StepMetric,
  type WorkflowBlock,
  type WorkflowStep,
} from "@/components/ui";
import {
  ShowcaseNav,
  ShowcaseNavRail,
} from "@/components/showcase/showcase-nav";
import { AltRoute, Delete, Groups, Schedule } from "@/components/ui/icons";
import { NavStat } from "@/components/app-nav";
import type { Session } from "@/lib/showcase/contract";
import {
  deletePerson,
  useShowcase,
  type ShowcasePerson,
  type ShowcaseWorkflow,
} from "@/lib/showcase/store";
import { timingOf } from "@/lib/workflow/library";
import { readable } from "../people-list";

/**
 * One person's onboarding, as whoever added them watches it.
 *
 * People answers "who has a seat". This is the other half — what that seat
 * actually started — and it is the page the product has to be most careful on,
 * because it is the one where an interface is most tempted to flatter itself. A
 * progress bar at 40%, three steps ticked because they look like the sort of
 * thing that would have happened by now, a percentage rounded up out of
 * nothing: every one of those is easy to draw and every one of them is a claim
 * about a real person's first week that nobody made.
 *
 * So the rule here is that a step changes only when something happened to it.
 * Right now exactly one thing has: the seat itself, which is why the header
 * carries the date it was given and the steps below it all say Not started. The
 * counter reads "0 of 6", which is a worse-looking screen and an honest one —
 * and it is the version that is still right the morning somebody asks whether
 * their new starter has signed their contract.
 *
 * Which workflow they're shown is the published one, because that is the rule
 * the rest of the product runs on: a seat starts whatever is published at the
 * time. Nothing on the person records which draft was live the day they were
 * added, and inventing that link would be the same kind of lie in a quieter
 * place — so the page says what runs, rather than claiming to remember.
 */

export function PersonProgress({ id, user }: { id: string; user: Session }) {
  const { people, workflows } = useShowcase();
  const router = useRouter();
  const person = people.find((p) => p.id === id);

  /* Both the confirmation and the removal live out here rather than in
     `Detail`, because `Detail` is the thing being removed. A component cannot
     own the state that decides whether it still exists. */
  const [confirming, setConfirming] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);

  /* The one that would actually run against anybody given a seat today. */
  const workflow = workflows.find((w) => w.published) ?? null;

  function remove() {
    if (!person) return;
    /* Set in the same batch as the store write, and it has to be: removing
       them re-renders this component with nobody to find, and the branch below
       would show the "no such person" screen on the way out of a removal that
       worked. */
    setLeaving(true);
    deletePerson(person.id);
    router.push("/showcase/people");
  }

  if (!person) return leaving ? null : <NoPerson user={user} />;

  return (
    <>
      <Detail
        person={person}
        workflow={workflow}
        user={user}
        onRemove={() => setConfirming(true)}
      />
      <ConfirmRemove
        open={confirming}
        person={person}
        workflow={workflow}
        onCancel={() => setConfirming(false)}
        onConfirm={remove}
      />
    </>
  );
}

function Detail({
  person,
  workflow,
  user,
  onRemove,
}: {
  person: ShowcasePerson;
  workflow: ShowcaseWorkflow | null;
  user: Session;
  onRemove: () => void;
}) {
  const first = person.name.split(" ")[0];
  const addedOn = added(person.invitedAt);

  /* The trigger is the event, not work anybody does — it is the seat, and the
     seat is already the subject of the line above the list. Numbering it as
     step one would push every real step down by one and count an act of the
     admin's as part of the new starter's week. */
  const steps = (workflow?.blocks ?? [])
    .filter((b) => b.kind !== "trigger")
    .map(toCard);

  /* Derived, not written down as the zero it currently is. The day any of this
     starts moving, the counter moves with it rather than being a second place
     somebody has to remember to update. */
  const done = steps.filter((s) => s.status === "complete").length;

  return (
    <AppShell
      title={person.name}
      account={{ name: user.name, email: user.email }}
      navRail={<ShowcaseNavRail />}
      nav={
        <ShowcaseNav>
          <PersonNav
            person={person}
            workflow={workflow}
            done={done}
            total={steps.length}
            onRemove={onRemove}
          />
        </ShowcaseNav>
      }
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 py-10">
        <header className="flex items-start gap-4">
          <Avatar name={person.name} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-[-0.02em]">
                {person.name}
              </h1>
              <Badge tone="accent" size="sm">
                Onboarding
              </Badge>
            </div>
            <p className="text-md text-text-muted">
              {person.role} · {person.email}
            </p>
            {/* The two dates that are actually known. Everything else on this
                page is a plan; these two happened. */}
            <p className="text-sm text-text-subtle">
              {person.startDate && `Starts ${readable(person.startDate)}`}
              {person.startDate && addedOn && " · "}
              {addedOn && `Added ${addedOn}`}
            </p>
          </div>
        </header>

        {workflow ? (
          <>
            {/* Said once, at the top, rather than left to be inferred from a
                column of identical badges. Somebody who has just added their
                first hire is entitled to wonder whether this screen is broken
                or whether nothing has happened yet, and those are very
                different worries to be left with. */}
            <Callout tone="neutral" icon={<Schedule />} title="Not started yet">
              {first} has a seat and their invitation has gone out. Each step
              below is waiting for the day it belongs to, and this page fills in
              as they happen — nothing is ticked off ahead of the work.
            </Callout>

            <section className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <h2 className="text-lg font-semibold tracking-[-0.01em]">
                    {workflow.name}
                  </h2>
                  <p className="text-sm text-text-muted">
                    The published workflow, which is what everyone with a seat
                    is put through.
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  {/* Counted from the steps rather than written as the zero it
                      is today, and stated in the header rather than left for
                      the eye to total up from six identical badges. */}
                  {steps.length > 0 && (
                    <span className="text-sm text-text-subtle">
                      {done} of {steps.length} done
                    </span>
                  )}
                  <Link
                    href={`/showcase/workflows/${workflow.id}`}
                    className={buttonVariants({
                      variant: "secondary",
                      size: "sm",
                    })}
                  >
                    Open workflow
                  </Link>
                </div>
              </div>

              {steps.length > 0 ? (
                <WorkflowProgress steps={steps} />
              ) : (
                <p className="text-base leading-relaxed text-text-muted">
                  There are no steps in it yet, so the seat is all {first} has
                  so far.
                </p>
              )}
            </section>
          </>
        ) : (
          <EmptyState
            icon={<AltRoute />}
            title="Nothing is running for them"
            description={`${first} has a seat, but no workflow on this account is published — so there are no steps waiting on them.`}
            action={
              <Link
                href="/showcase/workflows"
                className={buttonVariants({ size: "sm" })}
              >
                Open workflows
              </Link>
            }
          />
        )}
      </div>
    </AppShell>
  );
}

/**
 * A step of the workflow, as this person's copy of it.
 *
 * Every one comes back `not_started`, and that is the honest answer rather than
 * a placeholder: nothing has been done to any of them. The status is set here
 * in one place so that when a step can genuinely be finished, there is exactly
 * one line to change and no second copy of "how far along is this" anywhere on
 * the page contradicting it.
 *
 * The metrics carry the two things worth knowing about a step nobody has
 * touched — whose it is, and when it's meant to happen. Both come off the
 * block, so a step Craig left unassigned says so rather than quietly picking
 * somebody.
 */
function toCard(block: WorkflowBlock): WorkflowStep {
  const metrics: StepMetric[] = [
    { value: block.owner ?? "Nobody yet", label: "owns it" },
  ];

  const timing = timingOf(block.preset, block.config);
  if (timing) metrics.push({ value: timing, label: "on the plan" });

  return {
    id: block.id,
    title: block.title,
    description: block.summary,
    status: "not_started",
    metrics,
  };
}

/**
 * The moment they were added, as a date.
 *
 * `invitedAt` is a full timestamp, so `new Date` is right here in a way it is
 * wrong for a start date: a string carrying a time and a zone is unambiguous,
 * and the bare `YYYY-MM-DD` that isn't is exactly what `readable` exists to
 * handle. No weekday — the day of the week matters for the morning somebody
 * turns up and not at all for an afternoon that has already been and gone.
 */
function added(iso: string | undefined) {
  if (!iso) return null;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
  }).format(date);
}

/**
 * The menu column: the facts about their seat, and the one way to take it back.
 *
 * The counter is the part that has to stay honest. "0 of 6" in a column that
 * updates itself is a page you can trust the day it says 4, and a hardcoded
 * zero is a number that would still read zero on the morning everything was
 * finished.
 */
function PersonNav({
  person,
  workflow,
  done,
  total,
  onRemove,
}: {
  person: ShowcasePerson;
  workflow: ShowcaseWorkflow | null;
  done: number;
  total: number;
  onRemove: () => void;
}) {
  const addedOn = added(person.invitedAt);

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/showcase/people" className="px-2">
        People
      </BackLink>

      <Separator />

      <div className="flex flex-col gap-3 px-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Their seat
        </p>

        <div className="flex flex-col gap-1">
          <Fact label="Role" value={person.role} />
          {person.startDate && (
            <Fact label="Starts" value={readable(person.startDate)} />
          )}
          {addedOn && <Fact label="Added" value={addedOn} />}
          <Fact label="Workflow" value={workflow?.name ?? "None published"} />
        </div>

        {workflow && (
          <div className="flex flex-col gap-2 pt-1">
            <NavStat label="Steps" value={total} />
            <NavStat label="Done" value={`${done} of ${total}`} />
          </div>
        )}
      </div>

      <Separator />

      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        A step only changes here once it has actually happened. Nothing is
        filled in ahead of the work.
      </p>

      {/* Last in the column, a quiet link rather than a red button — the weight
          belongs in the confirmation, and a danger button sitting in the
          furniture all day stops reading as a warning. */}
      <button
        type="button"
        onClick={onRemove}
        /* `mx-0.5 px-1.5` puts the label on the same 8px as the lines above,
           which sit inside a `px-2` wrapper, while leaving the hover fill
           wider than the text. */
        className="mx-0.5 mt-1 flex items-center gap-1.5 self-start rounded-md px-1.5 py-1 text-xs text-text-subtle transition-colors hover:bg-danger-subtle hover:text-danger"
      >
        <Delete className="size-3.5" />
        Remove from People
      </button>
    </div>
  );
}

/** A label and a value on one line. Not a `NavStat` — these aren't counts, and
    a badge around a job title is a badge around a sentence. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="shrink-0 text-text-subtle">{label}</span>
      {/* min-w-0 or truncate does nothing on its own: a flex item's default
          min-width is auto, which floors it at its content and pushes past the
          panel when you drag it narrow. */}
      <span
        className="min-w-0 truncate text-right text-text-muted"
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Taking somebody's seat back.
 *
 * Asked about rather than stated, which is the exception in this product —
 * everywhere else the screen says what will happen and lets you press it. This
 * earns the exception the same way deleting a workflow does: there is no undo,
 * and the row cannot be rebuilt from anything the account still holds.
 *
 * The second paragraph is the one that has to be there. "Remove" sounds like it
 * reaches out and un-invites somebody, and it doesn't: an email went to a real
 * person under the company's name, they read it, and nothing here can take that
 * back. Somebody removing a hire who fell through needs to know they still have
 * a message to send themselves.
 */
function ConfirmRemove({
  open,
  person,
  workflow,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  person: ShowcasePerson;
  workflow: ShowcaseWorkflow | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      /* Not `sm`. The title carries their full name and the body has two
         paragraphs to say; 24rem wraps a three-word name onto two lines. */
      size="md"
      title={`Remove ${person.name}?`}
      description="This can't be undone."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>
            Remove person
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 px-5 py-5">
        <p className="text-base leading-relaxed text-text-muted">
          They lose their seat and{" "}
          {workflow
            ? `${workflow.name} stops running against them`
            : "nothing further runs against them"}
          . The seat goes back to the account for somebody else.
        </p>

        <p className="text-sm leading-relaxed text-text-subtle">
          Their invitation has already gone out. Removing them stops anything
          after it — it can&apos;t take that email back.
        </p>
      </div>
    </Dialog>
  );
}

/**
 * An address with nobody behind it.
 *
 * Reachable by typing a URL, by following a link to somebody who has since been
 * removed, or by opening the account fresh in a browser that lost its state —
 * so it points at the list rather than explaining itself, since the list is
 * where the answer is either way.
 */
function NoPerson({ user }: { user: Session }) {
  return (
    <AppShell
      title="People"
      account={{ name: user.name, email: user.email }}
      navRail={<ShowcaseNavRail />}
      nav={<ShowcaseNav />}
    >
      <div className="mx-auto w-full max-w-3xl py-10">
        <EmptyState
          icon={<Groups />}
          title="There's nobody here"
          description="Whoever this page was for doesn't have a seat on this account. Everyone who does is on People."
          action={
            <Link
              href="/showcase/people"
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
