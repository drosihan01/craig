"use client";

import * as React from "react";
import {
  AppShell,
  Badge,
  EmailPreview,
  Field,
  Input,
  List,
  ListItem,
  SegmentedControl,
  Separator,
  Textarea,
  type AppNotification,
} from "@/components/ui";
import { Mail, Warning } from "@/components/ui/icons";
import { ACCOUNT, NEW_HIRE } from "@/lib/demo";
import {
  AUDIENCE,
  MERGE_FIELDS,
  TEMPLATES,
  unknownTokens,
  type EmailTemplate,
} from "@/lib/email";
import { AdminNav, NavStat } from "@/components/app-nav";

/**
 * The email Craig sends, and the words it says.
 *
 * This is a product screen rather than a build tool, because the copy goes out
 * under Katalis's name to somebody Ada just hired. She owns that voice. A
 * template file only the developer can see is a template nobody ever fixes.
 *
 * Editing and previewing are one screen, not two tabs — the whole job is
 * checking that what you typed reads like something a person would send, and
 * that's not a thing you can do from a form alone.
 */

const NOTIFICATIONS: AppNotification[] = [
  {
    id: "e1",
    kind: "info",
    title: "Nothing has been sent yet",
    description: "No workflow is published, so no email has gone anywhere.",
    timestamp: new Date(Date.now() - 20 * 60_000),
  },
];

export default function EmailPage() {
  const [drafts, setDrafts] = React.useState<EmailTemplate[]>(TEMPLATES);
  const [selectedId, setSelectedId] = React.useState(TEMPLATES[0].id);
  const [view, setView] = React.useState("edit");

  const template = drafts.find((t) => t.id === selectedId) ?? drafts[0];
  const broken = unknownTokens(template);

  function patch(changes: Partial<EmailTemplate>) {
    setDrafts((prev) =>
      prev.map((t) => (t.id === template.id ? { ...t, ...changes } : t)),
    );
  }

  return (
    <AppShell
      title="Email"
      nav={<EmailNav selectedId={selectedId} onSelect={setSelectedId} />}
      notifications={NOTIFICATIONS}
      account={ACCOUNT}
      asideTitle="Merge fields"
      aside={<EmailAside template={template} />}
      actions={
        <SegmentedControl
          value={view}
          onValueChange={setView}
          items={[
            { value: "edit", label: "Edit" },
            { value: "preview", label: "Preview" },
          ]}
        />
      }
    >
      <div className="mx-auto w-full max-w-2xl py-10">
        <header className="mb-6 flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">
              {template.name}
            </h1>
            <Badge tone="neutral" size="sm">
              {AUDIENCE[template.audience].label}
            </Badge>
          </div>
          <p className="text-md text-text-muted">{template.trigger}.</p>
        </header>

        {broken.length > 0 && (
          <div className="mb-5 flex items-start gap-2 rounded-md bg-warning-subtle p-3 text-base text-warning">
            <Warning className="mt-0.5 size-4 shrink-0" />
            <span>
              {broken.map((t) => `{{${t}}}`).join(", ")}{" "}
              {broken.length === 1 ? "isn't" : "aren't"} a merge field. It will
              go out exactly as written.
            </span>
          </div>
        )}

        {view === "edit" ? (
          <div className="flex flex-col gap-5">
            <Field
              label="Subject"
              hint="The only line most people read. Say the thing, don't tease it."
            >
              <Input
                value={template.subject}
                onChange={(e) => patch({ subject: e.target.value })}
              />
            </Field>

            <Field
              label="Preheader"
              hint="Shown after the subject in the inbox. Wasted if it repeats it."
            >
              <Input
                value={template.preheader}
                onChange={(e) => patch({ preheader: e.target.value })}
              />
            </Field>

            <Field label="Body" hint="Blank lines become paragraphs.">
              <Textarea
                rows={12}
                value={template.body}
                onChange={(e) => patch({ body: e.target.value })}
                className="font-mono text-sm"
              />
            </Field>

            <Field
              label="Button"
              hint="Leave empty if there's nothing to click. Not every email needs one."
            >
              <Input
                value={template.cta ?? ""}
                placeholder="No button"
                onChange={(e) => patch({ cta: e.target.value || undefined })}
              />
            </Field>

            <Separator />

            <div className="flex flex-col gap-2">
              <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
                As it lands
              </p>
              <EmailPreview template={template} />
            </div>
          </div>
        ) : (
          <EmailPreview template={template} />
        )}
      </div>
    </AppShell>
  );
}

function EmailNav({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <AdminNav>
      <div className="flex flex-col gap-2 px-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Templates
        </p>
        <NavStat label="Total" value={TEMPLATES.length} />
        <NavStat label="Sent so far" value={0} />
      </div>

      <div className="flex flex-col gap-0.5">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            aria-current={t.id === selectedId ? "true" : undefined}
            className={
              t.id === selectedId
                ? "flex items-center gap-2 rounded-md bg-accent-subtle px-2 py-1 text-left text-sm font-medium text-accent-subtle-fg"
                : "flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
            }
          >
            <Mail className="size-3.5 shrink-0 opacity-60" />
            {t.name}
          </button>
        ))}
      </div>

      <Separator />

      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        All transactional. One person, one thing, triggered by a step — there
        is no list and nothing to unsubscribe from.
      </p>
    </AdminNav>
  );
}

function EmailAside({ template }: { template: EmailTemplate }) {
  const used = MERGE_FIELDS.filter((f) =>
    [template.subject, template.preheader, template.body, template.cta ?? ""]
      .join(" ")
      .includes(`{{${f.token}}}`),
  );
  const unused = MERGE_FIELDS.filter((f) => !used.includes(f));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Goes to
        </p>
        <p className="text-sm font-medium">
          {AUDIENCE[template.audience].label}
        </p>
        <p className="text-xs leading-relaxed text-text-subtle">
          {AUDIENCE[template.audience].note}
        </p>
      </div>

      <Separator />

      {/* Split into used and available rather than one long list — the useful
          question when you're editing is "what else could I put in here". */}
      <FieldGroup title="In this email" fields={used} />
      {unused.length > 0 && <FieldGroup title="Also available" fields={unused} />}

      <Separator />

      <p className="text-xs leading-relaxed text-text-subtle">
        The preview fills these in with {NEW_HIRE.name}. At send time they come
        from the seat and the step, and a missing one is a hole in the email
        rather than a blank.
      </p>
    </div>
  );
}

function FieldGroup({
  title,
  fields,
}: {
  title: string;
  fields: typeof MERGE_FIELDS;
}) {
  if (fields.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          {title}
        </p>
        <p className="text-xs text-text-subtle">None.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
        {title}
      </p>
      <List dense divided={false} bordered={false}>
        {fields.map((f) => (
          <ListItem
            key={f.token}
            title={
              <code className="font-mono text-xs font-normal text-text-muted">
                {`{{${f.token}}}`}
              </code>
            }
            meta={f.example}
          />
        ))}
      </List>
    </div>
  );
}
