"use client";

import * as React from "react";
import Link from "next/link";
import {
  AppShell,
  Badge,
  List,
  ListIcon,
  ListItem,
  Separator,
  buttonVariants,
  type AppNotification,
} from "@/components/ui";
import { Add, AltRoute, AutoAwesome, Warning } from "@/components/ui/icons";
import { ACCOUNT } from "@/lib/demo";
import {
  BLANK_WORKFLOW,
  WORKFLOWS,
  stepCount,
  unconfiguredCount,
} from "@/lib/demo-workflow";
import { AdminNav, NavStat } from "@/components/app-nav";
import { cn } from "@/lib/cn";

/**
 * Pick a workflow, then build it.
 *
 * Katalis has two: the Engineer draft Craig wrote from the handbook, and an
 * empty one. That's the honest state of a three-person company that started
 * last week — padding it with sample workflows would make the product look
 * busier and the customer look further along than they are.
 */

/* Derived, so the counter can't claim something the list contradicts. */
const READY = WORKFLOWS.filter(
  (w) => stepCount(w.blocks) > 0 && unconfiguredCount(w.blocks) === 0,
).length;

const NOTIFICATIONS: AppNotification[] = [
  {
    id: "w1",
    kind: "assigned",
    title: "Jason owns six of the twelve steps",
    description: "Every account and the 1:1",
    timestamp: new Date(Date.now() - 4 * 60_000),
    actor: "Jason Cho",
  },
];

export default function WorkflowsPage() {
  return (
    <AppShell
      title="Workflows"
      nav={<WorkflowsNav />}
      notifications={NOTIFICATIONS}
      account={ACCOUNT}
      actions={
        <Link
          href={`/builder/${BLANK_WORKFLOW.id}`}
          className={buttonVariants({ size: "sm", variant: "secondary" })}
        >
          <Add />
          New workflow
        </Link>
      }
    >
      <div className="mx-auto w-full max-w-3xl py-10">
        <header className="mb-6 flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">
            Workflows
          </h1>
          <p className="text-md text-text-muted">
            One per kind of hire. Open one to change what happens and in what
            order.
          </p>
        </header>

        <List>
          {WORKFLOWS.map((w) => {
            const count = stepCount(w.blocks);
            const gaps = unconfiguredCount(w.blocks);
            const empty = count === 0;
            /* Three states, not two. "Ready" is the one that matters — it's
               the difference between a workflow you can assign to someone and
               one that only looks finished. */
            const state = empty
              ? { label: "Empty", tone: "neutral" as const }
              : gaps > 0
                ? { label: "Draft", tone: "warning" as const }
                : { label: "Ready", tone: "success" as const };

            return (
              <ListItem
                key={w.id}
                href={`/builder/${w.id}`}
                leading={
                  /* Dashed tile for the empty one — the same signal the canvas
                     uses for a block that isn't configured yet. */
                  <ListIcon tone={empty ? "muted" : "accent"}>
                    {empty ? <Add /> : <AltRoute />}
                  </ListIcon>
                }
                /* One badge in the title, not two. A second one wraps to its
                   own line the moment the column narrows and then reads as a
                   stray element floating above the description. The count is a
                   count, so it goes in the meta slot on the right, which is
                   shrink-0 and never wraps. */
                title={
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "truncate",
                        empty && "text-text-muted",
                      )}
                    >
                      {w.name}
                    </span>
                    <Badge tone={state.tone} size="sm" className="shrink-0">
                      {state.label}
                    </Badge>
                  </span>
                }
                meta={
                  gaps > 0 ? (
                    <Badge tone="warning" size="sm">
                      <Warning />
                      {gaps} unconfigured
                    </Badge>
                  ) : undefined
                }
                /* Only says who it's drafted for when it actually was. A
                   reusable template isn't for anyone in particular, and
                   "drafted for undefined" is how you find that out late. */
                description={
                  empty
                    ? "Nothing but a trigger. Build it from the block library."
                    : w.forWho
                      ? `${count} steps · drafted for ${w.forWho}, starts in ${w.startsIn}`
                      : `${count} steps · ${w.role}`
                }
                footnote={`${w.createdBy} · ${w.updated}`}
              />
            );
          })}
        </List>

        {/* Three ways in, stated rather than hidden behind one button. The
            middle one is the good one and it used to be the whole of Home. */}
        <div className="flex flex-col gap-2 pt-8">
          <h2 className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
            Start another
          </h2>
          <List>
            <ListItem
              href="/builder/new"
              leading={
                <ListIcon tone="accent">
                  <AutoAwesome />
                </ListIcon>
              }
              title="Describe it to Craig"
              description="Tell him who you're hiring and what they'll need. He drafts it, you edit it."
            />
            <ListItem
              href={`/builder/${BLANK_WORKFLOW.id}`}
              leading={
                <ListIcon tone="muted">
                  <Add />
                </ListIcon>
              }
              title="Start blank"
              description="A trigger and nothing else. Build it from the block library."
            />
          </List>
          <p className="pt-1 text-xs leading-relaxed text-text-subtle">
            Add one when you hire for a different kind of role — a contractor
            or a first GTM person needs a different shape to an engineer.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

function WorkflowsNav() {
  return (
    <AdminNav>
      <div className="flex flex-col gap-2 px-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Workflows
        </p>
        <NavStat label="Total" value={WORKFLOWS.length} />
        <NavStat
          label="Ready to assign"
          value={READY}
          tone={READY === 0 ? "warning" : "neutral"}
        />
      </div>

      <Separator />

      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        A workflow is ready when every step has what it needs. Until then it
        can&apos;t be assigned to anyone.
      </p>
    </AdminNav>
  );
}
