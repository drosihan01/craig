"use client";

import * as React from "react";
import {
  AuthDivider,
  Badge,
  Button,
  Calendar,
  DatePicker,
  DropdownMenu,
  Field,
  GoogleButton,
  Input,
  PasswordInput,
  WorkflowBuilder,
  type BlockKind,
  type WorkflowBlock,
} from "@/components/ui";
import { BLOCK_TYPES } from "@/components/ui/workflow-builder";
import {
  ContentCopy,
  Delete,
  Description,
  Add,
  MoreHoriz,
  PersonAdd,
  Settings,
} from "@/components/ui/icons";

/* --- Dropdown -------------------------------------------------------------- */

export function DropdownDemo() {
  const [last, setLast] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState("recent");

  return (
    <div className="flex flex-wrap items-center gap-3">
      <DropdownMenu
        label="Row actions"
        trigger={
          <span className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-surface shadow-e1 transition-colors hover:bg-surface-hover">
            <MoreHoriz className="size-4" />
          </span>
        }
        items={[
          { id: "edit", label: "Edit step", icon: <Description /> },
          { id: "duplicate", label: "Duplicate", icon: <ContentCopy /> },
          { id: "assign", label: "Assign owner", icon: <PersonAdd /> },
          {
            id: "delete",
            label: "Delete",
            icon: <Delete />,
            destructive: true,
            separatorBefore: true,
          },
        ]}
        onSelect={setLast}
      />

      <DropdownMenu
        label="Sort by"
        align="start"
        selectedId={sort}
        onSelect={setSort}
        width="w-52"
        trigger={
          <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-base shadow-e1 transition-colors hover:bg-surface-hover">
            Sort
            <span className="text-text-subtle">·</span>
            <span className="text-text-muted">{sort}</span>
          </span>
        }
        items={[
          { id: "recent", label: "Most recent", description: "Newest first" },
          { id: "due", label: "Due date", description: "Soonest first" },
          { id: "owner", label: "Owner", description: "Grouped by team" },
          { id: "archived", label: "Archived", disabled: true },
        ]}
      />

      <DropdownMenu
        label="Add"
        trigger={
          <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-base font-medium text-accent-fg shadow-e1 transition-colors hover:bg-accent-hover">
            <Add className="size-4" />
            New
          </span>
        }
        items={[
          { id: "workflow", label: "Workflow", description: "A full onboarding journey" },
          { id: "step", label: "Step", description: "One task inside a workflow" },
          { id: "template", label: "From template", icon: <Settings /> },
        ]}
        onSelect={setLast}
      />

      {last && (
        <span className="text-sm text-text-subtle">
          selected: <span className="text-text">{last}</span>
        </span>
      )}
    </div>
  );
}

/* --- Calendar -------------------------------------------------------------- */

export function CalendarDemo() {
  const [date, setDate] = React.useState<Date | null>(null);
  const [start, setStart] = React.useState<Date | null>(null);

  // Start dates are always in the future — the picker enforces it visually,
  // but the same rule has to hold server-side.
  const today = new Date();

  return (
    <div className="flex w-full flex-wrap items-start gap-8">
      <div className="rounded-lg border border-border bg-surface shadow-e1">
        <Calendar value={date} onChange={setDate} />
      </div>

      <div className="flex w-64 flex-col gap-4">
        <Field
          label="Start date"
          hint={start ? undefined : "Must be in the future"}
        >
          <DatePicker value={start} onChange={setStart} min={today} />
        </Field>
        <div className="flex flex-col gap-1 text-sm text-text-subtle">
          <span>
            calendar:{" "}
            <span className="text-text">
              {date ? date.toDateString() : "none"}
            </span>
          </span>
          <span>
            picker:{" "}
            <span className="text-text">
              {start ? start.toDateString() : "none"}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* --- Auth ------------------------------------------------------------------ */

export function AuthDemo() {
  return (
    <div className="flex w-full flex-wrap items-start gap-8">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-e2">
        <div className="mb-5 flex flex-col gap-1 text-center">
          <span className="text-lg font-semibold tracking-[-0.02em]">
            Craig.
          </span>
          <h3 className="text-xl font-semibold tracking-[-0.02em]">Sign in</h3>
        </div>

        <GoogleButton />
        <AuthDivider label="or continue with email" />

        <div className="flex flex-col gap-4">
          <Field label="Work email">
            <Input type="email" placeholder="you@company.com" />
          </Field>
          <Field label="Password">
            <PasswordInput placeholder="••••••••" />
          </Field>
          <Button size="lg" className="w-full">
            Sign in
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">Pieces</p>
        <GoogleButton className="w-64" />
        <div className="w-64">
          <PasswordInput defaultValue="hunter2" />
        </div>
        <div className="w-64">
          <AuthDivider />
        </div>
        <Badge tone="neutral">
          <a href="/sign-in" className="hover:underline">
            Open /sign-in →
          </a>
        </Badge>
      </div>
    </div>
  );
}

/* --- Workflow builder ------------------------------------------------------ */

const DEMO_BLOCKS: WorkflowBlock[] = [
  {
    id: "t",
    kind: "trigger",
    title: "A new starter is added",
    summary: "Role is Retail team member",
  },
  {
    id: "a",
    kind: "task",
    title: "Order laptop and store login",
    summary: "Due 3 days before start date",
    owner: "IT service desk",
  },
  {
    id: "b",
    kind: "approval",
    title: "Hiring manager confirms readiness",
    owner: "Hiring manager",
  },
  {
    id: "c",
    kind: "notify",
    title: "Send the welcome email",
    incomplete: "No template chosen",
  },
];

let n = 0;

export function BuilderDemo() {
  const [blocks, setBlocks] = React.useState(DEMO_BLOCKS);
  const [selected, setSelected] = React.useState<string | null>("a");

  return (
    <WorkflowBuilder
      className="w-full"
      blocks={blocks}
      selectedId={selected}
      onSelect={setSelected}
      onInsert={(kind: BlockKind, index: number) => {
        const id = `d${n++}`;
        setBlocks((prev) => [
          ...prev.slice(0, index),
          {
            id,
            kind,
            title: `New ${BLOCK_TYPES[kind].label.toLowerCase()}`,
            incomplete: "Not configured",
          },
          ...prev.slice(index),
        ]);
        setSelected(id);
      }}
      onRemove={(id) => setBlocks((p) => p.filter((b) => b.id !== id))}
      onDuplicate={(id) =>
        setBlocks((p) => {
          const i = p.findIndex((b) => b.id === id);
          return [...p.slice(0, i + 1), { ...p[i], id: `d${n++}` }, ...p.slice(i + 1)];
        })
      }
      onMove={(id, dir) =>
        setBlocks((p) => {
          const i = p.findIndex((b) => b.id === id);
          const j = i + dir;
          if (i < 1 || j < 1 || j >= p.length) return p;
          const next = [...p];
          [next[i], next[j]] = [next[j], next[i]];
          return next;
        })
      }
    />
  );
}
