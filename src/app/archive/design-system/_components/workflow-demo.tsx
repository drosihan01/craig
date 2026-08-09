"use client";

import * as React from "react";
import {
  Badge,
  BlockPicker,
  BlockSetup,
  Button,
  EmailPreview,
  SegmentedControl,
  SelectMenu,
  TestRun,
  isUnconfigured,
  missingSetup,
  setupWarning,
  type WorkflowBlock,
} from "@/components/ui";
import { Add, Check, PlayArrow, Warning } from "@/components/ui/icons";
import {
  ALL_PRESETS,
  blockFromPreset,
  findPreset,
  type BlockPreset,
} from "@/lib/workflow/library";
import { AUDIENCE, TEMPLATES } from "@/lib/email";

/* --- Block picker ---------------------------------------------------------- */

/* Read off the library rather than listed here, so the roster below can't
   claim a block is unavailable after someone has shipped it. */
const UNAVAILABLE = ALL_PRESETS.filter((p) => p.unavailable);

export function BlockPickerDemo() {
  const [open, setOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<BlockPreset | null>(null);

  const Icon = picked?.icon;
  const required = picked?.setup.filter((f) => f.required).length ?? 0;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setOpen(true)}>
          <Add />
          Add a step
        </Button>

        {picked && Icon ? (
          <span className="flex items-center gap-2 text-sm text-text-muted">
            <span className="flex size-7 items-center justify-center rounded-md bg-accent-subtle text-accent-subtle-fg">
              <Icon className="size-4" />
            </span>
            <span className="font-medium text-text">{picked.label}</span>
            <span className="text-text-subtle">
              runs as a {picked.kind} · {required}{" "}
              {required === 1 ? "field" : "fields"} to set up
            </span>
          </span>
        ) : (
          <span className="text-sm text-text-subtle">
            {ALL_PRESETS.length} presets, {UNAVAILABLE.length} of them disabled.
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border-strong p-3.5">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Shown but disabled
        </p>
        <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {UNAVAILABLE.map((p) => (
            <li key={p.id} className="flex gap-2 text-xs">
              <span className="shrink-0 font-medium text-text-muted">
                {p.label}
              </span>
              <span className="min-w-0 flex-1 text-text-subtle">
                {p.unavailable}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <BlockPicker
        open={open}
        onClose={() => setOpen(false)}
        onPick={setPicked}
      />
    </div>
  );
}

/* --- Block setup ----------------------------------------------------------- */

/* Three presets between them cover all seven field kinds: GitHub has text,
   multiselect, select, person and when; Slack adds url; Sign contract adds
   file. */
const SETUP_PRESETS = ["github", "slack", "sign-contract"];

const PEOPLE = ["Ada Yıldız", "Jason Cho", "Matty", "The new hire"];

export function BlockSetupDemo() {
  const [presetId, setPresetId] = React.useState(SETUP_PRESETS[0]);
  /* Config per preset, so switching tabs and coming back doesn't quietly
     discard what was typed. */
  const [configs, setConfigs] = React.useState<
    Record<string, Record<string, string | string[]>>
  >({});

  const preset = findPreset(presetId)!;
  const block: WorkflowBlock = {
    ...blockFromPreset(preset, "demo"),
    config: configs[presetId] ?? {},
  };

  const missing = missingSetup(block);
  const warning = setupWarning(block);

  return (
    <div className="flex w-full flex-col gap-4">
      <SegmentedControl
        value={presetId}
        onValueChange={setPresetId}
        items={SETUP_PRESETS.map((id) => ({
          value: id,
          label: findPreset(id)!.label,
        }))}
      />

      <div className="grid gap-6 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="rounded-lg border border-border bg-surface-sunken/40 p-4">
          <BlockSetup
            block={block}
            people={PEOPLE}
            onChange={(fieldId, value) =>
              setConfigs((prev) => ({
                ...prev,
                [presetId]: { ...prev[presetId], [fieldId]: value },
              }))
            }
          />
        </div>

        {/* Nothing here is stored — every line is recomputed from the fields
            on the left. Fill one in and the badge the canvas would show
            changes with it. */}
        <dl className="flex flex-col gap-2.5 text-sm">
          <Derived name="missingSetup(block)">
            {missing.length === 0 ? (
              <span className="text-text-subtle">[]</span>
            ) : (
              <span className="font-mono text-xs text-text-muted">
                [{missing.map((f) => f.id).join(", ")}]
              </span>
            )}
          </Derived>

          <Derived name="isUnconfigured(block)">
            <span className="font-mono text-xs text-text-muted">
              {String(isUnconfigured(block))}
            </span>
          </Derived>

          <Derived name="setupWarning(block)">
            {warning ? (
              <Badge tone="warning" size="sm">
                <Warning />
                {warning}
              </Badge>
            ) : (
              <Badge tone="success" size="sm">
                <Check />
                Ready
              </Badge>
            )}
          </Derived>

          <p className="pt-1 text-xs leading-relaxed text-text-subtle">
            The badge on the block, the count in the nav and the disabled
            Publish button all call these. There is no{" "}
            <code className="font-mono">configured</code> flag anywhere to
            forget to clear.
          </p>
        </dl>
      </div>
    </div>
  );
}

function Derived({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <dt className="font-mono text-xs text-text-subtle">{name}</dt>
      <dd className="flex items-center">{children}</dd>
    </div>
  );
}

/* --- Test run -------------------------------------------------------------- */

/* One clean step, one missing a required field, one flagged by hand — the
   three states a dry run has to tell apart. */
const TEST_BLOCKS: WorkflowBlock[] = [
  { id: "t", kind: "trigger", title: "New seat added" },
  {
    id: "a",
    kind: "task",
    preset: "github",
    title: "Invite to GitHub",
    owner: "Jason Cho",
    config: {
      org: "github.com/katalis",
      teams: ["eng", "infra"],
      permission: "write",
      owner: "Jason Cho",
      when: "day-one",
    },
  },
  {
    id: "b",
    kind: "task",
    preset: "slack",
    title: "Slack workspace and channels",
    owner: "Jason Cho",
    config: {
      workspace: "katalis.slack.com",
      type: "member",
      owner: "Jason Cho",
      when: "day-one",
    },
  },
  {
    id: "c",
    kind: "approval",
    title: "Jason signs off on prod access",
    owner: "Jason Cho",
    incomplete: "Nobody has decided what prod access means for this role",
  },
];

export function TestRunDemo() {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <PlayArrow />
        Test run
      </Button>
      <span className="text-sm text-text-subtle">
        Three steps: one ready, one missing a channel list, one flagged by hand.
      </span>

      <TestRun
        open={open}
        onClose={() => setOpen(false)}
        workflowName="Engineer — Katalis"
        blocks={TEST_BLOCKS}
        candidates={["Nils Hoffman", "Rae Okonkwo"]}
      />
    </div>
  );
}

/* --- Email preview --------------------------------------------------------- */

export function EmailPreviewDemo() {
  const [id, setId] = React.useState(TEMPLATES[0].id);
  const template = TEMPLATES.find((t) => t.id === id)!;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-56">
          <SelectMenu
            label="Template"
            value={id}
            onChange={setId}
            options={TEMPLATES.map((t) => ({ id: t.id, label: t.name }))}
          />
        </div>
        <Badge tone="neutral">{AUDIENCE[template.audience].label}</Badge>
        <span className="min-w-0 flex-1 text-xs text-text-subtle">
          {template.trigger}
        </span>
      </div>

      <EmailPreview template={template} />
    </div>
  );
}
