"use client";

import * as React from "react";
import Link from "next/link";
import {
  AppShell,
  Avatar,
  Badge,
  Callout,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  ControlRow,
  EmailPreview,
  Field,
  Input,
  SelectMenu,
  MARK_MIN_SIZE,
  MARK_STROKE,
  Button,
  Progress,
  Separator,
  StatusPill,
  buttonVariants,
  type AppNotification,
  type TaskStatus,
} from "@/components/ui";
import {
  AltRoute,
  Database,
  Description,
  Mail,
  MenuBook,
  OpenInNew,
  Palette,
  PersonAdd,
  PlayArrow,
} from "@/components/ui/icons";
import {
  AUDIENCE,
  TEMPLATES as EMAIL_TEMPLATES,
} from "@/lib/email";
import { SECTIONS } from "@/app/design-system/sections";
import { ACCOUNT, COMPANY, PEOPLE } from "@/lib/demo";
import { cn } from "@/lib/cn";

/**
 * The builder's hub — not part of the product. Everything else under /src/app
 * is a screen a Katalis person would see; this is the screen the person
 * *building* Craig lands on to see what state the repo is in and what's next.
 *
 * It runs on AppShell like every other route, deliberately: if the frame
 * breaks, it should break on the page opened most often.
 *
 * The counts here are derived from the modules they describe rather than
 * typed in, so the page can't quietly go stale — the one number that would
 * drift fastest is the section count, and it comes straight from SECTIONS.
 */

const REPO = "https://github.com/drosihan01/craig";

const SECTION_COUNT = SECTIONS.reduce((n, g) => n + g.items.length, 0);

/* -------------------------------------------------------------------------- */
/*  Home — what's actually left                                               */
/* -------------------------------------------------------------------------- */

interface Todo {
  id: string;
  title: string;
  note: string;
  /** File the work lands in, when there's an obvious one. */
  where?: string;
  /** Only set when the item is genuinely waiting on something else. */
  status?: TaskStatus;
  tag?: { label: string; tone: "danger" | "warning" };
}

interface TodoGroup {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  items: Todo[];
}

const TODOS: TodoGroup[] = [
  {
    id: "domain",
    title: "Domain model",
    description:
      "The workflow is currently described only by the components that draw it.",
    icon: AltRoute,
    items: [
      {
        id: "d1",
        title: "Name the thing an admin publishes: WorkflowTemplate",
        note: "The builder passes WorkflowBlock[] around and nothing in the codebase names the artefact itself.",
        where: "src/lib/workflow/",
      },
      {
        id: "d2",
        title: "Split template from instance",
        note: "Assigning a workflow has to snapshot it. Editing a template must never retroactively rewrite an onboarding someone is halfway through.",
        status: "blocked",
      },
      {
        id: "d3",
        title: "Move TASK_STATUS out of badge.tsx",
        note: "It is the state machine both seats read from, not a badge concern. The README already flags this.",
        where: "src/components/ui/badge.tsx",
      },
      {
        id: "d4",
        title: "Move BLOCK_TYPES and INSERTABLE the same way",
        note: "Kinds, labels and which ones can be inserted are domain. Only the icon mapping belongs to the component.",
        where: "src/components/ui/workflow-builder.tsx",
      },
    ],
  },
  {
    id: "backend",
    title: "Backend",
    description: "None of it exists. Every screen is front-end state.",
    icon: Database,
    items: [
      {
        id: "b1",
        title: "Persist a workflow",
        note: "/builder holds its blocks in React state — a refresh loses the whole thing.",
        where: "src/app/builder/page.tsx",
      },
      {
        id: "b2",
        title: "Real auth, and guard the routes server-side",
        note: "/sign-in validates the shape of an email and then routes to /. Nothing behind it is protected.",
        where: "src/app/sign-in/page.tsx",
        tag: { label: "Security", tone: "danger" },
      },
      {
        id: "b3",
        title: "Enforce the model data boundary in the API layer",
        note: "internal: true on Craigopilot is a label. Nothing currently stops a request routed to a hosted model from carrying tenant data.",
        where: "src/components/ui/model-picker.tsx",
        tag: { label: "Security", tone: "danger" },
      },
      {
        id: "b4",
        title: "Publish endpoint, with the unconfigured check on the server",
        note: "“A workflow can’t be published while any block is unconfigured” is a sentence in the nav, not a rule.",
        status: "blocked",
      },
    ],
  },
  {
    id: "product",
    title: "Product surface",
    description: "Screens the README promises that have no route yet.",
    icon: PersonAdd,
    items: [
      {
        id: "p1",
        title: "Build the new-starter seat",
        note: "Stepper and WorkflowProgress were designed for it and currently render nowhere but the showcase.",
      },
      {
        id: "p2",
        title: "Wire the home prompt to generation",
        note: "/ collects the description and answers with hard-coded copy. The draft it promises is never produced.",
        where: "src/app/page.tsx",
      },
      {
        id: "p3",
        title: "Replace the placeholder nav in the builder",
        note: "Build / People / Settings are bare anchors pointing at #.",
        where: "src/app/builder/page.tsx",
      },
    ],
  },
  {
    id: "housekeeping",
    title: "Housekeeping",
    description: "Small, and cheap to do before they compound.",
    icon: Description,
    items: [
      {
        id: "h1",
        title: "README is behind the routes",
        note: "It still says / redirects to /design-system, which stopped being true when the admin home landed. The layout tree is missing builder/ and lib/demo.ts.",
        where: "README.md",
      },
      {
        id: "h2",
        title: "Delete lib/demo.ts when persistence lands",
        note: "Its own doc comment says to delete it rather than grow it. Easy to forget once real records exist.",
        where: "src/lib/demo.ts",
      },
    ],
  },
];

