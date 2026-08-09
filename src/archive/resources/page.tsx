"use client";

import * as React from "react";
import {
  AppShell,
  Badge,
  Button,
  EmptyState,
  FilterBar,
  FilterChip,
  List,
  ListIcon,
  ListItem,
  ListSection,
  SearchInput,
  Separator,
  SortControl,
  type AppNotification,
  type SortState,
} from "@/components/ui";
import { Add, Description, Search, Warning } from "@/components/ui/icons";
import { ACCOUNT } from "@/lib/demo";
import {
  ALL_RESOURCES,
  LIBRARY,
  MISSING_COUNT,
  STATE,
  type Resource,
  type ResourceState,
} from "@/lib/demo-resources";
import { AdminNav, NavStat } from "@/components/app-nav";

/**
 * Everything the workflows draw on, in one place.
 *
 * The honest version of this page for a three-person company is mostly gaps,
 * and it's written that way. A resources page that only lists the files that
 * happen to exist tells Ada nothing; the useful part is that four things her
 * workflow points at aren't documents at all — they're Jason.
 *
 * Anything marked missing here has a matching unconfigured step in the
 * builder. That's deliberate: the two views should never disagree about what
 * Katalis actually has written down.
 */

const NOTIFICATIONS: AppNotification[] = [
  {
    id: "r1",
    kind: "overdue",
    title: "The handbook hasn't been reviewed since Feb 2026",
    description: "It\u2019s what the pop quiz would read from",
    timestamp: new Date(Date.now() - 90 * 60_000),
  },
];

const ALL = ALL_RESOURCES;
const MISSING = MISSING_COUNT;
const STALE = ALL.filter((r) => r.state === "stale").length;

const STATE_OPTIONS = (Object.keys(STATE) as ResourceState[]).map((id) => ({
  id,
  label: STATE[id].label,
}));

const CATEGORY_OPTIONS = LIBRARY.map((g) => ({
  id: g.category,
  label: g.category,
}));

const SORTS = [
  { id: "category", label: "Category" },
  { id: "state", label: "State" },
  { id: "name", label: "Name" },
  { id: "used", label: "Steps using it" },
];

/* Missing first when sorting by state — the useful ordering for Ada is
   "what's broken", not "what's fine". */
const STATE_ORDER: ResourceState[] = ["missing", "stale", "current"];

