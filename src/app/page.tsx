"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AppShell,
  Avatar,
  Badge,
  Button,
  buttonVariants,
  CraigMark,
  EmptyState,
  List,
  ListItem,
  Progress,
  PromptBar,
  Separator,
  isUnconfigured,
  setupWarning,
  type AppNotification,
} from "@/components/ui";
import { PersonAdd } from "@/components/ui/icons";
import { ACCOUNT, COMPANY, NEW_HIRE, PEOPLE } from "@/lib/demo";
import { WORKFLOW, WORKFLOWS, stepCount } from "@/lib/demo-workflow";
import { ACTIVITY, ACTIVITY_VERB, outstanding } from "@/lib/craig-activity";
import { AddSeat, SeatState } from "@/components/add-seat";
import { DraftSession } from "@/components/draft-session";
import { type Onboarding } from "@/lib/onboarding";
import { AdminNav, NavStat } from "@/components/app-nav";

/**
 * The admin's home.
 *
 * Two states, and which one you get depends on whether the account has
 * anything in it yet.
 *
 * Empty: the hero and the prompt, because with nothing built there is exactly
 * one useful thing to do and it's describe the company. That was previously
 * the *permanent* state of this page, which meant the largest text on screen
 * was a question with a permanent answer — a home screen optimised for the
 * least frequent visit anyone makes to it.
 *
 * Otherwise: the loop. Add someone, and a workflow runs against them. Building
 * a workflow is the means; an admin who never adds a seat has got nothing out
 * of Craig at all. Under that, what needs them — derived from the same data
 * the other pages read, so it can't disagree with them — and who's currently
 * onboarding.
 *
 * The nav is already permanently on the left, so this page deliberately isn't
 * a launcher. Status is the better wayfinding: every row points at one
 * specific thing that needs Ada rather than at a section.
 */

const NOTIFICATIONS: AppNotification[] = [
  {
    id: "h1",
    kind: "assigned",
    title: `${NEW_HIRE.name} starts in ${NEW_HIRE.startsIn}`,
    description: "Nothing is running for him yet",
    timestamp: new Date(Date.now() - 3 * 60_000),
  },
];

export default function AdminHomePage() {
  return (
    /* useSearchParams needs a boundary; the fallback is the same page in its
       established state, which is the correct thing to show if the param never
       resolves. */
    <React.Suspense fallback={<Home fresh={false} />}>
      <HomeWithParams />
    </React.Suspense>
  );
}

function HomeWithParams() {
  /* ?fresh=1 is how the setup flow arrives. An account that is ninety seconds
     old shouldn't be shown a stale handbook, a hire who already has a seat, or
     colleagues who haven't been invited — that's somebody else's Katalis. */
  const fresh = useSearchParams().get("fresh") === "1";
  return <Home fresh={fresh} />;
}

