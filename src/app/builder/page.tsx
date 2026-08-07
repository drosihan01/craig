"use client";

import * as React from "react";
import {
  AppShell,
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
  type AppNotification,
  type BlockKind,
  type WorkflowBlock,
} from "@/components/ui";
import { BLOCK_TYPES } from "@/components/ui/workflow-builder";
import { AutoAwesome } from "@/components/ui/icons";
import { ACCOUNT, NEW_HIRE, PEOPLE } from "@/lib/demo";
import { AdminNav, NavStat } from "@/components/app-nav";

/* Drafted from Ada's handbook — the first-week checklist in that doc is
   literally four bullets, so the workflow is deliberately small. The gaps it
   surfaces (an unowned step, a handbook nobody has reviewed) are the point:
   Craig's job here is to make the undocumented parts visible, not to invent
   process a three-person company doesn't want. */
/* Exactly the nine steps Craig proposes at the end of the scripted session,
   in the same order and with the same two gaps left open. If the conversation
   and the draft disagree, the demo's whole argument falls over. */
const INITIAL: WorkflowBlock[] = [
  {
    id: "t",
    kind: "trigger",
    title: "A new hire is added",
    summary: `Engineer · ${NEW_HIRE.name} starts in ${NEW_HIRE.startsIn}`,
  },
  {
    id: "b1",
    kind: "document",
    title: "Contract and payroll details",
    summary: "Before day one",
    owner: PEOPLE.ada.name,
  },
  {
    id: "b2",
    kind: "task",
    title: "Order the laptop",
    summary: "Two weeks to arrive — start this the day he signs",
    owner: PEOPLE.ada.name,
  },
  {
    id: "b3",
    kind: "task",
    title: "GitHub, AWS and the provider keys",
    summary: "Jason owns all of these",
    owner: PEOPLE.jason.name,
  },
  {
    id: "b4",
    kind: "task",
    title: "Add to Slack channels",
    summary: "Which ones is currently tribal knowledge",
    incomplete: "Nobody owns this yet",
  },
  {
    id: "b5",
    kind: "delay",
    title: "Wait until day one",
    summary: "Resumes 9:00am Berlin — 9h ahead of Jason",
  },
  {
    id: "b6",
    kind: "document",
    title: "Read the handbook",
    summary: "Katalis Handbook — last updated Feb 2026",
    owner: PEOPLE.ada.name,
    incomplete: "Needs refreshing before he reads it",
  },
  {
    id: "b7",
    kind: "task",
    title: "Walk through what's live and what's fallback",
    summary: "Half an hour with Jason — the bit only in his head",
    owner: PEOPLE.jason.name,
  },
  {
    id: "b8",
    kind: "approval",
    title: "Jason signs off on prod access",
    summary: "Nothing touches routing until this clears",
    owner: PEOPLE.jason.name,
  },
  {
    id: "b9",
    kind: "task",
    title: "30-day check-in",
    summary: "What should have been written down and wasn't",
    owner: PEOPLE.ada.name,
  },
];

const NOTIFICATIONS: AppNotification[] = [
  {
    id: "n1",
    kind: "approval",
    title: "Jason needs to sign off on prod access",
    description: "Blocks the last step of the engineer workflow",
    timestamp: new Date(Date.now() - 4 * 60_000),
    actor: PEOPLE.jason.name,
  },
  {
    id: "n2",
    kind: "overdue",
    title: "The handbook hasn\u2019t been reviewed since Feb 2026",
    description: "Two steps point at it",
    timestamp: new Date(Date.now() - 90 * 60_000),
  },
  {
    id: "n3",
    kind: "complete",
    title: "Jason completed \u201cGitHub, AWS and model provider keys\u201d",
    timestamp: new Date(Date.now() - 5 * 3_600_000),
    actor: PEOPLE.jason.name,
    read: true,
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
      title="Engineer — Katalis"
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
                    value={selected.owner ?? PEOPLE.ada.name}
                    onChange={(owner) => patch(selected.id, { owner })}
                    options={[
                      { id: PEOPLE.ada.name, label: PEOPLE.ada.name },
                      { id: PEOPLE.jason.name, label: PEOPLE.jason.name },
                      { id: PEOPLE.matty.name, label: PEOPLE.matty.name },
                      { id: "The new hire", label: "The new hire" },
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
          <Button size="sm" disabled={unconfigured > 0}>
            Publish
          </Button>
        </>
      }
    >
      {/* Full bleed. The canvas is the page — a title and a paragraph above it
          would be repeating the header and stealing the space the work needs.
          The negative margins cancel the content column's padding. */}
      <div className="-mx-4 h-[calc(100vh-3rem)] lg:-mx-8">
        <WorkflowCanvas className="h-full rounded-none border-0">
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
        A workflow can&apos;t be published while any block is unconfigured.
      </p>
    </AdminNav>
  );
}
