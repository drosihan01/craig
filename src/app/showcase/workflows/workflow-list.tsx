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
} from "@/components/ui";
import { ShowcaseNav } from "@/components/showcase/showcase-nav";
import { NewWorkflowDialog } from "@/components/showcase/new-workflow";
import { Add, AltRoute, Warning } from "@/components/ui/icons";
import { NavStat } from "@/components/app-nav";
import type { Session } from "@/lib/showcase/contract";
import {
  stepCount,
  unconfiguredCount,
  useShowcase,
  type ShowcaseWorkflow,
} from "@/lib/showcase/store";

/**
 * Everything the account has, which for a long while is one thing or nothing.
 *
 * Deliberately not a dashboard. A new account has a single workflow at most,
 * and a page built for twenty would spend its whole first week apologising for
 * being empty — so the empty state is the design and the list is what happens
 * to it, rather than the other way round.
 *
 * The "new workflow" button doesn't make one. It asks how, and the asking is
 * the point: Craig writing these out of a conversation about how the company
 * actually works is still the version of this product that works, so he is the
 * first thing in the dialog and blank is the deliberate second choice. What the
 * dialog fixes is the other half of it — somebody who already knows exactly
 * what they want shouldn't have to be interviewed to get a canvas, and having
 * no button at all made that person's shortest route through the product a
 * conversation they didn't need.
 */

export function WorkflowList({ user }: { user: Session }) {
  const { workflows } = useShowcase();
  const [choosing, setChoosing] = React.useState(false);

  const ready = workflows.filter(
    (w) => stepCount(w.blocks) > 0 && unconfiguredCount(w.blocks) === 0,
  ).length;

  return (
    <AppShell
      title="Workflows"
      account={{ name: user.name, email: user.email }}
      nav={
        <ShowcaseNav>
          <ListNav total={workflows.length} ready={ready} />
        </ShowcaseNav>
      }
    >
      <div className="mx-auto w-full max-w-3xl py-10">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">
              Workflows
            </h1>
            <p className="text-md text-text-muted">
              One workflow per kind of hire. Open one to change its steps,
              answer what Craig left open, or publish it.
            </p>
          </div>

          {/* Kept in the header on every state of this page, including the
              empty one. It's the same button in both places rather than one
              that appears once there's a list — a control that moves as the
              page fills up is one you have to find again. */}
          <Button
            size="sm"
            onClick={() => setChoosing(true)}
            className="shrink-0"
          >
            <Add />
            New workflow
          </Button>
        </header>

        {workflows.length === 0 ? (
          <EmptyState
            icon={<AltRoute />}
            title="Nothing here yet"
            description="Craig writes the first one out of a conversation about your company — what you sell, who does what, and who's arriving."
            /* Opens the same dialog as the header rather than going straight
               to Craig. The description still says he writes the first one and
               the dialog still recommends him — but an empty account is exactly
               where somebody arrives having already decided, and sending the
               only button on the screen into a conversation was how they found
               out there was another way afterwards. */
            action={
              <Button size="sm" onClick={() => setChoosing(true)}>
                <Add />
                New workflow
              </Button>
            }
          />
        ) : (
          <List>
            {workflows.map((w) => (
              <WorkflowRow key={w.id} workflow={w} />
            ))}
          </List>
        )}
      </div>

      {/* One dialog for both buttons. Two would be two pieces of state that
          can disagree, and the copy inside it would be free to drift into two
          different accounts of what the choice is. */}
      <NewWorkflowDialog open={choosing} onClose={() => setChoosing(false)} />
    </AppShell>
  );
}

function WorkflowRow({ workflow }: { workflow: ShowcaseWorkflow }) {
  const steps = stepCount(workflow.blocks);
  const open = unconfiguredCount(workflow.blocks);

  /* Three states, and the middle one is the one worth having. "Ready" is the
     difference between a workflow you could publish and one that only looks
     finished, and it's a distinction a step count alone can't make. */
  const state = workflow.published
    ? { label: "Published", tone: "success" as const }
    : open > 0
      ? { label: "Draft", tone: "warning" as const }
      : { label: "Ready", tone: "accent" as const };

  return (
    <ListItem
      href={`/showcase/workflows/${workflow.id}`}
      leading={
        <ListIcon tone="accent">
          <AltRoute />
        </ListIcon>
      }
      title={
        <span className="flex items-center gap-2">
          <span className="truncate">{workflow.name}</span>
          <Badge tone={state.tone} size="sm" className="shrink-0">
            {state.label}
          </Badge>
        </span>
      }
      description={`${steps} ${steps === 1 ? "step" : "steps"}`}
      /* Only says who wrote it when somebody did. A workflow with no author on
         it is one this account made itself, and "drafted by undefined" is how
         you find that out late. */
      footnote={
        workflow.draftedBy ? `Drafted by ${workflow.draftedBy}` : undefined
      }
      meta={
        open > 0 ? (
          <Badge tone="warning" size="sm">
            <Warning />
            {open} unconfigured
          </Badge>
        ) : undefined
      }
    />
  );
}

function ListNav({ total, ready }: { total: number; ready: number }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 px-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Workflows
        </p>
        <NavStat label="Total" value={total} />
        <NavStat
          label="Ready to publish"
          value={ready}
          tone={total > 0 && ready === 0 ? "warning" : "neutral"}
        />
      </div>

      <Separator />

      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        A workflow is ready once every step has what it needs. Until then Craig
        can&apos;t run it for anybody.
      </p>
    </div>
  );
}
