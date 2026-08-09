"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Callout, EmptyState, Switch } from "@/components/ui";
import { Delete, MenuBook, UploadFile } from "@/components/ui/icons";

/**
 * The company's documents, and the one switch that decides who reads them.
 *
 * The switch is the whole screen. Everything else here — uploading, listing,
 * removing — is plumbing that exists so there is something for it to act on.
 * `documents.ts` defaults every upload to private and shares nothing on the way
 * in, deliberately, so this is the only place a document ever becomes visible to
 * a new starter, and it is one deliberate act by the person who should be making
 * it.
 *
 * It is labelled with the consequence rather than the state. "Shared" is a
 * property of a row; "new starters can read this" is what actually happens, and
 * on a screen whose failure mode is somebody's handbook reaching people it
 * should not, the label is the safety feature.
 */

export interface ResourceRow {
  id: string;
  name: string;
  kind: string;
  size: string;
  shared: boolean;
  uploadedOn: string;
}

export function ResourcesScreen({ rows }: { rows: ResourceRow[] }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  /* Seeded from the server and updated in place. The alternative — waiting for
     `router.refresh()` after every toggle — makes a switch take a round trip to
     move, which on a control this consequential reads as the click not
     registering and invites a second one. The refresh still runs, so the server
     stays the truth; this is what the person sees in the meantime.

     Reset during render rather than in an effect. Syncing props into state with
     `useEffect` renders once with the stale list before correcting itself, and
     the lint rule that forbids it is right: this way the new rows are what the
     first render draws. `lastRows` is an identity check, not a comparison — the
     server hands down a fresh array whenever anything actually changed. */
  const [items, setItems] = React.useState(rows);
  const [lastRows, setLastRows] = React.useState(rows);
  if (lastRows !== rows) {
    setLastRows(rows);
    setItems(rows);
  }

  const [busy, setBusy] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setUploading(true);

    const body = new FormData();
    body.append("file", file);

    try {
      const response = await fetch("/api/documents", { method: "POST", body });
      if (!response.ok) {
        const reason = await response
          .json()
          .then((b: { error?: string }) => b.error)
          .catch(() => null);
        throw new Error(reason ?? "That didn’t upload.");
      }
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That didn’t upload.");
    } finally {
      setUploading(false);
      /* Cleared so the same file can be chosen twice — a file input holds its
         last value, and re-picking it otherwise fires no change event at all. */
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function setShared(id: string, shared: boolean) {
    setError(null);
    setBusy(id);

    /* Moved before the request and put back if it fails. A switch that waits is
       a switch somebody clicks twice. */
    setItems((current) =>
      current.map((row) => (row.id === id ? { ...row, shared } : row)),
    );

    try {
      const response = await fetch(`/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: shared ? "shared" : "private" }),
      });
      if (!response.ok) throw new Error("That didn’t save.");
      router.refresh();
    } catch {
      setItems((current) =>
        current.map((row) => (row.id === id ? { ...row, shared: !shared } : row)),
      );
      setError("That didn’t save. Nothing has changed.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string, name: string) {
    /* The one destructive control on the screen, and the only place here that
       asks. A document is somebody's upload and there is no undo behind this —
       the object is deleted from storage, not flagged. */
    if (!window.confirm(`Delete ${name}? This can’t be undone.`)) return;

    setError(null);
    setBusy(id);

    try {
      const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("That didn’t delete.");
      setItems((current) => current.filter((row) => row.id !== id));
      router.refresh();
    } catch {
      setError("That didn’t delete.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">
            Resources
          </h1>
          <p className="text-sm text-text-muted">
            Handbooks, policies, anything a new starter should read. Nothing is
            shared until you say so.
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept=".pdf,.txt,.md,.doc,.docx,.rtf,.png,.jpg,.jpeg"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button onClick={() => inputRef.current?.click()} loading={uploading}>
          {!uploading && <UploadFile aria-hidden />}
          Upload
        </Button>
      </header>

      {error && (
        <Callout tone="danger" title="That didn’t work">
          {error}
        </Callout>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<MenuBook />}
          title="Nothing here yet"
          description="Upload a handbook, a policy, or anything else somebody joining should read. You choose which of them new starters can see."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-border px-4 py-3"
            >
              <div className="flex min-w-0 flex-[1_1_16rem] flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{row.name}</span>
                <span className="text-2xs text-text-subtle">
                  {row.kind} · {row.size} · added {row.uploadedOn}
                </span>
              </div>

              <label className="flex shrink-0 items-center gap-2.5">
                <Switch
                  checked={row.shared}
                  disabled={busy === row.id}
                  onChange={(event) =>
                    void setShared(row.id, event.target.checked)
                  }
                />
                {/* The consequence, not the state. */}
                <span className="text-sm text-text-muted">
                  New starters can read this
                </span>
              </label>

              <Button
                variant="ghost"
                size="sm"
                disabled={busy === row.id}
                onClick={() => void remove(row.id, row.name)}
                aria-label={`Delete ${row.name}`}
              >
                <Delete aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
