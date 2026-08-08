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
  type WorkflowStep,
} from "@/components/ui";
import {
  ShowcaseNav,
  ShowcaseNavRail,
} from "@/components/showcase/showcase-nav";
import {
  CheckCircle,
  Delete,
  Groups,
  Schedule,
  TaskAlt,
  Warning,
} from "@/components/ui/icons";
import { NavStat } from "@/components/app-nav";
import type {
  JoinerField,
  JoinerStep,
  Session,
  StepActor,
} from "@/lib/showcase/contract";
import { readable } from "../people-list";
import { dueDateFrom } from "@/lib/workflow/library";

/**
 * One person's onboarding, as whoever gave them the seat watches it.
 *
 * People answers "who has a seat". This is the other half — what that seat
 * started, how far it has got, and which of the remaining steps are the reader's
 * own to do. It is the page the product has to be most careful on, because it is
 * the one an interface is most tempted to flatter itself on: a bar at 40%, three
 * steps ticked because they look like the sort of thing that would have happened
 * by now, a percentage rounded up out of nothing. Every one of those is easy to
 * draw and every one is a claim about a real person's first week that nobody
 * made.
 *
 * So the rule is that a step is only complete when it carries a `completedAt`,
 * and a `completedAt` only exists because somebody did something: the new
 * starter submitted an answer on their own screen, or the reader pressed the
 * tick here. There is no third source, nothing is inferred from a date, and a
 * step nobody has touched says Not started however overdue it looks.
 *
 * Everything on this page arrives from the server as a prop, and the ticks go
 * back to the server and come round again the same way. That is deliberate:
 * mirroring the steps into React state and updating them optimistically would
 * create a second copy of "how far along is this" living in a browser, and the
 * first thing that copy would do is disagree with the other person's screen.
 * `router.refresh()` re-runs the page instead, so what is drawn after a tick is
 * what the store actually holds — which costs a round trip and buys the one
 * property this screen is for.
 *
 * The steps shown are the snapshot taken the day the invitation went out, not
 * the workflow as it is now. That belongs to the record rather than to this
 * page, but it has to be said out loud here, because somebody who edits the
 * published workflow and comes back expecting these to have changed has found a
 * bug in their model rather than in the product.
 */

/** Where a tick goes. */
const TICK_ENDPOINT = "/api/showcase/tick";
/** Where taking the seat back goes. */
const PERSON_ENDPOINT = "/api/showcase/person";

/**
 * The person, as much of them as this screen draws.
 *
 * Not the whole `Joiner`. `accountEmail` decided whether this page renders at
 * all and has no business being shipped to a browser afterwards, and `company`
 * is the account's own name, which the reader knows. What is left is the person
 * and their steps — including the answers they gave, which is the payoff of the
 * whole feature and reaches exactly one screen: this one.
 */
export interface PersonView {
  id: string;
  name: string;
  email: string;
  role: string;
  startDate: string;
  workflowId: string;
  workflowName: string;
  invitedAt: string;
  steps: JoinerStep[];
}

/**
 * How far the onboarding has got, derived on the server by `progressOf`.
 *
 * Both sides together, because that is the question the reader has. The counts
 * cover only steps somebody can actually complete — a denominator containing
 * work this showcase doesn't run is a progress bar that can never fill — and the
 * steps left out of it are still drawn below, saying so.
 */
export interface PersonProgressView {
  done: number;
  total: number;
  finished: boolean;
  /** Whoever the whole thing is waiting on next, or null when it isn't. */
  next: { title: string; actor: StepActor } | null;
  /** The new starter's own half, so the column can split the remaining work. */
  theirs: { done: number; total: number };
}

