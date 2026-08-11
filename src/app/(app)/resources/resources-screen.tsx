"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AppShell,
  Button,
  buttonVariants,
  Callout,
  Dialog,
  EmptyState,
  FilterBar,
  SearchInput,
  SegmentedControl,
  Select,
  Separator,
  Switch,
} from "@/components/ui";
import {
  Delete,
  FilterList,
  MenuBook,
  ArrowDownward,
  OpenInNew,
  UploadFile,
  Visibility,
} from "@/components/ui/icons";
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
 *
 * ## Finding one of them, once there are more than a few
 *
 * A search box, a sharing filter and a sort, all three composing, and every one
 * of them arithmetic on the rows the server already sent. Nothing here asks the
 * server anything: the whole list is in the browser the moment the page paints,
 * an account's documents number in the tens rather than the thousands, and a
 * round trip per keystroke would buy latency and a race and no correctness at
 * all. If that assumption ever stops holding, the thing to change is the query
 * in `page.tsx`, not this file.
 *
 * The screen's failure mode shapes all three. A filtered list looks exactly
 * like a short list, and somebody who believes a filtered list is the whole
 * list will conclude they never uploaded the handbook — or, worse, that nothing
 * is shared. So:
 *
 *   - `FilterBar` keeps "showing 3 of 20 documents" under the controls
 *     whenever anything is hidden, and offers to put it back.
 *   - Matching nothing gets its own empty state, which says what was asked for
 *     and that the documents are still there. The upload-something-first empty
 *     state is a different sentence for a different situation, and using one
 *     for both is how a screen ends up saying "nothing here yet" to somebody
 *     with twenty documents and a typo in the search box.
 *   - The counts in the nav are never narrowed. They describe the account, and
 *     a number that moves while you type is describing something other than
 *     what its label says.
 */

/**
 * One document, flattened by the server — and two of its facts twice over.
 *
 * `size` and `uploadedOn` are words: "1.2 MB", "10 August". They are words
 * because words are what the row draws, and they are made into words on the
 * server for the reason every date in this product is — an instant formatted
 * during render is formatted twice, in two timezones, and either side of
 * midnight those are two different days.
 *
 * Words cannot be put in order. "1.2 MB" sorts before "900 KB" and "10 August"
 * sorts before "9 August", so a sort reading the display strings would be
 * confidently, silently wrong — the worst kind of wrong on a control whose
 * entire job is to be believed. `sizeBytes` and `uploadedAt` are the same two
 * facts unformatted, they are what the sort compares, and neither is ever
 * drawn.
 *
 * The alternative was parsing the words back into numbers, which is a formatter
 * and a parser that have to agree forever: the first time somebody improves the
 * wording of a file size, the sort quietly stops working and nothing fails.
 */
/**
 * Reading a document without leaving the page.
 *
 * Before this, Resources could upload, share and delete a file and offered no
 * way to *look* at one — so the only way to check what you had shared with
 * every new starter was to download it. Somebody deciding whether a document
 * is safe to share should be able to see what is in it in the same breath.
 *
 * ## Three kinds of file, three honest answers
 *
 * **PDFs** go in an `<iframe>` pointed at our own route, which redirects to a
 * short-lived signed URL. The same argument the contract room makes: every
 * browser already has a PDF viewer better than one we would build, and
 * rendering PDFs ourselves means shipping `pdfjs-dist` to somebody who will
 * use it once. The frame's `src` is a path on our origin, so the signed URL
 * never lands in the DOM for a screenshot or a devtools tab to catch.
 *
 * **Text and markdown** are fetched and shown as text. They are their own
 * content, and putting a plain-text file behind a download is a step for
 * nothing.
 *
 * **Word documents and RTF** cannot be rendered by a browser at all, and this
 * says so rather than showing an empty frame and letting somebody conclude the
 * file is corrupt. They get the one thing that does work — opening it, which
 * hands it to whatever application they actually read `.docx` in.
 *
 * The dialog is `bare` and supplies its own header because the file name is
 * long, needs truncating, and wants the "open in a new tab" escape hatch
 * sitting beside it rather than at the bottom of a scrolling document.
 */
