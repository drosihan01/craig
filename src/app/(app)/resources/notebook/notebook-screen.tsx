"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AppShell,
  BackLink,
  Button,
  Callout,
  Separator,
} from "@/components/ui";
import { Warning } from "@/components/ui/icons";
import { ShowcaseNav, ShowcaseNavRail } from "@/components/craig/nav";
import { NotebookEditor } from "@/components/craig/notebook-editor";
import type { Session } from "@/lib/craig/contract";
import type { Notebook, NotebookNote } from "@/lib/craig/notebook";

/**
 * Everything Craig knows about this company, and the things he has asked about.
 *
 * One document, edited as text. No page tree, no blocks, no rich editor — and
 * that is a decision rather than a first version. The shape this replaced was
 * `facts: { key, value }[]`, which forced every piece of company knowledge
 * through a label and a value; most of it does not fit that. "How we run
 * standups" is a paragraph. Structure can be added the day its absence
 * actually hurts, and not before.
 *
 * **Craig's questions sit above the document, not below it.** They are the
 * reason to open this screen at all: the document is what you already know,
 * and the list is what he needs from you. Putting the answers first and the
 * questions underneath would bury the only part with anything outstanding in
 * it.
 *
 * Nothing here is shared or unshared, because the rule lives upstream: a new
 * starter's Craig answers out of this same document, so nothing personal is
 * written into it in the first place. Facts about a *person* stay in the
 * database behind the joiner boundary. That is what buys one document, two
 * audiences and no permissions.
 */
export function NotebookScreen({
  user,
  notebook,
  notes,
}: {
  user: Session;
  notebook: Notebook;
  notes: NotebookNote[];
}) {
  const router = useRouter();

  const [text, setText] = React.useState(notebook.content);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<string | null>(
    notebook.updatedAt,
  );
  const [pending, setPending] = React.useState(notes);

  /* What the server last confirmed it holds. State rather than a ref, because
     the Save button renders from it — and reading a ref during render is the
     thing `react-hooks` refuses, for the good reason that a ref change does
     not re-render and the button would go stale.
     
     Compared rather than tracked with a dirty flag, so typing an edit and then
     undoing it correctly reads as saved again. */
  const [savedText, setSavedText] = React.useState(notebook.content);
  const dirty = text !== savedText;

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/notebook", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        updatedAt?: string;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? "That didn't save. Try again?");
        return;
      }

      setSavedText(text);
      setSavedAt(payload.updatedAt ?? new Date().toISOString());
      /* The server is the record. Re-reading keeps this screen honest about
         what Craig will actually be handed on the next conversation. */
      router.refresh();
    } catch {
      setError("That didn't reach the server. Your words are still here.");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Take one of Craig's questions into the document.
   *
   * It is appended as a heading with nothing under it, rather than as a line
   * of prose, because the answer is the point and an empty heading is an
   * obvious invitation to write one. Dropping it in as a sentence would read
   * as though it had already been dealt with.
   */
  function addNote(note: NotebookNote) {
    const heading = note.text.trim();
    setText(
      `${text.trimEnd() ? `${text.trimEnd()}\n\n` : ""}## ${heading}\n\n`,
    );
    void settle(note.id);
  }

  async function settle(id: string) {
    setPending((rows) => rows.filter((row) => row.id !== id));
    try {
      await fetch(`/api/notebook/notes/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    } catch {
      /* Put back, because a question that silently vanished is a question
         nobody answers. */
      setPending(notes);
      setError("That didn't reach the server. Nothing was changed.");
    }
  }

  return (
    <AppShell
      title="Notebook"
      account={{ name: user.name, email: user.email }}
      nav={<ShowcaseNav />}
      navRail={<ShowcaseNavRail />}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-8">
        <div className="flex flex-col gap-3">
          <BackLink href="/resources">Resources</BackLink>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-xl font-semibold tracking-[-0.01em]">
              Notebook
            </h1>

            <Button size="sm" onClick={() => void save()} loading={saving} disabled={!dirty}>
              {dirty ? "Save" : "Saved"}
            </Button>
          </div>
        </div>

        {error && (
          <Callout tone="danger" icon={<Warning />} title="That didn't save">
            {error}
          </Callout>
        )}

        {pending.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
              Craig needs an answer
            </h2>
            <ul className="flex flex-col gap-2">
              {pending.map((note) => (
                <li
                  key={note.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-surface p-3"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm">{note.text}</span>
                    <span className="text-2xs text-text-subtle">
                      {note.kind === "unanswered"
                        ? "Somebody asked and I couldn't answer"
                        : note.kind === "gap"
                          ? "Nobody has written this down"
                          : "You told me this — worth keeping?"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => addNote(note)}>
                      Add it
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void settle(note.id)}>
                      Not needed
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Separator />

        <NotebookEditor value={text} onChange={setText} />

        <p className="text-2xs text-text-subtle">
          {savedAt
            ? `Last saved ${new Date(savedAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}`
            : "Not saved yet"}
        </p>
      </div>
    </AppShell>
  );
}