export function PersonProgress({
  person,
  progress,
  user,
}: {
  person: PersonView;
  progress: PersonProgressView;
  user: Session;
}) {
  const router = useRouter();

  /* Which step is mid-flight, by id, so the control on that card can say so
     while the rest of the page stays put. A single id rather than a set: two
     ticks in the air at once is not a thing anybody needs to do, and refusing
     the second is cheaper to reason about than reconciling two responses that
     could come back in either order. */
  const [saving, setSaving] = React.useState<string | null>(null);

  /* The window after the server has taken the tick and before the re-rendered
     page arrives. `useTransition` is what makes it visible: `router.refresh()`
     inside it keeps `refreshing` true until the new server output actually
     commits, so the page can't spend a beat claiming to be idle while showing
     the old answer. */
  const [refreshing, startRefresh] = React.useTransition();

  const [error, setError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);

  const busy = saving !== null || refreshing || removing;

  /**
   * Tick a step, or take the tick back.
   *
   * `done` is sent rather than toggled, because a toggle is a claim about what
   * the state was when the button was drawn — and after a refresh, or on a
   * second tab, that claim can be stale. Sending the direction means the worst
   * a duplicate press can do is ask for the state it is already in.
   *
   * `setSaving(null)` goes inside the transition rather than in a `finally`, so
   * the card stops saying "Ticking off" at the same moment the fresh data lands
   * rather than a beat before it. Cleared eagerly, it would flash the old state
   * back with a live-looking button under it.
   */
  const tick = React.useCallback(
    async (stepId: string, done: boolean) => {
      if (busy) return;
      setSaving(stepId);
      setError(null);

      try {
        const response = await fetch(TICK_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ joinerId: person.id, stepId, done }),
        });
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;

        if (!response.ok || !payload?.ok) {
          setSaving(null);
          setError(
            payload?.error ??
              "That didn't save. The step is as it was — try it again.",
          );
          return;
        }

        startRefresh(() => {
          router.refresh();
          setSaving(null);
        });
      } catch {
        /* No response at all — offline, or the tab lost the network mid-request.
           Said carefully, because the request may well have reached the server:
           the page is re-read either way, so the honest instruction is to look
           rather than to assume. */
        setSaving(null);
        setError(
          "That didn't reach the server. Reload the page to see where the step actually stands.",
        );
      }
    },
    [busy, person.id, router],
  );

  /**
   * Take the seat back.
   *
   * `replace` rather than `push`: the page they are standing on is about to stop
   * existing, and leaving it in the history means the back button lands on a
   * "there's nobody here" screen for a removal that worked.
   *
   * The refresh is queued behind the navigation in the same transition, so it
   * re-reads People rather than this page — the list is where the row has to
   * disappear from, and it is the one screen that would otherwise be able to
   * show somebody who is gone.
   *
   * `removing` is never cleared on success. The component is on its way out and
   * clearing it would re-enable the buttons on a person who no longer exists.
   */
  const remove = React.useCallback(async () => {
    if (busy) return;
    setRemoving(true);
    setError(null);

    try {
      const response = await fetch(
        `${PERSON_ENDPOINT}?id=${encodeURIComponent(person.id)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        /* The confirmation closes on the way out so the message lands on the
           page behind it. A dialog that stays open holding an error about the
           thing it was asking you to confirm reads as a second question. */
        setRemoving(false);
        setConfirming(false);
        setError(
          payload?.error ??
            "That didn't go through. They still have their seat.",
        );
        return;
      }

      startRefresh(() => {
        router.replace("/showcase/people");
        router.refresh();
      });
    } catch {
      setRemoving(false);
      setConfirming(false);
      setError(
        "That didn't reach the server. They still have their seat — try again.",
      );
    }
  }, [busy, person.id, router]);

  return (
    <>
      <Detail
        person={person}
        progress={progress}
        user={user}
        tick={{ saving, busy, onTick: tick }}
        error={error}
        onRemove={() => setConfirming(true)}
      />
      <ConfirmRemove
        open={confirming}
        person={person}
        removing={removing}
        onCancel={() => setConfirming(false)}
        onConfirm={remove}
      />
    </>
  );
}

/** What a step card needs to know about the tick in flight, in one bundle so
    the shape doesn't have to be threaded through three components as three
    separate props that can be passed in the wrong order. */
interface TickUi {
  /** The step being written, if any. */
  saving: string | null;
  /** Anything at all in flight. Every control refuses while this is true. */
  busy: boolean;
  onTick: (stepId: string, done: boolean) => void;
}

function Detail({
  person,
  progress,
  user,
  tick,
  error,
  onRemove,
}: {
  person: PersonView;
  progress: PersonProgressView;
  user: Session;
  tick: TickUi;
  error: string | null;
  onRemove: () => void;
}) {
  const first = person.name.split(" ")[0];
  const addedOn = onDay(person.invitedAt);

  const steps = person.steps.map((step) =>
    toCard(step, first, tick, person.startDate),
  );

  /* Steps waiting on neither side. They are drawn like everything else and
     counted in nothing, which is right — `progressOf` leaves them out of both
     totals because nobody can finish them from these screens — but the
     difference between the count in the header and the number of cards under it
     has to be explained somewhere, or it reads as arithmetic going wrong. */
  const uncounted = person.steps.length - progress.total;

  return (
    <AppShell
      title={person.name}
      account={{ name: user.name, email: user.email }}
      navRail={<ShowcaseNavRail />}
      nav={
        <ShowcaseNav>
          <PersonNav
            person={person}
            progress={progress}
            first={first}
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
              {progress.finished ? (
                <Badge tone="success" size="sm">
                  <CheckCircle />
                  Done
                </Badge>
              ) : (
                <Badge tone="accent" size="sm">
                  Onboarding
                </Badge>
              )}
            </div>
            <p className="text-md text-text-muted">
              {person.role ? `${person.role} · ` : ""}
              {person.email}
            </p>
            {/* The two dates that actually happened. Everything below is a plan
                until somebody completes it. */}
            <p className="text-sm text-text-subtle">
              {person.startDate && `Starts ${readable(person.startDate)}`}
              {person.startDate && addedOn && " · "}
              {addedOn && `Invited ${addedOn}`}
            </p>
          </div>
        </header>

        {/* Where the whole thing stands, said once at the top. Somebody opens
            this page with one question — is it moving, and is it moving without
            me — and leaving that to be totalled up from a column of badges is
            leaving the only question unanswered. */}
        <Lead person={person} progress={progress} first={first} />

        {/* Failures stay on the page rather than flashing past. A tick that
            didn't take is worth being able to see after you have looked away,
            because the screen it failed on looks identical to the screen it
            would have succeeded on. */}
        {error && (
          <Callout tone="danger" icon={<Warning />} title="That didn't save">
            {error}
          </Callout>
        )}

        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-lg font-semibold tracking-[-0.01em]">
                {person.workflowName}
              </h2>
              <p className="text-sm text-text-muted">
                The steps as they were the day {first} was given a seat. Editing
                that workflow since doesn&apos;t change theirs.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              {progress.total > 0 && (
                /* Counted here rather than by `WorkflowProgress`, which would
                   total every card including the ones nobody can finish. Two
                   numbers for the same thing on one screen is how a page starts
                   contradicting itself. */
                <span className="text-sm text-text-subtle">
                  {progress.done} of {progress.total} done
                </span>
              )}
              {person.workflowId && (
                <Link
                  href={`/showcase/workflows/${person.workflowId}`}
                  className={buttonVariants({
                    variant: "secondary",
                    size: "sm",
                  })}
                >
                  Open workflow
                </Link>
              )}
            </div>
          </div>

          {steps.length > 0 ? (
            <>
              <WorkflowProgress steps={steps} />

              {uncounted > 0 && (
                <p className="text-sm leading-relaxed text-text-subtle">
                  {uncounted === 1
                    ? "One step above isn't counted: it's real work, but it isn't something either of you finishes from these screens, so nothing here pretends to know whether it has happened."
                    : `${uncounted} steps above aren't counted: they're real work, but they aren't something either of you finishes from these screens, so nothing here pretends to know whether they have happened.`}
                </p>
              )}
            </>
          ) : (
            <p className="text-base leading-relaxed text-text-muted">
              There was nothing in {person.workflowName} but its trigger, so the
              seat is all {first} has so far.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}

/**
 * The one line that says how the onboarding is going.
 *
 * Four states, and each one names who the next move belongs to, because that is
 * the difference between a page you check and a page you act on. Waiting on the
 * new starter is the quiet case — there is nothing to do but know. Waiting on
 * the reader is the loud one, and it gets the accent, because a step that has
 * been sitting on somebody's own desk for a week is the failure this whole
 * screen exists to catch.
 */
function Lead({
  person,
  progress,
  first,
}: {
  person: PersonView;
  progress: PersonProgressView;
  first: string;
}) {
  if (progress.finished) {
    return (
      <Callout
        tone="success"
        icon={<CheckCircle />}
        title="Everything's been done"
      >
        {person.startDate
          ? `All ${progress.total} steps are finished, and ${first} starts ${readable(person.startDate)}.`
          : `All ${progress.total} steps are finished.`}
      </Callout>
    );
  }

  if (!progress.next) {
    return (
      <Callout tone="neutral" icon={<Schedule />} title="Nothing to do here">
        {first} has a seat and their invitation has gone out, but none of the
        steps in {person.workflowName} are ones you or they complete from these
        screens.
      </Callout>
    );
  }

  if (progress.next.actor === "admin") {
    return (
      <Callout tone="accent" icon={<TaskAlt />} title="It's waiting on you">
        {progress.done} of {progress.total} done. Next is{" "}
        <span className="font-medium">{progress.next.title}</span>, which is
        yours — tick it off below once it has actually been done.
      </Callout>
    );
  }

  return (
    <Callout
      tone="neutral"
      icon={<Schedule />}
      title={`It's waiting on ${first}`}
    >
      {progress.done} of {progress.total} done. Next is{" "}
      <span className="font-medium">{progress.next.title}</span>, which {first}{" "}
      fills in on their own screen. Nothing here can answer it for them.
    </Callout>
  );
}

/**
 * What a completed answer is called, so the card can name the thing rather than
 * the fact that a thing was given.
 *
 * "Anne is their middle name" is the sentence somebody came to this page for.
 * "Anne is what they gave" is the same sentence with the useful noun removed —
 * true, and worth nothing to whoever is making the name tag.
 */
const ANSWER_LABEL: Record<JoinerField, string> = {
  "middle-name": "is their middle name",
  "date-of-birth": "is their date of birth",
};

/**
 * One step, as a card.
 *
 * Three shapes, one per actor, and the split is the whole point of the screen.
 * A joiner step is something to watch and, once it lands, something to read —
 * the answer they typed, which is the reason anybody asked. An admin step is
 * something to do, and carries the only control on the page that changes
 * anything. A step with no actor is real work that neither of them finishes
 * here, and it is drawn plainly rather than dressed up with a tick box beside
 * work nobody on these two screens can do.
 *
 * The status comes off `completedAt` and nothing else. Not from the start date,
 * not from the step's position in the list, not from how long ago the
 * invitation went — a step is complete because a person completed it, or it
 * says Not started.
 *
 * The tick labels change while a write is in flight, which is the only feedback
 * `StepAction` has room for and is enough: it is a text control, the press is
 * refused for as long as anything is saving, and the card behind it re-renders
 * from the server the moment the answer lands.
 */
/** Local midnight, so a step due today isn't overdue at nine in the morning. */
function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/**
 * A due date, without the year.
 *
 * `readable` is for start dates and does the same job, but this one is built
 * from a `Date` rather than a `YYYY-MM-DD` string — resolving an offset
 * produces a real date, and routing it back through a string to reuse a
 * formatter would be a conversion in each direction for nothing.
 */
function dueOnDay(date: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

function toCard(
  step: JoinerStep,
  first: string,
  tick: TickUi,
  startDate: string,
): WorkflowStep {
  const done = Boolean(step.completedAt);
  const when = onDay(step.completedAt);
  const saving = tick.saving === step.id;

  /* Only while it's outstanding. A deadline is a thing to act on, so once a
     step is finished the date it was finished on is the fact worth carrying —
     showing both invites the reader to work out whether it was late, which is
     a judgement this page has no business making on its own. */
  const dueDate = done ? null : dueDateFrom(startDate, step.due);
  /* Local midnight both sides, so "today" is not overdue for the eleven hours
     before the comparison instant. */
  const overdue = dueDate ? dueDate.getTime() < startOfToday() : false;

  const card: WorkflowStep = {
    id: step.id,
    title: step.title,
    status: done ? "complete" : "not_started",
  };

  const metrics: StepMetric[] = [];

  if (dueDate) {
    metrics.push({
      value: dueOnDay(dueDate),
      label: overdue ? "was due" : "due",
    });
  }

  if (step.actor === "joiner") {
    if (done) {
      const value = answerOf(step);
      metrics.push({
        value: value ?? "Answered",
        label: (step.field && ANSWER_LABEL[step.field]) || "is what they gave",
      });
      if (when) metrics.push({ value: when, label: "answered" });
      card.description = `${first} filled this in themselves.`;
    } else {
      metrics.push({ value: first, label: "fills this in" });
      card.description = `Waiting on ${first}. It's on their own screen, and there's nothing here that can answer it for them.`;
    }
  } else if (step.actor === "admin") {
    if (done) {
      metrics.push({ value: when ?? "Done", label: "ticked off" });
      card.description =
        "Ticked off here. Untick it if that turns out not to be true.";
      /* The quieter of the two controls, deliberately. Undoing is the rarer act
         and this is a record of something in the world — the name tag exists —
         so taking it back is offered explicitly rather than by pressing the
         same button twice and hoping. */
      card.secondaryAction = {
        label: saving ? "Unticking" : "Untick it",
        onClick: () => tick.onTick(step.id, false),
      };
    } else {
      metrics.push({ value: "You", label: "tick this one off" });
      card.description =
        "Yours to do. Nothing here can check it for you, so tick it off once it has actually been done.";
      card.primaryAction = {
        label: saving ? "Ticking off" : "Tick it off",
        onClick: () => tick.onTick(step.id, true),
      };
    }
  } else {
    metrics.push({ value: "Nobody here", label: "does this one" });
    card.description =
      "Real work, but not something either of you finishes from these screens — so it stays open, and it isn't counted.";
  }

  card.metrics = metrics;
  return card;
}

/**
 * What they gave, in the words they'd recognise.
 *
 * A date of birth arrives as `YYYY-MM-DD` and has to be printed with its year,
 * which is why `readable` is not reused here — that one is for start dates and
 * drops the year on purpose, and a date of birth without a year is not a date of
 * birth. Everything else is printed as typed.
 */
function answerOf(step: JoinerStep): string | null {
  if (!step.value) return null;
  return step.field === "date-of-birth" ? birthday(step.value) : step.value;
}

/**
 * `1994-08-24` as "24 August 1994".
 *
 * Built from the parts rather than handed to `new Date(string)`, which reads a
 * bare date as UTC midnight and renders it a day early anywhere west of
 * Greenwich — a date of birth that is one day out is worse than no date of birth
 * at all, because it looks right.
 *
 * Anything that isn't a bare date comes back untouched. The store trims what
 * they typed and nothing more, so this has to survive being handed a string
 * that was never a date; a formatter that threw would take the whole page with
 * it over one field.
 */
function birthday(value: string) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!parts) return value;

  const date = new Date(
    Number(parts[1]),
    Number(parts[2]) - 1,
    Number(parts[3]),
  );
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/**
 * A moment that has already happened, as a date.
 *
 * `invitedAt` and `completedAt` are both full ISO timestamps, so `new Date` is
 * right here in a way it is wrong for a start date: a string carrying a time and
 * a zone is unambiguous, and the bare `YYYY-MM-DD` that isn't is what `readable`
 * and `birthday` exist to handle.
 *
 * No weekday. The day of the week matters for the morning somebody turns up and
 * not at all for an afternoon that has been and gone.
 */
function onDay(iso: string | undefined) {
  if (!iso) return null;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
  }).format(date);
}

