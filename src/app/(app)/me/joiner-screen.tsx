"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AppShell,
  Badge,
  Button,
  Callout,
  CraigMark,
  DatePicker,
  EmptyState,
  Field,
  Input,
  Progress,
  Select,
  toISODate,
} from "@/components/ui";
import { Check, DoneAll, Lock, Schedule } from "@/components/ui/icons";
import { NavStat } from "@/components/app-nav";
import { JoinerNav, JoinerNavRail } from "@/components/craig/joiner-nav";
import { cn } from "@/lib/cn";
import {
  AU_STATES,
  PERSONAL_DETAIL_FIELDS,
  PERSONAL_DETAIL_GROUPS,
  type JoinerField,
  type PersonalDetailField,
  type PersonalDetailKey,
  type StepActor,
} from "@/lib/craig/contract";

/**
 * The new starter's own screen, and the only one they will ever see.
 *
 * Everything else in this product is addressed to the person who bought it.
 * This is addressed to somebody who has been told where to turn up on Monday
 * and nothing else, so it is built as a place rather than as a form: it says
 * who it is from, what the whole plan is, which single part of it is theirs
 * right now, and what has already been dealt with. Somebody arriving here for
 * the second time should be able to answer "have I done that yet" by looking.
 *
 * No `AppShell`. That frame is nav and an account menu, and this person has
 * neither — no other screens to move between and no account to sign out of.
 * A chrome full of dead controls would be the first thing this company showed
 * them. So it is the shape the auth screens use instead: one column, centred,
 * one job.
 *
 * The kinds of step are the substance of the design. Their own steps have a
 * box. The company's steps are shown and are visibly not theirs. The steps
 * Craig runs himself say so, and say what came out of them once something has.
 * And the steps waiting on nobody are shown too — quietly, because a plan with
 * its middle deleted misrepresents both what is happening and how long it goes
 * on for. What none of them may ever do is read as something this person failed
 * to do: they are told whose each one is, in words, next to it.
 *
 * Nothing about how an automated step is *going* reaches this screen, and that
 * is a deliberate omission rather than a gap. A Workspace account that can't be
 * created because nobody has connected Google, or because the tenant is out of
 * licences, is real news for the person who can fix it and is nothing but
 * anxiety here — this person cannot connect anything, cannot buy a licence, and
 * would be reading a fault report about their own first day. So every state
 * short of finished reads the same to them: it is being sorted.
 */

const ENDPOINT = "/api/showcase/step";

/**
 * One step, as the person reading it needs it — not as it is stored.
 *
 * Every date is already words by the time it arrives, because the server is the
 * only side that can turn a timestamp into "7 August" without the two of them
 * disagreeing. Formatting an instant during render means the server does it in
 * its timezone and the browser does it again in the reader's, and on the wrong
 * side of midnight those are different days: React calls that a hydration
 * mismatch, and a person half a world away calls it the wrong date.
 */
export interface PlanStep {
  id: string;
  title: string;
  /** Who it waits on. Absent means neither side — see the screen's note. */
  actor?: StepActor;
  /** The day it was finished, in words. Its presence is what "done" means. */
  doneOn?: string;
  /** Their own answer, in words. Only ever on their own steps. */
  answer?: string;
  /**
   * Which form to draw, present on exactly one step: the one being asked for
   * now. It doubles as the marker of the focus, deliberately — a step that
   * belongs to somebody at the company arrives with no field at all, so this
   * screen cannot render a control against it even by mistake.
   */
  field?: JoinerField;
  /**
   * On a `personal-details` step, whether the form also asks who to call in an
   * emergency.
   *
   * Straight off their snapshot rather than decided here. The admin ticked it
   * when the workflow was written and it was frozen with the rest of the plan,
   * so this screen renders what they were asked rather than what the block
   * currently says.
   */
  askEmergencyContact?: boolean;
  /** When it's due, already a real date. Absent once it's done. */
  dueOn?: string;
  /**
   * The whole sentence under an automated step's title, written on the server.
   *
   * A sentence rather than the state it was derived from, because the state is
   * about Google and the sentence is about this person: five run states, one of
   * which mentions an address they can now use and four of which mean "it's in
   * hand". Deciding that here would mean the browser holding a record of
   * somebody's provisioning going wrong in order to render a line that never
   * mentions it.
   */
  detail?: string;
  /**
   * What the pill says, on the one step and in the one state where the generic
   * wording is wrong.
   *
   * "Being handled" is the truth for an automated step right up until the
   * account exists and is sitting there waiting to be signed into. That is the
   * single moment this screen has something to hand this person, and leaving it
   * under the same grey pill as the name tag nobody has made would waste it.
   * Sent for that state and no other, which is why the badge that uses it is
   * unconditionally an accent one.
   */
  badge?: string;
}

