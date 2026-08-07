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
  List,
  ListItem,
  Separator,
  type AppNotification,
} from "@/components/ui";
import { ACCOUNT, COMPANY, NEW_HIRE, PEOPLE } from "@/lib/demo";
import { WORKFLOW, stepCount } from "@/lib/demo-workflow";
import { gaps, useWorkflows } from "@/lib/workflow-store";
import { ACTIVITY_VERB, outstanding } from "@/lib/craig-activity";
import { MISSING_COUNT } from "@/lib/demo-resources";
import { useActivity } from "@/lib/activity-store";
import { AddSeat } from "@/components/add-seat";
import { DraftSession } from "@/components/draft-session";
import { type Onboarding } from "@/lib/onboarding";
import { type DemoWorkflow } from "@/lib/demo-workflow";
import { AdminNav, NavStat } from "@/components/app-nav";
import { CraigDock, useAskCraig, useHomeChat } from "@/components/home-chat";
import { Add, Description, PersonAdd } from "@/components/ui/icons";

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
    /* useSearchParams needs a boundary. The fallback is nothing, not a copy
       of the page: rendering a second whole Home meant the prerender shipped
       two of everything, and the client had to reconcile a tree it had
       already drawn against a different one. It didn't — the boundary never
       resolved and neither copy was ever interactive. */
    <React.Suspense fallback={null}>
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

  const workflows = useWorkflows();
  const chat = useHomeChat();
  const ask = useAskCraig(chat, workflows);

  /* Katalis has a draft, so Home is past its empty state from the first load.
     If that ever stops being true the hero comes back on its own. */
  const hasWorkflows = workflows.some((w) => stepCount(w.blocks) > 0);
  const empty = !hasWorkflows && seats.length === 0;

  const todo = openItems(workflows, seats, fresh);

  return (
    <AppShell
      title="Home"
      nav={<HomeNav seats={seats} open={todo.length} fresh={fresh} />}
      notifications={NOTIFICATIONS}
      account={ACCOUNT}
      /* The established state manages its own height so the composer can sit
         on the bottom edge. The empty state only needs it once the draft
         session takes the screen over. */
      fill={empty ? drafting : true}
      asideTitle="Katalis"
      aside={<HomeAside fresh={fresh} />}
    >
      {empty ? (
        <DraftSession onStart={() => setDrafting(true)} />
      ) : (
        /* A conversation, so it's shaped like one: the brief scrolls and the
           composer stays on the bottom edge. Asking Craig something shouldn't
           mean scrolling past his morning report to find the box. */
        <div className="mx-auto flex h-[calc(100vh-3rem)] w-full max-w-2xl flex-col">
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto py-10">
            {/* Craig speaks first. A dashboard renders state and waits; an
                agent tells you what it did, what it's stuck on, and what it
                needs from you. The counters still exist — in the panel, where
                a number belongs. */}
            <CraigBrief
              items={todo}
              fresh={fresh}
              onAddSeat={() => setAdding(true)}
            />
          </div>

          {/* The composer grows into the conversation rather than pushing it
              up the page. The brief above stays put and stays current — it's
              what's true now, not a message, and it shouldn't scroll away
              while she's using the thing that changes it. */}
          <div className="shrink-0 pb-6 pt-2">
            <CraigDock
              chat={chat}
              onSubmit={ask}
              placeholder="Ask Craig anything — a policy, a step, who's waiting on what…"
              footnote="Craig knows your workflows, your people and whatever you've uploaded."
            />
          </div>
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
  /** Where the button goes. Omitted for the one that opens a dialog. */
  href?: string;
  cta: string;
  /** Opens the add-seat dialog rather than navigating. */
  seat?: boolean;
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

function openItems(
  workflows: DemoWorkflow[],
  seats: Onboarding[],
  fresh: boolean,
): OpenItem[] {
  const items: OpenItem[] = [];

  /* One row per unconfigured step, not one per workflow. "3 steps need setting
     up" is a number you have to go and decode; "Configure Slack in Engineer —
     needs channels to add them to" is a thing you can finish. Each row links
     straight to its block, so clearing the list is three clicks rather than
     three hunts. */
  for (const { workflow, block, missing } of gaps(workflows)) {
    items.push({
      id: `${workflow.id}-${block.id}`,
      title: `Configure “${block.title}” in ${workflow.name}`,
      ask: askFor(block.title, missing),
      detail: `${workflow.name} · ${missing ?? "something is missing"}`,
      href: `/builder/${workflow.id}?step=${block.id}`,
      cta: "Answer",
    });
  }

  /* The last thing on the list, and the only one that isn't a gap. Everything
     above it is housekeeping in service of this — an admin who answers every
     question and never adds a seat has got nothing out of Craig at all. It
     stays on the list once somebody is running, because hiring the second
     person is the same job as hiring the first.

     Matched on his own seat, not on "any seat exists": onboarding someone else
     doesn't make Nils any less unstarted. */
  const nilsStarted = seats.some(
    (s) => s.email === NEW_HIRE.email || s.name === NEW_HIRE.name,
  );
  const unanswered = items.length;
  items.push({
    id: "seat",
    title: "Add a person",
    ask:
      !fresh && !nilsStarted
        ? `Shall I start ${NEW_HIRE.name.split(" ")[0]}? He's in ${NEW_HIRE.startsIn}.`
        : "Ready to put somebody through this?",
    detail:
      unanswered > 0
        ? `${WORKFLOW.name} can't run until ${unanswered === 1 ? "that is" : "those are"} answered`
        : `${WORKFLOW.name} is ready — the first email goes out immediately`,
    cta: "Add someone",
    seat: true,
  });

  return items;
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
  /* Live, not the fixture. What Craig did in the panel a minute ago is the
     top line here — which is the whole reason closing the panel is safe. */
  const activity = useActivity();

  return (
    <div className="flex flex-col gap-5">
      {/* First, because it's the answer to "what has this thing actually
          done". It was inside the brief, where it competed with the questions
          she has to answer; here it sits beside them and stays put while she
          works through them. */}
      {!fresh && (
        <>
          <div className="flex flex-col gap-2">
            <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
              What I&apos;ve done
            </p>
            <div className="flex flex-col gap-2">
              {activity.slice(0, 6).map((a) => (
                <div key={a.id} className="flex flex-col gap-0.5">
                  <span className="text-xs leading-relaxed text-text-muted">
                    <span className="text-text-subtle">
                      {ACTIVITY_VERB[a.kind]}
                    </span>{" "}
                    {a.what.replace(/^\w+ /, "")}
                  </span>
                  <span className="text-2xs text-text-subtle">{a.when}</span>
                </div>
              ))}
            </div>
          </div>

          <Separator />
        </>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          People
        </p>
        {/* Dense and undivided — a short summary in a 260px panel. The rules
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

      {/* No paragraph. The count is the point and the link is the action —
          a sentence explaining both was the panel talking to itself. */}
      <div className="flex flex-col gap-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          What Craig has
        </p>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="truncate text-text-muted">Katalis Handbook</span>
          <Badge tone="warning" size="sm">
            Feb 2026
          </Badge>
        </div>
        <Link
          href="/resources"
          className="text-xs text-accent underline-offset-4 hover:underline"
        >
          {MISSING_COUNT} more it needs, missing
        </Link>
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
function CraigBrief({
  items,
  fresh,
  onAddSeat,
}: {
  items: OpenItem[];
  fresh: boolean;
  onAddSeat: () => void;
}) {
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  const asks = items.filter((i) => !dismissed.has(i.id));
  const waiting = outstanding;

  return (
    <div className="flex flex-col gap-6">
      {/* No card. A card is a boundary, and there's nothing on this page for
          it to be a boundary against — it was one box holding the only thing
          on screen, which is just a border drawn around the page. */}
      <div className="flex flex-col gap-3">
        <CraigMark className="size-8 text-accent" />
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-[-0.02em]">
            Hey, {PEOPLE.ada.name.split(" ")[0]}
          </h1>
          <p className="text-md leading-relaxed text-text-muted">
            {fresh ? (
              <>
                {COMPANY.name} is set up and I&apos;ve written your first
                workflow. There {asks.length === 1 ? "is" : "are"} {asks.length}{" "}
                thing{asks.length === 1 ? "" : "s"} left, and only you can
                answer {asks.length === 1 ? "it" : "them"}.
              </>
            ) : (
              <>
                I&apos;ve handled what I can. {waiting.length}{" "}
                {waiting.length === 1 ? "thing is" : "things are"} with someone
                else and I&apos;m chasing {waiting.length === 1 ? "it" : "them"}
                .{asks.length === 0 ? " Nothing needs you." : ""}
              </>
            )}
          </p>
        </div>
      </div>

      {asks.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
            I need you for{" "}
            {asks.length === 1 ? "one thing" : `${asks.length} things`}
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
              {i.seat ? (
                <Button size="sm" variant="secondary" onClick={onAddSeat}>
                  {i.cta}
                </Button>
              ) : (
                <Link
                  href={i.href ?? "#"}
                  className={buttonVariants({
                    size: "sm",
                    variant: "secondary",
                  })}
                >
                  {i.cta}
                </Link>
              )}
              <button
                type="button"
                onClick={() => setDismissed((prev) => new Set(prev).add(i.id))}
                className="rounded-md px-2 py-1 text-xs text-text-subtle transition-colors hover:bg-surface-hover hover:text-text"
              >
                Not now
              </button>
            </div>
          ))}
        </div>
      )}

      {/* The three nouns Craig works on. Not navigation — the nav is
          permanently on the left and already has Workflows, People and
          Resources. These are "start one", which is a different verb and the
          only one that isn't already one click away. */}
      <div className="flex flex-wrap gap-2">
        <QuickAdd
          icon={<PersonAdd />}
          label="Add a person"
          onClick={onAddSeat}
        />
        <QuickAdd icon={<Add />} label="New workflow" href="/builder/blank" />
        <QuickAdd
          icon={<Description />}
          label="Add a document"
          href="/resources"
        />
      </div>
    </div>
  );
}

function QuickAdd({
  icon,
  label,
  href,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
}) {
  const className =
    "inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-hover hover:text-text [&_svg]:size-3.5 [&_svg]:text-text-subtle";

  return href ? (
    <Link href={href} className={className}>
      {icon}
      {label}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {icon}
      {label}
    </button>
  );
}
