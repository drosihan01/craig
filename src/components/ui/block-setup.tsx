"use client";

import * as React from "react";
import { Badge } from "./badge";
import { Field } from "./field";
import { Input } from "./input";
import { SelectMenu } from "./dropdown";
import { Check, Close, UploadFile, Warning } from "./icons";
import {
  findPreset,
  WHEN_OPTIONS,
  type SetupField,
} from "@/lib/workflow/library";
import type { WorkflowBlock } from "./workflow-builder";
import { missingSetup } from "./workflow-builder";
import { cn } from "@/lib/cn";

/**
 * The setup a block needs before it can run.
 *
 * This is the difference between a workflow and a to-do list. "Invite to
 * GitHub" is a label; the org, the teams and the permission level are the
 * step. Craig's whole argument is that the undocumented parts should be
 * visible, and these fields are where the undocumented parts turn out to be —
 * nobody knows which Slack channels, nobody has decided the AWS permission
 * set, nobody has uploaded the contract.
 *
 * Required fields left empty are what "unconfigured" means, so this form and
 * the warning badge on the canvas are reading the same state.
 */

export function BlockSetup({
  block,
  people,
  onChange,
}: {
  block: WorkflowBlock;
  /** Names offered by the `person` field kind. */
  people: string[];
  onChange: (fieldId: string, value: string | string[]) => void;
}) {
  const preset = block.preset ? findPreset(block.preset) : undefined;
  if (!preset || preset.setup.length === 0) return null;

  const missing = missingSetup(block);

  return (
    <div className="flex flex-col gap-4">
      {/* What the block does regardless of the fields below it. Stated rather
          than left to be discovered — fixed behaviour is still behaviour. */}
      {preset.note && (
        <p className="rounded-lg border border-dashed border-border-strong px-3 py-2 text-xs leading-relaxed text-text-muted">
          {preset.note}
        </p>
      )}

      <div className="flex items-center gap-2">
        <h3 className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Setup
        </h3>
        {missing.length > 0 ? (
          <Badge tone="warning" size="sm">
            <Warning />
            {missing.length} left
          </Badge>
        ) : (
          <Badge tone="success" size="sm">
            <Check />
            Ready
          </Badge>
        )}
      </div>

      {preset.setup.map((f) => (
        <SetupControl
          key={f.id}
          field={f}
          people={people}
          value={block.config?.[f.id]}
          onChange={(v) => onChange(f.id, v)}
        />
      ))}
    </div>
  );
}