const TODO_COUNT = TODOS.reduce((n, g) => n + g.items.length, 0);

/* -------------------------------------------------------------------------- */
/*  Docs — decisions worth not re-litigating                                  */
/* -------------------------------------------------------------------------- */

const DECISIONS: { title: string; body: string }[] = [
  {
    title: "Tokens are three layers deep",
    body: "Palette → semantic → @theme. Components only ever touch layer 3, so retuning the accent is a one-line change and dark mode is a variable swap rather than a sweep through every file.",
  },
  {
    title: "Panels never carry overflow: hidden",
    body: "That makes an element a scroll container, which then becomes the scrollport for any sticky child — the child offsets by its top immediately and never sticks. In AppShell the aside owns width, and an inner wrapper owns clipping.",
  },
  {
    title: "Dashed inside a card, solid across the gap",
    body: "The workflow connector reads as one continuous thread without a line cutting through content. The two segments are positioned off measured constants because a card's border box and padding box differ by a pixel — miss it and they render offset.",
  },
  {
    title: "One stroke weight for the mark",
    body: `MARK_STROKE is ${MARK_STROKE} in the mark's own 256-unit space and does not vary. Below ${MARK_MIN_SIZE}px the detail collapses at any weight, so use the wordmark instead of thinning the stroke.`,
  },
  {
    title: "Base type is 14px",
    body: "App density, not marketing-site density. text-base is body, text-sm and text-xs are secondary. The scale tops out early on purpose.",
  },
  {
    title: "No date library",
    body: "Onboarding only needs “pick a day”, so Calendar uses Date and Intl. All maths is local-time: a UTC-based Date lands on the wrong day for anyone east of Greenwich. Use toISODate, never toISOString.",
  },
  {
    title: "Toasts and notifications are different jobs",
    body: "A toast confirms what just happened and disappears; a notification persists because someone still owes an action. Anything owed belongs in the feed. The panel never marks anything read on its own.",
  },
  {
    title: "The builder is a column, not a canvas",
    body: "A free canvas lets an admin draw a shape no engine can run. A single column can only express a real execution order — which is why the trigger is structural and steps are inserted from the connector.",
  },
];

/* -------------------------------------------------------------------------- */
/*  Backend — the shape the front end is already assuming                     */
/* -------------------------------------------------------------------------- */

const SCHEMA = `// What the admin edits. Versioned, and immutable once published.
WorkflowTemplate {
  id, orgId, role
  version, status: "draft" | "published"
  blocks: WorkflowBlock[]
  publishedAt?
}

// One new starter's run. Carries its own copy of the steps,
// taken when the workflow is assigned — never a live reference
// back to the template.
WorkflowInstance {
  id, templateId, templateVersion
  personId, startDate
  steps: StepInstance[]
}

StepInstance {
  id, blockId          // provenance, not a lookup
  title, ownerId, dueOn
  status: TaskStatus   // the one in badge.tsx today
  completedAt?
}`;

