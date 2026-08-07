"use client";

import * as React from "react";
import {
  AppShell,
  BackLink,
  Badge,
  BlockInspector,
  Button,
  Field,
  Input,
  SelectMenu,
  Separator,
  Textarea,
  WorkflowBuilder,
  WorkflowCanvas,
  CanvasPanel,
  type BlockKind,
  type WorkflowBlock,
} from "@/components/ui";
import { BLOCK_TYPES } from "@/components/ui/workflow-builder";
import { AutoAwesome } from "@/components/ui/icons";

const INITIAL: WorkflowBlock[] = [
  {
    id: "t",
    kind: "trigger",
    title: "A new starter is added",
    summary: "Role is Retail team member · VIC",
  },
  {
    id: "b1",
    kind: "document",
    title: "Collect payroll details and right to work",
    summary: "Due 5 days before start date",
    owner: "People & Culture",
  },
  {
    id: "b2",
    kind: "task",
    title: "Order laptop and store login",
    summary: "Due 3 days before start date",
    owner: "IT service desk",
  },
  {
    id: "b3",
    kind: "approval",
    title: "Hiring manager confirms readiness",
    summary: "Blocks day one until signed off",
    owner: "Hiring manager",
  },
  {
    id: "b4",
    kind: "delay",
    title: "Wait until start date",
    summary: "Resumes 9:00am on day one",
  },
  {
    id: "b5",
    kind: "notify",
    title: "Send the welcome email",
    owner: "People & Culture",
    incomplete: "No template chosen",
  },
];

let seq = 0;
const nextId = () => `b${Date.now()}-${seq++}`;

export default function BuilderPage() {
  const [blocks, setBlocks] = React.useState<WorkflowBlock[]>(INITIAL);
  const [selectedId, setSelectedId] = React.useState<string | null>("b2");

  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  function insert(kind: BlockKind, index: number) {
    const type = BLOCK_TYPES[kind];
    const block: WorkflowBlock = {
      id: nextId(),
      kind,
      title: `New ${type.label.toLowerCase()}`,
      incomplete: "Not configured",
    };
    setBlocks((prev) => [
      ...prev.slice(0, index),
      block,
      ...prev.slice(index),
    ]);
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

  const steps = blocks.length - 1;
  const unconfigured = blocks.filter((b) => b.incomplete).length;

  return (
    <AppShell
      title="Retail team member — VIC"
      nav={<BuilderNav steps={steps} unconfigured={unconfigured} />}
      asideTitle="Block"
      aside={
        <BlockInspector block={selected}>
          {selected && (
            <div className="flex flex-col gap-4">
              <Separator />
              <Field label="Title">
                <Input
                  value={selected.title}
                  onChange={(e) => patch(selected.id, { title: e.target.value })}
                />
              </Field>

              {selected.kind !== "trigger" && (
                <Field label="Owner" hint="Who this falls to">
                  <SelectMenu
                    label="Owner"
                    value={selected.owner ?? "hr"}
                    onChange={(owner) => patch(selected.id, { owner })}
                    options={[
                      { id: "People & Culture", label: "People & Culture" },
                      { id: "Hiring manager", label: "Hiring manager" },
                      { id: "IT service desk", label: "IT service desk" },
                      { id: "The new starter", label: "The new starter" },
                    ]}
                  />
                </Field>
              )}

              <Field label="Summary" hint="Shown on the block">
                <Textarea
                  rows={3}
                  value={selected.summary ?? ""}
                  onChange={(e) =>
                    patch(selected.id, { summary: e.target.value })
                  }
                />
              </Field>

              {selected.incomplete && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => patch(selected.id, { incomplete: undefined })}
                >
                  Mark as configured
                </Button>
              )}
            </div>
          )}
        </BlockInspector>
      }
      account={{
        name: "Dzaky Rosihan",
        email: "dzaky.rosihan@kmart.com.au",
        role: "Admin",
      }}
      actions={
        <>
          <Button size="sm" variant="ghost">
            <AutoAwesome />
            Ask Craig
          </Button>
          <Button size="sm">Publish</Button>
        </>
      }
    >
      <div className="py-8">
        <header className="mb-6 flex flex-col gap-1">
          <BackLink href="/design-system" className="mb-5">
            Back to design system
          </BackLink>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">
              Workflow builder
            </h1>
            <Badge tone="warning">Draft</Badge>
          </div>
          <p className="max-w-xl text-md text-text-muted">
            One column, top to bottom, in the order it runs. Drag the canvas to
            pan, ⌘-scroll to zoom, and use the connector between blocks to
            insert a step.
          </p>
        </header>

        <WorkflowCanvas className="h-[calc(100vh-15rem)] min-h-[32rem]">
          <CanvasPanel side="top-left">
            <div className="flex items-center gap-1 px-1">
              <Badge tone="neutral" size="sm">
                {steps} steps
              </Badge>
              {unconfigured > 0 && (
                <Badge tone="warning" size="sm">
                  {unconfigured} unconfigured
                </Badge>
              )}
            </div>
          </CanvasPanel>

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
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <p className="px-2 pb-1 text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Workflow
        </p>
        {["Build", "People", "Settings"].map((item, i) => (
          <a
            key={item}
            href="#"
            aria-current={i === 0 ? "true" : undefined}
            className={
              i === 0
                ? "rounded-md bg-accent-subtle px-2 py-1 text-sm font-medium text-accent-subtle-fg"
                : "rounded-md px-2 py-1 text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
            }
          >
            {item}
          </a>
        ))}
      </div>

      <Separator />

      <div className="flex flex-col gap-2 px-2">
        <Row label="Steps" value={steps} />
        <Row
          label="Unconfigured"
          value={unconfigured}
          tone={unconfigured > 0 ? "warning" : "neutral"}
        />
      </div>

      <Separator />

      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        A workflow can&apos;t be published while any block is unconfigured.
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "warning";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-muted">{label}</span>
      <Badge tone={tone} size="sm">
        {value}
      </Badge>
    </div>
  );
}