function SetupControl({
  field: f,
  people,
  value,
  onChange,
}: {
  field: SetupField;
  people: string[];
  value?: string | string[];
  onChange: (value: string | string[]) => void;
}) {
  /* The hint doubles as the "why" — it stays visible once answered rather
     than only appearing as an error, because these are decisions someone will
     want to re-read six months later. */
  const label = f.required ? f.label : `${f.label} (optional)`;

  if (f.kind === "person" || f.kind === "select" || f.kind === "when") {
    /* A `when` field with no options still has to resolve a stored value to a
       label, so it falls back to the shared vocabulary rather than rendering
       "Not set" over a value that is very much set. */
    const options =
      f.kind === "person"
        ? people.map((p) => ({ id: p, label: p }))
        : (f.options ?? (f.kind === "when" ? WHEN_OPTIONS : []));

    return (
      <Field label={label} hint={f.hint}>
        <SelectMenu
          label={f.label}
          value={typeof value === "string" ? value : ""}
          placeholder="Not set"
          onChange={onChange}
          options={options}
        />
      </Field>
    );
  }

  if (f.kind === "multiselect") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <Field label={label} hint={f.hint}>
        <MultiSelect
          field={f}
          people={people}
          selected={selected}
          onChange={onChange}
        />
      </Field>
    );
  }

  if (f.kind === "document") {
    return <DocumentPicker field={f} value={value} onChange={onChange} />;
  }

  if (f.kind === "file") {
    const name = typeof value === "string" ? value : "";
    return (
      <Field label={label} hint={f.hint}>
        {name ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5">
            <UploadFile className="size-4 shrink-0 text-text-subtle" />
            <span className="min-w-0 flex-1 truncate text-base">{name}</span>
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label={`Remove ${name}`}
              className="inline-flex size-5 shrink-0 items-center justify-center rounded text-text-subtle transition-colors hover:text-text"
            >
              <Close className="size-3.5" />
            </button>
          </div>
        ) : (
          <label
            className={cn(
              "flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border-strong px-2.5 py-2.5",
              "text-base text-text-muted transition-colors hover:border-accent hover:bg-surface-hover hover:text-text",
            )}
          >
            <UploadFile className="size-4 shrink-0" />
            Upload a file
            <input
              type="file"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onChange(file.name);
              }}
            />
          </label>
        )}
      </Field>
    );
  }

  return (
    <Field label={label} hint={f.hint}>
      <Input
        type={f.kind === "url" ? "url" : "text"}
        value={typeof value === "string" ? value : ""}
        placeholder={f.hint}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

/**
 * One of the account's uploaded documents, picked rather than named.
 *
 * The control this replaced was a file input that stored `file.name` and
 * uploaded nothing. That was honest enough while nothing downstream read it —
 * the hint said "the document they'll be sent" and the product never sent
 * one — and it became the wrong shape the moment Craig had to *show* somebody
 * their contract: a filename is a claim that a document exists, and a signature
 * has to be evidence about a document that does.
 *
 * So this offers what the account has actually uploaded, and stores the row id.
 * Two consequences follow and both are deliberate.
 *
 * **It cannot upload.** Resources is where documents go — it is the screen with
 * the visibility switch on it, and that switch is the safety feature of the
 * whole documents feature. An upload control here would create documents
 * out of the one place that asks the question those documents exist to answer.
 * The empty state says where to go instead.
 *
 * **It fetches.** Every other control in this file is pure, and this one needs
 * the server. The list is cached for the life of the page so that a workflow
 * with three document fields on it makes one request, not three — and it is
 * deliberately *not* revalidated, because a stale list here costs a reload and
 * a request per keystroke costs an editor that stutters.
 */
function DocumentPicker({
  field: f,
  value,
  onChange,
}: {
  field: SetupField;
  value?: string | string[];
  onChange: (value: string) => void;
}) {
  const documents = useAccountDocuments();
  const selected = typeof value === "string" ? value : "";

  const label = f.required ? f.label : `${f.label} (optional)`;

  /* Only PDFs. Every other type in the bucket is accepted for *reading* — a
     handbook can be a .docx and a policy can be an image — and none of them can
     be paged through and stamped. Offering one would be offering a choice that
     fails on the new starter's screen rather than on this one, which is the
     worst place for it to fail: the admin is gone by then. */
  const options = documents.list
    .filter((document) => document.contentType === "application/pdf")
    .map((document) => ({ id: document.id, label: document.name }));

  /* A document that has since been deleted, or one Craig invented. It keeps its
     place in the menu rather than silently resolving to "Not set", because the
     two are different problems: an empty field is something nobody has done,
     and this is something that has gone. */
  const missing = selected && !options.some((o) => o.id === selected);

  return (
    <Field label={label} hint={f.hint}>
      <div className="flex flex-col gap-1.5">
        <SelectMenu
          label={f.label}
          value={missing ? "" : selected}
          placeholder={documents.loading ? "Loading…" : "Not set"}
          onChange={onChange}
          options={options}
        />

        {missing && (
          <p className="text-xs text-warning">
            The document this pointed at isn&apos;t in Resources any more. Pick
            another one — nobody can sign this step until you do.
          </p>
        )}

        {!documents.loading && options.length === 0 && (
          <p className="text-xs text-text-subtle">
            No PDFs uploaded yet. Put the contract in{" "}
            <a
              href="/resources"
              className="underline underline-offset-2 hover:text-text"
            >
              Resources
            </a>{" "}
            first — it stays private unless you share it.
          </p>
        )}
      </div>
    </Field>
  );
}

interface AccountDocument {
  id: string;
  name: string;
  contentType: string;
}

/**
 * The account's documents, fetched once per page.
 *
 * A module-level promise rather than a per-component fetch, because the block
 * inspector mounts and unmounts as the admin clicks around the canvas and a
 * request per mount would be a request per click. Held for the life of the tab:
 * a document uploaded in another tab appears after a reload, which is the right
 * trade for an editor whose job is not to be a file browser.
 *
 * A failure is an empty list rather than an error, and the empty state's
 * sentence covers it — "no PDFs uploaded yet" is wrong in that case and it
 * points at the screen that would show them, which is what somebody needs
 * either way. A red box in a settings panel about a fetch is noise on a screen
 * about something else.
 */
let documentsPromise: Promise<AccountDocument[]> | null = null;

function useAccountDocuments() {
  const [list, setList] = React.useState<AccountDocument[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let live = true;

    documentsPromise ??= fetch("/api/documents", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { documents: [] }))
      .then((payload: { documents?: AccountDocument[] }) => payload.documents ?? [])
      .catch(() => []);

    documentsPromise.then((documents) => {
      if (!live) return;
      setList(documents);
      setLoading(false);
    });

    return () => {
      live = false;
    };
  }, []);

  return { list, loading };
}

/**
 * Toggle chips rather than a multi-select menu.
 *
 * These lists are short and the answer matters more than the field name — the
 * Slack channels a new starter lands in is exactly the sort of thing that gets
 * decided once and then forgotten, so it should be readable without opening
 * anything.
 */
function MultiSelect({
  field: f,
  people,
  selected,
  onChange,
}: {
  field: SetupField;
  people: string[];
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  const [draft, setDraft] = React.useState("");

  /* Three cases: a listed set of options, the team, or a free list. The last
     one is the common one — Craig can't know which documents a quiz should read
     or which Okta groups exist, and offering the team as a guess is worse than
     offering nothing. */
  const options =
    f.options ??
    (f.from === "people" ? people.map((p) => ({ id: p, label: p })) : []);
  const freeform = options.length === 0;

  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id],
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => toggle(o.id)}
              aria-pressed={on}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-md px-2 text-sm transition-colors",
                on
                  ? "border border-accent bg-accent-subtle text-accent-subtle-fg"
                  : "border border-dashed border-border-strong text-text-muted hover:bg-surface-hover hover:text-text",
              )}
            >
              {on && <Check className="size-3.5 shrink-0" />}
              {o.label}
            </button>
          );
        })}

        {/* Anything added by hand, so a list of options never becomes a ceiling. */}
        {selected
          .filter((s) => !options.some((o) => o.id === s))
          .map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggle(s)}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-accent bg-accent-subtle px-2 text-sm text-accent-subtle-fg"
            >
              <Check className="size-3.5 shrink-0" />
              {s}
              <Close className="size-3 shrink-0 opacity-60" />
            </button>
          ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = draft.trim();
          if (v && !selected.includes(v)) onChange([...selected, v]);
          setDraft("");
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            freeform ? "Type one and press enter" : "Add another"
          }
          className="h-7 text-sm"
        />
      </form>
    </div>
  );
}
