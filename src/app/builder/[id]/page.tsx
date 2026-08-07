"use client";

import * as React from "react";
import {
  AppShell,
  Badge,
  BlockInspector,
  BlockSetup,
  Button,
  Field,
  Input,
  Separator,
  Textarea,
  WorkflowBuilder,
  WorkflowCanvas,
  type AppNotification,
  type WorkflowBlock,
} from "@/components/ui";
import { ChevronLeft } from "@/components/ui/icons";
import { useParams, useSearchParams } from "next/navigation";
import { ACCOUNT, PEOPLE } from "@/lib/demo";
import { stepCount, unconfiguredCount } from "@/lib/demo-workflow";
import { setBlocks as commitBlocks, useWorkflow } from "@/lib/workflow-store";
import { blockFromPreset, type BlockPreset } from "@/lib/workflow/library";
import { AdminNav, NavStat } from "@/components/app-nav";
import {
  WorkflowAssistant,
  useCraigPanel,
} from "@/components/workflow-assistant";

/* Drafted from Ada's handbook, then built out of the block library. Each
   account is its own step — separate admin panels that fail independently,
   rather than one "access" step that's either done or isn't.

   The gaps it surfaces — which right-to-work check applies in Germany, which
   Slack channels a new engineer needs — are the point. Craig's job is to make
   the undocumented parts visible, not to invent process a three-person company
   doesn't want. */
const NOTIFICATIONS: AppNotification[] = [
  {
    id: "n1",
    kind: "assigned",
    title: "Jason owns six of the twelve steps",
    description: "Every account and the 1:1",
    timestamp: new Date(Date.now() - 4 * 60_000),
    actor: PEOPLE.jason.name,
  },
  {
    id: "n2",
    kind: "overdue",
    title: "The handbook hasn\u2019t been reviewed since Feb 2026",
    description: "Two steps reference it",
    timestamp: new Date(Date.now() - 90 * 60_000),
  },
  {
    id: "n3",
    kind: "complete",
    title: "GitHub access confirmed",
    timestamp: new Date(Date.now() - 5 * 3_600_000),
    actor: PEOPLE.jason.name,
    read: true,
  },
];

/* Everyone a step can be assigned to. "The new hire" is on the list because
   most steps are theirs. */
const ASSIGNEES = [
  PEOPLE.ada.name,
  PEOPLE.jason.name,
  PEOPLE.matty.name,
  "The new hire",
];

let seq = 0;
const nextId = () => `b${Date.now()}-${seq++}`;

export default function BuilderPage() {
  return (
    /* Nothing, not a second copy of the builder — see Home. */
    <React.Suspense fallback={null}>
      <BuilderWithParams />
    </React.Suspense>
  );
}

function BuilderWithParams() {
  /* ?step= is how Home's worklist links to a specific block. Landing on the
     canvas and hunting for the one that needs you is the difference between a
     list you clear and a list you look at. */
  const step = useSearchParams().get("step");
  return <Builder step={step} />;
}

