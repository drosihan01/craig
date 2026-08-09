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
import { Add, AltRoute, Warning } from "@/components/ui/icons";
import { ACCOUNT } from "@/lib/demo";
import {
  BLANK_WORKFLOW,
  stepCount,
  unconfiguredCount,
} from "@/lib/demo-workflow";
import { useWorkflows } from "@/lib/workflow-store";
import { AdminNav, NavStat } from "@/components/app-nav";

/**
 * Pick a workflow, then build it.
 *
 * Katalis has three: the one Craig drafted from the handbook, a short one for
 * trying the product out, and an empty one. That's the honest state of a
 * three-person company — padding it with samples would make the product look
 * busier and the customer look further along than they are.
 */

const NOTIFICATIONS: AppNotification[] = [
  {
    id: "w1",
    kind: "assigned",
    title: "Two steps still need configuring",
    description:
      "The Katalis employee workflow can't be assigned until they are",
    timestamp: new Date(Date.now() - 4 * 60_000),
  },
];

export default function WorkflowsPage() {
  const workflows = useWorkflows();
  /* Built ones only. The empty one isn't a workflow yet, it's the button. */
  const built = workflows.filter((w) => stepCount(w.blocks) > 0);
  const ready = built.filter((w) => unconfiguredCount(w.blocks) === 0).length;

  return (
    <AppShell
      title="Workflows"
      nav={<WorkflowsNav total={built.length} ready={ready} />}
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
            One workflow per kind of hire. Open one to change its steps or their
            order.
          </p>
        </header>

        <List>
          {built.map((w) => {
            const count = stepCount(w.blocks);
            const gaps = unconfiguredCount(w.blocks);
            /* Two states. "Ready" is the one that matters — it's the
               difference between a workflow you can assign to someone and one
               that only looks finished. */
            const state =
              gaps > 0
                ? { label: "Draft", tone: "warning" as const }
                : { label: "Ready", tone: "success" as const };

            return (
              <ListItem
                key={w.id}
                href={`/builder/${w.id}`}
                leading={
                  <ListIcon tone="accent">
                    <AltRoute />
                  </ListIcon>
                }
                /* One badge in the title, not two. A second one wraps to its
                   own line the moment the column narrows and then reads as a
                   stray element floating above the description. The count is a
                   count, so it goes in the meta slot on the right, which is
                   shrink-0 and never wraps. */
                title={
                  <span className="flex items-center gap-2">
                    <span className="truncate">{w.name}</span>
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
                  w.forWho
                    ? `${count} steps · drafted for ${w.forWho}, starts in ${w.startsIn}`
                    : `${count} steps · ${w.role}`
                }
                footnote={`${w.createdBy} · ${w.updated}`}
              />
            );
          })}

          {/* The last row is the empty workflow, which isn't a workflow — it's
              the way to make one. Listing it as "Untitled workflow, Empty, 0
              steps" put a thing you have to interpret where a button belongs,
              and left the count of workflows one higher than the number of
              workflows anybody had. */}
          <ListItem
            href={`/builder/${BLANK_WORKFLOW.id}`}
            leading={
              /* Dashed tile — the same signal the canvas uses for a block
                 that isn't configured yet. */
              <ListIcon tone="muted">
                <Add />
              </ListIcon>
            }
            title="Create a workflow"
            description="Opens the builder with a trigger and nothing else."
          />
        </List>
      </div>
    </AppShell>
  );
}

function WorkflowsNav({ total, ready }: { total: number; ready: number }) {
  return (
    <AdminNav>
      <div className="flex flex-col gap-2 px-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Workflows
        </p>
        <NavStat label="Total" value={total} />
        <NavStat
          label="Ready to assign"
          value={ready}
          tone={ready === 0 ? "warning" : "neutral"}
        />
      </div>

      <Separator />

      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        A workflow is ready once every step has what it needs. Until then it
        cannot be assigned.
      </p>
    </AdminNav>
  );
}