const SERVER_WORK: { title: string; body: string; security?: boolean }[] = [
  {
    title: "Persistence",
    body: "Templates, instances and step state. The builder's insert / move / duplicate / patch operations already define the mutations an API has to expose.",
  },
  {
    title: "Auth and tenancy",
    body: "Sessions, an org boundary, and route guards. Auth components render and validate shape only — a component that signs you in is a component that lies.",
  },
  {
    title: "Model routing",
    body: "The picker offers one in-house model and two hosted ones. The API has to refuse to send tenant data to a hosted model; the label is not the control.",
    security: true,
  },
  {
    title: "Generation",
    body: "The home prompt takes a company description and a handbook and is supposed to return a draft workflow the admin then edits. Nothing behind it yet.",
  },
];

/* -------------------------------------------------------------------------- */
/*  Demo                                                                      */
/* -------------------------------------------------------------------------- */

interface Run {
  href: string;
  label: string;
  body: string;
}

/**
 * Demo v1 — Ada, already inside, drafting a workflow from her handbook.
 * The original run-through. Starts mid-story.
 */
const FLOW_V1: Run[] = [
  {
    href: "/sign-in",
    label: "Sign in",
    body: "Returning-device state, so Ada is offered straight back in.",
  },
  {
    href: "/",
    label: "Admin home",
    body: "The dashboard: add someone, what needs you, who's onboarding.",
  },
  {
    href: "/builder",
    label: "Workflow builder",
    body: "The draft, drawn from Ada's handbook — small, with the gaps left visible rather than invented over.",
  },
];

/**
 * Demo v2 — the whole thing, from nobody having heard of Craig.
 *
 * The point of starting at signup rather than mid-story: the first screen
 * after creating an account is a conversation, not a setup wizard. No wizard
 * would have a field for "three people, nothing written down, handbook from
 * February", and that's the most important thing about Ada.
 */
const FLOW_V2: Run[] = [
  {
    href: "/sign-up",
    label: "Sign up",
    body: "Three fields, one of them inferred from the email domain. No card.",
  },
  {
    href: "/welcome",
    label: "Tell Craig about the company",
    body: "No nav, no side panel — the account is empty, so there's nowhere to go and nothing to show. Just the conversation.",
  },
  {
    href: "/builder/engineer",
    label: "The draft that falls out of it",
    body: "Twelve steps, three of them left open because Craig won't guess at a right-to-work check.",
  },
  {
    href: "/",
    label: "Add someone",
    body: "The loop. Gated on the workflow actually being able to run.",
  },
  {
    href: "/s/8f2a",
    label: "Nils claims his seat",
    body: "No signup form — Ada provisioned the account, he just picks how to sign in.",
  },
  {
    href: "/onboarding",
    label: "Nils's side",
    body: "The half the product is for. The whole path, what's not his, and a nudge button.",
  },
];

const NOTIFICATIONS: AppNotification[] = [
  {
    id: "s1",
    kind: "overdue",
    title: "The model data boundary isn’t enforced",
    description: "internal: true is a label until the API layer honours it",
    timestamp: new Date(Date.now() - 12 * 60_000),
  },
  {
    id: "s2",
    kind: "overdue",
    title: "Nothing persists",
    description: "The builder loses the workflow on refresh",
    timestamp: new Date(Date.now() - 3 * 3_600_000),
  },
  {
    id: "s3",
    kind: "info",
    title: `Design system is at ${SECTION_COUNT} sections`,
    description: "Foundations, components and patterns",
    timestamp: new Date(Date.now() - 30 * 3_600_000),
    read: true,
  },
];

/* -------------------------------------------------------------------------- */

/** The five sections, switched from the left panel rather than a tab strip. */
const SANDBOX_SECTIONS = [
  { value: "home", label: "Home" },
  { value: "design", label: "Design system" },
  { value: "docs", label: "Docs" },
  { value: "backend", label: "Backend" },
  { value: "demo", label: "Demo" },
  { value: "mail", label: "Mail" },
];