/**
 * The menu column: the facts about their seat, who the outstanding work belongs
 * to, and the one way to take the seat back.
 *
 * The split between the two people is the part worth having. "3 of 6" tells you
 * the onboarding is half done and tells you nothing about whether that is your
 * problem; the two lines under it do, and they are the difference between a page
 * you glance at and a page you can act on.
 *
 * Every number is derived from what the server sent, so there is no second copy
 * of "how far along" to fall out of date. The reader's own share is arithmetic
 * rather than a third count — every step anybody can finish is either theirs or
 * the new starter's — which keeps the rule about who owns what in `progressOf`
 * where the rest of the product reads it.
 */
function PersonNav({
  person,
  progress,
  first,
  onRemove,
}: {
  person: PersonView;
  progress: PersonProgressView;
  first: string;
  onRemove: () => void;
}) {
  const addedOn = onDay(person.invitedAt);

  const mine = progress.total - progress.theirs.total;
  const mineLeft = mine - (progress.done - progress.theirs.done);
  const theirsLeft = progress.theirs.total - progress.theirs.done;

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
          {person.role && <Fact label="Role" value={person.role} />}
          {person.startDate && (
            <Fact label="Starts" value={readable(person.startDate)} />
          )}
          {addedOn && <Fact label="Invited" value={addedOn} />}
          <Fact label="Workflow" value={person.workflowName} />
        </div>

        {progress.total > 0 && (
          <div className="flex flex-col gap-2 pt-1">
            <NavStat
              label="Done"
              value={`${progress.done} of ${progress.total}`}
            />
            {/* Warned about only while it's true, and only because it's the
                reader's own. A number sitting in amber all day stops meaning
                anything; a number that turns amber the moment something lands
                on your desk is worth looking at. */}
            {mine > 0 && (
              <NavStat
                label="Waiting on you"
                value={mineLeft}
                tone={mineLeft > 0 ? "warning" : "neutral"}
              />
            )}
            {progress.theirs.total > 0 && (
              <NavStat label={`Waiting on ${first}`} value={theirsLeft} />
            )}
          </div>
        )}
      </div>

      <Separator />

      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        A step only changes here once it has happened — either {first} filled it
        in, or you ticked it off. Nothing is filled in ahead of the work.
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
 * everywhere else the screen says what will happen and lets you press it. It
 * earns the exception twice over. There is no undo, and unlike a deleted
 * workflow the thing being destroyed isn't only the account's own work: the
 * answers this person typed about themselves go with the row, which is the
 * point rather than a side effect. A seat you removed that left a date of birth
 * on a server is a deletion that didn't delete anything.
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
  removing,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  person: PersonView;
  removing: boolean;
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
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={removing}
          >
            Cancel
          </Button>
          {/* `loading` rather than a swapped label: it disables the button and
              spins in one prop, which matters more here than anywhere else on
              the page. This is the request that can't be taken back, and a
              second press while the first is in flight is the most likely way
              anybody would try. */}
          <Button
            variant="danger"
            size="sm"
            onClick={onConfirm}
            loading={removing}
          >
            Remove person
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 px-5 py-5">
        <p className="text-base leading-relaxed text-text-muted">
          They lose their seat, {person.workflowName} stops running against
          them, and everything they filled in is deleted with the row. The seat
          goes back to the account for somebody else.
        </p>

        <p className="text-sm leading-relaxed text-text-subtle">
          Their invitation has already gone out. Removing them stops anything
          after it and their link stops working — it can&apos;t take that email
          back.
        </p>
      </div>
    </Dialog>
  );
}

/**
 * An address with nobody behind it.
 *
 * Reached three ways, and it deliberately can't tell you which. The id might
 * never have existed; it might be somebody who has since been removed; or it
 * might be a real person on somebody else's account, in which case saying so
 * would confirm the id is real to whoever guessed it. One wording covers all
 * three, and it points at the list rather than explaining itself, because the
 * list is where the answer is either way.
 *
 * Rendered by the server page rather than reached from inside the client
 * component, which is the change that makes the guard worth anything: the
 * person's name and their answers are never sent to a browser that isn't
 * entitled to them, rather than being sent and then not drawn.
 */
export function NoPerson({ user }: { user: Session }) {
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