function Builder({ step }: { step: string | null }) {
  const params = useParams<{ id: string }>();
  const workflow = useWorkflow(params.id);

  /* Straight from the store rather than copied into local state. The builder
     used to hold its own copy, which meant an edit here never reached Home and
     an answer Craig took on Home never reached here. */
  const blocks = workflow.blocks;
  const setBlocks = React.useCallback(
    (next: WorkflowBlock[] | ((prev: WorkflowBlock[]) => WorkflowBlock[])) =>
      commitBlocks(
        workflow.id,
        typeof next === "function" ? next(workflow.blocks) : next,
      ),
    [workflow.id, workflow.blocks],
  );
  /* Opens on the workflow rather than on a block — landing inside one step's
     settings before you've seen the shape of the thing is backwards — unless
     something linked here asking for a specific one. */
  const [selectedId, setSelectedId] = React.useState<string | null>(step);
  const chat = useCraigPanel(workflow.blocks);

  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  function insert(preset: BlockPreset, index: number) {
    const block = blockFromPreset(preset, nextId());
    setBlocks((prev) => [...prev.slice(0, index), block, ...prev.slice(index)]);
    setSelectedId(block.id);
  }

  function remove(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }

  function duplicate(id: string) {
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      if (i === -1) return prev;
      const copy = {
        ...prev[i],
        id: nextId(),
        title: `${prev[i].title} (copy)`,
      };
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
  }

  function move(id: string, direction: -1 | 1) {
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      const j = i + direction;
      // Index 0 is the trigger and is not a valid destination.
      if (i < 1 || j < 1 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function patch(id: string, changes: Partial<WorkflowBlock>) {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...changes } : b)),
    );
  }

  const steps = stepCount(blocks);
  const unconfigured = unconfiguredCount(blocks);

  return (
    <AppShell
      title={workflow.name}
      nav={<BuilderNav steps={steps} unconfigured={unconfigured} />}
      aside={
        /* One thing at a time, and no heading over it. With nothing selected
           the panel is just Craig — he's the reason to look right, and the
           workflow's own numbers are already in the left column. Select a
           block and it becomes that block's fields. */
        selected ? (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="-ml-1 flex w-fit items-center gap-1 rounded-md px-1 py-0.5 text-xs text-text-subtle transition-colors hover:bg-surface-hover hover:text-text"
            >
              <ChevronLeft className="size-3.5" />
              Back to Craig
            </button>

            <BlockInspector block={selected}>
              {/* The trigger has nothing to edit. It's the same block in every
                  workflow and it fires on one event — offering a title field
                  for it would imply otherwise. */}
              {selected.kind === "trigger" ? (
                <p className="text-sm leading-relaxed text-text-subtle">
                  No configuration. This step is identical in every workflow.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  <Separator />
                  <Field label="Title">
                    <Input
                      value={selected.title}
                      onChange={(e) =>
                        patch(selected.id, { title: e.target.value })
                      }
                    />
                  </Field>

                  <Field label="Summary" hint="Shown on the block">
                    <Textarea
                      rows={2}
                      value={selected.summary ?? ""}
                      onChange={(e) =>
                        patch(selected.id, { summary: e.target.value })
                      }
                    />
                  </Field>

                  {/* What this particular block needs before it can run. The
                    fields come from the preset, so a GitHub block asks for an
                    org and a permission level and a contract block asks for a
                    document and a countersigner. */}
                  {selected.preset && (
                    <>
                      <Separator />
                      <BlockSetup
                        block={selected}
                        people={ASSIGNEES}
                        onChange={(fieldId, value) =>
                          patch(selected.id, {
                            config: { ...selected.config, [fieldId]: value },
                          })
                        }
                      />
                    </>
                  )}

                  {selected.incomplete && (
                    <>
                      <Separator />
                      <Field
                        label="Flagged"
                        hint="Left open rather than guessed at"
                      >
                        <div className="flex flex-col gap-2">
                          <p className="text-sm text-text-muted">
                            {selected.incomplete}
                          </p>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="w-fit"
                            onClick={() =>
                              patch(selected.id, { incomplete: undefined })
                            }
                          >
                            Resolved
                          </Button>
                        </div>
                      </Field>
                    </>
                  )}
                </div>
              )}
            </BlockInspector>
          </div>
        ) : (
          <WorkflowAssistant
            blocks={blocks}
            chat={chat}
            onPatch={patch}
            onInsert={(b) => setBlocks((prev) => [...prev, b])}
            onSelect={setSelectedId}
          />
        )
      }
      notifications={NOTIFICATIONS}
      account={ACCOUNT}
      fill
      actions={
        <>
          <Badge tone="warning" size="sm">
            Draft
          </Badge>
          {/* A trigger on its own is valid but pointless, so an empty workflow
              is unpublishable for a different reason to an unconfigured one. */}
          <Button size="sm" disabled={unconfigured > 0 || steps === 0}>
            Publish
          </Button>
        </>
      }
    >
      {/* Full bleed. The canvas is the page — a title and a paragraph above it
          would be repeating the header and stealing the space the work needs.
          The negative margins cancel the content column's padding. */}
      <div className="-mx-4 h-[calc(100vh-3rem)] lg:-mx-8">
        <WorkflowCanvas
          className="h-full rounded-none border-0"
          onBackgroundClick={() => setSelectedId(null)}
        >
          <div className="px-10 py-12">
            <WorkflowBuilder
              blocks={blocks}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onInsert={insert}
              onRemove={remove}
              onDuplicate={duplicate}
              onMove={move}
            />
          </div>
        </WorkflowCanvas>
      </div>
    </AppShell>
  );
}

function BuilderNav({
  steps,
  unconfigured,
}: {
  steps: number;
  unconfigured: number;
}) {
  return (
    <AdminNav>
      <div className="flex flex-col gap-2 px-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          This workflow
        </p>
        <NavStat label="Steps" value={steps} />
        <NavStat
          label="Unconfigured"
          value={unconfigured}
          tone={unconfigured > 0 ? "warning" : "neutral"}
        />
      </div>

      <Separator />

      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        A workflow cannot be published while any step is unconfigured.
      </p>
    </AdminNav>
  );
}