export default function SandboxPage() {
  const [tab, setTab] = React.useState("home");
  /* Ticking a box is front-end state and nothing else — the same gap this list
     is mostly about. Said out loud on the Home tab rather than hidden. */
  const [done, setDone] = React.useState<ReadonlySet<string>>(new Set());

  function toggle(id: string) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const open = TODO_COUNT - done.size;

  return (
    <AppShell
      title="Sandbox"
      nav={
        <SandboxNav section={tab} onSection={setTab} open={open} />
      }
      asideTitle="Project"
      aside={<SandboxAside />}
      notifications={NOTIFICATIONS}
      account={ACCOUNT}
      actions={
        <Link
          href="/builder"
          className={buttonVariants({ size: "sm", variant: "secondary" })}
        >
          Open the builder
        </Link>
      }
    >
      <div className="mx-auto w-full max-w-4xl py-8">
        <header className="mb-6 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">
              {SANDBOX_SECTIONS.find((t) => t.value === tab)?.label ?? "Sandbox"}
            </h1>
            <Badge tone="accent">Builder&apos;s hub</Badge>
          </div>
          <p className="max-w-2xl text-md text-text-muted">
            Not part of the product — this is the starting point for whoever is
            building Craig. What state the repo is in, what&apos;s decided, and
            what to pick up next.
          </p>
        </header>

        <div>
          {tab === "home" && (
            <HomeTab done={done} onToggle={toggle} open={open} />
          )}
          {tab === "design" && <DesignTab />}
          {tab === "docs" && <DocsTab />}
          {tab === "backend" && <BackendTab />}
          {tab === "demo" && <DemoTab />}
          {tab === "mail" && <MailTab />}
        </div>
      </div>
    </AppShell>
  );
}

/* --- Home ------------------------------------------------------------------ */

