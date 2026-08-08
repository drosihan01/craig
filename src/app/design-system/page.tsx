"use client";

import * as React from "react";
import Link from "next/link";
import * as Icon from "@/components/ui/icons";
import {
  Add,
  AltRoute,
  ArrowForward,
  CalendarMonth,
  Check,
  Delete,
  Description,
  DragIndicator,
  Groups,
  Info,
  LaptopMac,
  MenuBook,
  Palette,
  Person,
  PersonAdd,
  Checklist,
  Search,
  UploadFile,
  Warning,
} from "@/components/ui/icons";
import {
  Avatar,
  AvatarStack,
  BLOCK_TYPES,
  BackLink,
  CraigLockup,
  CraigMark,
  List,
  ListIcon,
  ListItem,
  NavTree,
  NavTreeGroup,
  NavTreeItem,
  TalkToCraig,
  Badge,
  BrandIcons,
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
  DatePicker,
  Progress,
  Radio,
  SegmentedControl,
  Select,
  SelectMenu,
  Separator,
  Skeleton,
  StatusPill,
  Stepper,
  Switch,
  Tabs,
  Textarea,
  Tooltip,
  WorkflowProgress,
  type Step,
  type TaskStatus,
  type WorkflowStep,
} from "@/components/ui";
import { ChatDemo, DialogDemo, ModelPickerDemo } from "./_components/chat-demo";
import { NotificationDemo, ToastDemo } from "./_components/notify-demo";
import {
  AuthDemo,
  CalendarDemo,
  CanvasDemo,
  DropdownDemo,
  FiltersDemo,
  NavItemButtonDemo,
} from "./_components/misc-demo";
import {
  BlockPickerDemo,
  BlockSetupDemo,
  EmailPreviewDemo,
  TestRunDemo,
} from "./_components/workflow-demo";
import {
  ComposerFloorDemo,
  ComposerSizeDemo,
  ControlledComposerDemo,
} from "./_components/composer-demo";
import { ModalFamilyDemo } from "./_components/modal-demo";
import { SignUpDemo } from "./_components/signup-demo";
import {
  ActivityDemo,
  AgentTurnsDemo,
  AgentWorkDemo,
  CertaintyDemo,
} from "./_components/agent-demo";
import { Api, Usage } from "./_components/api";
import {
  APPSHELL_PROPS,
  AUTH_PROPS,
  CALENDAR_PROPS,
  CHAT_PROPS,
  DATEPICKER_PROPS,
  DIALOG_PROPS,
  DROPDOWN_PROPS,
  PROMPTBAR_PROPS,
  BACKLINK_PROPS,
  AGENT_WORK_PROPS,
  LIST_PROPS,
  NAV_TREE_ITEM_PROPS,
  NAV_TREE_PROPS,
  FILTER_PROPS,
  FILTER_BAR_PROPS,
  SORT_PROPS,
  NOTIFICATION_PROPS,
  TOAST_PROPS,
  BUILDER_PROPS,
  BLOCK_PICKER_PROPS,
  BLOCK_PRESET_PROPS,
  BLOCK_SETUP_PROPS,
  SETUP_FIELD_PROPS,
  TEST_RUN_PROPS,
  EMAIL_PREVIEW_PROPS,
  CANVASPANEL_PROPS,
  CANVAS_PROPS,
  MARK_PROPS,
  SELECTMENU_PROPS,
  STEPPER_PROPS,
  TEXTAREA_PROPS,
  WORKFLOW_PROPS,
} from "./_components/api-data";
import { Demo, Section, Swatch } from "./_components/specimen";
import { ALL_PRESETS, BLOCK_LIBRARY } from "@/lib/workflow/library";

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
    title: "Before day one",
    description: "Payroll details and the laptop order",
    state: "complete",
  },
  {
    id: "3",
    title: "Day one",
    description: "Keys from Jason, Slack, and the handbook",
    state: "current",
  },
  {
    id: "4",
    title: "First 30 days",
    description: "Who owns what, prod access, first check-in",
    state: "upcoming",
  },
  {
    id: "5",
    title: "30-day check-in",
    state: "upcoming",
  },
];

/* The setup flow's three phases, as /welcome and /v3/setup declare them. */
const SETUP_STEPS: Step[] = [
  { id: "upload", title: "Upload", state: "complete" },
  { id: "discovery", title: "Discovery", state: "current" },
  { id: "build", title: "Build workflow", state: "upcoming" },
];

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: "s1",
    title: "Before you start",
    description:
      "Contract, payroll details and your laptop order. Get these back to Ada early — the laptop has about two weeks of lead time and nothing else waits on it.",
    status: "complete",
    metrics: [
      { value: 3, label: "forms signed" },
      { value: 1, label: "laptop ordered" },
      { value: 0, label: "blockers" },
    ],
    primaryAction: { label: "Review what you sent", href: "#" },
    secondaryAction: { label: "Download copies" },
  },
  {
    id: "s2",
    title: "Day one",
    description:
      "GitHub, AWS and the model provider keys — Jason owns all of them. Slack channels too, once someone decides which ones you actually need.",
    status: "in_progress",
    metrics: [
      { value: 4, label: "accounts created" },
      { value: 1, label: "step unassigned" },
      { value: 0, label: "prod access yet" },
    ],
    primaryAction: { label: "Open day one", href: "#" },
    secondaryAction: { label: "Ping Jason" },
  },
  {
    id: "s3",
    title: "Find out who owns what",
    description:
      "Most of it lives in Jason's head rather than a doc. Walk through the routing layer, the fallback path and what breaking prod actually looks like here.",
    status: "awaiting",
    metrics: [
      { value: 4, label: "areas covered" },
      { value: 2, label: "still undocumented" },
      { value: 1, label: "awaiting sign-off" },
    ],
    primaryAction: { label: "Continue the walkthrough", href: "#" },
  },
  {
    id: "s4",
    title: "30-day check-in",
    description:
      "A proper conversation with Ada about how the first month actually went, and what should have been written down but wasn't.",
    status: "not_started",
  },
];

/* Everything the module exports, minus the type. Adding an icon to
   scripts/gen-icons.py makes it show up here automatically. */
const ICON_SET = Object.fromEntries(
  Object.entries(Icon).filter(([, v]) => typeof v !== "string"),
) as Record<string, React.ComponentType<{ className?: string }>>;

