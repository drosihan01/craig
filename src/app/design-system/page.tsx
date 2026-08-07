"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  FileText,
  Info,
  Laptop,
  Plus,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";
import {
  Avatar,
  AvatarStack,
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  ControlRow,
  EmptyState,
  Field,
  Input,
  Progress,
  Radio,
  SegmentedControl,
  Select,
  Separator,
  Skeleton,
  StatusPill,
  Stepper,
  Switch,
  Tabs,
  Textarea,
  Tooltip,
  type Step,
  type TaskStatus,
} from "@/components/ui";
import { Demo, Section, Swatch } from "./_components/specimen";

const SEMANTIC = [
  { name: "canvas", cls: "bg-canvas" },
  { name: "surface", cls: "bg-surface" },
  { name: "surface-sunken", cls: "bg-surface-sunken" },
  { name: "surface-hover", cls: "bg-surface-hover" },
  { name: "border", cls: "bg-border" },
  { name: "border-strong", cls: "bg-border-strong" },
  { name: "text", cls: "bg-text" },
  { name: "text-muted", cls: "bg-text-muted" },
  { name: "text-subtle", cls: "bg-text-subtle" },
  { name: "accent", cls: "bg-accent" },
  { name: "accent-subtle", cls: "bg-accent-subtle" },
  { name: "accent-ring", cls: "bg-accent-ring" },
];

const STATUS_COLORS = [
  { name: "success", cls: "bg-success" },
  { name: "warning", cls: "bg-warning" },
  { name: "danger", cls: "bg-danger" },
  { name: "info", cls: "bg-info" },
];

/* Written out rather than templated — Tailwind extracts class names
   statically, so `bg-accent-${n}` would produce nothing. */
const ACCENT_RAMP = [
  { step: 50, cls: "bg-accent-50" },
  { step: 100, cls: "bg-accent-100" },
  { step: 200, cls: "bg-accent-200" },
  { step: 300, cls: "bg-accent-300" },
  { step: 400, cls: "bg-accent-400" },
  { step: 500, cls: "bg-accent-500" },
  { step: 600, cls: "bg-accent-600" },
  { step: 700, cls: "bg-accent-700" },
  { step: 800, cls: "bg-accent-800" },
  { step: 900, cls: "bg-accent-900" },
  { step: 950, cls: "bg-accent-950" },
];

const TYPE_SCALE = [
  { cls: "text-5xl", name: "5xl", px: "40 / 48", use: "Marketing only" },
  { cls: "text-4xl", name: "4xl", px: "32 / 40", use: "Page hero" },
  { cls: "text-3xl", name: "3xl", px: "24 / 32", use: "Page title" },
  { cls: "text-2xl", name: "2xl", px: "21 / 28", use: "Section title" },
  { cls: "text-xl", name: "xl", px: "18 / 26", use: "Card title, large" },
  { cls: "text-lg", name: "lg", px: "16 / 24", use: "Subheading" },
  { cls: "text-md", name: "md", px: "15 / 22", use: "Lead paragraph" },
  { cls: "text-base", name: "base", px: "14 / 20", use: "Body — the default" },
  { cls: "text-sm", name: "sm", px: "13 / 18", use: "Labels, secondary" },
  { cls: "text-xs", name: "xs", px: "12 / 16", use: "Hints, metadata" },
  { cls: "text-2xs", name: "2xs", px: "11 / 16", use: "Badges, eyebrows" },
];

const SPACE = [0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];
const RADII = [
  { cls: "rounded-xs", name: "xs", px: "3px" },
  { cls: "rounded-sm", name: "sm", px: "4px" },
  { cls: "rounded-md", name: "md", px: "6px" },
  { cls: "rounded-lg", name: "lg", px: "8px" },
  { cls: "rounded-xl", name: "xl", px: "12px" },
  { cls: "rounded-2xl", name: "2xl", px: "16px" },
  { cls: "rounded-full", name: "full", px: "9999px" },
];