export interface JoinerView {
  firstName: string;
  company: string;
  /** The admin's name for the plan. Names the list rather than the greeting. */
  workflowName: string;
  /** "Monday 24 August", or null once that day has been and gone. */
  startsOn: string | null;
  steps: PlanStep[];
  /** Their own steps only. The company's half is not theirs to be measured on. */
  done: number;
  total: number;
  /** Nothing of theirs left to fill in. */
  finished: boolean;
  /** ...and the company has finished their half too, which is a different day. */
  allDone: boolean;
  /**
   * What their employer has shared with new starters. Only that.
   *
   * Assembled on the server by `listDocumentsForJoiner`, which filters by their
   * employer *and* by `shared` in one statement — so this array cannot contain
   * a document nobody decided to share, and the screen has no filtering of its
   * own to get wrong.
   */
  resources: Resource[];
}

export interface Resource {
  id: string;
  name: string;
  /** "PDF", "Word", "Image" — the kind, not the MIME type. */
  kind: string;
  /** "1.2 MB", already rounded on the server. */
  size: string;
}

/**
 * Small numbers as words.
 *
 * "There are 2 things I need from you" is a receipt. This screen is one side of
 * a conversation, and people write numbers this small out.
 */
const NUMBERS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

const spell = (n: number) => NUMBERS[n] ?? String(n);

/**
 * What each field actually asks, in this screen's words rather than the
 * workflow's.
 *
 * The block's title is the admin's label for a step in their plan — "Collect
 * middle name" — which is the right words above a list and the wrong words
 * above a box somebody has to type in. So the row keeps the title and the form
 * asks for itself.
 *
 * The middle-name hint is the one that earns its place. A person without a
 * middle name is stuck otherwise: an empty value is refused, so they would sit
 * on a screen that will not let them past for a fact about them that is simply
 * not true. Telling them what to write costs one line and unsticks the whole
 * thing.
 */
const ASK: Record<
  /* Everything except the one field that is a form rather than a question. Its
     labels live on `PERSONAL_DETAIL_FIELDS`, beside the validator that has to
     agree with them, and excluding it here is what makes the compiler insist
     the two are drawn by two different components rather than one that grew a
     branch. */
  Exclude<JoinerField, "personal-details">,
  { label: string; hint: string }
> = {
  "middle-name": {
    label: "Your middle name",
    hint: "As it's written on your passport or licence. If you haven't got one, put None.",
  },
  "date-of-birth": {
    label: "Your date of birth",
    hint: "Payroll needs this to match your ID exactly.",
  },
};

