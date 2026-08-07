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
  List,
  ListItem,
  Separator,
  TestRun,
  isUnconfigured,
  setupWarning,
  Textarea,
  WorkflowBuilder,
  WorkflowCanvas,
  type AppNotification,
  type WorkflowBlock,
} from "@/components/ui";
import { AutoAwesome, ChevronLeft, PlayArrow } from "@/components/ui/icons";
import { useParams, useSearchParams } from "next/navigation";
import { ACCOUNT, NEW_HIRE, PEOPLE } from "@/lib/demo";
import {
  findWorkflow,
  stepCount,
  unconfiguredCount,
  type DemoWorkflow,
} from "@/lib/demo-workflow";
import { blockFromPreset, type BlockPreset } from "@/lib/workflow/library";
import { AdminNav, NavStat } from "@/components/app-nav";

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
    /* useSearchParams needs a boundary. The fallback is the same page with
       nothing selected, which is the correct thing to show if ?step never
       resolves. */
    <React.Suspense fallback={<Builder step={null} />}>
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
  const workflow = findWorkflow(params.id);

  const [blocks, setBlocks] = React.useState<WorkflowBlock[]>(workflow.blocks);
  /* Opens on the workflow rather than on a block — landing inside one step's
     settings before you've seen the shape of the thing is backwards — unless
     something linked here asking for a specific one. */
  const [selectedId, setSelectedId] = React.useState<string | null>(step);
  const [testing, setTesting] = React.useState(false);

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
      const copy = { ...prev[i], id: nextId(), title: `${prev[i].title} (copy)` };
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
      title="Workflows"
      nav={<BuilderNav steps={steps} unconfigured={unconfigured} />}
      /* The panel shows one thing at a time. Nothing selected and it's about
         the workflow; a block selected and it's about that block and nothing
         else. Showing both at once means the settings you want are always
         under something you don't. */
      asideTitle={selected ? "Step" : "Workflow"}
      aside={
        selected ? (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="-ml-1 flex w-fit items-center gap-1 rounded-md px-1 py-0.5 text-xs text-text-subtle transition-colors hover:bg-surface-hover hover:text-text"
            >
              <ChevronLeft className="size-3.5" />
              {workflow.name}
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
          <WorkflowDetail
            workflow={workflow}
            blocks={blocks}
            steps={steps}
            unconfigured={unconfigured}
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
          <Button size="sm" variant="ghost">
            <AutoAwesome />
            Ask Craig
          </Button>
          {/* Sits before Publish deliberately. The order on screen is the
              order you should do them in, and testing a draft you can't
              publish yet is the whole point of having a test. */}
          <Button
            size="sm"
            variant="ghost"
            disabled={steps === 0}
            onClick={() => setTesting(true)}
          >
            <PlayArrow />
            Test run
          </Button>
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

      <TestRun
        open={testing}
        onClose={() => setTesting(false)}
        workflowName={workflow.name}
        blocks={blocks}
        candidates={[NEW_HIRE.name, "Someone new", PEOPLE.matty.name]}
        defaultCandidate={workflow.forWho ?? NEW_HIRE.name}
      />
    </AppShell>
  );
}

/**
 * The workflow itself, shown when nothing is selected.
 *
 * The useful thing here isn't the name — it's the list of what's still open.
 * Nine tidy steps and three unresolved ones is the actual state of the draft,
 * and each row jumps to the block, so the panel is a worklist rather than a
 * summary you read and then have to go hunting from.
 */
function WorkflowDetail({
  workflow,
  blocks,
  steps,
  unconfigured,
  onSelect,
}: {
  workflow: DemoWorkflow;
  blocks: WorkflowBlock[];
  steps: number;
  unconfigured: number;
  onSelect: (id: string) => void;
}) {
  const open = blocks.filter(isUnconfigured);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-medium">{workflow.name}</span>
          <Badge tone="warning" size="sm">
            Draft
          </Badge>
        </div>
        <p className="text-sm leading-relaxed text-text-muted">
          {steps === 0
            ? "No steps yet. Add one from the line under the trigger."
            : workflow.forWho
              ? `For ${workflow.forWho}, starting in ${workflow.startsIn}.`
              : "Not assigned to anyone yet."}
        </p>
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        <DetailRow label="Trigger" value="A new seat is added" />
        <DetailRow label="Steps" value={String(steps)} />
        <DetailRow
          label="Unconfigured"
          value={String(unconfigured)}
          tone={unconfigured > 0 ? "warning" : undefined}
        />
        <DetailRow label="Created by" value={workflow.createdBy} />
        <DetailRow label="Updated" value={workflow.updated} />
      </div>

      {open.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-col gap-2">
            <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
              Still open
            </p>
            <List dense divided={false} bordered={false}>
              {open.map((b) => (
                <ListItem
                  key={b.id}
                  onClick={() => onSelect(b.id)}
                  title={
                    <span className="font-normal text-text-muted">
                      {b.title}
                    </span>
                  }
                  description={setupWarning(b)}
                />
              ))}
            </List>
          </div>
        </>
      )}

      <Separator />

      <p className="text-xs leading-relaxed text-text-subtle">
        Select a step to configure it. Click the canvas to return here.
      </p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="shrink-0 text-text-subtle">{label}</span>
      {/* Wraps rather than truncates — "Craig, from your handbook" is the
          answer to how this draft got here, and half of it is no answer. */}
      <span
        className={
          tone === "warning"
            ? "text-right text-warning"
            : "text-right text-text-muted"
        }
      >
        {value}
      </span>
    </div>
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
