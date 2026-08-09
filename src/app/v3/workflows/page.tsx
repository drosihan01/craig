"use client";

import Link from "next/link";
import {
  AppShell,
  Badge,
  List,
  ListIcon,
  ListItem,
  Separator,
} from "@/components/ui";
import { Add, AltRoute } from "@/components/ui/icons";
import { V3_ACCOUNT } from "@/lib/v3/company";
import { V3_WORKFLOW } from "@/lib/v3/workflow";
import { openBlocks, useV3 } from "@/lib/v3/store";
import { V3Nav } from "@/components/v3/v3-nav";

/**
 * Calder has one workflow, and saying so is more honest than padding it.
 *
 * The demo never comes here — the director goes straight to the canvas — but
 * the nav links to it, and a nav item that 404s is worse than a page with one
 * row on it.
 */
export default function V3WorkflowsPage() {
  const { blocks, published } = useV3();
  const open = openBlocks(blocks);

  const state = published
    ? { label: "Published", tone: "success" as const }
    : open.length > 0
      ? { label: "Draft", tone: "warning" as const }
      : { label: "Ready", tone: "neutral" as const };

  return (
    <AppShell title="Workflows" account={V3_ACCOUNT} nav={<V3Nav />}>
      <div className="mx-auto w-full max-w-3xl py-10">
        <header className="mb-6 flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">
            Workflows
          </h1>
          <p className="text-md text-text-muted">
            One per kind of hire. Open one to change its steps or their order.
          </p>
        </header>

        <List>
          <ListItem
            href="/v3/workflows/qsa"
            leading={
              <ListIcon tone="accent">
                <AltRoute />
              </ListIcon>
            }
            title={
              <span className="flex items-center gap-2">
                <span className="truncate">{V3_WORKFLOW.name}</span>
                <Badge tone={state.tone} size="sm" className="shrink-0">
                  {state.label}
                </Badge>
              </span>
            }
            meta={
              open.length > 0 ? (
                <Badge tone="warning" size="sm">
                  {open.length} unanswered
                </Badge>
              ) : undefined
            }
            description={`${blocks.length - 1} steps · ${V3_WORKFLOW.role}`}
            footnote={`${V3_WORKFLOW.createdBy} · ${V3_WORKFLOW.updated}`}
          />

          <ListItem
            href="/v3/setup"
            leading={
              <ListIcon tone="muted">
                <Add />
              </ListIcon>
            }
            title="Create a workflow"
            description="Tell Craig who you're hiring and hand him whatever you've already written."
          />
        </List>

        <Separator className="my-8" />

        <p className="text-xs leading-relaxed text-text-subtle">
          Add another when a role needs a different shape. A field applications
          specialist who is never in the lab doesn&apos;t need a police check,
          and{" "}
          <Link
            href="/v3/workflows/qsa"
            className="text-accent underline-offset-4 hover:underline"
          >
            this one
          </Link>{" "}
          would make them wait 15 business days for it.
        </p>
      </div>
    </AppShell>
  );
}
