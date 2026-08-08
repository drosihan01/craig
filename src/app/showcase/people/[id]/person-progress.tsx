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
  NavRail,
  NavRailItem,
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
  ArrowBack,
  Bolt,
  CheckCircle,
  Cloud,
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
import { SETTINGS_PATH } from "@/lib/showcase/google-outcome";
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
/** Where "how is that account getting on" goes. */
const SEAT_ENDPOINT = "/api/showcase/seat";

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
  /**
   * Ids of automated steps that claimed themselves and never came back.
   *
   * A list from the server rather than a comparison done here, because it is a
   * fact about the current time: worked out during render it would be worked
   * out twice, in two places, moments apart — which React reports as a
   * hydration mismatch and a reader experiences as a status that changes when
   * they blink. Same rule as every date on this page.
   */
  interrupted: string[];
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
  /**
   * The same total, split three ways, so the column can say who each remaining
   * piece belongs to.
   *
   * Counted per actor on the server rather than derived from each other here.
   * The reader's own share used to be the subtraction — everything, minus the
   * new starter's — and that was correct for exactly as long as there were two
   * kinds of step. A third kind arriving would have silently reported Craig's
   * work as the reader's, in amber, under a heading saying it was waiting on
   * them.
   */
  theirs: { done: number; total: number };
  mine: { done: number; total: number };
  craig: { done: number; total: number };
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

  /* Which automated step is being asked about, by id, for the same reason
     `saving` is a single id rather than a set: one at a time is all anybody
     needs, and refusing the second is cheaper to reason about than reconciling
     two answers that can arrive in either order. */
  const [checking, setChecking] = React.useState<string | null>(null);

  const busy = saving !== null || refreshing || removing || checking !== null;

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
   * Ask Google where an automated step actually stands, because somebody asked.
   *
   * `manual: true` on every call from here, and that flag is doing real work at
   * the other end. It forces the check past the throttle — a person who presses
   * a button expects the answer to be from now, not from fifty seconds ago —
   * and it is what permits the route to *run* a step that has been sitting in
   * `waiting`. That permission is deliberately not granted by merely looking at
   * the page: an account appearing inside somebody's company because a
   * colleague opened a tab is a surprise nobody should get.
   *
   * The page is re-read afterwards rather than patched, exactly like the tick
   * beside it. What comes back from this endpoint is one word about one step;
   * the screen is a view of a record that a second person is also writing to,
   * and the moment it starts drawing from a response instead of from the store
   * it becomes a second copy that can disagree.
   */
  const check = React.useCallback(
    async (stepId: string) => {
      if (busy) return;
      setChecking(stepId);
      setError(null);

      const result = await askAboutSeat(person.id, stepId, true);

      if (!result.ok) {
        setChecking(null);
        setError(result.error);
        return;
      }

      startRefresh(() => {
        router.refresh();
        setChecking(null);
      });
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

  /**
   * The steps worth asking Google about the moment this page is opened.
   *
   * A seat that exists and hasn't been accepted, and a run that claimed itself
   * and never came back. Both are questions whose answer lives at Google and
   * changes without anybody here doing anything, which is precisely the shape
   * of thing a screen should refresh rather than display from memory.
   *
   * Derived from props with no reference to the clock — the interrupted list
   * was worked out on the server for exactly that reason — so this stays a pure
   * function of what was rendered.
   */
  const worthAsking = React.useMemo(
    () =>
      person.steps
        .filter(
          (step) =>
            step.actor === "craig" &&
            (step.run?.state === "awaiting" ||
              person.interrupted.includes(step.id)),
        )
        .map((step) => step.id),
    [person.steps, person.interrupted],
  );

  /**
   * Checking when somebody looks, which is the whole of the polling schedule.
   *
   * There is no cron and no webhook, and both absences are argued for on the
   * route this calls. What is left is this: the person who cares whether a new
   * starter has signed in yet is the person who just opened their page, so
   * their opening it is the trigger. It costs one Directory read, throttled on
   * the server to once a minute per step, so a page somebody leaves open and
   * reloads twenty times asks Google once.
   *
   * Once per mount, guarded by a ref rather than by state. State would put a
   * render between deciding to ask and asking, and — more to the point —
   * `router.refresh()` re-renders this component with fresh props, so anything
   * derived from those props would arm the effect again and it would ask for
   * ever. The ref survives the refresh; the props don't.
   *
   * Nothing here sets state. That is not only the React 19 rule about effects,
   * it is the right behaviour: a check nobody asked for should not put a
   * spinner on a page somebody is reading. It is silent, and if it learns
   * anything the page quietly redraws with the answer.
   */
  const askedRef = React.useRef(false);

  React.useEffect(() => {
    if (askedRef.current || worthAsking.length === 0) return;
    askedRef.current = true;

    let live = true;

    void (async () => {
      let learned = false;
      for (const stepId of worthAsking) {
        const result = await askAboutSeat(person.id, stepId, false);
        learned = learned || result.ok;
      }

      /* Only if the component is still mounted, and only if something was
         actually asked. A refresh scheduled after somebody has navigated away
         is a re-render of a page that isn't there. */
      if (live && learned) React.startTransition(() => router.refresh());
    })();

    return () => {
      live = false;
    };
  }, [worthAsking, person.id, router]);

  return (
    <>
      <Detail
        person={person}
        progress={progress}
        user={user}
        tick={{ saving, busy, onTick: tick }}
        seat={{ checking, busy, onCheck: check }}
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

/**
 * One request to the seat endpoint, with every outcome already a sentence.
 *
 * Module-level rather than a hook, because it has two callers who want opposite
 * things from it. The button wants the message so it can put it on the page;
 * the silent check on mount wants nothing at all — a failure there is a check
 * that didn't happen, which is the same as the check not being due, and putting
 * an error on the screen for it would mean a page that greets its reader with a
 * complaint about a request they never made.
 *
 * Never throws, so neither caller needs a try/catch it might forget on the path
 * where forgetting is silent.
 */
async function askAboutSeat(
  joinerId: string,
  stepId: string,
  manual: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch(SEAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ joinerId, stepId, manual }),
    });

    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
    } | null;

    if (!response.ok || !payload?.ok) {
      return {
        ok: false,
        error:
          payload?.error ??
          "That didn't go through. The step is as it was — try it again.",
      };
    }

    return { ok: true };
  } catch {
    /* No response at all. Worded carefully, because the request may well have
       reached the server: with a manual press that means the account may
       genuinely have been created, and "try again" would be reckless advice.
       Look, then decide. */
    return {
      ok: false,
      error:
        "That didn't reach the server. Reload the page to see where the step actually stands before trying again.",
    };
  }
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

