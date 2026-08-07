"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AppShell,
  Avatar,
  Badge,
  Button,
  EmptyState,
  List,
  ListIcon,
  ListItem,
  Progress,
  PromptBar,
  Separator,
  type AppNotification,
} from "@/components/ui";
import { PersonAdd, Warning } from "@/components/ui/icons";
import { ACCOUNT, COMPANY, NEW_HIRE, PEOPLE } from "@/lib/demo";
import {
  WORKFLOW,
  WORKFLOWS,
  stepCount,
  unconfiguredCount,
} from "@/lib/demo-workflow";
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
      actions={
        empty ? undefined : (
          <Button size="sm" onClick={() => setAdding(true)}>
            <PersonAdd />
            Add someone
          </Button>
        )
      }
    >
      {empty ? (
        <DraftSession onStart={() => setDrafting(true)} />
      ) : (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 py-10">
          {/* The ask stays prominent rather than being demoted to a corner.
              It's the thing that's useful on the days when there's nothing to
              report, which for a three-person company is most days. */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold tracking-[-0.02em]">
                {fresh ? `${COMPANY.name} is set up` : COMPANY.name}
              </h1>
              {/* The third step of setup, finished on the screen it leads to
                  rather than announced on the one before it. */}
              {fresh && (
                <p className="text-md text-text-muted">
                  Your workflow is written. Close the gaps below and you can put
                  somebody through it.
                </p>
              )}
            </div>
            <PromptBar
              placeholder="Ask Craig anything — a policy, a step, who's waiting on what…"
              onSubmit={() => {}}
              footnote="Craig knows your workflows, your people and whatever you've uploaded."
            />
          </div>

          <NeedsYou items={todo} />

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
  detail: string;
  href: string;
  urgent?: boolean;
}

/**
 * Derived, never typed in. Every row here is computed from the same data the
 * page it points at reads, so Home can't claim three unconfigured steps while
 * the builder shows two.
 */
function openItems(seats: Onboarding[], fresh: boolean): OpenItem[] {
  const items: OpenItem[] = [];

  for (const w of WORKFLOWS) {
    const gaps = unconfiguredCount(w.blocks);
    if (gaps > 0) {
      items.push({
        id: `gaps-${w.id}`,
        title: `${gaps} ${gaps === 1 ? "step needs" : "steps need"} setting up in ${w.name}`,
        detail: "Nothing can be assigned to it until they're done",
        href: `/builder/${w.id}`,
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

  items.push({
    id: "handbook",
    title: "The handbook hasn't been reviewed since Feb 2026",
    detail: fresh
      ? "It's the only thing the quiz has to draw questions from"
      : "It's what the pop quiz would read from",
    href: "/resources",
  });

  return items;
}

function NeedsYou({ items }: { items: OpenItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <SectionHead title="Needs you" />
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-base text-text-subtle">
          Nothing. Genuinely — everything that could be waiting on you isn&apos;t.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <SectionHead title="Needs you" count={items.length} />
      <List>
        {items.map((i) => (
          <ListItem
            key={i.id}
            href={i.href}
            leading={
              <ListIcon tone={i.urgent ? "accent" : "default"}>
                <Warning />
              </ListIcon>
            }
            title={i.title}
            description={i.detail}
          />
        ))}
      </List>
    </div>
  );
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
