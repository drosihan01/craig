"use client";

import Link from "next/link";
import {
  AppShell,
  Badge,
  EmptyState,
  List,
  ListIcon,
  ListItem,
  Separator,
  buttonVariants,
} from "@/components/ui";
import { AltRoute, AutoAwesome, Warning } from "@/components/ui/icons";
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
 * There's no "new workflow" button. Craig writes them, out of a conversation
 * about how the company actually works, and a button that dropped somebody
 * onto a blank canvas would be offering the version of this product that
 * doesn't work.
 */

export function WorkflowList({ user }: { user: Session }) {
  const { workflows } = useShowcase();

  const ready = workflows.filter(
    (w) => stepCount(w.blocks) > 0 && unconfiguredCount(w.blocks) === 0,
  ).length;

  return (
    <AppShell
      title="Workflows"
      account={{ name: user.name, email: user.email }}
      nav={<ListNav total={workflows.length} ready={ready} />}
    >
      <div className="mx-auto w-full max-w-3xl py-10">
        <header className="mb-6 flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">
            Workflows
          </h1>
          <p className="text-md text-text-muted">
            One workflow per kind of hire. Open one to change its steps, answer
            what Craig left open, or publish it.
          </p>
        </header>

        {workflows.length === 0 ? (
          <EmptyState
            icon={<AltRoute />}
            title="Nothing here yet"
            description="Craig writes the first one out of a conversation about your company — what you sell, who does what, and who's arriving."
            action={
              <Link
                href="/showcase/welcome"
                className={buttonVariants({ size: "sm" })}
              >
                <AutoAwesome />
                Talk to Craig
              </Link>
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
