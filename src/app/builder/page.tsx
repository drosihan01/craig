"use client";

import * as React from "react";
import {
  AppShell,
  Badge,
  Button,
  EmptyState,
  List,
  ListIcon,
  ListItem,
  Separator,
  type AppNotification,
} from "@/components/ui";
import { Add, Code, Warning } from "@/components/ui/icons";
import { ACCOUNT } from "@/lib/demo";
import {
  WORKFLOW,
  stepCount,
  unconfiguredCount,
} from "@/lib/demo-workflow";
import { AdminNav, NavStat } from "@/components/app-nav";

/**
 * Pick a workflow, then build it.
 *
 * Katalis has exactly one, which makes this page look thin — and that's the
 * honest state of a three-person company that started last week. Padding it
 * with sample workflows would make the product look busier and the customer
 * look further along than they are.
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

const steps = stepCount([...WORKFLOW.blocks]);
const unconfigured = unconfiguredCount([...WORKFLOW.blocks]);

export default function WorkflowsPage() {
  return (
    <AppShell
      title="Workflows"
      nav={<WorkflowsNav />}
      notifications={NOTIFICATIONS}
      account={ACCOUNT}
      actions={
        <Button size="sm" variant="secondary">
          <Add />
          New workflow
        </Button>
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

        <div className="flex flex-col gap-3">
          <List>
            <ListItem
              href={`/builder/${WORKFLOW.id}`}
              leading={
                <ListIcon tone="accent">
                  <Code />
                </ListIcon>
              }
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {WORKFLOW.name}
                  <Badge tone="warning" size="sm">
                    Draft
                  </Badge>
                  {unconfigured > 0 && (
                    <Badge tone="warning" size="sm">
                      <Warning />
                      {unconfigured} unconfigured
                    </Badge>
                  )}
                </span>
              }
              description={`${steps} steps · drafted for ${WORKFLOW.forWho}, starts in ${WORKFLOW.startsIn}`}
              footnote={`${WORKFLOW.createdBy} · ${WORKFLOW.updated}`}
            />
          </List>

          {/* Only one workflow exists, so the second slot says what a second one
              would be for rather than sitting empty. */}
          <EmptyState
            className="border-dashed"
            icon={<Add />}
            title="No other workflows yet"
            description="Add one when you hire for a different kind of role — a contractor or a first GTM person needs a different shape to an engineer."
            action={
              <Button size="sm" variant="secondary">
                New workflow
              </Button>
            }
          />
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
        <NavStat label="Drafts" value={1} />
        <NavStat label="Live" value={0} />
      </div>

      <Separator />

      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        Nothing runs until a workflow is published, and none are yet.
      </p>
    </AdminNav>
  );
}
