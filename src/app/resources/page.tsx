"use client";

import * as React from "react";
import {
  AppShell,
  Badge,
  Button,
  CraigMark,
  PromptBar,
  Separator,
  type AppNotification,
} from "@/components/ui";
import { Add, Description, Warning } from "@/components/ui/icons";
import { ACCOUNT } from "@/lib/demo";
import { AdminNav, NavStat } from "@/components/app-nav";

/**
 * Everything the workflows draw on, in one place.
 *
 * The honest version of this page for a three-person company is mostly gaps,
 * and it's written that way. A resources page that only lists the files that
 * happen to exist tells Ada nothing; the useful part is that four things her
 * workflow points at aren't documents at all — they're Jason.
 *
 * Anything marked missing here has a matching unconfigured step in the
 * builder. That's deliberate: the two views should never disagree about what
 * Katalis actually has written down.
 */

const NOTIFICATIONS: AppNotification[] = [
  {
    id: "r1",
    kind: "overdue",
    title: "The handbook hasn't been reviewed since Feb 2026",
    description: "Two workflow steps point at it",
    timestamp: new Date(Date.now() - 90 * 60_000),
  },
];

type ResourceState = "current" | "stale" | "missing";

const STATE: Record<
  ResourceState,
  { label: string; tone: "success" | "warning" | "danger" }
> = {
  current: { label: "Current", tone: "success" },
  stale: { label: "Out of date", tone: "warning" },
  missing: { label: "Doesn't exist", tone: "danger" },
};

interface Resource {
  name: string;
  meta: string;
  state: ResourceState;
  /** How many workflow steps depend on it. */
  usedBy?: number;
}

const LIBRARY: { category: string; items: Resource[] }[] = [
  {
    category: "Onboarding",
    items: [
      {
        name: "Katalis Handbook",
        meta: "PDF · uploaded by Ada · last updated Feb 2026",
        state: "stale",
        usedBy: 2,
      },
      {
        name: "First-week checklist",
        meta: "Four bullets, inside the handbook — not its own doc",
        state: "stale",
      },
    ],
  },
  {
    category: "Legal and payroll",
    items: [
      {
        name: "Employment contract",
        meta: "Template · one per hire",
        state: "current",
        usedBy: 1,
      },
      {
        name: "Payroll and tax details",
        meta: "Form · collected per hire",
        state: "current",
        usedBy: 1,
      },
      {
        name: "Right to work",
        meta: "Not collected anywhere yet",
        state: "missing",
      },
    ],
  },
  {
    category: "Engineering",
    items: [
      {
        name: "What's live and what's fallback",
        meta: "Only in Jason's head",
        state: "missing",
        usedBy: 1,
      },
      {
        name: "Slack channel list",
        meta: "Nobody has written this down",
        state: "missing",
        usedBy: 1,
      },
      {
        name: "Access and key ownership",
        meta: "Jason, entirely",
        state: "missing",
      },
    ],
  },
  {
    category: "Policies",
    items: [
      {
        name: "Security policy",
        meta: "None yet",
        state: "missing",
      },
    ],
  },
];

const ALL = LIBRARY.flatMap((g) => g.items);
const MISSING = ALL.filter((r) => r.state === "missing").length;
const STALE = ALL.filter((r) => r.state === "stale").length;

export default function ResourcesPage() {
  return (
    <AppShell
      title="Resources"
      nav={<ResourcesNav />}
      notifications={NOTIFICATIONS}
      account={ACCOUNT}
      actions={
        <Button size="sm" variant="secondary">
          <Add />
          Upload
        </Button>
      }
    >
      <div className="mx-auto w-full max-w-2xl py-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <CraigMark className="size-10 text-accent" />
          <h1 className="text-3xl font-semibold tracking-[-0.02em]">
            Ask Craig
          </h1>
        </div>

        <div className="pt-6">
          <PromptBar
            placeholder="Ask about a policy, a document, anything you've uploaded…"
            onSubmit={() => {}}
            footnote="Craig only knows what's below. Anything marked as missing, he can't answer on."
          />
        </div>

        <div className="flex items-center justify-between gap-3 pb-3 pt-12">
          <h2 className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
            Documents
          </h2>
          <span className="text-xs text-text-subtle">
            {ALL.length} tracked · {MISSING} don&apos;t exist
          </span>
        </div>

        <div className="flex flex-col gap-7">
          {LIBRARY.map((group) => (
            <section key={group.category} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <h3 className="text-base font-medium">{group.category}</h3>
                <span className="text-xs text-text-subtle">
                  {group.items.length}
                </span>
              </div>

              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
                {group.items.map((r) => (
                  <ResourceRow key={r.name} resource={r} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function ResourceRow({ resource: r }: { resource: Resource }) {
  const state = STATE[r.state];
  const missing = r.state === "missing";

  return (
    <li className="flex items-start gap-3 px-3.5 py-3">
      <span
        aria-hidden
        className={
          missing
            ? "flex size-8 shrink-0 items-center justify-center rounded-lg border border-dashed border-border-strong text-text-subtle"
            : "flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-text-subtle"
        }
      >
        {missing ? (
          <Warning className="size-4" />
        ) : (
          <Description className="size-4" />
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              missing
                ? "text-base text-text-muted"
                : "text-base font-medium text-text"
            }
          >
            {r.name}
          </span>
          <Badge tone={state.tone} size="sm">
            {state.label}
          </Badge>
        </div>
        <span className="text-sm text-text-subtle">{r.meta}</span>
      </div>

      {r.usedBy !== undefined && (
        <span className="shrink-0 whitespace-nowrap pt-0.5 text-2xs text-text-subtle">
          {r.usedBy} {r.usedBy === 1 ? "step" : "steps"} use this
        </span>
      )}
    </li>
  );
}

function ResourcesNav() {
  return (
    <AdminNav>
      <div className="flex flex-col gap-2 px-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Library
        </p>
        <NavStat label="Tracked" value={ALL.length} />
        <NavStat label="Out of date" value={STALE} tone="warning" />
        <NavStat label="Missing" value={MISSING} tone="warning" />
      </div>

      <Separator />

      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        Missing here means a workflow step points at something nobody has
        written down.
      </p>
    </AdminNav>
  );
}