function HomeTab({
  done,
  onToggle,
  open,
}: {
  done: ReadonlySet<string>;
  onToggle: (id: string) => void;
  open: number;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <p className="text-base font-medium">
            {open} open{" "}
            <span className="text-text-subtle">
              · {done.size} of {TODO_COUNT} ticked
            </span>
          </p>
          <p className="text-xs text-text-subtle">
            Grouped by what has to be true first
          </p>
        </div>
        <Progress value={done.size} max={TODO_COUNT} label="Todos ticked" />
      </div>

      {TODOS.map((group) => {
        const remaining = group.items.filter((i) => !done.has(i.id)).length;
        return (
          <Card key={group.id}>
            <CardHeader className="flex-row items-start gap-3">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-text-muted">
                <group.icon className="size-4" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <CardTitle>{group.title}</CardTitle>
                <CardDescription>{group.description}</CardDescription>
              </div>
              <Badge
                size="sm"
                tone={remaining === 0 ? "success" : "neutral"}
                className="mt-0.5 shrink-0"
              >
                {remaining === 0 ? "clear" : `${remaining} open`}
              </Badge>
            </CardHeader>

            <CardContent className="flex flex-col gap-3.5">
              <Separator />
              {group.items.map((item) => {
                const checked = done.has(item.id);
                return (
                  <ControlRow
                    key={item.id}
                    control={
                      <Checkbox
                        checked={checked}
                        onChange={() => onToggle(item.id)}
                      />
                    }
                    label={
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            checked && "text-text-subtle line-through",
                          )}
                        >
                          {item.title}
                        </span>
                        {item.tag && !checked && (
                          <Badge size="sm" tone={item.tag.tone}>
                            {item.tag.label}
                          </Badge>
                        )}
                        {item.status && !checked && (
                          <StatusPill status={item.status} size="sm" />
                        )}
                      </span>
                    }
                    description={
                      <span className="flex flex-col gap-0.5">
                        <span>{item.note}</span>
                        {item.where && (
                          <span className="font-mono text-xs text-text-subtle">
                            {item.where}
                          </span>
                        )}
                      </span>
                    }
                  />
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      <Callout tone="neutral">
        Ticking a box here is React state and nothing else — it resets on
        refresh, exactly like the workflow in <Code>/builder</Code>. Which is
        most of the list.
      </Callout>
    </div>
  );
}

/* --- Design system --------------------------------------------------------- */

function DesignTab() {
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="flex-row items-start gap-3">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent-subtle-fg">
            <Palette className="size-4" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <CardTitle>The design system</CardTitle>
            <CardDescription>
              The primitives both seats are built from, browsable and running on
              the same shell as the product.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat value={String(SECTION_COUNT)} label="Sections" />
            <Stat value={String(SECTIONS.length)} label="Groups" />
            <Stat value="3" label="Token layers" />
            <Stat value="0" label="UI dependencies" />
          </div>
          <Link
            href="/design-system"
            className={cn(
              buttonVariants({ size: "sm", variant: "secondary" }),
              // Flex child of a column: without this it stretches full width.
              "self-start",
            )}
          >
            Open the design system
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What&apos;s in it</CardTitle>
          <CardDescription>
            Read from the same list that orders the page, so it can&apos;t drift.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {SECTIONS.map((group) => (
            <div key={group.group} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
                  {group.group}
                </p>
                <Badge size="sm">{group.items.length}</Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                {group.items.map((item) => (
                  <Badge key={item.id} size="sm">
                    {item.label}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stack</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5">
          <Line label="Framework">
            Next.js 16 (App Router) · React 19 · TypeScript
          </Line>
          <Line label="Styling">
            Tailwind v4, tokens in <Code>src/app/globals.css</Code>. Components
            only touch the <Code>@theme</Code> layer.
          </Line>
          <Line label="Type">
            Google Sans Flex, self-hosted, one variable file covering 100–1000.
            Three weights in practice.
          </Line>
          <Line label="Icons">
            Material Symbols vendored as inline SVG by{" "}
            <Code>scripts/gen-icons.py</Code>. Add one to the ICONS map and
            re-run it — never hand-write an SVG or install a set.
          </Line>
          <Line label="Runtime deps">
            clsx, tailwind-merge, class-variance-authority. Nothing else, on
            purpose.
          </Line>
        </CardContent>
      </Card>
    </div>
  );
}

/* --- Docs ------------------------------------------------------------------ */

function DocsTab() {
  return (
    <div className="flex flex-col gap-5">
      <Callout tone="accent" icon={<MenuBook />}>
        The long version lives in the README — this is the set worth
        remembering before touching anything.
      </Callout>

      <div className="grid gap-3 sm:grid-cols-2">
        {DECISIONS.map((d) => (
          <Card key={d.title}>
            <CardHeader>
              <CardTitle>{d.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base leading-relaxed text-text-muted">
                {d.body}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <a
        href={`${REPO}#readme`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex w-fit items-center gap-1.5 text-base text-accent underline-offset-4 hover:underline"
      >
        Read the full README
        <OpenInNew className="size-4" />
      </a>
    </div>
  );
}

/* --- Backend --------------------------------------------------------------- */

function BackendTab() {
  return (
    <div className="flex flex-col gap-5">
      <Callout tone="warning" title="The model choice is a data boundary">
        Craigopilot is in-house and the only model that sees company
        data. Claude and GPT are hosted, so anything sent to them leaves the
        tenancy. The composer says which regime you&apos;re in — that has to be
        enforced in the API layer, because a label is not a control.
      </Callout>

      <Card>
        <CardHeader className="flex-row items-start gap-3">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-text-muted">
            <Database className="size-4" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <CardTitle>Data model sketch</CardTitle>
            <CardDescription>
              The split the front end already assumes but doesn&apos;t yet
              express.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <pre className="scrollbar-thin overflow-x-auto rounded-md border border-border bg-surface-sunken p-3 font-mono text-xs leading-relaxed text-text-muted">
            {SCHEMA}
          </pre>
        </CardContent>
      </Card>

      <Callout tone="danger">
        An instance holds a copy of its steps, not a pointer at the template.
        Without that, editing a published workflow silently rewrites the
        onboarding of everyone currently part-way through it — including steps
        they&apos;ve already completed.
      </Callout>

      <div className="grid gap-3 sm:grid-cols-2">
        {SERVER_WORK.map((w) => (
          <Card key={w.title}>
            <CardHeader className="flex-row items-center gap-2">
              <CardTitle className="flex-1">{w.title}</CardTitle>
              {w.security && (
                <Badge size="sm" tone="danger">
                  Security
                </Badge>
              )}
            </CardHeader>
            <CardContent>
              <p className="text-base leading-relaxed text-text-muted">
                {w.body}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* --- Demo ------------------------------------------------------------------ */

function DemoTab() {
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="flex-row items-start gap-3">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-text-muted">
            <PlayArrow className="size-4" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <CardTitle>{COMPANY.name}</CardTitle>
            <CardDescription>{COMPANY.pitch}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {Object.values(PEOPLE).map((p) => (
              <div key={p.email} className="flex items-center gap-2">
                <Avatar name={p.name} size="sm" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{p.name}</span>
                  <span className="text-2xs text-text-subtle">{p.role}</span>
                </div>
              </div>
            ))}
          </div>
          <Separator />
          <p className="text-base leading-relaxed text-text-muted">
            Three people, no written process, first non-founder hire starting in
            two weeks. That&apos;s the whole argument: a 500-person company
            already has an HR system, and Craig would be a worse version of it.
            Ada has a Notion doc written at 11pm before a fundraise call, and
            everything else lives in her head and Jason&apos;s. Making the
            undocumented parts visible is the product — not inventing process a
            three-person company doesn&apos;t want.
          </p>
        </CardContent>
      </Card>

      <RunThrough
        title="Demo v2 — the whole thing"
        note="Start here. Begins with nobody having heard of Craig."
        steps={FLOW_V2}
      />

      <RunThrough
        title="Demo v1 — the workflow draft"
        note="Starts mid-story, with Ada already inside."
        steps={FLOW_V1}
      />

      <Callout tone="neutral">
        The gaps in the drafted workflow — a right-to-work check nobody has
        specified, a Slack channel list nobody has written down — are
        deliberate. They&apos;re what Craig is for, and a demo that hides them
        is demoing the wrong thing.
      </Callout>
    </div>
  );
}

function RunThrough({
  title,
  note,
  steps,
}: {
  title: string;
  note: string;
  steps: Run[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          {title}
        </p>
        <p className="text-xs text-text-subtle">{note}</p>
      </div>
      <div className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <Link key={step.href} href={step.href} className="rounded-lg">
            <Card interactive>
              <CardContent className="flex items-start gap-3 pt-4">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-xs font-semibold text-accent-subtle-fg">
                  {i + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-md font-semibold tracking-[-0.01em]">
                      {step.label}
                    </span>
                    <Code>{step.href}</Code>
                  </div>
                  <p className="text-base text-text-muted">{step.body}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* --- Mail ------------------------------------------------------------------ */

/**
 * The send harness.
 *
 * Deliberately here and not in /email. The editor is Ada's — it's the copy that
 * goes out under Katalis's name, so it lives in the product. Punching a
 * template at a personal inbox to see what a real client does with it is a
 * build tool, and a build tool with somebody's Gmail address hardcoded in it
 * is exactly the sort of thing that ships by accident.
 *
 * The address comes from an env var, never the source. This repo is public.
 */
function MailTab() {
  const [templateId, setTemplateId] = React.useState(EMAIL_TEMPLATES[0].id);
  const template =
    EMAIL_TEMPLATES.find((t) => t.id === templateId) ?? EMAIL_TEMPLATES[0];

  const inbox = process.env.NEXT_PUBLIC_CRAIG_TEST_INBOX;

  return (
    <div className="flex flex-col gap-5">
      <Callout tone="warning" title="Nothing can send yet">
        Craig has no server. Every screen in this repo is front-end state, and
        real mail needs an API route plus a provider key — the first backend
        this project would have. The button below is real and disabled, rather
        than fake and satisfying.
      </Callout>

      <Card>
        <CardHeader className="flex-row items-start gap-3">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-text-muted">
            <Mail className="size-4" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <CardTitle>Send a test</CardTitle>
            <CardDescription>
              Pick a template, punch it at a real inbox, see what a real client
              does with it.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <Field label="Template">
            <SelectMenu
              label="Template"
              value={templateId}
              onChange={setTemplateId}
              options={EMAIL_TEMPLATES.map((t) => ({
                id: t.id,
                label: t.name,
                description: AUDIENCE[t.audience].label,
              }))}
            />
          </Field>

          <Field
            label="To"
            hint={
              inbox
                ? "From NEXT_PUBLIC_CRAIG_TEST_INBOX."
                : "Set NEXT_PUBLIC_CRAIG_TEST_INBOX in .env.local. Not committed, because this repo is public."
            }
          >
            <Input
              readOnly
              value={inbox ?? ""}
              placeholder="you@example.com — not set"
            />
          </Field>

          <div className="flex items-center gap-3">
            <Button size="sm" disabled>
              <Mail />
              Send test
            </Button>
            <span className="text-xs text-text-subtle">
              Needs an API route and a provider.
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
            What would arrive
          </p>
          <Link
            href="/email"
            className="text-xs text-accent underline-offset-4 hover:underline"
          >
            Edit the copy in the product →
          </Link>
        </div>
        <EmailPreview template={template} />
      </div>

      <Callout tone="neutral" title="What wiring it up needs">
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
          <li>
            A route handler at <Code>src/app/api/email/test/route.ts</Code>.
          </li>
          <li>
            A provider. Resend is the least friction — one dependency, one key.
          </li>
          <li>
            <Code>RESEND_API_KEY</Code> in <Code>.env.local</Code>, and never in
            a commit. Server-side only, so no <Code>NEXT_PUBLIC_</Code> prefix.
          </li>
          <li>
            A verified sending domain, or everything lands in spam and the test
            tells you nothing.
          </li>
        </ul>
      </Callout>
    </div>
  );
}

/* --- Shell furniture ------------------------------------------------------- */

const ROUTES: { href: string; label: string; note: string }[] = [
  { href: "/", label: "Admin home", note: "The prompt" },
  { href: "/builder", label: "Workflows", note: "The draft" },
  { href: "/resources", label: "Resources", note: "Mostly gaps" },
  { href: "/email", label: "Email", note: "What Craig sends" },
  { href: "/people", label: "People", note: "Seats" },
  { href: "/settings", label: "Settings", note: "Empty on purpose" },
  { href: "/design-system", label: "Design system", note: "The primitives" },
  { href: "/sign-up", label: "Sign up", note: "Demo v2 starts here" },
  { href: "/welcome", label: "Welcome", note: "The conversation" },
  { href: "/onboarding", label: "New starter", note: "Nils's side" },
  { href: "/sign-in", label: "Sign in", note: "Shape only" },
];

/**
 * The left panel is the section switcher here, not a set of top tabs. There
 * are five sections and they're peers, so a persistent list beats a tab strip
 * — and it leaves the content column its full width.
 */
function SandboxNav({
  section,
  onSection,
  open,
}: {
  section: string;
  onSection: (value: string) => void;
  open: number;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <p className="px-2 pb-1 text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Sandbox
        </p>
        {SANDBOX_SECTIONS.map((t) => {
          const current = t.value === section;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => onSection(t.value)}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors",
                current
                  ? "bg-accent-subtle font-medium text-accent-subtle-fg"
                  : "text-text-muted hover:bg-surface-hover hover:text-text",
              )}
            >
              {t.label}
              {t.value === "home" && open > 0 && (
                <Badge size="sm" tone="warning" className="ml-auto">
                  {open}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      <Separator />

      <div className="flex flex-col gap-0.5">
        <p className="px-2 pb-1 text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Craig
        </p>
        {ROUTES.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="rounded-md px-2 py-1 text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
          >
            {r.label}
          </Link>
        ))}
      </div>

      <Separator />

      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        This page isn&apos;t part of the product. Nothing here should ever end
        up in front of a customer.
      </p>
    </div>
  );
}

function SandboxAside() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">Routes</p>
        {ROUTES.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="group flex items-baseline justify-between gap-2 rounded-sm text-sm"
          >
            <span className="font-mono text-xs text-text-muted group-hover:text-text">
              {r.href}
            </span>
            <span className="text-xs text-text-subtle">{r.note}</span>
          </Link>
        ))}
      </div>

      <Separator />

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">Checks</p>
        <p className="font-mono text-xs leading-relaxed text-text-muted">
          npx tsc --noEmit
          <br />
          npx eslint src/
          <br />
          npm run build
        </p>
      </div>

      <Separator />

      <p className="text-xs leading-relaxed text-text-subtle">
        Front-end only, pre-MVP. Nothing on any screen is stored, and no route
        is guarded.
      </p>
    </div>
  );
}

/* --- Small shared bits ----------------------------------------------------- */

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border bg-surface-sunken px-3 py-2">
      <span className="text-xl font-semibold tracking-[-0.02em]">{value}</span>
      <span className="text-xs text-text-subtle">{label}</span>
    </div>
  );
}

function Line({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <span className="shrink-0 text-sm text-text-subtle sm:w-28">{label}</span>
      <span className="flex-1 text-base leading-relaxed text-text-muted">
        {children}
      </span>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-xs text-text-muted">
      {children}
    </code>
  );
}