function Home({ fresh }: { fresh: boolean }) {
  const [seats, setSeats] = React.useState<Onboarding[]>([]);
  const [adding, setAdding] = React.useState(false);
  /* Local to this page: it only decides whether the hero collapses. */
  const [drafting, setDrafting] = React.useState(false);

  /* Katalis has a draft, so Home is past its empty state from the first load.
     If that ever stops being true the hero comes back on its own. */
  const hasWorkflows = WORKFLOWS.some((w) => stepCount(w.blocks) > 0);
  const empty = !hasWorkflows && seats.length === 0;

  const todo = openItems(seats, fresh);

  return (
    <AppShell
      title="Home"
      nav={<HomeNav seats={seats} open={todo.length} fresh={fresh} />}
      notifications={NOTIFICATIONS}
      account={ACCOUNT}
      fill={empty && drafting}
      asideTitle="Katalis"
      aside={<HomeAside fresh={fresh} />}
    >
      {empty ? (
        <DraftSession onStart={() => setDrafting(true)} />
      ) : (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 py-10">
          {/* Craig speaks first. A dashboard renders state and waits; an
              agent tells you what it did, what it's stuck on, and what it
              needs from you. The counters still exist — in the panel, where a
              number belongs. */}
          <CraigBrief items={todo} fresh={fresh} />

          <div className="flex flex-col gap-3">
            <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
              Ask me anything
            </p>
            <PromptBar
              placeholder="Ask Craig anything — a policy, a step, who's waiting on what…"
              onSubmit={() => {}}
              footnote="Craig knows your workflows, your people and whatever you've uploaded."
            />
          </div>

          <Onboardings seats={seats} onAdd={() => setAdding(true)} />
        </div>
      )}

      <AddSeat
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={(seat) => setSeats((prev) => [...prev, seat])}
      />
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  What needs you                                                            */
/* -------------------------------------------------------------------------- */

interface OpenItem {
  id: string;
  title: string;
  /** The same thing phrased as Craig asking, rather than as a chore. */
  ask?: string;
  detail: string;
  href: string;
  urgent?: boolean;
}

/**
 * Derived, never typed in. Every row here is computed from the same data the
 * page it points at reads, so Home can't claim three unconfigured steps while
 * the builder shows two.
 */
/* Craig asking, in his own words. "Configure Slack" is a task assigned to
   somebody; "which Slack channels does a new engineer need?" is a question
   only Ada can answer, which is the actual situation. */
function askFor(step: string, missing: string | null) {
  const m = (missing ?? "").toLowerCase();
  if (m.includes("channel"))
    return "Which Slack channels does a new engineer actually need?";
  if (m.includes("check"))
    return "Which right-to-work check applies to somebody employed in Germany?";
  return `What should I use for “${step}”?`;
}

function openItems(seats: Onboarding[], fresh: boolean): OpenItem[] {
  const items: OpenItem[] = [];

  /* One row per unconfigured step, not one per workflow. "3 steps need setting
     up" is a number you have to go and decode; "Configure Slack in Engineer —
     needs channels to add them to" is a thing you can finish. Each row links
     straight to its block, so clearing the list is three clicks rather than
     three hunts. */
  for (const w of WORKFLOWS) {
    for (const b of w.blocks) {
      if (!isUnconfigured(b)) continue;
      items.push({
        id: `${w.id}-${b.id}`,
        title: `Configure “${b.title}” in ${w.name}`,
        ask: askFor(b.title, setupWarning(b)),
        detail: `${w.name} · ${setupWarning(b) ?? "something is missing"}`,
        href: `/builder/${w.id}?step=${b.id}`,
        urgent: true,
      });
    }
  }

  /* Matched on his own seat, not on "any seat exists" — onboarding someone
     else doesn't make Nils any less unstarted. Skipped entirely on a fresh
     account: Craig has heard about Nils, he doesn't have a seat yet. */
  const nilsStarted = seats.some(
    (s) => s.email === NEW_HIRE.email || s.name === NEW_HIRE.name,
  );
  if (!fresh && !nilsStarted) {
    items.push({
      id: "nils",
      title: `${NEW_HIRE.name} starts in ${NEW_HIRE.startsIn}`,
      detail: "He has a seat but no workflow running against it",
      href: "/people",
      urgent: true,
    });
  }

  return items;
}

/* -------------------------------------------------------------------------- */
/*  Onboarding now                                                            */
/* -------------------------------------------------------------------------- */

function Onboardings({
  seats,
  onAdd,
}: {
  seats: Onboarding[];
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SectionHead title="Onboarding now" count={seats.length || undefined} />

      {seats.length === 0 ? (
        <EmptyState
          className="border-dashed"
          icon={<PersonAdd />}
          title="Nobody yet"
          description="Add someone and Craig takes it from there — the first email goes out immediately, and the rest run in order."
          action={
            <Button size="sm" onClick={onAdd}>
              Add someone
            </Button>
          }
        />
      ) : (
        <List>
          {seats.map((s) => {
            const w = WORKFLOWS.find((x) => x.id === s.workflowId);
            const total = w ? stepCount(w.blocks) : 0;
            return (
              <ListItem
                key={s.id}
                href="/people"
                leading={<Avatar name={s.name} size="md" />}
                title={
                  <span className="flex items-center gap-2">
                    <span className="truncate">{s.name}</span>
                    <SeatState state={s.state} />
                  </span>
                }
                description={`${s.role} · starts ${s.startsIn} · ${w?.name ?? "no workflow"}`}
                meta={
                  <span className="flex w-24 flex-col items-end gap-1">
                    <span>
                      {s.done} of {total}
                    </span>
                    <Progress
                      value={s.done}
                      max={total || 1}
                      label={`${s.name} progress`}
                      className="w-full"
                    />
                  </span>
                }
              />
            );
          })}
        </List>
      )}
    </div>
  );
}

function SectionHead({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
        {title}
      </h2>
      {count !== undefined && (
        <span className="text-xs text-text-subtle">{count}</span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Panels                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What Craig knows about Katalis, and what he doesn't.
 *
 * The gaps are listed as prominently as the facts. They're the reason his
 * answers are worth anything, and a panel that only showed what's on file
 * would flatter a company with three people and a stale handbook.
 */
function HomeAside({ fresh }: { fresh: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Company
        </p>
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-text">{COMPANY.name}</span>
          <span className="leading-relaxed text-text-muted">
            {COMPANY.pitch}
          </span>
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          People
        </p>
        {/* Dense and undivided — a four-row summary in a 260px panel. The rules
            and the gutter are what make a list read as a surface, and this
            isn't one; it's the roster, sitting next to the work. */}
        <List dense divided={false} bordered={false}>
          {Object.values(PEOPLE).map((p) => (
            <ListItem
              key={p.email}
              leading={<Avatar name={p.name} size="xs" />}
              title={
                <span className="font-normal text-text-muted">{p.name}</span>
              }
              /* On a fresh account they're people Ada mentioned, not people
                 with accounts. Saying so is the difference between a roster
                 and a guess. */
              meta={fresh && p.email !== ACCOUNT.email ? "Not invited" : p.role}
            />
          ))}
          {!fresh && (
            <ListItem
              leading={<Avatar name={NEW_HIRE.name} size="xs" />}
              title={
                <span className="font-normal text-text-muted">
                  {NEW_HIRE.name}
                </span>
              }
              trailing={
                <Badge tone="warning" size="sm">
                  In {NEW_HIRE.startsIn}
                </Badge>
              }
            />
          )}
        </List>
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          What Craig has
        </p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">Katalis Handbook</span>
          <Badge tone="warning" size="sm">
            Feb 2026
          </Badge>
        </div>
        <p className="text-xs leading-relaxed text-text-subtle">
          {fresh
            ? "It's the only thing you've given me. Five other things the workflow needs aren't written down anywhere. "
            : "Five other things the workflow needs aren't written down anywhere. "}
          <Link
            href="/resources"
            className="text-accent underline-offset-4 hover:underline"
          >
            Resources
          </Link>
        </p>
      </div>
    </div>
  );
}

function HomeNav({
  seats,
  open,
  fresh,
}: {
  seats: Onboarding[];
  open: number;
  fresh: boolean;
}) {
  return (
    <AdminNav>
      <div className="flex flex-col gap-2 px-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Right now
        </p>
        <NavStat label="Onboarding" value={seats.length} />
        <NavStat
          label="Needs you"
          value={open}
          tone={open > 0 ? "warning" : "neutral"}
        />
        <NavStat label="Published" value={0} />
      </div>

      <Separator />

      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        {fresh
          ? `${WORKFLOW.name} is written but not finished. Close the gaps and you can put somebody through it.`
          : `${WORKFLOW.name} is still a draft, so nothing is running against anyone yet.`}
      </p>
    </AdminNav>
  );
}

/**
 * Craig's report, and the only thing at the top of Home.
 *
 * This is the screen that most decided whether Craig read as an agent or as a
 * tracker, and it used to be counters and a list of chores. A dashboard puts
 * state on screen and waits for you to interpret it; an agent tells you what
 * it did, what it's waiting on, and what it needs — and only the last of those
 * is your problem.
 *
 * Three parts, in the order Ada cares about them: what he's already handled,
 * what he's stuck on and chasing, and what only she can answer.
 */
function CraigBrief({ items, fresh }: { items: OpenItem[]; fresh: boolean }) {
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  const asks = items.filter((i) => !dismissed.has(i.id));
  const waiting = outstanding;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex items-start gap-3">
        <CraigMark className="mt-0.5 size-6 shrink-0 text-accent" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-md font-semibold tracking-[-0.01em]">
            {fresh
              ? `Right — ${COMPANY.name} is set up.`
              : `Morning. Here's where ${NEW_HIRE.name.split(" ")[0]} is up to.`}
          </p>
          <p className="text-sm leading-relaxed text-text-muted">
            {fresh ? (
              <>
                I&apos;ve written your first workflow. There{" "}
                {asks.length === 1 ? "is" : "are"} {asks.length} thing
                {asks.length === 1 ? "" : "s"} only you can answer, and then you
                can put somebody through it.
              </>
            ) : (
              <>
                I&apos;ve handled what I can. {waiting.length}{" "}
                {waiting.length === 1 ? "thing is" : "things are"} with someone
                else and I&apos;m chasing {waiting.length === 1 ? "it" : "them"}
                . {asks.length === 0 ? "Nothing needs you." : ""}
              </>
            )}
          </p>
        </div>
      </div>

      {/* What he did on his own. Small, because it's reassurance rather than
          work — but present, because it's the proof he does anything. */}
      {!fresh && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          {ACTIVITY.slice(0, 3).map((a) => (
            <div key={a.id} className="flex items-baseline gap-2 text-xs">
              <span className="shrink-0 text-text-subtle">
                {ACTIVITY_VERB[a.kind]}
              </span>
              <span className="min-w-0 flex-1 text-text-muted">
                {a.what.replace(/^\w+ /, "")}
              </span>
              <span className="shrink-0 text-2xs text-text-subtle">
                {a.when}
              </span>
            </div>
          ))}
        </div>
      )}

      {asks.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
            I need you for {asks.length === 1 ? "one thing" : `${asks.length} things`}
          </p>

          {/* One row per question, phrased as him asking rather than as a
              chore assigned to her. Dismissing is allowed — an agent that
              can't be told "not now" is a nag. */}
          {asks.map((i) => (
            <div
              key={i.id}
              className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-sunken px-3 py-2.5"
            >
              <span className="min-w-0 flex-1 text-base">
                {i.ask ?? i.title}
                <span className="block text-xs text-text-subtle">
                  {i.detail}
                </span>
              </span>
              <Link
                href={i.href}
                className={buttonVariants({ size: "sm", variant: "secondary" })}
              >
                Answer
              </Link>
              <button
                type="button"
                onClick={() =>
                  setDismissed((prev) => new Set(prev).add(i.id))
                }
                className="rounded-md px-2 py-1 text-xs text-text-subtle transition-colors hover:bg-surface-hover hover:text-text"
              >
                Not now
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