function DocumentViewer({
  row,
  onClose,
}: {
  row: ResourceRow | null;
  onClose: () => void;
}) {
  const [text, setText] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [loadedFor, setLoadedFor] = React.useState<string | null>(null);

  const isPdf = row?.contentType === "application/pdf";
  const isText =
    row?.contentType === "text/plain" || row?.contentType === "text/markdown";

  /* Cleared during render rather than in an effect.
     
     Opening a second document has to forget the first one's text *before*
     anything paints — an effect runs after, so for one frame the new file's
     name would sit above the old file's contents. That is the whole reason
     `react-hooks` refuses `setState` in an effect body, and the reason this
     is written the way React documents for state derived from props. */
  if (row && loadedFor !== row.id) {
    setLoadedFor(row.id);
    setText(null);
    setFailed(false);
  }

  React.useEffect(() => {
    if (!row || !isText) return;

    /* Cancelled on the way out: a dialog closed before the fetch lands would
       otherwise write one file's contents under the next file's name. */
    let live = true;

    void fetch(`/api/documents/${encodeURIComponent(row.id)}`)
      .then((response) => (response.ok ? response.text() : Promise.reject()))
      .then((body) => {
        if (live) setText(body);
      })
      .catch(() => {
        if (live) setFailed(true);
      });

    return () => {
      live = false;
    };
  }, [row, isText]);

  if (!row) return null;
  const href = `/api/documents/${encodeURIComponent(row.id)}`;

  return (
    <Dialog open onClose={onClose} size="xl" bare>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="truncate text-base font-semibold">{row.name}</h2>
            <p className="text-2xs text-text-subtle">
              {row.kind} · {row.size}
              {row.shared ? " · new starters can read this" : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <OpenInNew aria-hidden />
              Open
            </a>
            {/* Beside Open rather than instead of it, because they are
                different intentions: Open hands the file to whatever reads it,
                Download puts a copy on the disk. The `?download` is what does
                the work — it sets `Content-Disposition: attachment` on the
                object. An `<a download>` here would be ignored, because the
                bytes come from Supabase's origin and not ours. */}
            <a
              href={`${href}?download`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <ArrowDownward aria-hidden />
              Download
            </a>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        {isPdf && (
          <iframe
            src={href}
            title={row.name}
            className="h-[70vh] w-full rounded-md border border-border bg-surface-sunken"
          />
        )}

        {isText && (
          <div className="h-[70vh] w-full overflow-auto rounded-md border border-border bg-surface-sunken p-4">
            {failed ? (
              <p className="text-sm text-text-muted">
                That didn&rsquo;t load. Opening it in a new tab usually works.
              </p>
            ) : text === null ? (
              <p className="text-sm text-text-subtle">Loading&hellip;</p>
            ) : (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
                {text}
              </pre>
            )}
          </div>
        )}

        {!isPdf && !isText && (
          /* Said plainly rather than shown as a blank frame. A viewer that
             renders nothing reads as a broken file, and the file is fine. */
          <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-md border border-border bg-surface-sunken text-center">
            <p className="text-sm text-text-muted">
              Browsers can&rsquo;t display {row.kind} files.
            </p>
            <p className="text-2xs text-text-subtle">
              Open it and it&rsquo;ll go to whatever you normally read these in.
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export interface ResourceRow {
  id: string;
  name: string;
  kind: string;
  /**
   * The real MIME type, beside the human `kind`.
   *
   * Both, because they answer different questions: `kind` is the word a person
   * reads in the row ("PDF"), and this is what the viewer branches on. Deriving
   * one from the other in the browser would mean a second copy of the mapping
   * in `page.tsx`, and the copy that goes stale is always the one further from
   * the data.
   */
  contentType: string;
  /** For the eye: "1.2 MB". */
  size: string;
  shared: boolean;
  /** For the eye: "10 August". */
  uploadedOn: string;
  /** For the sort. Never drawn. */
  sizeBytes: number;
  /** For the sort — an ISO instant. Never drawn. */
  uploadedAt: string;
}

/**
 * What the sharing filter is set to. `all` is not a filter — it is the absence
 * of one, which is why it is also what "clear" puts it back to.
 */
type Sharing = "all" | "shared" | "private";

type Order = "newest" | "oldest" | "name" | "largest";

export function ResourcesScreen({
  user,
  rows,
  waiting,
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
  /** How many of Craig's questions are unanswered. Drawn on the notebook link. */
  waiting: number;
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
  /* The whole row rather than an id: the dialog draws its name, kind, size and
     sharing state, and looking all of that back up from an id would mean the
     dialog could disagree with the row it was opened from. */
  const [viewing, setViewing] = React.useState<ResourceRow | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /* How the list is being looked at, which is nobody's business but this
     browser's. None of the three is in the URL: they are not a place, nothing
     links to a filtered Resources screen, and a query string would only mean a
     back button that walks somebody backwards through their own typing. */
  const [query, setQuery] = React.useState("");
  const [sharing, setSharing] = React.useState<Sharing>("all");
  const [order, setOrder] = React.useState<Order>("newest");

  /* Counted off `items` rather than `rows`, so the column agrees with the
     switch that was just flicked. The list moves before the server does — see
     the note on that state above — and a count sitting two feet from the
     control that changed it, still describing the previous answer until a
     refresh lands, is the same "did that register?" doubt the optimistic
     update exists to prevent.

     Off `items` rather than `visible`, too, and that one matters more. These
     two numbers are answers about the account — how much is here, how much of
     it has been let out — and the nav says exactly that in words. A count that
     fell to zero because somebody typed three letters into a search box would
     still be sitting under the heading "New starters can read", claiming a
     thing about the company that is not true. */
  const shared = items.filter((row) => row.shared).length;

  /* Search and filter decide what is on the list; sort decides only what order
     it is in. That split is why `clear()` below puts the first two back and
     leaves the third alone — and why the "showing 3 of 20" line can be trusted
     to appear exactly when something is missing. */
  const needle = query.trim().toLowerCase();
  const visible = items
    .filter((row) => {
      if (sharing === "shared" && !row.shared) return false;
      if (sharing === "private" && row.shared) return false;
      return needle === "" || row.name.toLowerCase().includes(needle);
    })
    /* Safe to sort in place: `filter` has already handed back a new array, and
       `items` itself must not be reordered — it is the state the switches and
       the delete button index into. */
    .sort(ORDERS[order]);

  /* Everything that is hiding a document, and nothing else. */
  function clear() {
    setQuery("");
    setSharing("all");
  }

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
        /* `items`, never `visible` — the nav is about the account, not about
           what is currently on screen. See the count above. */
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
          {/* The notebook lives behind Resources rather than beside it in the
              nav, because the two are one idea from two sides: this screen
              holds the *files* a company has, the notebook holds what Craig has
              understood. A separate top-level tab would imply they are
              unrelated, and somebody who found one would have no reason to look
              for the other. */}
          <Link
            href="/resources/notebook"
            className={buttonVariants({ variant: "secondary" })}
          >
            <MenuBook aria-hidden />
            Notebook
            {waiting > 0 && (
              /* The number, not a dot. A dot says something changed; a number
                 says how much work it is, and the difference decides whether
                 somebody opens it now or later. */
              <span
                className="ml-1 rounded-full bg-accent px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-accent-fg"
                aria-label={`${waiting} ${waiting === 1 ? "question" : "questions"} from Craig`}
              >
                {waiting}
              </span>
            )}
          </Link>

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
          /* No documents at all. The other empty state on this screen is the
             one that looks like this and means something completely different
             — read them next to each other before editing either. */
          <EmptyState
            icon={<MenuBook />}
            title="Nothing here yet"
            description="Upload a handbook, a policy, or anything else somebody joining should read. You choose which of them new starters can see."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {/* Shown from the first document rather than past some threshold.
                A screen that grows a search box on the fourth upload is a
                screen that behaves differently for a reason nobody can see,
                and the number would have to be defended forever. One document
                and a search box is mildly silly; it is not confusing. */}
            <FilterBar
              shown={visible.length}
              total={items.length}
              noun={items.length === 1 ? "document" : "documents"}
              onClear={clear}
            >
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search documents"
                className="w-56"
              />

              {/* The middle option is the switch's own words, not "Shared".
                  A filter and the control it filters on must not use two names
                  for one state — the whole screen is written that way, and a
                  segment saying "Shared" above a column of switches saying "New
                  starters can read this" is two vocabularies for one fact. */}
              <div role="group" aria-label="Filter by who can read">
                <SegmentedControl
                  value={sharing}
                  onValueChange={(value) => setSharing(value as Sharing)}
                  items={[
                    { value: "all", label: "All" },
                    { value: "shared", label: "New starters can read" },
                    { value: "private", label: "Private" },
                  ]}
                />
              </div>

              {/* A plain `Select` rather than the design system's
                  `SortControl`, which is a field paired with its own
                  ascending/descending button. That control is right for a
                  column of comparable values and wrong here: it would offer
                  "oldest largest" and "name Z–A" as reachable states, and three
                  of the four orders anybody actually wants on this screen only
                  make sense in one direction. Four named answers beat eight
                  combinations, six of which are noise.

                  The wrapper carries `ml-auto`, not the `Select`. `Select`
                  puts its `className` on the `<select>` and draws its own
                  positioned box around it, so a margin passed in would land on
                  the element being pushed rather than on the flex item doing
                  the pushing, and quietly do nothing. */}
              <div className="ml-auto">
                <Select
                  className="w-auto"
                  aria-label="Sort documents"
                  value={order}
                  onChange={(event) => setOrder(event.target.value as Order)}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="name">Name A–Z</option>
                  <option value="largest">Largest first</option>
                </Select>
              </div>
            </FilterBar>

            {visible.length === 0 ? (
              /* Documents exist; these controls are hiding them. Everything
                 about this state has to be different from the one above,
                 because the two mean opposite things and the mistake they
                 invite is expensive in opposite directions: told "nothing here
                 yet", somebody uploads a second copy of a handbook they
                 already have, or concludes the account lost their files. So it
                 names what was asked for, says the documents are still there,
                 and puts the way out in the one place they are already
                 looking. */
              <EmptyState
                icon={<FilterList />}
                title="No documents match"
                description={noMatch(query.trim(), sharing, items.length)}
                action={
                  <Button size="sm" variant="secondary" onClick={clear}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {visible.map((row) => (
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
                      onClick={() => setViewing(row)}
                      aria-label={`View ${row.name}`}
                    >
                      <Visibility aria-hidden />
                    </Button>

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
        )}
      </div>

      <DocumentViewer row={viewing} onClose={() => setViewing(null)} />
    </AppShell>
  );
}

/**
 * The four orders, and the two facts they are allowed to read.
 *
 * Every one of them compares a raw value rather than the words on the row —
 * see `ResourceRow` for why that distinction is the difference between a sort
 * that works and one that looks like it does.
 *
 * `uploadedAt` is compared as text, not parsed. `toISOString()` always produces
 * the same fixed-width UTC format, so lexicographic order is chronological
 * order exactly; and unlike `Date.parse`, a value that somehow was not an ISO
 * instant degrades into the wrong order rather than into `NaN`, which would
 * make the comparator incoherent and the resulting list arbitrary.
 *
 * The locale is named rather than left to the runtime. This component renders
 * on the server and again in the browser, and `localeCompare` with no locale
 * asks each of them for its own default — the same trap the date formatting in
 * `page.tsx` avoids, one layer down. `numeric` is what puts "Policy 2" before
 * "Policy 10", which is what anybody means by A–Z when their filenames are
 * numbered.
 */
const ORDERS: Record<Order, (a: ResourceRow, b: ResourceRow) => number> = {
  newest: (a, b) => b.uploadedAt.localeCompare(a.uploadedAt),
  oldest: (a, b) => a.uploadedAt.localeCompare(b.uploadedAt),
  name: (a, b) =>
    a.name.localeCompare(b.name, "en-AU", {
      numeric: true,
      sensitivity: "base",
    }),
  largest: (a, b) => b.sizeBytes - a.sizeBytes,
};

/**
 * Why the list is empty, in the words of whatever was asked for.
 *
 * "No documents match" on its own is true and useless — it leaves open the one
 * reading that does damage, which is that the documents are gone. So the
 * sentence names the search text and the sharing state that produced the
 * result, and then says plainly that everything is still there. Somebody who
 * reads it knows both what to change and that they have not lost anything.
 *
 * The count is the account's, not the filtered list's, for the same reason the
 * nav's is.
 */
function noMatch(query: string, sharing: Sharing, total: number): string {
  const kept = `All ${
    total === 1 ? "1 document is" : `${total} documents are`
  } still here — this is the search and the filter, not the account.`;

  const state =
    sharing === "shared"
      ? "shared with new starters"
      : sharing === "private"
        ? "private"
        : null;

  if (query && state)
    return `Nothing with “${query}” in its name is ${state}. ${kept}`;
  if (query) return `Nothing here has “${query}” in its name. ${kept}`;
  if (state) return `Nothing here is ${state}. ${kept}`;

  /* Unreachable: with no search and no filter the visible list is the account's
     own list, and this screen only asks for these words once something has been
     hidden. Written out anyway rather than thrown, because the cost of being
     wrong about that is an empty screen with no explanation on it. */
  return kept;
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
