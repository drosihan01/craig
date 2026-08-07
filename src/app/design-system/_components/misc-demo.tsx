"use client";

import * as React from "react";
import {
  Avatar,
  AuthDivider,
  Badge,
  FilterBar,
  FilterChip,
  List,
  ListItem,
  SearchInput,
  SortControl,
  type SortState,
  ContinueAs,
  Button,
  Calendar,
  DatePicker,
  DropdownMenu,
  Field,
  GoogleButton,
  Input,
  PasswordInput,
  WorkflowBuilder,
  WorkflowCanvas,
  CanvasPanel,
  type WorkflowBlock,
} from "@/components/ui";
import { blockFromPreset } from "@/lib/workflow/library";
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

      <div className="flex w-full max-w-sm flex-col gap-3">
        <p className="text-sm font-medium">Returning to this device</p>
        <ContinueAs
          account={{
            name: "Ada Y\u0131ld\u0131z",
            email: "ada@katalis.ai",
            method: "google",
          }}
        />
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
    title: "New seat added",
    summary: "The only trigger there is",
  },
  {
    id: "a",
    kind: "task",
    title: "GitHub, AWS and model provider keys",
    summary: "Jason owns all of these",
    owner: "Jason Cho",
  },
  {
    id: "b",
    kind: "approval",
    title: "Jason signs off on prod access",
    owner: "Jason Cho",
  },
  {
    id: "c",
    kind: "notify",
    title: "Add to Slack channels",
    incomplete: "No channel list \u2014 ask Ada or Jason",
  },
];

let n = 0;

export function CanvasDemo() {
  const [blocks, setBlocks] = React.useState(DEMO_BLOCKS);
  const [selected, setSelected] = React.useState<string | null>("a");

  return (
    <WorkflowCanvas className="h-[34rem] w-full rounded-none border-0">
      <CanvasPanel side="top-left">
        <span className="px-1.5 text-2xs text-text-subtle">
          {blocks.length - 1} steps
        </span>
      </CanvasPanel>
      <div className="px-8 py-10">
    <WorkflowBuilder
      className="w-full"
      blocks={blocks}
      selectedId={selected}
      onSelect={setSelected}
      onInsert={(preset, index) => {
        const id = `d${n++}`;
        setBlocks((prev) => [
          ...prev.slice(0, index),
          blockFromPreset(preset, id),
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
      </div>
    </WorkflowCanvas>
  );
}

/* --- Sort & filter --------------------------------------------------------- */

const FILTER_ROWS = [
  { name: "Ada Yıldız", role: "owner", status: "active", steps: 4 },
  { name: "Jason Cho", role: "admin", status: "active", steps: 4 },
  { name: "Matty", role: "contributor", status: "active", steps: 0 },
  { name: "Nils Hoffman", role: "starter", status: "invited", steps: 0 },
];

const ROLE_OPTIONS = [
  { id: "owner", label: "Owner" },
  { id: "admin", label: "Admin" },
  { id: "contributor", label: "Contributor" },
  { id: "starter", label: "New starter" },
];

export function FiltersDemo() {
  const [query, setQuery] = React.useState("");
  const [roles, setRoles] = React.useState<string[]>([]);
  const [statuses, setStatuses] = React.useState<string[]>([]);
  const [sort, setSort] = React.useState<SortState>({
    field: "name",
    direction: "asc",
  });

  const q = query.trim().toLowerCase();
  const rows = FILTER_ROWS.filter(
    (r) =>
      (!roles.length || roles.includes(r.role)) &&
      (!statuses.length || statuses.includes(r.status)) &&
      (!q || r.name.toLowerCase().includes(q)),
  ).sort((a, b) => {
    const dir = sort.direction === "asc" ? 1 : -1;
    return sort.field === "steps"
      ? (a.steps - b.steps) * dir
      : a.name.localeCompare(b.name) * dir;
  });

  function clear() {
    setQuery("");
    setRoles([]);
    setStatuses([]);
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <FilterBar
        shown={rows.length}
        total={FILTER_ROWS.length}
        noun="people"
        onClear={clear}
      >
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search people"
          className="w-52"
        />
        <FilterChip
          label="Role"
          options={ROLE_OPTIONS}
          selected={roles}
          onChange={setRoles}
        />
        <FilterChip
          label="Status"
          options={[
            { id: "active", label: "Active" },
            { id: "invited", label: "Invited" },
          ]}
          selected={statuses}
          onChange={setStatuses}
        />
        <SortControl
          className="ml-auto"
          value={sort}
          options={[
            { id: "name", label: "Name" },
            { id: "steps", label: "Steps owned" },
          ]}
          onChange={setSort}
        />
      </FilterBar>

      <List className="w-full">
        {rows.map((r) => (
          <ListItem
            key={r.name}
            leading={<Avatar name={r.name} size="md" />}
            title={r.name}
            description={
              ROLE_OPTIONS.find((o) => o.id === r.role)?.label ?? r.role
            }
            meta={r.steps ? `owns ${r.steps} steps` : undefined}
          />
        ))}
      </List>
    </div>
  );
}