export default function ResourcesPage() {
  const [query, setQuery] = React.useState("");
  const [states, setStates] = React.useState<string[]>([]);
  const [categories, setCategories] = React.useState<string[]>([]);
  const [sort, setSort] = React.useState<SortState>({
    field: "category",
    direction: "asc",
  });

  const q = query.trim().toLowerCase();
  const filtering = Boolean(q || states.length || categories.length);

  function clear() {
    setQuery("");
    setStates([]);
    setCategories([]);
  }

  /* Filtering runs inside each group so the categories stay as headings.
     Flattening on filter would drop the one piece of structure the page has,
     and "Slack channel list" means something different under Engineering. */
  const groups = LIBRARY.map((g) => ({
    category: g.category,
    items: g.items.filter((r) => {
      if (states.length && !states.includes(r.state)) return false;
      if (categories.length && !categories.includes(g.category)) return false;
      if (!q) return true;
      return `${r.name} ${r.meta}`.toLowerCase().includes(q);
    }),
  })).filter((g) => g.items.length > 0);

  const dir = sort.direction === "asc" ? 1 : -1;

  /* Sorting by category means sorting the *groups*; the other fields sort the
     rows inside each one. Two different things behind one control, but the
     alternative — a separate "group by" — is a second control for a page with
     four categories. */
  const sorted =
    sort.field === "category"
      ? sort.direction === "asc"
        ? groups
        : [...groups].reverse()
      : groups.map((g) => ({
          ...g,
          items: [...g.items].sort((a, b) => {
            switch (sort.field) {
              case "used":
                return ((a.usedBy ?? 0) - (b.usedBy ?? 0)) * dir;
              case "state":
                return (
                  (STATE_ORDER.indexOf(a.state) -
                    STATE_ORDER.indexOf(b.state)) *
                  dir
                );
              default:
                return a.name.localeCompare(b.name) * dir;
            }
          }),
        }));

  const shownCount = sorted.reduce((n, g) => n + g.items.length, 0);

  return (
    <AppShell
      title="Resources"
      nav={<ResourcesNav />}
      notifications={NOTIFICATIONS}
      account={ACCOUNT}
      actions={
        <Button size="sm" variant="secondary">
          <Add />
          Upload
        </Button>
      }
    >
      <div className="mx-auto w-full max-w-2xl py-10">
        {/* No composer here. There's one on Home and it answers from the same
            documents — two boxes that ask Craig things is one box too many,
            and this page's job is the shelf, not the conversation. */}
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">
            Resources
          </h1>
          <p className="text-md text-text-muted">
            What Craig can answer from. Anything marked as missing, he
            can&apos;t.
          </p>
        </header>

        <div className="flex items-center justify-between gap-3 pb-3 pt-8">
          <h2 className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
            Documents
          </h2>
          <span className="text-xs text-text-subtle">
            {MISSING} of {ALL.length} don&apos;t exist
          </span>
        </div>

        <FilterBar
          className="pb-5"
          shown={shownCount}
          total={ALL.length}
          noun="documents"
          onClear={clear}
        >
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search documents"
            className="w-56"
          />
          <FilterChip
            label="State"
            options={STATE_OPTIONS}
            selected={states}
            onChange={setStates}
          />
          <FilterChip
            label="Category"
            options={CATEGORY_OPTIONS}
            selected={categories}
            onChange={setCategories}
          />
          <SortControl
            className="ml-auto"
            value={sort}
            options={SORTS}
            onChange={setSort}
          />
        </FilterBar>

        {sorted.length > 0 ? (
          <div className="flex flex-col gap-7">
            {sorted.map((group) => (
              <ListSection
                key={group.category}
                title={group.category}
                count={group.items.length}
              >
                <List>
                  {group.items.map((r) => (
                    <ResourceRow key={r.name} resource={r} />
                  ))}
                </List>
              </ListSection>
            ))}
          </div>
        ) : (
          <EmptyState
            className="border-dashed"
            icon={<Search />}
            title="Nothing matches"
            description={
              filtering
                ? "Try widening the filters — Katalis only tracks ten things in total."
                : "Nothing has been uploaded yet."
            }
            action={
              filtering ? (
                <Button size="sm" variant="secondary" onClick={clear}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    </AppShell>
  );
}

function ResourceRow({ resource: r }: { resource: Resource }) {
  const state = STATE[r.state];
  const missing = r.state === "missing";

  return (
    <ListItem
      leading={
        <ListIcon tone={missing ? "muted" : "default"}>
          {missing ? <Warning /> : <Description />}
        </ListIcon>
      }
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className={missing ? "font-normal text-text-muted" : undefined}>
            {r.name}
          </span>
          <Badge tone={state.tone} size="sm">
            {state.label}
          </Badge>
        </span>
      }
      description={r.meta}
      meta={
        r.usedBy !== undefined
          ? `${r.usedBy} ${r.usedBy === 1 ? "step uses" : "steps use"} this`
          : undefined
      }
    />
  );
}

function ResourcesNav() {
  return (
    <AdminNav>
      <div className="flex flex-col gap-2 px-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Library
        </p>
        <NavStat label="Tracked" value={ALL.length} />
        <NavStat label="Out of date" value={STALE} tone="warning" />
        <NavStat label="Missing" value={MISSING} tone="warning" />
      </div>

      <Separator />

      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        Missing here means a workflow step points at something nobody has
        written down.
      </p>
    </AdminNav>
  );
}