const ELEVATION = [
  { cls: "shadow-e1", name: "e1", use: "Resting — inputs, cards, buttons" },
  { cls: "shadow-e2", name: "e2", use: "Hover lift" },
  { cls: "shadow-e3", name: "e3", use: "Popovers, dropdowns, tooltips" },
  { cls: "shadow-e4", name: "e4", use: "Modals, command palette" },
];

const STEPS: Step[] = [
  {
    id: "1",
    title: "Offer accepted",
    description: "Contract signed and countersigned",
    state: "complete",
  },
  {
    id: "2",
    title: "Pre-boarding",
    description: "Payroll details, right to work, equipment order",
    state: "complete",
  },
  {
    id: "3",
    title: "Day one",
    description: "Accounts provisioned, buddy assigned, welcome session",
    state: "current",
  },
  {
    id: "4",
    title: "First 30 days",
    description: "Role training, team intros, first check-in",
    state: "upcoming",
  },
  {
    id: "5",
    title: "Probation review",
    state: "upcoming",
  },
];

const ALL_STATUSES: TaskStatus[] = [
  "not_started",
  "in_progress",
  "awaiting",
  "blocked",
  "complete",
];

export default function DesignSystemPage() {
  const [tab, setTab] = React.useState("overview");
  const [segment, setSegment] = React.useState("board");

  return (
    <div className="py-10">
      <div className="mb-2 flex flex-col gap-3 pb-8">
        <Badge tone="accent" className="w-fit">
          v0.1 — foundations
        </Badge>
        <h1 className="text-4xl font-semibold tracking-[-0.03em]">
          Craig design system
        </h1>
        <p className="max-w-2xl text-md text-text-muted">
          The primitives behind both seats of the product — the admin who builds
          an onboarding workflow, and the new starter who walks through it.
          Everything below reads from one token layer, so a change to the accent
          or the type scale lands everywhere at once.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Badge>Mori</Badge>
          <Badge>Charcoal brown</Badge>
          <Badge>14px base</Badge>
          <Badge>Light + dark</Badge>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="colour"
        title="Colour"
        description="Charcoal brown carries every intentional action. Neutrals are pulled a few degrees warm so they sit with it rather than fighting it. Components only ever reference the semantic names — never the raw ramp."
      >
        <Demo title="Semantic tokens" note="these flip with the theme">
          <div className="grid w-full grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {SEMANTIC.map((c) => (
              <Swatch
                key={c.name}
                name={c.name}
                varName={`--color-${c.name}`}
                className={c.cls}
              />
            ))}
          </div>
        </Demo>

        <Demo title="Status">
          <div className="grid w-full grid-cols-2 gap-4 sm:grid-cols-4">
            {STATUS_COLORS.map((c) => (
              <Swatch
                key={c.name}
                name={c.name}
                varName={`--color-${c.name}`}
                className={c.cls}
              />
            ))}
          </div>
        </Demo>

        <Demo title="Accent ramp" note="charcoal brown, 50 → 950">
          <div className="w-full">
            <div className="flex h-14 w-full overflow-hidden rounded-md border border-border">
              {ACCENT_RAMP.map((c) => (
                <div
                  key={c.step}
                  className={`flex-1 ${c.cls}`}
                  title={`accent-${c.step}`}
                />
              ))}
            </div>
            <div className="mt-1.5 flex w-full">
              {ACCENT_RAMP.map((c) => (
                <span
                  key={c.step}
                  className="flex-1 text-center font-mono text-2xs text-text-subtle"
                >
                  {c.step}
                </span>
              ))}
            </div>
          </div>
        </Demo>

        <Callout
          tone="info"
          icon={<Info />}
          title="Why the accent inverts in dark mode"
        >
          <p>
            Charcoal brown at 800 is nearly black — on a dark canvas it
            disappears. Dark mode promotes the light tan end of the ramp
            (accent-300) and flips the foreground, so the accent keeps the same
            role and the same warmth at both ends.
          </p>
        </Callout>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="typography"
        title="Typography"
        description="Mori across the board. The scale is app-density: base is 14px, not 16px, and steps are tight so a dense workflow table and a page title still feel related."
      >
        <Demo className="flex-col items-stretch gap-0 divide-y divide-border p-0">
          {TYPE_SCALE.map((t) => (
            <div
              key={t.name}
              className="flex items-baseline gap-5 px-5 py-3.5"
            >
              <span className="w-12 shrink-0 font-mono text-2xs text-text-subtle">
                {t.name}
              </span>
              <span className="w-16 shrink-0 font-mono text-2xs text-text-subtle">
                {t.px}
              </span>
              <span className={`min-w-0 flex-1 truncate ${t.cls}`}>
                Welcome to the team
              </span>
              <span className="hidden shrink-0 text-xs text-text-subtle md:block">
                {t.use}
              </span>
            </div>
          ))}
        </Demo>

        <Demo title="Weights" note="three only — 200 / 400 / 600">
          <div className="flex w-full flex-col gap-2">
            <p className="text-xl font-extralight">
              Extralight 200 — display sizes only
            </p>
            <p className="text-xl font-normal">Regular 400 — body and UI</p>
            <p className="text-xl font-semibold">
              SemiBold 600 — titles and emphasis
            </p>
          </div>
        </Demo>

        <Callout tone="warning" icon={<AlertTriangle />} title="Font files needed">
          <p>
            Mori is a licensed typeface, so the <code className="font-mono text-xs">.woff2</code>{" "}
            files aren&apos;t in the repo. Drop them into{" "}
            <code className="font-mono text-xs">/public/fonts</code> — see the
            README there for exact filenames. Until then the stack falls through
            to system-ui and nothing breaks.
          </p>
        </Callout>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="space"
        title="Space & radius"
        description="A 4px grid, with 2px available for optical nudges. Radii stay tight — 6px is the workhorse."
      >
        <Demo title="Space" className="flex-col items-start gap-2.5">
          {SPACE.map((s) => (
            <div key={s} className="flex items-center gap-3">
              <span className="w-10 font-mono text-2xs text-text-subtle">
                {s}
              </span>
              <span className="w-10 font-mono text-2xs text-text-subtle">
                {s * 4}px
              </span>
              <div
                className="h-3 rounded-xs bg-accent-subtle"
                style={{ width: `${s * 4}px` }}
              />
            </div>
          ))}
        </Demo>

        <Demo title="Radius">
          {RADII.map((r) => (
            <div key={r.name} className="flex flex-col items-center gap-1.5">
              <div
                className={`size-14 border border-border-strong bg-surface-sunken ${r.cls}`}
              />
              <span className="text-2xs font-medium">{r.name}</span>
              <span className="font-mono text-2xs text-text-subtle">
                {r.px}
              </span>
            </div>
          ))}
        </Demo>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="elevation"
        title="Elevation"
        description="Four steps, each tied to a job. Shadows are layered and low-opacity in light mode and lean much darker in dark mode, where a lift reads as contrast rather than shade."
      >
        <Demo className="gap-6 bg-canvas p-8">
          {ELEVATION.map((e) => (
            <div key={e.name} className="flex flex-col items-center gap-2">
              <div
                className={`flex size-24 items-center justify-center rounded-lg border border-border bg-surface font-mono text-xs text-text-subtle ${e.cls}`}
              >
                {e.name}
              </div>
              <span className="max-w-32 text-center text-2xs text-text-subtle">
                {e.use}
              </span>
            </div>
          ))}
        </Demo>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="motion"
        title="Motion"
        description="Fast and near-invisible. 150ms for state changes, 200ms for things that travel, 500ms for progress. Two easing curves, no more."
      >
        <Demo className="gap-6">
          <div className="group flex cursor-pointer flex-col items-center gap-2">
            <div className="flex size-24 items-center justify-center rounded-lg border border-border bg-surface transition-transform duration-150 ease-out-quart group-hover:-translate-y-1.5">
              <span className="font-mono text-2xs text-text-subtle">hover</span>
            </div>
            <span className="text-2xs font-medium">ease-out-quart</span>
            <span className="text-2xs text-text-subtle">150ms · settling</span>
          </div>
          <div className="group flex cursor-pointer flex-col items-center gap-2">
            <div className="flex size-24 items-center justify-center rounded-lg border border-border bg-surface transition-transform duration-200 ease-spring group-hover:translate-x-3">
              <span className="font-mono text-2xs text-text-subtle">hover</span>
            </div>
            <span className="text-2xs font-medium">ease-spring</span>
            <span className="text-2xs text-text-subtle">200ms · travelling</span>
          </div>
        </Demo>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="button"
        title="Button"
        description="One primary action per view. Secondary carries everything else; ghost is for toolbars and table rows where a border would add noise."
      >
        <Demo title="Variants">
          <Button>Publish workflow</Button>
          <Button variant="secondary">Save draft</Button>
          <Button variant="subtle">Duplicate</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Delete</Button>
          <Button variant="link">Learn more</Button>
        </Demo>

        <Demo title="Sizes">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" variant="secondary" aria-label="Add step">
            <Plus />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Delete step">
            <Trash2 />
          </Button>
        </Demo>

        <Demo title="With icons, loading, disabled">
          <Button>
            <UserPlus />
            Invite new starter
          </Button>
          <Button variant="secondary">
            Continue
            <ArrowRight />
          </Button>
          <Button loading>Saving</Button>
          <Button variant="secondary" loading>
            Saving
          </Button>
          <Button disabled>Disabled</Button>
        </Demo>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="inputs"
        title="Inputs"
        description="Every control sits in a Field, which owns the label, hint, error and the aria wiring. Controls never render their own label."
      >
        <Demo className="items-start">
          <div className="grid w-full gap-5 sm:grid-cols-2">
            <Field label="Workflow name" required hint="Shown to the new starter">
              <Input placeholder="e.g. Retail team member — VIC" />
            </Field>
            <Field label="Search">
              <Input placeholder="Search steps…" icon={<Search />} />
            </Field>
            <Field
              label="Start date"
              error="Start date must be in the future"
            >
              <Input type="date" defaultValue="2026-01-04" />
            </Field>
            <Field label="Owner" hint="Receives every escalation">
              <Select defaultValue="hr">
                <option value="hr">People &amp; Culture</option>
                <option value="mgr">Hiring manager</option>
                <option value="it">IT service desk</option>
              </Select>
            </Field>
            <Field
              label="Welcome message"
              hint="Markdown supported"
              className="sm:col-span-2"
            >
              <Textarea placeholder="Tell them what day one looks like…" />
            </Field>
            <Field label="Disabled">
              <Input placeholder="Not editable" disabled />
            </Field>
          </div>
        </Demo>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="selection"
        title="Selection"
        description="Native inputs underneath — keyboard, form submission and screen-reader behaviour come free. ControlRow pairs one with a label and description."
      >
        <Demo className="items-start">
          <div className="grid w-full gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">Checkbox</p>
              <ControlRow
                control={<Checkbox defaultChecked />}
                label="Require manager sign-off"
                description="The step stays open until the hiring manager approves it."
              />
              <ControlRow
                control={<Checkbox />}
                label="Send a reminder"
                description="Nudges the new starter 24h before the due date."
              />
              <ControlRow
                control={<Checkbox disabled />}
                label="Disabled option"
              />
            </div>

            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">Radio</p>
              <ControlRow
                control={<Radio name="due" defaultChecked />}
                label="Relative to start date"
                description="e.g. 3 days before day one"
              />
              <ControlRow
                control={<Radio name="due" />}
                label="Fixed date"
                description="Same deadline for every new starter"
              />
            </div>

            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">Switch</p>
              <ControlRow
                control={<Switch defaultChecked />}
                label="Workflow is live"
                description="New starters are assigned this workflow automatically."
              />
              <ControlRow
                control={<Switch />}
                label="Notify the buddy"
              />
            </div>
          </div>
        </Demo>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="badge"
        title="Badge & status"
        description="Task status is defined once, in TASK_STATUS, and both seats read from it — so the admin builder and the new-starter view can never drift apart."
      >
        <Demo title="Status pills" note="the workflow state machine">
          {ALL_STATUSES.map((s) => (
            <StatusPill key={s} status={s} />
          ))}
        </Demo>

        <Demo title="Badge tones">
          <Badge tone="neutral">Neutral</Badge>
          <Badge tone="accent">Accent</Badge>
          <Badge tone="solid">Solid</Badge>
          <Badge tone="success">Success</Badge>
          <Badge tone="warning">Warning</Badge>
          <Badge tone="danger">Danger</Badge>
          <Badge tone="info">Info</Badge>
        </Demo>

        <Demo title="Sizes">
          <Badge size="sm">Small</Badge>
          <Badge size="md">Medium</Badge>
          <StatusPill status="in_progress" size="sm" />
          <Badge tone="accent">
            <FileText />
            Document
          </Badge>
        </Demo>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="card"
        title="Card"
        description="The container for a workflow, a step, or a new starter. Interactive cards lift on hover; static ones don't move."
      >
        <Demo className="items-stretch">
          <div className="grid w-full gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Retail team member</CardTitle>
                <CardDescription>
                  12 steps across 4 stages · 6 owners
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Progress value={62} label="Workflow completion" />
                <p className="mt-2 text-xs text-text-subtle">
                  62% average completion across 34 active starters
                </p>
              </CardContent>
              <CardFooter>
                <Button size="sm" variant="secondary">
                  Edit workflow
                </Button>
                <Button size="sm" variant="ghost">
                  Duplicate
                </Button>
              </CardFooter>
            </Card>

            <Card interactive>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <CardTitle>Order equipment</CardTitle>
                    <CardDescription>
                      Due 3 days before start date
                    </CardDescription>
                  </div>
                  <StatusPill status="in_progress" />
                </div>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                <Badge tone="neutral">
                  <Laptop />
                  IT
                </Badge>
                <Separator orientation="vertical" className="h-4" />
                <AvatarStack
                  people={[{ name: "Priya Nair" }, { name: "Tom Walsh" }]}
                />
              </CardContent>
            </Card>
          </div>
        </Demo>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="avatar"
        title="Avatar"
        description="Initials by default. Stacks cap at four and roll the rest into a counter."
      >
        <Demo>
          <Avatar name="Dzaky Rosihan" size="xs" />
          <Avatar name="Dzaky Rosihan" size="sm" />
          <Avatar name="Dzaky Rosihan" size="md" />
          <Avatar name="Dzaky Rosihan" size="lg" />
          <Separator orientation="vertical" className="mx-2 h-8" />
          <AvatarStack
            size="md"
            people={[
              { name: "Priya Nair" },
              { name: "Tom Walsh" },
              { name: "Amara Chen" },
              { name: "Jonas Bergman" },
              { name: "Lena Fischer" },
              { name: "Sam Ortiz" },
            ]}
          />
        </Demo>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="tabs"
        title="Tabs"
        description="Tabs switch a page; the segmented control switches a view within one. Arrow keys move between tabs and only the active tab is in the tab order."
      >
        <Demo className="items-stretch flex-col">
          <Tabs
            value={tab}
            onValueChange={setTab}
            items={[
              { value: "overview", label: "Overview" },
              {
                value: "steps",
                label: "Steps",
                badge: <Badge size="sm">12</Badge>,
              },
              { value: "people", label: "People" },
              { value: "settings", label: "Settings" },
            ]}
          />
          <div className="pt-4 text-base text-text-muted">
            Showing the <span className="font-medium text-text">{tab}</span>{" "}
            panel.
          </div>
        </Demo>

        <Demo title="Segmented control">
          <SegmentedControl
            value={segment}
            onValueChange={setSegment}
            items={[
              { value: "board", label: "Board" },
              { value: "list", label: "List" },
              { value: "timeline", label: "Timeline" },
            ]}
          />
        </Demo>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="progress"
        title="Progress & steps"
        description="The stepper is the spine of the new-starter view. Vertical for the full journey, horizontal for a compact header."
      >
        <Demo title="Progress bar" className="items-stretch flex-col gap-4">
          <Progress value={20} label="20%" />
          <Progress value={62} label="62%" />
          <Progress value={100} label="100%" />
        </Demo>

        <Demo title="Stepper — horizontal" className="items-stretch">
          <Stepper
            orientation="horizontal"
            className="w-full"
            steps={STEPS.slice(0, 4)}
          />
        </Demo>

        <Demo title="Stepper — vertical" className="items-start">
          <Stepper steps={STEPS} />
        </Demo>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="feedback"
        title="Feedback"
        description="Callouts for information that belongs inline, empty states for a screen with nothing on it yet, skeletons for anything that loads."
      >
        <Demo className="items-stretch flex-col gap-3">
          <Callout tone="info" icon={<Info />} title="Draft workflow">
            <p>
              This workflow isn&apos;t live yet — new starters won&apos;t be
              assigned to it until you publish.
            </p>
          </Callout>
          <Callout tone="warning" icon={<AlertTriangle />} title="Unassigned steps">
            <p>3 steps have no owner. They&apos;ll fall to People &amp; Culture.</p>
          </Callout>
          <Callout tone="success" icon={<Check />} title="All checks passed" />
        </Demo>

        <Demo title="Empty state" className="items-stretch">
          <EmptyState
            className="w-full"
            icon={<CalendarDays />}
            title="No workflows yet"
            description="Build your first onboarding workflow and every new starter in this role will be assigned it automatically."
            action={
              <Button>
                <Plus />
                New workflow
              </Button>
            }
          />
        </Demo>

        <Demo title="Skeleton" className="items-stretch flex-col gap-2">
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </Demo>

        <Demo title="Tooltip" note="hover or focus the trigger">
          <Tooltip content="Applies to every new starter in this role">
            <Button variant="secondary">Hover me</Button>
          </Tooltip>
          <Tooltip content="Delete this step" side="bottom">
            <Button variant="ghost" size="icon" aria-label="Delete step">
              <Trash2 />
            </Button>
          </Tooltip>
        </Demo>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="patterns"
        title="In context"
        description="The same primitives, assembled the way each seat will actually use them."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Admin — step row in the builder</h3>
            <Card className="divide-y divide-border">
              {[
                { title: "Sign employment contract", owner: "P&C", status: "complete" },
                { title: "Order laptop & phone", owner: "IT", status: "in_progress" },
                { title: "Assign a buddy", owner: "Manager", status: "not_started" },
              ].map((row) => (
                <div
                  key={row.title}
                  className="group flex items-center gap-3 px-3.5 py-2.5"
                >
                  <span className="cursor-grab text-text-subtle opacity-0 transition-opacity group-hover:opacity-100">
                    ⠿
                  </span>
                  <span className="flex-1 truncate text-base font-medium">
                    {row.title}
                  </span>
                  <Badge size="sm">{row.owner}</Badge>
                  <StatusPill status={row.status as TaskStatus} size="sm" />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Remove step"
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <div className="p-2">
                <Button variant="ghost" size="sm" className="w-full justify-start">
                  <Plus />
                  Add step
                </Button>
              </div>
            </Card>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">New starter — day one</h3>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2.5">
                  <Avatar name="Dzaky Rosihan" size="lg" />
                  <div className="flex flex-col">
                    <CardTitle>Welcome, Dzaky</CardTitle>
                    <CardDescription>
                      Day 1 of 30 · Retail team member
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-text-muted">
                      4 of 12 complete
                    </span>
                    <span className="text-sm font-medium">33%</span>
                  </div>
                  <Progress value={33} label="Onboarding progress" />
                </div>
                <Separator />
                <Stepper steps={STEPS.slice(1, 4)} />
              </CardContent>
              <CardFooter>
                <Button size="sm">
                  Continue
                  <ArrowRight />
                </Button>
                <span className="text-xs text-text-subtle">
                  Next: meet your buddy
                </span>
              </CardFooter>
            </Card>
          </div>
        </div>
      </Section>
    </div>
  );
}