export function JoinerScreen({ view }: { view: JoinerView }) {
  const {
    firstName,
    company,
    workflowName,
    startsOn,
    steps,
    done,
    total,
    finished,
    allDone,
  } = view;

  const left = total - done;
  /* Whether there is anybody else in this plan at all. It decides one clause:
     promising that "the rest is taken care of" on a workflow that is nothing
     but their own three steps would be a comfort with nothing behind it. */
  const shared = steps.some((step) => step.actor !== "joiner");

  return (
    /* The product's own frame, with a nav holding two rows.

       This screen used to build its own shell: a bare `<main>`, a hand-made
       header with the lockup and the theme toggle in it, and a comment arguing
       that a nav would be "a navigation bar that navigates nowhere". That was
       true while `/me` was the only place a new starter could be. It stopped
       being true when Craig became a room of his own, and the honest fix was
       not a third bespoke layout but the shell every other screen already uses.

       No `account` prop, so no account cell — `AppShell`'s is wired to Settings
       and to a Sign out that clears the *admin's* cookie, and for a joiner both
       would be controls that look like they work and do nothing. The reasoning
       lives in `joiner-nav.tsx` with the nav it belongs to. */
    <AppShell
      title="Your tasks"
      navRail={<JoinerNavRail />}
      nav={
        <JoinerNav>
          {total > 0 && (
            <div className="flex flex-col gap-1 px-1">
              <NavStat label="Your part" value={`${done}/${total}`} />
            </div>
          )}
        </JoinerNav>
      }
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 py-10">
        <header className="flex flex-col gap-3 pt-4">
          <CraigMark className="size-9 text-accent" />
          <h1 className="text-3xl font-semibold tracking-[-0.02em]">
            Hello {firstName}.
          </h1>
          <p className="text-md leading-relaxed text-text-muted">
            Welcome to {company}. I&apos;m Craig, and I look after the boring
            half of starting somewhere new.{" "}
            {/* Silent when the plan is empty — the list below says so itself,
                and "it is all being taken care of" about a plan with nothing in
                it is a reassurance with nothing behind it. Silent again once
                they are finished, because the panel underneath carries that
                news and saying it twice reads as a screen that has lost track
                of what it has already told you. */}
            {steps.length === 0 || finished
              ? null
              : total === 0
                ? "There's nothing here for you to fill in — every part of this is being taken care of for you."
                : `There ${left === 1 ? "is one thing" : `are ${spell(left)} things`} I need from you${
                    startsOn ? ` before you start on ${startsOn}` : ""
                  }.${shared ? " The rest is being taken care of for you." : ""}`}
          </p>
        </header>

        {total > 0 && (
          <section className="flex flex-col gap-2" aria-label="Your progress">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">Your part</span>
              <span className="text-sm text-text-subtle">
                {done} of {total} done
              </span>
            </div>
            {/* Counts only their own steps, and says so in the label above it.
                A bar that folded in the company's half would move on a morning
                this person did nothing, which is a progress bar about somebody
                else wearing their name. */}
            <Progress value={done} max={total} label="Your part" />
          </section>
        )}

        {finished && (
          <Callout
            tone="success"
            icon={<DoneAll />}
            title={allDone ? "That's everything" : "That's everything from you"}
          >
            {/* The two sentences are not interchangeable, and the difference is
                the point. Their half being finished is theirs to be told about
                the moment it happens; the whole thing being finished is a
                different day, and claiming it early would have this screen
                congratulate them on a name tag nobody has made. Neither version
                speaks for the steps waiting on nobody — those are somebody
                else's problem and it would be a stretch to call them done. */}
            {allDone
              ? `Nothing is waiting on you, ${firstName}, and ${company} has finished their half too.${
                  startsOn ? ` See you on ${startsOn}.` : ""
                }`
              : `Nothing is waiting on you now, ${firstName}. ${company} is still working through their half — I'll email you if anything else comes up.${
                  startsOn ? ` See you on ${startsOn}.` : ""
                }`}
          </Callout>
        )}

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold tracking-[-0.01em]">
              {workflowName}
            </h2>
            <p className="text-sm text-text-muted">
              Everything {company} has planned for you, in the order it happens.
            </p>
          </div>

          {steps.length === 0 ? (
            <EmptyState
              icon={<Schedule />}
              title="Nothing in here yet"
              description={`${company} hasn't put anything in your plan so far. I'll email you the moment they do.`}
            />
          ) : (
            <ol className="flex flex-col">
              {steps.map((step, i) => (
                <PlanRow
                  key={step.id}
                  step={step}
                  company={company}
                  last={i === steps.length - 1}
                  finishing={left === 1}
                />
              ))}
            </ol>
          )}
        </section>

        {/* Only when there is something in it. An empty "Resources" heading on
            somebody's onboarding reads as a section that failed to load, or as
            a promise their employer has not kept — and this person cannot tell
            which, or do anything about either. Nothing is the honest state. */}
        {view.resources.length > 0 && (
          <section className="flex flex-col gap-4" aria-label="Resources">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold tracking-[-0.01em]">
                Things to read
              </h2>
              <p className="text-sm text-text-muted">
                {company} shared these with everyone joining.
              </p>
            </div>

            <ul className="flex flex-col gap-2">
              {view.resources.map((resource) => (
                <li key={resource.id}>
                  {/* A plain link to a route that checks, then redirects to a
                      URL good for a minute. Not an <a download>: the file may
                      be a PDF somebody wants to read rather than keep, and the
                      browser is better at deciding that than we are. */}
                  <a
                    href={`/api/joiner/documents/${resource.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-3 transition-colors hover:border-border-strong"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {resource.name}
                    </span>
                    <span className="shrink-0 text-2xs text-text-subtle">
                      {resource.kind} · {resource.size}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

          {/* The way out, and the only one there is. This person cannot raise a
              ticket, and nothing on this screen can correct a name somebody
              else typed — so the last line is a route back to a human rather
              than a legal notice about why they are receiving this. Craig
              beside it does not replace it: he can answer questions and change
              nothing — and he is a nav row away now rather than beside this,
              which makes the distinction easier to read rather than harder. */}
        <p className="text-xs leading-relaxed text-text-subtle">
          You&apos;re seeing this because {company} gave you a seat. If
          something here looks wrong, reply to the email that brought you — it
          reaches a person.
        </p>
      </div>
    </AppShell>
  );
}

/**
 * One row of the plan.
 *
 * The three states read differently on purpose, and the difference is the whole
 * honesty of the screen: a tick, a box to fill in, and a line saying somebody
 * else has this one. What a row must never do is look like a chore of theirs
 * that has gone unanswered, so the ones that are not theirs say whose they are
 * in words rather than leaving an empty circle to be read as a reproach.
 */
function PlanRow({
  step,
  company,
  last,
  finishing,
}: {
  step: PlanStep;
  company: string;
  last: boolean;
  /** Whether answering this one is the last thing they owe. */
  finishing: boolean;
}) {
  const done = !!step.doneOn;
  const current = !!step.field;
  const theirs = step.actor === "joiner";

  return (
    <li className="relative flex gap-3.5 pb-5 last:pb-0">
      {/* Runs from under one marker to the next, so the column reads as one
          sequence rather than five unrelated cards. */}
      {!last && (
        <span
          aria-hidden
          className={cn(
            "absolute left-[13px] top-7 w-px",
            "h-[calc(100%-1.75rem)]",
            done ? "bg-success/40" : "bg-border",
          )}
        />
      )}

      {/* Dashed only for the steps waiting on nobody. An automated one gets the
          solid ring every other real step gets, because something is genuinely
          happening on it — dashing it would file it with the work this showcase
          admits it doesn't do. */}
      <Marker done={done} current={current} dashed={!step.actor} />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h3
            className={cn(
              "text-base",
              current ? "font-semibold" : "font-medium",
              !theirs && !done && "text-text-muted",
            )}
          >
            {step.title}
          </h3>
          <StepBadge
            done={done}
            current={current}
            actor={step.actor}
            label={step.badge}
          />

          {/* Beside the title, quietly. A deadline on somebody's first week
              should read as information about the plan, not as pressure — so
              it sits at the end of the line in the same weight as everything
              else, and it disappears the moment the step is done. */}
          {step.dueOn && (
            <span className="shrink-0 text-2xs text-text-subtle">
              Due {step.dueOn}
            </span>
          )}
        </div>

        {/* Craig's steps carry their own line, finished or not, and it comes
            first because it is the only one written for the state the step is
            actually in. The branches below are about a step being done or being
            somebody's — neither of which is the question an automated step
            raises, which is what has come of it. */}
        {step.detail ? (
          <p className="text-sm text-text-muted">{step.detail}</p>
        ) : done ? (
          <p className="text-sm text-text-muted">
            {step.answer ? (
              <>
                <span className="font-medium text-text">{step.answer}</span>
                <span className="text-text-subtle"> · you sent this on </span>
                {step.doneOn}
              </>
            ) : (
              <>
                {company} sorted this on {step.doneOn}.
              </>
            )}
          </p>
        ) : step.actor === "admin" ? (
          /* Said in words next to the badge, not left to the styling. Somebody
             scanning a column of unticked circles reads them as a list of
             things they have not got round to; being told, plainly, that this
             one is somebody else's is what stops their own screen quietly
             blaming them for the company's half. */
          <p className="text-sm text-text-muted">
            {company} is doing this one. There&apos;s nothing here for you.
          </p>
        ) : !step.actor ? (
          <p className="text-sm text-text-muted">
            Part of your onboarding. Nobody&apos;s waiting on you for it.
          </p>
        ) : null}

        {/* The two forms are two components, not one with a branch in it. One
            is a box; the other is twelve boxes, a calendar, a select and a
            payload that gets encrypted before it is stored — and the day
            somebody adds a third kind of question, the alternative is a
            component with three modes and a union of state that only makes
            sense in one of them. */}
        {step.field === "personal-details" ? (
          <DetailsForm
            stepId={step.id}
            emergencyContact={Boolean(step.askEmergencyContact)}
            finishing={finishing}
          />
        ) : step.field ? (
          <AnswerForm
            stepId={step.id}
            field={step.field}
            company={company}
            finishing={finishing}
          />
        ) : null}
      </div>
    </li>
  );
}

/** The dot in the left rail. Dashed when nobody is doing the step, which is the
    one difference somebody scanning the column will read without being told. */
function Marker({
  done,
  current,
  dashed,
}: {
  done: boolean;
  current: boolean;
  dashed: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative z-10 mt-0.5 flex size-[27px] shrink-0 items-center justify-center rounded-full border bg-surface",
        done && "border-transparent bg-success-subtle text-success",
        !done && current && "border-accent bg-accent-subtle",
        !done && !current && !dashed && "border-border",
        !done && !current && dashed && "border-dashed border-border",
      )}
    >
      {done ? (
        <Check className="size-4" />
      ) : current ? (
        <span className="size-2 rounded-full bg-accent" />
      ) : null}
    </span>
  );
}

function StepBadge({
  done,
  current,
  actor,
  label,
}: {
  done: boolean;
  current: boolean;
  actor?: StepActor;
  /** An automated step's own wording. Ignored once the step is finished, where
      "Done" is the only thing worth saying and is the same for everybody. */
  label?: string;
}) {
  if (done) {
    return (
      <Badge tone="success" size="sm">
        Done
      </Badge>
    );
  }
  if (current) {
    return (
      <Badge tone="accent" size="sm">
        Now
      </Badge>
    );
  }
  if (label) {
    /* Accent, because the only time an automated step overrides its badge is
       the moment it has something for this person: an address that exists and a
       password sitting in their inbox. A neutral pill there would put the one
       actionable thing on the screen in the same grey as the six things that
       aren't. */
    return (
      <Badge tone="accent" size="sm">
        {label}
      </Badge>
    );
  }
  if (actor === "joiner") {
    return (
      <Badge tone="neutral" size="sm">
        Later
      </Badge>
    );
  }
  /* The kinds that are not theirs get a badge that says so without saying they
     are late. "Being handled" is the truth for the company's own steps and for
     Craig's — from where this person is sitting those are the same fact, and
     "an automated integration is provisioning your account" is a distinction
     that serves the product rather than the reader. The plainer one covers work
     neither side does from here. */
  return (
    <Badge tone="neutral" size="sm">
      {actor === "admin" || actor === "craig" ? "Being handled" : "On the plan"}
    </Badge>
  );
}

/**
 * The one box on the screen.
 *
 * Answering re-reads the page from the server rather than patching what is on
 * it. That costs a round trip and buys the thing worth having: one copy of the
 * truth. The store decides what was recorded and when, the next step follows
 * from it, and there is no second version of this person's progress living in
 * the browser to drift out of step with the first — which is exactly the bug
 * that a screen with a `steps` array in local state gets, the day a save half
 * fails.
 *
 * `isPending` from the transition covers the gap: the button stays busy from
 * the moment it is pressed until the new page has actually arrived, rather than
 * going quiet in the middle while the old, wrong list is still on screen.
 *
 * There is no local state to reset afterwards, because the form is not the same
 * component afterwards — it is rendered inside the step it belongs to, so the
 * answered step loses it and the next one grows its own, empty.
 */
function AnswerForm({
  stepId,
  field,
  company,
  finishing,
}: {
  stepId: string;
  field: Exclude<JoinerField, "personal-details">;
  company: string;
  finishing: boolean;
}) {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const [date, setDate] = React.useState<Date | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [reloading, startReload] = React.useTransition();

  const ask = ASK[field];
  const wantsDate = field === "date-of-birth";
  const value = wantsDate ? (date ? toISODate(date) : "") : text.trim();
  const busy = saving || reloading;

  /* Nobody has a birthday tomorrow. Held still for the life of the form so the
     calendar cannot shift underneath somebody who leaves the tab open. */
  const today = React.useMemo(() => new Date(), []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!value || busy) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /* The step and the answer. Who this is comes from the cookie on the
           server — an id in here would be a person anybody could name. */
        body: JSON.stringify({ stepId, value }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? "That didn't save. Try it once more.");
        setSaving(false);
        return;
      }

      /* Both in the same tick, so the button never flickers back to life for
         the frame between finishing the save and starting the reload. */
      setSaving(false);
      startReload(() => router.refresh());
    } catch {
      /* No response at all. Said carefully: the request may well have reached
         the server, so this must not imply the answer was lost. */
      setError(
        "I couldn't reach the server just then. Check your connection and have another go — pressing it twice is safe.",
      );
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="mt-2 flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-e1"
    >
      <Field label={ask.label} hint={ask.hint}>
        {wantsDate ? (
          <DatePicker
            value={date}
            onChange={setDate}
            max={today}
            placeholder="Pick the day"
            aria-invalid={error ? true : undefined}
          />
        ) : (
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoComplete="additional-name"
            aria-invalid={error ? true : undefined}
            disabled={busy}
          />
        )}
      </Field>

      {/* Form-level rather than pinned under the box. Some of what can come
          back is about the value and some of it is about the connection, and a
          message sitting under the input insists it is always the former. */}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button type="submit" loading={busy} disabled={!value}>
          {finishing ? "Save and finish" : "Save and carry on"}
        </Button>
        <span className="text-xs text-text-subtle">
          Only {company} sees this.
        </span>
      </div>
    </form>
  );
}

/**
 * The twelve-box one.
 *
 * **Why it is one form and not twelve steps.** The plan above is the order
 * things happen in, and turning "tell us who you are" into a dozen rows would
 * make somebody's first week look like a list of chores that are really one
 * act. It is also the shape of the answer: an address is one fact about a
 * person, not four, and a workflow that can be half-way through an address is a
 * workflow that can hold half an address. So the step keeps one answer and the
 * answer has parts — the argument in full is on `PersonalDetails` in the
 * contract.
 *
 * **The state is one record keyed by field id**, built from the same list the
 * server validates against, rather than a `useState` per box. Fourteen pieces
 * of state that have to stay in step with a list living somewhere else is
 * fourteen chances to add a field to the form and forget it in the payload;
 * one record cannot drift, because both ends read the same array.
 *
 * The date is the one exception and has to be, because the calendar hands back
 * a `Date` and the payload wants `YYYY-MM-DD` — the same conversion the
 * single-field form does, for the same reason.
 *
 * **It does not validate.** Whether a phone number is a phone number, whether
 * a postcode is four digits, whether a required box is empty: all of that is
 * decided on the server and comes back as one sentence, which is shown here. A
 * copy of the rules in the browser would be a second opinion about what a valid
 * answer is, and on the day the two disagree the browser's is both the wrong
 * one and the one the person is looking at. What this does do is keep the
 * button dark until every required box has something in it, which is a
 * courtesy rather than a rule — the server still checks.
 */
function DetailsForm({
  stepId,
  emergencyContact,
  finishing,
}: {
  stepId: string;
  /** Whether the plan they were sent asks for one. */
  emergencyContact: boolean;
  finishing: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState<
    Partial<Record<PersonalDetailKey, string>>
  >({});
  const [birthday, setBirthday] = React.useState<Date | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [reloading, startReload] = React.useTransition();

  const busy = saving || reloading;

  /* Nobody has a birthday tomorrow. Held still for the life of the form so the
     calendar cannot shift underneath somebody who leaves the tab open. */
  const today = React.useMemo(() => new Date(), []);

  /* The emergency contact's three fields are dropped from the list entirely
     rather than hidden. A hidden field is still a field: it is filled in by
     autofill, submitted by the form, and read by anything looking at the DOM.
     If the company did not ask, this person is not asked. */
  const fields = React.useMemo(
    () =>
      PERSONAL_DETAIL_FIELDS.filter(
        (field) => !field.emergency || emergencyContact,
      ),
    [emergencyContact],
  );

  const valueOf = (field: PersonalDetailField) =>
    field.kind === "date"
      ? birthday
        ? toISODate(birthday)
        : ""
      : (values[field.key] ?? "");

  const ready = fields.every((field) => !field.required || valueOf(field).trim());

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;

    setSaving(true);
    setError(null);

    /* Assembled from the field list rather than from the state object, so a
       value left over from a field that is no longer asked for cannot ride
       along in the payload. */
    const details: Record<string, string> = {};
    for (const field of fields) {
      const value = valueOf(field).trim();
      if (value) details[field.key] = value;
    }

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /* The step and the answer. Who this is comes from the cookie on the
           server — an id in here would be a person anybody could name. */
        body: JSON.stringify({ stepId, details }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? "That didn't save. Try it once more.");
        setSaving(false);
        return;
      }

      setSaving(false);
      startReload(() => router.refresh());
    } catch {
      /* No response at all. Said carefully: the request may well have reached
         the server, so this must not imply the answer was lost. */
      setError(
        "I couldn't reach the server just then. Check your connection and have another go — pressing it twice is safe.",
      );
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="mt-2 flex flex-col gap-5 rounded-lg border border-border bg-surface p-4 shadow-e1"
    >
      {PERSONAL_DETAIL_GROUPS.map((group) => {
        const inGroup = fields.filter((field) => field.group === group.id);
        if (inGroup.length === 0) return null;

        return (
          <fieldset key={group.id} className="flex flex-col gap-3">
            <legend className="text-sm font-medium">{group.label}</legend>

            {inGroup.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                hint={field.hint}
                required={field.required}
              >
                {field.kind === "date" ? (
                  <DatePicker
                    value={birthday}
                    onChange={setBirthday}
                    max={today}
                    placeholder="Pick the day"
                    aria-invalid={error ? true : undefined}
                  />
                ) : field.kind === "state" ? (
                  <Select
                    value={values[field.key] ?? ""}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                    autoComplete={field.autoComplete}
                    disabled={busy}
                  >
                    <option value="">Pick one</option>
                    {AU_STATES.map((state) => (
                      <option key={state.id} value={state.id}>
                        {state.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    value={values[field.key] ?? ""}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                    /* The browser's own type, so a phone gets a keypad and an
                       email gets the @ key. `inputMode` for the postcode
                       rather than `type="number"`, which draws spinners on a
                       thing nobody increments and treats a leading zero as
                       arithmetic — which is half of Australia. */
                    type={
                      field.kind === "email"
                        ? "email"
                        : field.kind === "phone"
                          ? "tel"
                          : "text"
                    }
                    inputMode={field.kind === "postcode" ? "numeric" : undefined}
                    maxLength={field.max}
                    autoComplete={field.autoComplete}
                    disabled={busy}
                  />
                )}
              </Field>
            ))}
          </fieldset>
        );
      })}

      {/* Form-level, and here it matters more than on the one-box form: the
          sentence that comes back names the field it is about, so pinning it
          under an input would attach it to whichever box happened to be
          last. */}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button type="submit" loading={busy} disabled={!ready}>
          {finishing ? "Save and finish" : "Save and carry on"}
        </Button>
        {/* Said where it is being asked for rather than in a policy nobody
            opens. This is the one form in the product that asks for the bundle
            people are most careful with, and naming what happens to it is
            worth more than "only your employer sees this". */}
        <span className="inline-flex items-center gap-1.5 text-xs text-text-subtle">
          <Lock className="size-3.5" />
          Encrypted the moment you send it.
        </span>
      </div>
    </form>
  );
}
