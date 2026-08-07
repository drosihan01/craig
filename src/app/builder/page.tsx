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
import { Add, Code, Warning } from "@/components/ui/icons";
import { ACCOUNT } from "@/lib/demo";
import {
  BLANK_WORKFLOW,
  WORKFLOWS,
  stepCount,
  unconfiguredCount,
} from "@/lib/demo-workflow";
import { AdminNav, NavStat } from "@/components/app-nav";

/**
 * Pick a workflow, then build it.
 *
 * Katalis has two: the Engineer draft Craig wrote from the handbook, and an
 * empty one. That's the honest state of a three-person company that started
 * last week — padding it with sample workflows would make the product look
 * busier and the customer look further along than they are.
 */

const NOTIFICATIONS: AppNotification[] = [
  {
    id: "w1",
    kind: "approval",
    title: "Jason needs to sign off on prod access",
    description: "Last step of the engineer workflow",
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

            return (
              <ListItem
                key={w.id}
                href={`/builder/${w.id}`}
                leading={
                  /* Dashed tile for the empty one — the same signal the canvas
                     uses for a block that isn't configured yet. */
                  <ListIcon tone={empty ? "muted" : "accent"}>
                    {empty ? <Add /> : <Code />}
                  </ListIcon>
                }
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={empty ? "text-text-muted" : undefined}>
                      {w.name}
                    </span>
                    <Badge tone={empty ? "neutral" : "warning"} size="sm">
                      {empty ? "Empty" : "Draft"}
                    </Badge>
                    {gaps > 0 && (
                      <Badge tone="warning" size="sm">
                        <Warning />
                        {gaps} unconfigured
                      </Badge>
                    )}
                  </span>
                }
                description={
                  empty
                    ? "Nothing but a trigger. Build it from the block library."
                    : `${count} steps · drafted for ${w.forWho}, starts in ${w.startsIn}`
                }
                footnote={`${w.createdBy} · ${w.updated}`}
              />
            );
          })}
        </List>

        <p className="pt-3 text-xs leading-relaxed text-text-subtle">
          Add a workflow when you hire for a different kind of role — a
          contractor or a first GTM person needs a different shape to an
          engineer.
        </p>
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
        <NavStat label="Drafts" value={WORKFLOWS.length} />
        <NavStat label="Live" value={0} />
      </div>

      <Separator />

      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        Nothing runs until a workflow is published, and none are yet.
      </p>
    </AdminNav>
  );
}