/** The same, for the one control on an automated step. Separate from `TickUi`
    because they are different acts on different kinds of step, and a single
    bundle would invite a card to offer whichever one it happened to have. */
interface SeatUi {
  /** The step being asked about, if any. */
  checking: string | null;
  busy: boolean;
  onCheck: (stepId: string) => void;
}

function Detail({
  person,
  progress,
  user,
  tick,
  seat,
  error,
  onRemove,
}: {
  person: PersonView;
  progress: PersonProgressView;
  user: Session;
  tick: TickUi;
  seat: SeatUi;
  error: string | null;
  onRemove: () => void;
}) {
  const first = person.name.split(" ")[0];
  const addedOn = onDay(person.invitedAt);

  const steps = person.steps.map((step) =>
    toCard(step, {
      first,
      tick,
      seat,
      startDate: person.startDate,
      /* Whether everything ahead of it is finished — the same rule the server
         applies before it will run anything, restated here so a step that
         cannot run yet says why rather than offering a button that would be
         refused. Pure data: no clock, no second source. */
      due: person.steps
        .slice(
          0,
          person.steps.findIndex((s) => s.id === step.id),
        )
        .every((s) => !s.actor || Boolean(s.completedAt)),
      interrupted: person.interrupted.includes(step.id),
    }),
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
      /* Collapsed, the column keeps the one thing it has: the way out. The
         list screens' rails carry Workflows and People; this one deliberately
         doesn't, for the same reason the builder's doesn't — a page about one
         person is somewhere you went into, and offering two other rooms
         invites you out of it before you have read anything. */
      navRail={
        <NavRail>
          <NavRailItem
            href="/showcase/people"
            label="People"
            icon={<ArrowBack />}
          />
        </NavRail>
      }
      nav={
        <PersonNav
          person={person}
          progress={progress}
          first={first}
          onRemove={onRemove}
        />
      }
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 py-10">
        <div className="flex flex-col gap-4">
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
              {/* The two dates that actually happened. Everything below is a
                  plan until somebody completes it. */}
              <p className="text-sm text-text-subtle">
                {person.startDate && `Starts ${readable(person.startDate)}`}
                {person.startDate && addedOn && " · "}
                {addedOn && `Invited ${addedOn}`}
              </p>
            </div>
          </header>
        </div>

        {/* Where the whole thing stands, said once at the top. Somebody opens
            this page with one question — is it moving, and is it moving without
            me — and leaving that to be totalled up from a column of badges is
            leaving the only question unanswered. */}
        <Lead person={person} progress={progress} first={first} />

        {/* Anything Craig couldn't do, at the top, where it cannot be missed.
            This is the whole difference between an automation and a promise: a
            step that quietly failed is a person whose first week is going wrong
            in a way nobody finds out about until they turn up and have no email
            address. It is above the list on purpose — a red badge eight cards
            down is a badge you find after you already knew. */}
        <SeatTrouble person={person} first={first} />

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

  /* Craig's own. Neutral rather than accent, because there is nothing here for
     the reader to do — which is the entire selling point of the step and would
     be undermined by a callout that looked like a task. When it *does* need
     them, it needs them for a specific reason, and that reason gets its own
     panel underneath this one rather than being smuggled into the summary. */
  if (progress.next.actor === "craig") {
    return (
      <Callout tone="neutral" icon={<Bolt />} title="I'm on the next one">
        {progress.done} of {progress.total} done. Next is{" "}
        <span className="font-medium">{progress.next.title}</span>, which I run
        myself — nobody has to do anything for it.
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

/** Everything a card needs beyond the step itself, in one bundle rather than
    six positional arguments that can be handed over in the wrong order. */
interface CardContext {
  first: string;
  tick: TickUi;
  seat: SeatUi;
  startDate: string;
  /** Whether everything ahead of this step has actually been finished. */
  due: boolean;
  /** Whether an automated run claimed this step and never came back. */
  interrupted: boolean;
}

function toCard(step: JoinerStep, ctx: CardContext): WorkflowStep {
  const { first, tick, startDate } = ctx;
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

  if (step.actor === "craig") {
    dressAutomated(card, metrics, step, ctx);
    card.metrics = metrics;
    return card;
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
 * A step Craig runs, in whichever of its six shapes it is actually in.
 *
 * Six, because the four states the block has are not the four things the reader
 * needs told apart. Waiting splits into "nothing has unblocked it yet" and
 * "it tried and there was nothing to try with", which are a shrug and a to-do
 * respectively; running splits into "happening now" and "started and never came
 * back", which are patience and a problem. Collapsing either pair would put the
 * calm half and the urgent half behind the same words.
 *
 * The rule the rest of this page runs on holds here too, and holds harder: a
 * step is complete because something completed it, never because it looks like
 * it should have. `done` here means Google itself reported that the person
 * signed in and accepted — not that an account was created, which happened
 * weeks earlier and is not the same claim.
 *
 * Every state that a person can move gets a control, and every state that
 * nobody can move gets none. A button that would be refused is worse than no
 * button: it invites somebody to press it twice and conclude the page is
 * broken.
 */
function dressAutomated(
  card: WorkflowStep,
  metrics: StepMetric[],
  step: JoinerStep,
  { first, seat, due, interrupted }: CardContext,
) {
  const run = step.run;
  const state = run?.state ?? "waiting";
  const checking = seat.checking === step.id;
  const seatEmail = run?.seatEmail;

  /* One label for the control, whichever it is, so the card can't be reading
     one state and the button another. */
  const press = (label: string) => ({
    label: checking ? "Checking" : label,
    onClick: () => seat.onCheck(step.id),
  });

  if (state === "done") {
    card.status = "complete";
    if (seatEmail)
      metrics.push({ value: seatEmail, label: "is their address" });
    metrics.push({
      value: onDay(step.completedAt) ?? "Done",
      label: "signed in",
    });
    card.description = `I created this account and ${first} has signed in and accepted it. Nothing else to do.`;
    return;
  }

  if (state === "awaiting") {
    /* In progress rather than complete, and the distinction is the whole point
       of the step. The account has existed since the moment it was created;
       what hasn't happened is a person going near it, and until they do this
       company has provisioned a mailbox nobody reads. */
    card.status = "in_progress";
    if (seatEmail) metrics.push({ value: seatEmail, label: "was created" });
    metrics.push({ value: first, label: "hasn't signed in yet" });
    card.description = run?.emailProblem
      ? run.emailProblem
      : `The account is made. It finishes when ${first} signs in for the first time and accepts Google's terms — I check whenever this page is opened, and nothing here can do it for them.`;
    card.primaryAction = press("Check now");
    return;
  }

  if (state === "running" && interrupted) {
    card.status = "blocked";
    card.description =
      run?.message ??
      "This one started and never finished — the server was probably restarted mid-way. Checking asks Google what it actually managed to do, which is the only safe way to find out; nothing gets created twice.";
    card.primaryAction = press("Check what happened");
    return;
  }

  if (state === "running") {
    card.status = "in_progress";
    metrics.push({ value: "Me", label: "am doing this now" });
    card.description =
      "Creating the account now. This takes a second or two — reload the page and it'll say where it got to.";
    return;
  }

  if (state === "failed") {
    card.status = "blocked";
    card.description =
      run?.message ??
      "This one didn't work, and no account was created. Try it again once whatever caused it has been sorted.";
    card.primaryAction = press("Try again");
    return;
  }

  /* Waiting, in its two quite different flavours. */
  metrics.push({ value: "Me", label: "run this one" });

  if (!due) {
    card.description =
      "I run this one myself, as soon as everything above it is finished. Nobody has to come back and start it.";
    return;
  }

  card.description =
    run?.message ??
    "Ready to go. It runs itself when the step before it is finished — this button is only here for starting it by hand.";
  card.primaryAction = press("Run it now");
}

/**
 * Anything Craig couldn't do, said at the top of the page.
 *
 * The requirement this exists for is worth stating plainly: an automated step
 * that fails silently is worse than no automation at all. A person ticks their
 * own steps off, sees a list that is mostly green, and finds out on somebody's
 * first morning that the account nobody was responsible for was never made. So
 * a run that is stuck says so above the fold, in the reader's own words, with
 * the next move in the sentence.
 *
 * Waiting on a connection is included and is deliberately not red. It is the
 * state every deployment is in until somebody connects Google Workspace, it is
 * a to-do rather than a fault, and `src/lib/google/result.ts` argues at length
 * that painting it as a failure misrepresents the product. It still belongs
 * here, because "nothing is happening and nothing will" is exactly the thing
 * somebody needs to be told — quietly is not the same as not at all.
 *
 * A failed send of the password gets its own entry even though the step around
 * it is fine, because it is the one problem here with a deadline attached: the
 * account exists, the person doesn't know, and the only copy of the password is
 * gone.
 *
 * Two of these carry a way to fix them, and only two. A step waiting on a
 * connection and a connection that has stopped working are the same act away
 * from moving — somebody with the right privileges pressing Connect — and this
 * page is one of the two places anybody ever discovers that, the other being
 * the block's own settings. Telling somebody their new starter has no email
 * address, naming the reason, and then leaving them to guess which screen holds
 * the button is the failure this link exists to prevent. The other notices get
 * none, because there is nothing here to send anybody to.
 */
function SeatTrouble({ person, first }: { person: PersonView; first: string }) {
  const notices = person.steps.flatMap((step) => {
    if (step.actor !== "craig") return [];

    const run = step.run;
    const state = run?.state ?? "waiting";
    const out: {
      key: string;
      tone: "danger" | "warning" | "neutral";
      icon: React.ReactNode;
      title: string;
      body: string;
      /** Shown under the body when the fix is one screen away. */
      fix?: string;
    }[] = [];

    if (state === "failed" && run?.message) {
      out.push({
        key: `${step.id}-failed`,
        tone: "danger",
        icon: <Warning />,
        title: `${step.title} didn't run`,
        body: run.message,
        /* Only the one failure a person can act on from here. `needs-reconnect`
           is a permission that has lapsed and needs granting again; every other
           refusal — a full tenant, an address already taken, Google saying no —
           is fixed somewhere else entirely, and a link to settings under those
           would send somebody to a page that has nothing to do with it. */
        fix:
          run.problem === "needs-reconnect"
            ? "Connect Google Workspace again"
            : undefined,
      });
    }

    if (state === "running" && person.interrupted.includes(step.id)) {
      out.push({
        key: `${step.id}-stuck`,
        tone: "warning",
        icon: <Warning />,
        title: `${step.title} was interrupted`,
        body:
          run?.message ??
          "It started and never finished. Check it below and I'll ask Google what it actually did — nothing gets created twice.",
      });
    }

    if (state === "waiting" && run?.problem === "not-set-up" && run.message) {
      out.push({
        key: `${step.id}-setup`,
        tone: "neutral",
        icon: <Cloud />,
        title: `${step.title} is waiting on a connection`,
        body: run.message,
        fix: "Connect Google Workspace",
      });
    }

    if (run?.emailProblem) {
      out.push({
        key: `${step.id}-email`,
        tone: "warning",
        icon: <Warning />,
        title: `${first} hasn't been sent their password`,
        body: run.emailProblem,
      });
    }

    return out;
  });

  if (notices.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {notices.map((notice) => (
        <Callout
          key={notice.key}
          tone={notice.tone}
          icon={notice.icon}
          title={notice.title}
        >
          {notice.body}
          {notice.fix && (
            /* A link rather than a button, and to the screen rather than to the
               act. Connecting sends somebody to Google's consent screen, which
               is not a thing to start from a notice on somebody else's page —
               settings names the account it will be attached to first, which is
               the check this product now insists on. */
            <Link
              href={SETTINGS_PATH}
              className="mt-1 block w-fit font-medium underline underline-offset-4"
            >
              {notice.fix}
            </Link>
          )}
        </Callout>
      ))}
    </div>
  );
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
 * The split between the people is the part worth having. "3 of 6" tells you the
 * onboarding is half done and tells you nothing about whether that is your
 * problem; the lines under it do, and they are the difference between a page you
 * glance at and a page you can act on.
 *
 * Every number is counted by `progressOf`, per actor, rather than worked out
 * here. The reader's own share used to be arithmetic — everything, minus the new
 * starter's — which was exactly right while there were two kinds of step and
 * became a lie the day there were three: it would have put every account Craig
 * was still creating in the amber "waiting on you" line, about work the reader
 * cannot do and is not waiting for.
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

  const mineLeft = progress.mine.total - progress.mine.done;
  const theirsLeft = progress.theirs.total - progress.theirs.done;
  const craigLeft = progress.craig.total - progress.craig.done;

  return (
    /* The way back opens the column, and it is the only navigation here — the
       same shape as the builder, because this is the same kind of screen: one
       record, at length, that you leave by going back rather than sideways.

       It sat above the name in the content for a while, on the argument that a
       collapsible panel is no place for the only way out. The rail settles
       that — collapsed, the column still shows this as an arrow — so the link
       can live where the eye already looks for navigation, and the page can
       open on the person's name instead of on a link away from them. */
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
            {progress.mine.total > 0 && (
              <NavStat
                label="Waiting on you"
                value={mineLeft}
                tone={mineLeft > 0 ? "warning" : "neutral"}
              />
            )}
            {progress.theirs.total > 0 && (
              <NavStat label={`Waiting on ${first}`} value={theirsLeft} />
            )}
            {/* Never amber, whatever the number. Craig's outstanding steps are
                the one line here that is not a nudge — they are what the reader
                bought, and colouring them like a task on their desk would turn
                the feature's selling point into a source of guilt. */}
            {progress.craig.total > 0 && (
              <NavStat label="I'm handling" value={craigLeft} />
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
 *
 * The third is newer and is the bigger of the two. Craig may have created this
 * person a real Google Workspace account, and deleting the row does not delete
 * it — so without this paragraph somebody rescinds an invitation, watches the
 * row disappear, and is left with a live mailbox in their company belonging to
 * a person who never joined, quietly billing them for a licence. The address is
 * named rather than described, because "an account may exist" is a worry and
 * "nils.hoffman@katalis.ai exists" is a thing somebody can go and deal with.
 *
 * There is deliberately no button here that deletes it. The consent this
 * product holds is `admin.directory.user`, granted so that accounts can be
 * created on somebody's first morning; using it to destroy a mailbox from a
 * confirmation dialog is not what anybody agreed to, and doing it quietly as a
 * side effect of tidying a list would be far worse than saying what remains.
 * Naming what survives is the honest answer, and the Google Admin console is
 * where it is somebody's decision rather than ours.
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
  /**
   * Every account Craig actually created for this person, by address.
   *
   * From `seatEmail` on the run rather than from the step being complete, and
   * that distinction is the whole point: a Google step is only *complete* once
   * they have signed in and accepted, so a person who never turned up leaves a
   * step sitting at "awaiting" with a perfectly real mailbox behind it — which
   * is precisely the case this warning is for. `seatEmail` is written when
   * Google confirms the account exists and at no other time, so it is the one
   * field that means an account is out there.
   *
   * A list rather than one address, because a workflow can carry more than one
   * of these and a dialog that named the first would be quietly wrong about the
   * rest.
   */
  const created = person.steps
    .map((step) => step.run?.seatEmail)
    .filter((email): email is string => Boolean(email));

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      /* Not `sm`. The title carries their full name and the body has two
         paragraphs to say — three once there is a Google account to warn
         about; 24rem wraps a three-word name onto two lines. */
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

        {/* Only when it is true. A standing warning about an account that was
            never created would be noise on every removal, and the one time it
            mattered nobody would read it. */}
        {created.length > 0 && (
          <Callout
            tone="warning"
            icon={<Warning />}
            title={
              created.length === 1
                ? "Their Google account stays"
                : "Their Google accounts stay"
            }
          >
            <span className="flex flex-col gap-1">
              <span>
                {created.length === 1
                  ? "I created "
                  : "I created these accounts: "}
                <span className="font-medium">{created.join(", ")}</span>
                {created.length === 1
                  ? " for them, and removing them here doesn't delete it."
                  : ", and removing them here doesn't delete them."}{" "}
                {created.length === 1 ? "It stays" : "They stay"} in your Google
                Workspace — still receiving mail, still counting towards your
                licences — until somebody removes{" "}
                {created.length === 1 ? "it" : "them"} in the Google Admin
                console.
              </span>
              <span>
                I don&apos;t delete accounts, on purpose. You gave me permission
                to create them, and taking somebody&apos;s mailbox away is a
                decision for whoever runs your Workspace rather than something
                that happens as a side effect of tidying this list.
              </span>
            </span>
          </Callout>
        )}
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