/* Same trick for the brand set, minus the exported type alias. */
const BRAND_SET = Object.fromEntries(
  Object.entries(BrandIcons).filter(([, v]) => typeof v === "object"),
) as Record<string, React.ComponentType<{ className?: string }>>;

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
  const [owner, setOwner] = React.useState("hr");
  const [startDate, setStartDate] = React.useState<Date | null>(null);

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
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface-sunken px-2 text-xs font-medium text-text transition-colors hover:border-border-strong hover:bg-surface-hover"
          >
            Admin home →
          </Link>
          <Link
            href="/builder"
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface-sunken px-2 text-xs font-medium text-text transition-colors hover:border-border-strong hover:bg-surface-hover"
          >
            Workflow builder →
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface-sunken px-2 text-xs font-medium text-text transition-colors hover:border-border-strong hover:bg-surface-hover"
          >
            Sign in →
          </Link>
          <Badge>Google Sans Flex</Badge>
          <Badge>Material Symbols</Badge>
          <Badge>Charcoal brown</Badge>
          <Badge>14px base</Badge>
          <Badge>Light + dark</Badge>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="brand"
        title="Brand"
        description="A drawn mark and a wordmark. The full stop is part of the wordmark — it sets the tone the rest of the system follows: quiet, deliberate, finished."
      >
        <Demo title="Mark" note="stroked, drawn in currentColor">
          <div className="flex items-end gap-7">
            <CraigMark className="size-20 text-text" />
            <CraigMark className="size-14 text-text" />
            <CraigMark className="size-10 text-text" />
            <CraigMark className="size-8 text-text" />
            <CraigMark className="size-5 text-text" />
          </div>
        </Demo>

        <Demo title="Lockup">
          <div className="flex items-center gap-8">
            <CraigLockup className="text-2xl" markClassName="size-7" />
            <CraigLockup className="text-lg" markClassName="size-6" />
            <CraigLockup className="text-base" />
          </div>
        </Demo>

        <Demo title="On accent" className="gap-6">
          <span className="flex size-14 items-center justify-center rounded-xl bg-accent text-accent-fg">
            <CraigMark className="size-9" />
          </span>
          <span className="flex size-14 items-center justify-center rounded-xl bg-accent-subtle text-accent-subtle-fg">
            <CraigMark className="size-9" />
          </span>
          <span className="flex size-14 items-center justify-center rounded-xl border border-border bg-surface text-text">
            <CraigMark className="size-9" />
          </span>
        </Demo>

        <Api component="CraigMark" props={MARK_PROPS} />
        <Usage>{`import { CraigMark, CraigLockup, MARK_STROKE } from "@/components/ui";`}</Usage>

        <Callout
          tone="info"
          icon={<Info />}
          title="One stroke weight, and a floor"
        >
          <p>
            The mark uses <code className="font-mono text-xs">MARK_STROKE</code>{" "}
            (9) at every size — never vary it. An earlier version scaled the
            weight per size to keep small renders legible; it worked, but it
            redrew the mark heavier as it shrank, so it read as a slightly
            different logo depending on where it appeared. 9 was chosen by
            rendering the mark from 16px to 80px at several weights: heavy
            enough to hold at 20px, light enough to keep the drawing&apos;s
            character at 80px.
          </p>
          <p className="mt-2">
            The trade is a floor rather than a weight change. Below{" "}
            <code className="font-mono text-xs">MARK_MIN_SIZE</code> (20px) the
            drawing carries more detail than there are pixels to render it,
            whatever the stroke — use the wordmark alone down there.
          </p>
        </Callout>
      </Section>

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
        description="Google Sans Flex across the board — one variable file covering 100–1000, self-hosted. The scale is app-density: base is 14px, not 16px, and steps are tight so a dense workflow table and a page title still feel related."
      >
        <Demo className="flex-col items-stretch gap-0 divide-y divide-border p-0">
          {TYPE_SCALE.map((t) => (
            <div key={t.name} className="flex items-baseline gap-5 px-5 py-3.5">
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

        <Demo title="Weights" note="use three — 200 / 400 / 600">
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

        <Callout tone="info" icon={<Info />} title="It's a variable font">
          <p>
            Every weight from 100 to 1000 is available from a single 51KB file,
            so adding one costs nothing at runtime. Stick to the three above
            anyway — the constraint is what keeps the UI legible, not the file
            size. The font is self-hosted rather than linked from Google, so
            there&apos;s no third-party connection and no extra round trip.
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
            <span className="text-2xs text-text-subtle">
              200ms · travelling
            </span>
          </div>
        </Demo>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="icons"
        title="Icons"
        description="Material Symbols (Rounded), vendored as inline SVG — no runtime dependency and no thousand-file package. They fill with currentColor and take their size from a class, so they inherit whatever they sit inside."
      >
        <Demo title="Set" note="add one via scripts/gen-icons.py">
          <div className="grid w-full grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
            {Object.entries(ICON_SET).map(([name, Ico]) => (
              <div
                key={name}
                className="flex flex-col items-center gap-1.5 rounded-md border border-border bg-surface-sunken/40 px-2 py-3"
              >
                <Ico className="size-5 text-text" />
                <span className="w-full truncate text-center text-2xs text-text-subtle">
                  {name}
                </span>
              </div>
            ))}
          </div>
        </Demo>

        <Demo title="Sizes" note="16 is the default in buttons and badges">
          <Check className="size-3 text-text" />
          <Check className="size-4 text-text" />
          <Check className="size-5 text-text" />
          <Check className="size-6 text-text" />
          <Separator orientation="vertical" className="mx-2 h-6" />
          <Check className="size-5 text-accent" />
          <Check className="size-5 text-success" />
          <Check className="size-5 text-danger" />
          <Check className="size-5 text-text-subtle" />
        </Demo>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="brand-icons"
        title="Brand icons"
        description="A second set, because Material Symbols has no brand logos at all — not one, across the whole library. These are vendored from Simple Icons (CC0), single paths on the same 24×24 grid, and they render in currentColor rather than brand colour: they sit in a tinted tile beside Material glyphs, and fifteen brand colours in one dialog is a fruit salad."
      >
        <Demo title="Set" note="add one via scripts/gen-brand-icons.py">
          <div className="grid w-full grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
            {Object.entries(BRAND_SET).map(([name, Ico]) => (
              <div
                key={name}
                className="flex flex-col items-center gap-1.5 rounded-md border border-border bg-surface-sunken/40 px-2 py-3"
              >
                <Ico className="size-5 text-text" />
                <span className="w-full truncate text-center text-2xs text-text-subtle">
                  {name}
                </span>
              </div>
            ))}
          </div>
        </Demo>

        <Demo
          title="Beside a Material glyph"
          note="the two sets are meant to read as one"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent-subtle text-accent-subtle-fg">
            <BrandIcons.GitHub className="size-4.5" />
          </span>
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent-subtle text-accent-subtle-fg">
            <BrandIcons.Google className="size-4.5" />
          </span>
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent-subtle text-accent-subtle-fg">
            <Icon.Apps className="size-4.5" />
          </span>
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent-subtle text-accent-subtle-fg">
            <Icon.Lock className="size-4.5" />
          </span>
        </Demo>

        <Usage>{`import { BrandIcons } from "@/components/ui";  // BrandIcons.GitHub`}</Usage>

        <Callout
          tone="warning"
          icon={<Warning />}
          title="Slack, AWS and Microsoft can't be drawn"
        >
          <p>
            Simple Icons carried all three and removed them at the trademark
            holders&apos; request, so there is no freely licensed copy to vendor
            — and Material Symbols has never had a brand mark to fall back on.
            Those blocks use{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              Apps
            </code>{" "}
            instead: the same neutral placeholder for each, rather than a cloud
            for AWS and a speech bubble for Slack. One placeholder reads as
            &ldquo;no logo available&rdquo;; two different guesses read as two
            different opinions.
          </p>
          <p className="mt-2">
            The gap is the licence, not the drawing. If Katalis has permission
            to use those marks, add them to{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              brand-icons.tsx
            </code>{" "}
            by hand and teach the generator to leave them alone — it rewrites
            the whole file from{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              BRANDS
            </code>{" "}
            on every run, and every slug in there has to resolve upstream.
          </p>
        </Callout>
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
            <Add />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Delete step">
            <Delete />
          </Button>
        </Demo>

        <Demo title="With icons, loading, disabled">
          <Button>
            <PersonAdd />
            Invite new starter
          </Button>
          <Button variant="secondary">
            Continue
            <ArrowForward />
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
            <Field
              label="Workflow name"
              required
              hint="Shown to the new starter"
            >
              <Input placeholder="e.g. Engineer — Katalis" />
            </Field>
            <Field label="Search">
              <Input placeholder="Search steps…" icon={<Search />} />
            </Field>
            <Field label="Start date" hint="Must be in the future">
              <DatePicker
                value={startDate}
                onChange={setStartDate}
                min={new Date()}
              />
            </Field>
            <Field label="Owner" hint="Receives every escalation">
              <SelectMenu
                label="Owner"
                value={owner}
                onChange={setOwner}
                options={[
                  {
                    id: "hr",
                    label: "Ada Yıldız",
                    description: "Default for anything unassigned",
                  },
                  {
                    id: "mgr",
                    label: "Jason Cho",
                    description: "Infra, access, anything prod",
                  },
                  {
                    id: "it",
                    label: "Matty",
                    description: "Frontend, part-time",
                  },
                ]}
              />
            </Field>
            <Field
              label="Native select"
              hint="Still right for long, plain lists — the OS picker wins on mobile"
            >
              <Select defaultValue="au">
                <option value="au">Australia</option>
                <option value="nz">New Zealand</option>
              </Select>
            </Field>
            <Field
              label="Welcome message"
              hint="Grows as you type, then scrolls at 12 lines"
              className="sm:col-span-2"
            >
              <Textarea placeholder="Tell them what day one actually looks like…" />
            </Field>
            <Field label="Disabled">
              <Input placeholder="Not editable" disabled />
            </Field>
          </div>
        </Demo>

        <Api
          component="SelectMenu"
          props={SELECTMENU_PROPS}
          note="DropdownMenu wearing a form control's clothes"
        />
        <Api component="Textarea" props={TEXTAREA_PROPS} />
        <Usage>{`import { Field, Input, Textarea, Select, SelectMenu, DatePicker } from "@/components/ui";`}</Usage>
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
                description="Nudges the new hire 24h before the due date."
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
                description="New hires are assigned this workflow automatically."
              />
              <ControlRow control={<Switch />} label="Notify Jason" />
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
            <Description />
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
                <CardTitle>Engineer — Katalis</CardTitle>
                <CardDescription>
                  9 steps across 3 stages · 2 owners
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Progress value={62} label="Workflow completion" />
                <p className="mt-2 text-xs text-text-subtle">
                  62% average completion across 3 active hires
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
                    <CardTitle>Order laptop</CardTitle>
                    <CardDescription>Two weeks lead time</CardDescription>
                  </div>
                  <StatusPill status="in_progress" />
                </div>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                <Badge tone="neutral">
                  <LaptopMac />
                  Ada
                </Badge>
                <Separator orientation="vertical" className="h-4" />
                <AvatarStack
                  people={[{ name: "Ada Yıldız" }, { name: "Jason Cho" }]}
                />
              </CardContent>
            </Card>
          </div>
        </Demo>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="list"
        title="List"
        description="Rows of things — people, documents, workflows. Borrowed from Material's list anatomy, mainly for one detail: dividers are inset, starting where the text starts rather than at the row edge, so a column of avatars reads as a column instead of every row looking like a separate boxed card."
      >
        <Demo
          title="Two-line rows with a leading avatar"
          className="items-stretch"
        >
          <List className="w-full">
            <ListItem
              leading={<Avatar name="Ada Yıldız" size="md" />}
              title="Ada Yıldız"
              description="Founder · ada@katalis.ai"
              meta="owns 4 steps"
              trailing={
                <Badge tone="neutral" size="sm">
                  Owner
                </Badge>
              }
            />
            <ListItem
              leading={<Avatar name="Jason Cho" size="md" />}
              title="Jason Cho"
              description="Cofounder · jason@katalis.ai"
              footnote="Every credential goes through him"
              meta="owns 4 steps"
              trailing={
                <Badge tone="neutral" size="sm">
                  Admin
                </Badge>
              }
            />
            <ListItem
              leading={<Avatar name="Matty" size="md" />}
              title="Matty"
              description="Frontend, contract · matty@katalis.ai"
              trailing={
                <Badge tone="neutral" size="sm">
                  Contributor
                </Badge>
              }
            />
          </List>
        </Demo>

        <Demo
          title="Icon tiles, overline, and an interactive row"
          className="items-stretch"
        >
          <List className="w-full">
            <ListItem
              href="/resources"
              leading={
                <ListIcon tone="accent">
                  <Description />
                </ListIcon>
              }
              overline="Onboarding"
              title="Katalis Handbook"
              description="PDF · last updated Feb 2026"
              meta="2 steps use this"
            />
            <ListItem
              leading={
                <ListIcon tone="muted">
                  <Warning />
                </ListIcon>
              }
              overline="Engineering"
              title="Slack channel list"
              description="Nobody has written this down"
            />
            <ListItem
              title="A row with nothing leading"
              description="The divider runs the full width when there's no leading slot."
            />
          </List>
        </Demo>

        <Demo
          title="Dense, undivided — for side panels"
          className="items-stretch"
        >
          <div className="w-64 rounded-lg border border-border bg-surface p-3">
            <List dense divided={false} bordered={false}>
              <ListItem
                leading={<Avatar name="Ada Yıldız" size="xs" />}
                title={
                  <span className="font-normal text-text-muted">
                    Ada Yıldız
                  </span>
                }
                meta="Founder"
              />
              <ListItem
                leading={<Avatar name="Jason Cho" size="xs" />}
                title={
                  <span className="font-normal text-text-muted">Jason Cho</span>
                }
                meta="Cofounder"
              />
              <ListItem
                leading={<Avatar name="Nils Hoffman" size="xs" />}
                title={
                  <span className="font-normal text-text-muted">
                    Nils Hoffman
                  </span>
                }
                trailing={
                  <Badge tone="warning" size="sm">
                    Starts in 2 weeks
                  </Badge>
                }
              />
            </List>
          </div>
        </Demo>

        <Api component="ListItem" props={LIST_PROPS} />
        <Usage>{`import { List, ListItem, ListSection, ListIcon } from "@/components/ui";`}</Usage>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="nav-tree"
        title="Menu item & nested nav"
        description="One component for both positions. NavTreeItem on its own is a plain menu row; put it inside a NavTreeGroup and it's a child. That's deliberate — a nav where “row” and “row with a parent” are two different components will drift, and they'll stop lining up the first time either one's padding changes. The dotted rule is what makes nesting legible: indentation alone gets ambiguous the moment two groups are open, because you can see that a row is nested but not what it's nested under. Dotted rather than solid for the same reason the canvas uses dotted inside a step — solid means flow, and Evidence doesn't come after Discovery, it's part of it."
      >
        <Demo
          title="A real nav"
          note="flat items, an open group, a collapsed one, a count, a shut row — every nav in this product is some arrangement of these"
          className="items-stretch"
        >
          <NavTree className="w-64 rounded-lg border border-border bg-surface p-2">
            <NavTreeItem label="Home" icon={<Description />} current />
            <NavTreeItem label="People" icon={<Groups />} />
            <NavTreeItem
              label="Resources"
              icon={<MenuBook />}
              trailing={
                <Badge tone="neutral" size="sm">
                  12
                </Badge>
              }
            />
            <NavTreeItem
              label="Equipment"
              icon={<LaptopMac />}
              disabled
              reason="Nothing to hand out until a workflow asks for it"
            />
            <NavTreeGroup label="Discovery" icon={<Search />}>
              <NavTreeItem label="Evidence" icon={<UploadFile />} />
              <NavTreeItem
                label="Review"
                icon={<Checklist />}
                trailing={
                  <Badge tone="warning" size="sm">
                    2
                  </Badge>
                }
              />
            </NavTreeGroup>
            <NavTreeGroup
              label="Onboarding"
              icon={<AltRoute />}
              defaultOpen={false}
            >
              <NavTreeItem label="Workflows" />
              <NavTreeItem label="People" />
            </NavTreeGroup>
          </NavTree>
        </Demo>

        <Demo
          title="Standalone, and nested"
          note="the same component, the same row height"
          className="items-start gap-10"
        >
          <div className="w-56 rounded-lg border border-border bg-surface p-2">
            <NavTreeItem label="Overview" icon={<Description />} />
            <NavTreeItem label="Evidence" icon={<UploadFile />} />
            <NavTreeItem label="Review" icon={<Checklist />} current />
          </div>
          <div className="w-56 rounded-lg border border-border bg-surface p-2">
            <NavTreeGroup label="Discovery" icon={<Search />}>
              <NavTreeItem label="Evidence" icon={<UploadFile />} />
              <NavTreeItem label="Review" icon={<Checklist />} current />
            </NavTreeGroup>
          </div>
        </Demo>

        <Demo
          title="Link or button"
          note="href renders a Link and sets aria-current; without one it's a real button"
          className="items-start gap-10"
        >
          <div className="w-56 rounded-lg border border-border bg-surface p-2">
            <NavTreeItem
              label="Design system"
              href="/design-system"
              icon={<Palette />}
              current
            />
            <NavTreeItem
              label="Workflow builder"
              href="/builder"
              icon={<AltRoute />}
            />
            <NavTreeItem label="Sign in" href="/sign-in" icon={<Person />} />
          </div>
          <NavItemButtonDemo />
        </Demo>

        <Demo
          title="The mark as an AI affordance"
          note="20px, not 16 — a button would size it below the mark's own floor"
        >
          <TalkToCraig />
          <TalkToCraig>Ask Craig about this step</TalkToCraig>
        </Demo>

        <Api component="NavTreeGroup" props={NAV_TREE_PROPS} />
        <Api component="NavTreeItem" props={NAV_TREE_ITEM_PROPS} />
        <Usage>{`import { NavTreeGroup, NavTreeItem } from "@/components/ui";`}</Usage>

        <Callout
          tone="info"
          icon={<Info />}
          title="href for a place, onClick for a view"
        >
          <p>
            With{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              href
            </code>{" "}
            the row is a{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              Link
            </code>{" "}
            and carries{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              aria-current=&quot;page&quot;
            </code>
            ; without one it&apos;s a{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              button
            </code>
            . Use the button form when the row changes what&apos;s on screen
            rather than where you are — the sandbox nav does exactly this,
            because its sections are local state and not routes. Rendering a
            link that goes nowhere is how a nav ends up with rows you can&apos;t
            middle-click and rows you can, with nothing to tell them apart.
          </p>
          <p className="mt-2">
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              disabled
            </code>{" "}
            drops the element instead of styling it: no{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              Link
            </code>
            , no button, just a{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              span
            </code>{" "}
            with{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              aria-disabled
            </code>
            , out of the tab order and with no href left in the markup for a
            middle-click to find. Pass{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              reason
            </code>{" "}
            with it every time — it goes in the{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              title
            </code>{" "}
            and, off-screen, into the row&apos;s own text, so the row says what
            would unlock it rather than only refusing. Use this where the place
            exists but the account hasn&apos;t earned it yet; a row that will
            never work for this person is a row to leave out.
          </p>
          <p className="mt-2">
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              current
            </code>{" "}
            and{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              disabled
            </code>{" "}
            are the only styled states. Hover is a transition, not a state — a
            nav where hover looks like selection means you can never tell,
            mid-mouse-move, which page you&apos;re actually on. The{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              icon
            </code>{" "}
            slot is a fixed 24px box so a column of them lines up whatever glyph
            goes in;{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              trailing
            </code>{" "}
            is hard right, for a count or a badge.
          </p>
        </Callout>

        <Callout
          tone="warning"
          icon={<Warning />}
          title="Three navs hand-roll this row instead of using it"
        >
          <p>
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              AdminNav
            </code>
            ,{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              V3Nav
            </code>{" "}
            and{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              SandboxNav
            </code>{" "}
            each repeat the same class string for a flat row rather than
            rendering a{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              NavTreeItem
            </code>
            . They have already drifted: all three use{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              py-1
            </code>
            , this component uses{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              py-1.5
            </code>{" "}
            and{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              gap-2
            </code>
            , which is why the sandbox&apos;s hand-rolled route links sit a
            little tighter than the NavTreeItem rows above them. It&apos;s the
            drift this section is arguing against, live in the product. Recorded
            here rather than fixed — the three files are somebody else&apos;s
            right now.
          </p>
        </Callout>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="filters"
        title="Sort & filter"
        description="A chip shows its value, not just its name — “Role: Admin”, not “Role ▾”. The state of a filtered list has to be readable without opening anything, because the expensive mistake is looking at a filtered list and believing it's the whole list. The count says “showing 2 of 4” for the same reason."
      >
        <Demo className="items-stretch">
          <FiltersDemo />
        </Demo>

        <Api component="FilterChip" props={FILTER_PROPS} />
        <Api component="SortControl" props={SORT_PROPS} />
        <Api component="FilterBar" props={FILTER_BAR_PROPS} />
        <Usage>{`import { FilterBar, FilterChip, SearchInput, SortControl } from "@/components/ui";`}</Usage>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="avatar"
        title="Avatar"
        description="Initials by default. Stacks cap at four and roll the rest into a counter."
      >
        <Demo>
          <Avatar name="Ada Yıldız" size="xs" />
          <Avatar name="Ada Yıldız" size="sm" />
          <Avatar name="Ada Yıldız" size="md" />
          <Avatar name="Ada Yıldız" size="lg" />
          <Separator orientation="vertical" className="mx-2 h-8" />
          <AvatarStack
            size="md"
            people={[
              { name: "Ada Yıldız" },
              { name: "Jason Cho" },
              { name: "Matty" },
              { name: "Nils Hoffman" },
              { name: "Rae Okonkwo" },
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
        description="The stepper is the spine of the new-starter view. Three variants, and the choice is about how much instruction the moment needs: vertical for the full journey, horizontal for a header, compact for a rail that sits beside the work rather than being the work."
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

        <Demo
          title="Vertical and compact, side by side"
          note="the horizontal one is above — three variants, three amounts of instruction"
          className="items-start gap-10"
        >
          <div className="flex flex-col gap-2">
            <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
              vertical
            </span>
            <Stepper steps={STEPS.slice(0, 3)} />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
              compact
            </span>
            {/* In a 14rem column, because that's the left panel it lives in. */}
            <div className="w-56 rounded-lg border border-border bg-surface p-3">
              <Stepper steps={SETUP_STEPS} compact />
            </div>
          </div>
        </Demo>

        <Demo
          title="Stepper — vertical, with descriptions"
          className="items-start"
        >
          <Stepper steps={STEPS} />
        </Demo>

        <Demo
          title="Workflow progress"
          note="each step is a card — room for what it produced"
          className="items-stretch bg-canvas"
        >
          <WorkflowProgress
            className="w-full"
            title="Workflow progress"
            steps={WORKFLOW_STEPS}
          />
        </Demo>
        <Api component="Stepper" props={STEPPER_PROPS} />
        <Api component="WorkflowProgress" props={WORKFLOW_PROPS} />
        <Usage>{`import { WorkflowProgress, Stepper, Progress } from "@/components/ui";`}</Usage>

        <Callout
          tone="info"
          icon={<Info />}
          title="Why compact drops the numbers"
        >
          <p>
            It&apos;s the rail in the left panel during setup —{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              /welcome
            </code>{" "}
            and{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              /v3/setup
            </code>{" "}
            — sitting beside a conversation. Its job is orientation, not
            instruction: proof that this is three things and not an open-ended
            interview. And the three aren&apos;t the same size. One is dropping
            files in, one is a five-minute conversation, one is Craig reading
            what you gave him. Numbering them would promise an even, countable
            progression the thing doesn&apos;t have, and &ldquo;2 of 3&rdquo;
            would be read as two-thirds done.
          </p>
          <p className="mt-2">
            Two measurements in there are load-bearing. The dot is centred
            inside an 18px line box rather than nudged down with a margin, so it
            stays aligned to the first line of text if the type scale changes.
            The connector starts at 13px because that&apos;s the dot&apos;s
            bottom edge — half the line box plus half the dot — and it goes
            accent the moment a step completes, so the rail fills in behind you.
          </p>
        </Callout>
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
          <Callout tone="warning" icon={<Warning />} title="Unassigned steps">
            <p>
              3 steps have no owner. They&apos;ll fall to People &amp; Culture.
            </p>
          </Callout>
          <Callout tone="success" icon={<Check />} title="All checks passed" />
        </Demo>

        <Demo title="Empty state" className="items-stretch">
          <EmptyState
            className="w-full"
            icon={<CalendarMonth />}
            title="No workflows yet"
            description="Build your first onboarding workflow and every new starter in this role will be assigned it automatically."
            action={
              <Button>
                <Add />
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
              <Delete />
            </Button>
          </Tooltip>
        </Demo>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="notifications"
        description="Two different jobs. Toasts confirm what just happened and disappear; notifications persist because they're things the user still has to act on. A toast that's missed is gone — so anything owed to someone belongs in the list, not in a toast."
        title="Notifications"
      >
        <Demo title="Toasts" note="bottom-right, pause on hover">
          <ToastDemo />
        </Demo>
        <Api component="useToast().toast(options)" props={TOAST_PROPS} />

        <Demo title="Notification feed" className="items-start">
          <NotificationDemo />
        </Demo>
        <Api
          component="NotificationBell / NotificationList"
          props={NOTIFICATION_PROPS}
        />
        <Usage>{`import { ToastProvider, useToast, NotificationBell } from "@/components/ui";`}</Usage>

        <Callout
          tone="info"
          icon={<Info />}
          title="Opening the list isn't reading it"
        >
          <p>
            The panel never marks anything read by itself. &ldquo;I opened the
            list&rdquo; is not &ldquo;I dealt with it&rdquo;, and clearing the
            badge on open throws away the one signal telling someone they still
            owe an approval. Read state stays with the caller.
          </p>
        </Callout>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="dropdown"
        title="Dropdown"
        description="Menu anchored to a trigger. Placement is declared, not computed — fine for toolbars, row actions and the composer. Arrows move, Home/End jump, Escape closes and returns focus to the trigger without also closing a dialog it sits inside."
      >
        <Demo title="As a menu, and as a select">
          <DropdownDemo />
        </Demo>
        <Api component="DropdownMenu" props={DROPDOWN_PROPS} />
        <Usage>{`import { DropdownMenu, SelectMenu } from "@/components/ui";`}</Usage>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="calendar"
        title="Calendar"
        description="No date library — onboarding only needs 'pick a day', and Date plus Intl covers it. Everything is computed in local time; a UTC-based Date lands on the wrong day for anyone east of Greenwich, which is most of this product's users."
      >
        <Demo title="Calendar and date picker" className="items-start">
          <CalendarDemo />
        </Demo>
        <Api component="Calendar" props={CALENDAR_PROPS} />
        <Api
          component="DatePicker"
          props={DATEPICKER_PROPS}
          note="Calendar in a popover, styled as a form control"
        />
        <Usage>{`import { Calendar, DatePicker, toISODate } from "@/components/ui";`}</Usage>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="dialog"
        title="Dialog"
        description="Hand-rolled rather than pulled from Radix — one behaviour, owned outright. Escape and backdrop close it, Tab is trapped inside, focus moves in on open and back to the trigger on close, and the page behind can't scroll."
      >
        <Demo title="Sizes and intent">
          <DialogDemo />
        </Demo>
        <Api component="Dialog" props={DIALOG_PROPS} />
        <Usage>{`import { Dialog, DialogClose } from "@/components/ui";`}</Usage>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="chat"
        title="Chat"
        description="Ask Craig — a modal assistant over the workflow you're looking at. User turns are bubbles because they're short; assistant turns run full width with no container so a long answer reads as prose. Enter sends, Shift+Enter breaks the line."
      >
        <Demo title="Chat modal" note="replies are canned, but they stream">
          <ChatDemo />
        </Demo>

        <Demo title="Model picker" className="items-start">
          <ModelPickerDemo />
        </Demo>

        <Api component="ChatModal" props={CHAT_PROPS} />
        <Usage>{`import { ChatModal, CHAT_MODELS } from "@/components/ui";`}</Usage>

        <Callout
          tone="warning"
          icon={<Warning />}
          title="The model choice is a data boundary"
        >
          <p>
            Craigopilot is in-house and the default — it&apos;s the only one
            that sees company data. Claude and GPT are hosted, so anything sent
            to them leaves the tenancy. The composer says which regime
            you&apos;re in rather than burying it in settings, and that rule
            belongs in the API layer too, not just this label.
          </p>
        </Callout>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="composer"
        title="Composer"
        description="One PromptBar, everywhere anyone types at Craig — page level on Home, in a side panel beside the builder, and as ChatModal's footer. One implementation because two would drift, and the composer is the product's main verb: if it behaves differently depending on which screen you're on, the assistant does too."
      >
        <Demo
          title="Both sizes"
          note="sm shown at the width it's actually used"
          className="items-stretch"
        >
          <ComposerSizeDemo />
        </Demo>

        <Demo
          title="Controlled"
          note="value + onValueChange — the caller owns the text"
          className="items-stretch"
        >
          <ControlledComposerDemo />
        </Demo>

        <Demo
          title="The height floor"
          note="type one character into each"
          className="items-stretch"
        >
          <ComposerFloorDemo />
        </Demo>

        <Api component="PromptBar" props={PROMPTBAR_PROPS} />
        <Usage>{`import { PromptBar } from "@/components/ui";`}</Usage>

        <Callout
          tone="info"
          icon={<Info />}
          title="Controlled so something else can speak through it"
        >
          <p>
            Uncontrolled is still the default, because that&apos;s what every
            product caller wants.{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              value
            </code>{" "}
            and{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              onValueChange
            </code>{" "}
            exist for the case where the text comes from outside — the v3 demo
            types Theo&apos;s replies into the real box, character by character
            (
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              typeDraft
            </code>{" "}
            in{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              src/lib/v3/store.ts
            </code>
            ), rather than fading a screenshot of a message in beside it. Words
            appearing in the thing that sends messages is what makes the box
            read as the mechanism instead of decoration.
          </p>
        </Callout>

        <Callout
          tone="warning"
          icon={<Warning />}
          title="The resting height is a floor, and it has to stay one"
        >
          <p>
            The bar measures its own empty height once and never renders
            shorter. Without that, a placeholder long enough to wrap makes the
            empty box two or three lines tall, and the first character you type
            collapses it to one — the composer flinching away from you at the
            exact moment you commit to it. Home was doing this.
          </p>
          <p className="mt-2">
            It looks like a redundant{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              Math.max
            </code>{" "}
            in an auto-resize effect, which is precisely why it gets
            &ldquo;simplified&rdquo; away. The floor is re-measured when{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              placeholder
            </code>{" "}
            or{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              size
            </code>{" "}
            changes, since either moves the resting height.
          </p>
        </Callout>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="shell"
        title="App shell"
        description="The frame this page already uses, generalised for the product. Both panels collapse and remember it; the toggle for the left one lives in the brand cell so the control sits on the edge it moves. The account chip is fixed bottom-right so it stays put whichever panels are collapsed."
      >
        <Demo title="Live" note="collapse the panels — the state persists">
          <div className="flex flex-col gap-2">
            <p className="text-base text-text-muted">
              You&apos;re looking at it. Use the panel toggles in the header:
              one beside <span className="font-medium text-text">Craig.</span>{" "}
              for the nav, one at the far right for the details panel.
            </p>
          </div>
        </Demo>
        <Api component="AppShell" props={APPSHELL_PROPS} />

        <Demo title="Back link" note="for pages the nav can't reach">
          <BackLink href="/design-system">Back to design system</BackLink>
        </Demo>
        <Api component="BackLink" props={BACKLINK_PROPS} />
        <Usage>{`import { AppShell, BackLink } from "@/components/ui";`}</Usage>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="builder"
        title="Workflow builder"
        description="One column, top to bottom, in the order the workflow runs. A free canvas would let an admin draw a shape that doesn't correspond to any execution order — a single column can only express what the engine can actually do. The first block is always the same one: a workflow starts when someone is given a seat, and that isn't a choice."
      >
        <Demo
          title="Blocks on a canvas"
          note="drag to pan · ⌘-scroll or the controls to zoom"
          className="items-stretch p-0"
        >
          <CanvasDemo />
        </Demo>

        <Callout tone="neutral" title="Kinds and presets are different things">
          <p>
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              BlockKind
            </code>{" "}
            is the mechanism — what the engine does with a block. There are{" "}
            {Object.keys(BLOCK_TYPES).length}, and there should stay{" "}
            {Object.keys(BLOCK_TYPES).length}. A <em>preset</em> is a named
            piece of onboarding sitting on one of them: “Set up MFA” and “Get
            tools &amp; access” are both tasks as far as the engine is
            concerned, but nobody builds an onboarding by thinking “I need three
            tasks”. Adding a preset is data ({" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              src/lib/workflow/library.ts
            </code>{" "}
            ); adding a kind is a change to the engine.
          </p>
          <p className="pt-2">
            {ALL_PRESETS.length} presets across {BLOCK_LIBRARY.length}{" "}
            categories, picked from the dialog on any connector. Each carries
            its own <em>setup</em> — the fields it needs before it can run — and
            a block with a required field still empty is what “unconfigured”
            means. Derived, not stored, so the badge on the canvas and the
            disabled Publish button are reading the same answer.
          </p>
        </Callout>

        <Api component="WorkflowBuilder" props={BUILDER_PROPS} />
        <Api
          component="WorkflowCanvas"
          props={CANVAS_PROPS}
          note="pan, zoom and the dot grid"
        />
        <Api component="CanvasPanel" props={CANVASPANEL_PROPS} />
        <Usage>{`import { WorkflowBuilder, WorkflowCanvas, CanvasPanel, BlockInspector } from "@/components/ui";`}</Usage>
        <Callout tone="info" icon={<Info />} title="The full builder space">
          <p>
            <Link
              href="/builder/engineer"
              className="font-medium underline underline-offset-4"
            >
              Open the builder
            </Link>{" "}
            — the canvas inside the app shell, with the selected block&apos;s
            inspector in the right panel. Hover a connector to insert a step.
          </p>
        </Callout>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="block-picker"
        title="Block picker"
        description="A dialog with a search box rather than a menu. A dropdown was fine at seven abstract kinds; at thirty-odd named blocks, each needing a sentence to tell Slack from Google Workspace, a menu is a column you scroll blind. Search is first and focused, because past the second workflow an admin knows the name of the block they want — the categories are for the first workflow, when they don't."
      >
        <Demo
          title="Open it"
          note="search filters across label and description; category blurbs hide once you type"
          className="items-stretch"
        >
          <BlockPickerDemo />
        </Demo>

        <Api component="BlockPicker" props={BLOCK_PICKER_PROPS} />
        <Api
          component="BlockPreset"
          props={BLOCK_PRESET_PROPS}
          note="the library entry a card is drawn from — src/lib/workflow/library.ts"
        />
        <Usage>{`import { BlockPicker } from "@/components/ui";\nimport { BLOCK_LIBRARY, blockFromPreset, type BlockPreset } from "@/lib/workflow/library";`}</Usage>

        <Callout
          tone="info"
          icon={<Info />}
          title="Unbuilt blocks are disabled, not hidden"
        >
          <p>
            {ALL_PRESETS.filter((p) => p.unavailable).length} of the{" "}
            {ALL_PRESETS.length} presets can&apos;t be picked yet, and every one
            of them still appears — greyed, with the reason in place of the
            description. The library is the product&apos;s claim about what
            onboarding is made of, and a shorter list is a smaller claim.
            &ldquo;Notion&apos;s API can&apos;t manage workspace members&rdquo;
            is an answer; quietly not having Notion looks like an oversight, and
            an admin who can&apos;t find it goes looking twice.
          </p>
          <p className="mt-2">
            It costs nothing to keep honest, because the disable is derived from
            the reason: a preset is unavailable exactly when{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              unavailable
            </code>{" "}
            holds a string. There is no second flag to fall out of step with it,
            and shipping the block means deleting the sentence.
          </p>
        </Callout>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="block-setup"
        title="Block setup"
        description="The fields a block needs before it can run — and the reason “unconfigured” is never stored. It's derived from which required fields are empty, so the badge on the canvas, the count in the nav and the disabled Publish button are all reading the same answer and can't drift. A stored flag is a flag somebody forgets to clear."
      >
        <Demo
          title="A preset's setup, and what it derives"
          note="fill a required field and watch the right-hand column change"
          className="items-stretch"
        >
          <BlockSetupDemo />
        </Demo>

        <Api component="BlockSetup" props={BLOCK_SETUP_PROPS} />
        <Api
          component="SetupField"
          props={SETUP_FIELD_PROPS}
          note="one field's definition, from the preset"
        />
        <Usage>{`import { BlockSetup, missingSetup, isUnconfigured, setupWarning } from "@/components/ui";`}</Usage>

        <Callout
          tone="neutral"
          title="Why these fields are the interesting part"
        >
          <p>
            &ldquo;Invite to GitHub&rdquo; is a label. The org, the teams and
            the permission level are the step. Craig&apos;s argument is that the
            undocumented parts of onboarding should be visible, and this form is
            where they turn out to be — nobody knows which Slack channels,
            nobody has decided the AWS permission set, nobody has uploaded the
            contract. An empty required field isn&apos;t a validation error;
            it&apos;s a decision the company hasn&apos;t made yet, which is why
            it&apos;s allowed to sit there and be counted rather than blocking
            the form.
          </p>
          <p className="pt-2">
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              incomplete
            </code>{" "}
            sits alongside the derived warning rather than replacing it: some
            gaps aren&apos;t a missing field at all — &ldquo;nobody owns
            this&rdquo;, &ldquo;the doc it points at is out of date&rdquo; — and{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              isUnconfigured
            </code>{" "}
            counts both.
          </p>
        </Callout>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="test-run"
        title="Test run"
        description="A dry run of a workflow against one named person. The question a test button has to answer is “what would this actually do to someone”, and “it ran successfully” isn't that — so there's no progress bar. It lays out every step in order, with the timing, the owner and the values the admin typed, and where a step can't run it says so at the step rather than in a summary at the top."
      >
        <Demo title="Open it" note="nothing fires — see below">
          <TestRunDemo />
        </Demo>

        <Api component="TestRun" props={TEST_RUN_PROPS} />
        <Usage>{`import { TestRun } from "@/components/ui";`}</Usage>

        <Callout
          tone="warning"
          icon={<Warning />}
          title="Exported, but nothing calls it"
        >
          <p>
            The builder&apos;s Test run button was removed when the right panel
            became Craig&apos;s, and the component was left in place. It is
            exported from{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              @/components/ui
            </code>{" "}
            and rendered here, and nowhere else in the app — so this section
            documents a working primitive with no home, not a feature of the
            product. Treat it as a component to place, or to delete.
          </p>
        </Callout>

        <Callout tone="info" icon={<Info />} title="Nothing fires">
          <p>
            Stated once in the dialog description and never contradicted
            anywhere in the panel: no invites, no accounts, no email. A test
            that might send a real invite to a real person is not a test, and a
            dry run that hedges about it will be run once and never trusted
            again.
          </p>
        </Callout>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="email-preview"
        title="Email preview"
        description="What actually lands in the inbox. Two parts, because they fail differently: the inbox row — sender, address, subject, preheader — is the only bit most recipients ever read and the bit template editors usually don't show, and the body is what you get if they open it."
      >
        <Demo title="Every template Craig sends" className="items-stretch">
          <EmailPreviewDemo />
        </Demo>

        <Api component="EmailPreview" props={EMAIL_PREVIEW_PROPS} />
        <Usage>{`import { EmailPreview } from "@/components/ui";\nimport { TEMPLATES, MERGE_FIELDS, render } from "@/lib/email";`}</Usage>

        <Callout
          tone="info"
          icon={<Info />}
          title="It stays light in dark mode, on purpose"
        >
          <p>
            This is the one component in the system that ignores the theme.
            Email renders on the recipient&apos;s terms, not ours — a dark-mode
            preview of something that will arrive on white is a preview that
            lies. So it uses fixed values rather than tokens, inside a frame
            that makes clear it&apos;s a different surface to the app around it.
            That&apos;s the exception that proves the rule; nothing else in here
            gets to hardcode a colour.
          </p>
          <p className="mt-2">
            The footer says who sent it and why, and there is no unsubscribe.
            These are transactional — one person, one thing, triggered by a
            step. Offering a way off a list implies there&apos;s a list.
          </p>
        </Callout>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="modals"
        title="Modal family"
        description="Six dialogs sit on the one Dialog primitive, and they're not interchangeable. A modal is the right shape for a decision that has to be made now and can't be made anywhere else — it stops the page precisely so nothing else competes. That's also why it's usually the wrong answer: most of what a product wants to say isn't urgent enough to earn a blocked screen."
      >
        <Demo title="Three of them, live" note="AddSeat, celebration, paywall">
          <ModalFamilyDemo />
        </Demo>

        <Demo title="The family" className="items-stretch">
          <List className="w-full">
            <ListItem
              overline="Form"
              title="AddSeat"
              description="Name, email, start, workflow — and a live panel saying exactly what pressing the button does to a real person. “Here is what happens” is a better question than “are you sure?”"
              meta="src/components/add-seat.tsx"
              trailing={
                <Badge tone="neutral" size="sm">
                  Home
                </Badge>
              }
            />
            <ListItem
              overline="Form"
              title="V3AddSeat"
              description="The demo twin, pre-filled. Its one real argument is the personal email address: everything after the contract goes to her work account, which signing the contract is what creates."
              meta="src/components/v3/v3-add-seat.tsx"
              trailing={
                <Badge tone="neutral" size="sm">
                  v3
                </Badge>
              }
            />
            <ListItem
              overline="Picker"
              title="BlockPicker"
              description="Search plus a categorised grid. A dialog because the library is thirty-odd named blocks and a menu would be a column you scroll blind."
              meta="src/components/ui/block-picker.tsx"
              trailing={
                <Badge tone="neutral" size="sm">
                  Builder
                </Badge>
              }
            />
            <ListItem
              overline="Read-only"
              title="TestRun"
              description="A dry run laid out step by step. Currently exported with no call site — see the Test run section."
              meta="src/components/ui/test-run.tsx"
              trailing={
                <Badge tone="warning" size="sm">
                  Unused
                </Badge>
              }
            />
            <ListItem
              overline="Moment"
              title="CelebrateDialog"
              description="Two dates and no confetti."
              meta="src/components/v3/celebrate-dialog.tsx"
              trailing={
                <Badge tone="neutral" size="sm">
                  v3
                </Badge>
              }
            />
            <ListItem
              overline="Moment"
              title="PaywallDialog"
              description="A price, and what you keep if you say no."
              meta="src/components/v3/paywall-dialog.tsx"
              trailing={
                <Badge tone="neutral" size="sm">
                  v3
                </Badge>
              }
            />
            <ListItem
              overline="Conversation"
              title="ChatModal"
              description="Ask Craig, over the workflow you're looking at. size=&quot;chat&quot; is fixed-height so the composer doesn't move as messages arrive."
              meta="src/components/ui/chat.tsx"
              trailing={
                <Badge tone="neutral" size="sm">
                  Builder
                </Badge>
              }
            />
          </List>
        </Demo>

        <Usage>{`import { Dialog, DialogClose, BlockPicker, TestRun, ChatModal } from "@/components/ui";\nimport { AddSeat } from "@/components/add-seat";`}</Usage>

        <Callout
          tone="warning"
          icon={<Warning />}
          title="When a dialog is the wrong answer"
        >
          <p>
            Two decisions in this codebase went the other way, and both are
            worth more than the six above.
          </p>
          <p className="mt-2">
            <strong className="font-medium text-text">
              Craig&apos;s conversation on Home is not a modal.
            </strong>{" "}
            The thing he&apos;s asking about is the brief directly above the
            composer — which steps are open, which one nobody owns. A modal
            would cover the very thing it exists to act on, and the answer to
            &ldquo;which Slack channels?&rdquo; is on screen behind it. So the
            composer sits on the bottom edge of the page and the brief stays put
            and stays current.
          </p>
          <p className="mt-2">
            <strong className="font-medium text-text">
              The Resources composer was deleted, not made modal.
            </strong>{" "}
            There was already one on Home reading the same documents, and two
            boxes that ask Craig things is one too many. The instinct when a
            second entry point feels crowded is to hide it behind a button; the
            right move was to notice it was a duplicate.
          </p>
          <p className="mt-2">
            A design system that only shows how to open a dialog teaches people
            to reach for one. If the content is a place, it&apos;s a page. If
            it&apos;s context, it&apos;s a panel. A modal is for a decision that
            blocks everything behind it — and if it doesn&apos;t, the modal is
            lying about how important it is.
          </p>
        </Callout>

        <Callout tone="neutral" title="Two of them are copy, doing real work">
          <p>
            <strong className="font-medium text-text">CelebrateDialog</strong>{" "}
            is the obvious confetti screen, written for the person actually
            reading it. Theo never wanted a pleasant first week for its own sake
            — he wanted a training record he can hand an auditor in March
            without apologising for it. So the modal is two dates: signed and
            approved four working days in, where the SOP allows five; a police
            check back in nine, because it went out the day she got her seat.
            Praise nobody asked for reads as flattery. A signed record inside
            the deadline reads as the thing working.
          </p>
          <p className="pt-2">
            <strong className="font-medium text-text">PaywallDialog</strong>{" "}
            states what the money buys and, in the same box, what you keep if
            you say no: the records stay readable and exportable, the workflow
            stays written, Craig just can&apos;t run it against anybody new.
            Leaving that half out is why people distrust the other half — and it
            costs nothing, because it&apos;s true. The primary action is still
            Upgrade; the honesty is what makes it answerable.
          </p>
        </Callout>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="agent"
        title="Agent conversation"
        description="Craig is an agent, not a chatbot, and the difference is visible in these four pieces. A chatbot answers; an agent notices something, proposes, waits for a yes, and does it. The primitives here exist because that shape was hand-rolled four times over three demos and had already started to drift."
      >
        <Demo
          title="Phases, not a spinner"
          note="press Run — the change lands with the last phase, not the first"
          className="items-start"
        >
          <AgentWorkDemo />
        </Demo>

        <Callout tone="neutral" title="Why the labels are specific">
          <p className="text-base leading-relaxed text-text-muted">
            Each phase names a thing the agent would actually have to do, in the
            order it would do it, so the wait explains itself.
            &ldquo;Reconciling SOP-014 against the checklist&rdquo; is a claim
            you can check; &ldquo;Setting things up&rdquo; is a spinner with
            words on it. And there is no spinner beside them on purpose — the
            mark is already there and the label already changes, so a spinning
            circle is a third thing saying the same thing.
          </p>
        </Callout>

        <Demo title="Turns" className="items-start">
          <AgentTurnsDemo />
        </Demo>

        <Callout tone="neutral" title="The question is pulled out of the prose">
          <p className="text-base leading-relaxed text-text-muted">
            Buried at the end of four paragraphs an ask gets skimmed past, and
            then the reply below it reads as answering nothing. Dotted outline
            and no fill, because it is an aside asking something rather than a
            card announcing something — and dotted is already this system&apos;s
            language for &ldquo;provisional&rdquo;. A filled block read heavier
            than the answer above it.
          </p>
        </Callout>

        <Api component="useAgentWork" props={AGENT_WORK_PROPS} />
        <Usage>{`import { AgentPhase, AgentQuestion, PersonTurn, useAgentWork } from "@/components/ui";`}</Usage>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="certainty"
        title="Certainty"
        description="How the agent knows a step is done. Three states, deliberately not two: he created the Google account and can see it, but Saoirse says she ran the lab induction and there is nothing for him to look at. A column of green ticks flattens those into one claim, and the weaker one is the one that will be wrong."
      >
        <Demo title="The three states" className="items-start">
          <CertaintyDemo />
        </Demo>

        <Callout
          tone="warning"
          title="This is product vocabulary, like TASK_STATUS"
        >
          <p className="text-base leading-relaxed text-text-muted">
            It lives in the UI layer and is declared exactly once, so the
            admin&apos;s view and the new starter&apos;s view cannot drift. It
            was previously declared in two fixture files, re-exported through a
            third and mirrored a fourth time inside a page — and the copy had
            already diverged by a punctuation mark. At a company whose records
            get read by an auditor, the distinction between &ldquo;I
            checked&rdquo; and &ldquo;somebody told me&rdquo; is the record.
          </p>
        </Callout>

        <Usage>{`import { CERTAINTY, CertaintyPill, type Certainty } from "@/components/ui";`}</Usage>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="activity"
        title="Activity"
        description="What the agent did without being asked. This is the ledger, and it is what makes throwing the conversation away safe — the transcript is scaffolding, the change it produced is the record, and this is where the change is attributed and dated."
      >
        <Demo title="Both stamp modes" className="items-start">
          <ActivityDemo />
        </Demo>

        <Callout tone="neutral" title="The verb is separated from the sentence">
          <p className="text-base leading-relaxed text-text-muted">
            Sent, Checked, Chased, Noticed, Set. A column of them scans as kinds
            of action rather than as prose, which is what you want from a record
            you consult rather than read. <code>stamp=&quot;newest&quot;</code>{" "}
            times only the top entry — when everything says &ldquo;Just
            now&rdquo;, twelve identical stamps are noise around the one that is
            actually true.
          </p>
        </Callout>

        <Usage>{`import { ActivityFeed, type ActivityEntry } from "@/components/ui";`}</Usage>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="auth"
        title="Auth"
        description="Email and password, or Google. These components render and validate shape — nothing else. Auth belongs on the server; a component that 'signs you in' in the browser is a component that lies."
      >
        <Demo
          title="Sign up — two panels"
          note="the page both demos open on"
          className="items-stretch"
        >
          <SignUpDemo />
        </Demo>

        <Callout
          tone="info"
          icon={<Info />}
          title="One of the three fields is inferred"
        >
          <p>
            The company name is read off the email domain. Craig can parse
            &ldquo;theo@calderdx.com&rdquo; as well as Theo can, and asking him
            to type &ldquo;Calder&rdquo; straight after typing
            &ldquo;@calderdx.com&rdquo; is asking him to prove something we
            already know. A signup form is the first thing a product ever asks
            of someone and every field is a chance to close the tab.
          </p>
          <p className="mt-2">
            It&apos;s shown back and editable rather than assumed silently —
            inference you can&apos;t see is indistinguishable from a mistake,
            and the hint says where the value came from so a wrong guess reads
            as a guess.{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              PUBLIC_DOMAINS
            </code>{" "}
            exists because a gmail address says nothing about where somebody
            works: there the field infers nothing and asks properly. Typing in
            it once stops the inference overwriting you on the next keystroke.
          </p>
          <p className="mt-2">
            The layout carries two arguments of its own. The form is
            left-aligned in a column sized to itself, because a centred column
            of labels makes the eye travel further down a form than it needs to.
            The right panel is what the product does, shown rather than claimed,
            on the same dot grid the workflow canvas uses — and below{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              lg
            </code>{" "}
            it isn&apos;t rendered at all, because there it would only be
            something to scroll past to reach the form.
          </p>
        </Callout>

        <Callout
          tone="warning"
          icon={<Warning />}
          title="The validation is real. The account isn't."
        >
          <p>
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              /sign-up
            </code>{" "}
            checks the shape of what you typed and then routes to{" "}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs">
              /welcome
            </code>
            . There is no backend and nothing is created. Before this ships, the
            route it lands on has to be guarded server-side — otherwise
            it&apos;s a signup page that lets anyone in by clicking a button,
            and it will look finished enough that nobody checks.
          </p>
        </Callout>

        <Demo title="Sign in" className="items-start">
          <AuthDemo />
        </Demo>

        <Api
          component="Auth"
          props={AUTH_PROPS}
          note="four pieces, composed by the /sign-in route"
        />
        <Usage>{`import { AuthShell, GoogleButton, AuthDivider, PasswordInput } from "@/components/ui";`}</Usage>

        <Callout tone="info" icon={<Info />} title="On the Google mark">
          <p>
            Google&apos;s branding guidelines require the official four-colour
            &ldquo;G&rdquo;, unrecoloured, on a light surface — so it keeps its
            own colours in dark mode and sits on a white chip rather than being
            tinted to match the theme.
          </p>
        </Callout>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="agent-surfaces"
        title="Where the agent lives"
        description="Three surfaces, and the choice between them is not cosmetic. A modal covers the thing it is meant to act on. An appending transcript reads as page content you might lose. A panel that grows out of the composer and closes reads as a working surface — which is what it is, because almost nothing said here is worth keeping."
      >
        <Callout tone="neutral" title="The dock — Home">
          <p className="text-base leading-relaxed text-text-muted">
            Idle it is a prompt bar. Say something and it becomes a bounded
            surface with the exchange inside it and the composer still at the
            bottom of the same object. The shape is the argument: she says
            &ldquo;#general #engineering&rdquo;, Craig writes it into the Slack
            block, and <em>the block</em> is the record — so closing the panel
            has to feel like closing a drawer rather than deleting a document.
            That only works because everything he does is written to the
            activity ledger as well; otherwise dismissing it really would lose
            something.
          </p>
        </Callout>

        <Callout tone="neutral" title="The side panel — the builder">
          <p className="text-base leading-relaxed text-text-muted">
            The canvas is a good editor and a bad conversation. Filling in a
            Slack workspace URL means selecting the block, finding the field and
            typing — three deliberate acts for something you could say in four
            words. The panel takes what you say and works out which step it
            belongs to, so you never have to know that
            &ldquo;katalis.slack.com&rdquo; is the <code>workspace</code> field
            of the block called Slack.
          </p>
          <p className="pt-2 text-base leading-relaxed text-text-muted">
            It is deliberately narrow — links, channel names, and &ldquo;add a
            &lt;preset&gt;&rdquo; matched against the block library rather than
            a keyword list. Anything else it says plainly it cannot do. An
            editor that quietly does the wrong thing is worse than one that does
            nothing, and that is the real design constraint on this pattern.
          </p>
        </Callout>

        <Callout tone="warning" title="The transcript lives above the panel">
          <p className="text-base leading-relaxed text-text-muted">
            Craig selects the block he just changed, and selecting swaps the
            panel to that block&apos;s fields — which would unmount him and
            throw away everything he just said. The conversation is held in the
            page (<code>useCraigPanel</code>), so leaving and coming back finds
            the thread where it was. This is the non-obvious part, and the one
            most likely to be undone by somebody tidying up.
          </p>
        </Callout>

        <Callout tone="danger" title="When a dialog is the wrong answer">
          <p className="text-base leading-relaxed text-text-muted">
            Two real cases from this repo. Home&apos;s conversation is not a
            modal, because a modal would cover the brief it exists to act on.
            And the Resources composer was deleted rather than made modal,
            because two boxes that ask Craig things is one box too many. A
            design system that only shows how to open a dialog teaches people to
            open one.
          </p>
        </Callout>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="brief"
        title="Queue and ledger"
        description="Two lists that look alike and answer different questions. The queue is what needs you — you drain it. The ledger is what the agent did — you consult it. Draining a ledger makes no sense; consulting a queue misses the point."
      >
        <Callout tone="neutral" title="Why they must not merge">
          <p className="text-base leading-relaxed text-text-muted">
            In an agentic product the split matters more, not less. Craig does
            most things himself, so if everything he did became a notification
            you would have forty unread within a week, learn to ignore the bell,
            and bury the two things that genuinely need you. Worse, it
            contradicts the claim: a notification says <em>you handle it</em>,
            and the whole product argument is <em>I handled it</em>. The bell
            should be near-empty, and that emptiness is the product working.
          </p>
        </Callout>

        <Callout tone="neutral" title="The queue asks questions, not chores">
          <p className="text-base leading-relaxed text-text-muted">
            &ldquo;Configure Slack&rdquo; is a task assigned to somebody.
            &ldquo;Which Slack channels does a new engineer actually
            need?&rdquo; is a question only the founder can answer, which is the
            actual situation. One row per step rather than per workflow, because
            &ldquo;3 steps need setting up&rdquo; is a number you have to go and
            decode. Every row is derived from the same <code>gaps()</code> the
            builder and the nav counter read, so they cannot disagree. And it is
            dismissable — an agent that cannot be told &ldquo;not now&rdquo; is
            a nag.
          </p>
        </Callout>

        <Callout tone="warning" title="Known defect: there is a third list">
          <p className="text-base leading-relaxed text-text-muted">
            The notification bell is a second copy of the queue, hardcoded per
            page rather than derived, so it already disagrees with the counters.
            The builder&apos;s bell still says &ldquo;Jason owns six of the
            twelve steps&rdquo; — he owns none of them, and there are eleven.
            The fix is to derive it from the same place, and to move anything of
            kind <code>complete</code> out of it and into the ledger where it
            belongs.
          </p>
        </Callout>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="patterns"
        title="In context"
        description="The same primitives, assembled the way each seat will actually use them."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">
              Admin — step row in the builder
            </h3>
            <Card className="divide-y divide-border">
              {[
                {
                  title: "Sign employment contract",
                  owner: "Ada",
                  status: "complete",
                },
                {
                  title: "GitHub + AWS keys",
                  owner: "Jason",
                  status: "in_progress",
                },
                {
                  title: "Add to Slack channels",
                  owner: "—",
                  status: "not_started",
                },
              ].map((row) => (
                <div
                  key={row.title}
                  className="group flex items-center gap-3 px-3.5 py-2.5"
                >
                  <DragIndicator className="size-4 cursor-grab text-text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
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
                    <Delete />
                  </Button>
                </div>
              ))}
              <div className="p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                >
                  <Add />
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
                  <Avatar name="Nils Hoffman" size="lg" />
                  <div className="flex flex-col">
                    <CardTitle>Welcome, Nils</CardTitle>
                    <CardDescription>Day 1 of 30 · Engineer</CardDescription>
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
                  <ArrowForward />
                </Button>
                <span className="text-xs text-text-subtle">
                  Next: keys from Jason
                </span>
              </CardFooter>
            </Card>
          </div>
        </div>
      </Section>
    </div>
  );
}
