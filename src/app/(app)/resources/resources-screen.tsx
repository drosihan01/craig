"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AppShell,
  Button,
  Callout,
  EmptyState,
  Separator,
  Switch,
} from "@/components/ui";
import { Delete, MenuBook, UploadFile } from "@/components/ui/icons";
import { NavStat } from "@/components/app-nav";
import { ShowcaseNav, ShowcaseNavRail } from "@/components/craig/nav";
import type { Session } from "@/lib/craig/contract";

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
 *
 * ## It lives in the product's frame, which it did not until now
 *
 * This screen shipped as a bare centre column: no left nav, no rail, no account
 * cell. Every other admin room is an `AppShell` with `ShowcaseNav` in it, so
 * arriving here from People took the whole frame away and there was no way back
 * except the browser's own back button — the exact failure the nav was written
 * to fix, reintroduced by the one room added after it. Resources has been the
 * fourth item in that nav since the day documents got storage; a nav offering a
 * door that leads somewhere with no nav on the other side is worse than not
 * offering it.
 *
 * The frame goes on here rather than in a layout, matching People and
 * Workflows. `AppShell` is a client component holding panel state, and the
 * account cell wants a session — so the screens that need it take it as a prop
 * and the server page hands it down, which is why `user` travels beside `rows`.
 */

export interface ResourceRow {
  id: string;
  name: string;
  kind: string;
  size: string;
  shared: boolean;
  uploadedOn: string;
}

export function ResourcesScreen({
  user,
  rows,
}: {
  /**
   * Only ever the account cell at the foot of the nav.
   *
   * Nothing on this screen is scoped by it — the server already read this
   * account's documents and handed down the rows — so it is here for the same
   * reason People takes one: the shell draws who you are signed in as, and the
   * alternative is a frame that is complete on three screens and missing its
   * bottom corner on the fourth.
   */
  user: Session;
  rows: ResourceRow[];
}) {
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

  /* Counted off `items` rather than `rows`, so the column agrees with the
     switch that was just flicked. The list moves before the server does — see
     the note on that state above — and a count sitting two feet from the
     control that changed it, still describing the previous answer until a
     refresh lands, is the same "did that register?" doubt the optimistic
     update exists to prevent. */
  const shared = items.filter((row) => row.shared).length;

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
    <AppShell
      title="Resources"
      account={{ name: user.name, email: user.email }}
      navRail={<ShowcaseNavRail />}
      nav={
        <ShowcaseNav>
          <ResourcesNav total={items.length} shared={shared} />
        </ShowcaseNav>
      }
    >
      {/* The same centre column as People and Workflows, down to the padding.
          These three are one room seen three ways, and a page that centred at a
          different width or started at a different height would read as a
          different product the moment somebody moved between them. The screen's
          own `gap-6` is folded into this wrapper rather than kept in a div
          inside it, which is what Settings does with its `gap-8`. */}
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">
              Resources
            </h1>
            <p className="text-sm text-text-muted">
              Handbooks, policies, anything a new starter should read. Nothing
              is shared until you say so.
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
                  <span className="truncate text-sm font-medium">
                    {row.name}
                  </span>
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
    </AppShell>
  );
}

/**
 * What is on this screen, and how much of it has been let out.
 *
 * Two numbers rather than one, because the fact worth reading here is the gap
 * between them. "Twelve documents" answers nothing anybody came with; "twelve
 * uploaded, two readable" is the whole state of the only decision this page
 * makes, and it is legible without scrolling a list of switches to count them.
 *
 * The second label is the switch's own words rather than "Shared", for the
 * reason the screen above gives at length: shared is a property of a row, and
 * being read by somebody who has just joined is what actually happens. A count
 * and the control it counts must not use two names for one state — that is how
 * somebody ends up sure they understand a number they have misread.
 *
 * Neither is ever `warning`, which is a deliberate departure from the Workflows
 * column next door. There, nothing ready to publish is a workflow that cannot
 * run for anybody, so the amber is earned. Here, nothing shared is the safe
 * default and frequently the correct answer — a payslip template and last
 * year's redundancy consultation are both documents this account may hold, and
 * neither wants a new starter reading it. An amber badge would be nagging
 * somebody towards the one state on this screen a switch cannot take back: a
 * document that has already been read has been read.
 */
function ResourcesNav({ total, shared }: { total: number; shared: number }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 px-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Documents
        </p>
        <NavStat label="Uploaded" value={total} />
        <NavStat label="New starters can read" value={shared} />
      </div>

      <Separator />

      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        Everything arrives private. The ones you switch on are what a new
        starter finds under Things to read, and the only ones Craig will quote
        to them.
      </p>
    </div>
  );
}
