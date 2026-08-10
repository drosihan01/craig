"use client";

import * as React from "react";
import {
  AppShell,
  BackLink,
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
import { NEW_HIRE } from "@/lib/demo";
import type { Session } from "@/lib/craig/contract";
import {
  AUDIENCE,
  MERGE_FIELDS,
  TEMPLATES,
  unknownTokens,
  type EmailTemplate,
} from "@/lib/email";
import { NavStat } from "@/components/app-nav";

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

export function EmailScreen({
  user,
}: {
  /**
   * Who is signed in, read on the server by `page.tsx`.
   *
   * A prop rather than something this file fetches, because it cannot: the
   * session lives in an httpOnly cookie and is verified against Supabase's
   * public key on the server. The alternative was what this screen did before —
   * render the demo fixture — and a profile box naming a person who does not
   * exist is worse than no profile box, because the one control inside it signs
   * the real person out.
   */
  user: Session;
}) {
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
      account={{ name: user.name, email: user.email }}
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

/**
 * The way out, then the templates.
 *
 * This column used to be `AdminNav` — the product's own list of rooms, with the
 * template switcher hung underneath it. Two things were wrong with that, and
 * the framing one is the smaller of them.
 *
 * The framing: the mailmaker is not a room of the product. It is a tool for
 * whoever is building the product, it is now reached from `/mission-control`
 * along with the design system, and a column offering Home, People, Workflows
 * and Settings invites somebody out of a screen before they have finished the
 * one thing they came in to do — the argument Settings and the builder both
 * make about their own columns. So the navigation here is the way back and this
 * page's own contents, which is what a room you *went into* should have.
 *
 * The other thing is that `AdminNav` has been quietly broken for as long as it
 * has been rendered here: its Workflows row points at `/builder`, and that
 * route does not exist — the builder became `/workflows` and this list was
 * never told. `/email` was the only live screen still drawing it, so this is
 * also the change that stops shipping a dead link. `AdminNav` itself is left
 * alone rather than fixed in passing: the design system documents it by name,
 * and a nav nothing renders is a much smaller problem than one three screens do.
 *
 * No `navRail` either, so collapsing still takes the column to nothing. The
 * template switcher is the useful half of this panel and a strip of icons
 * cannot hold seven template names — they would all be the same envelope. A
 * rail that kept only the back arrow would be offering the exit at the price of
 * the thing you came for.
 */
function EmailNav({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/mission-control" className="px-2">
        Mission control
      </BackLink>

      <Separator />

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
    </div>
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
