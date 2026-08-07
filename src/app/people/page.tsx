"use client";

import * as React from "react";
import {
  AppShell,
  Avatar,
  Badge,
  Button,
  DropdownMenu,
  EmptyState,
  FilterBar,
  FilterChip,
  List,
  ListItem,
  ListSection,
  SearchInput,
  SelectMenu,
  Separator,
  SortControl,
  type AppNotification,
  type SortState,
} from "@/components/ui";
import {
  Delete,
  Mail,
  MoreHoriz,
  PersonAdd,
  Search,
  Warning,
} from "@/components/ui/icons";
import { ACCOUNT, NEW_HIRE, PEOPLE } from "@/lib/demo";
import { AdminNav, NavStat } from "@/components/app-nav";

/**
 * Who's here and what they're allowed to do.
 *
 * Roles are about workflows, not seniority. Ada is the founder and Nils is a
 * new engineer, but the only thing this page decides is who can publish
 * something that then runs against a real person's onboarding.
 */

type Role = "owner" | "admin" | "contributor" | "starter";

const ROLES: {
  id: Role;
  label: string;
  description: string;
}[] = [
  {
    id: "owner",
    label: "Owner",
    description: "Everything, including billing. Only one.",
  },
  {
    id: "admin",
    label: "Admin",
    description: "Build and publish workflows, and manage people.",
  },
  {
    id: "contributor",
    label: "Contributor",
    description: "Complete the steps assigned to them. Can't publish.",
  },
  {
    id: "starter",
    label: "New starter",
    description: "Sees their own onboarding and nothing else.",
  },
];

interface Person {
  name: string;
  email: string;
  title: string;
  role: Role;
  status: "active" | "invited";
  /** Workflow steps currently assigned to them. */
  ownsSteps?: number;
  note?: string;
}

const INITIAL: Person[] = [
  {
    name: PEOPLE.ada.name,
    email: PEOPLE.ada.email,
    title: "Founder",
    role: "owner",
    status: "active",
    ownsSteps: 4,
  },
  {
    name: PEOPLE.jason.name,
    email: PEOPLE.jason.email,
    title: "Cofounder",
    role: "admin",
    status: "active",
    ownsSteps: 4,
    note: "Every credential goes through him",
  },
  {
    name: PEOPLE.matty.name,
    email: PEOPLE.matty.email,
    title: "Frontend, contract",
    role: "contributor",
    status: "active",
    ownsSteps: 0,
    note: "Roughly two days a week",
  },
  {
    name: NEW_HIRE.name,
    email: NEW_HIRE.email,
    title: NEW_HIRE.role,
    role: "starter",
    status: "invited",
    note: `Starts in ${NEW_HIRE.startsIn} · ${NEW_HIRE.location}`,
  },
];

const NOTIFICATIONS: AppNotification[] = [
  {
    id: "p1",
    kind: "assigned",
    title: `${NEW_HIRE.name} hasn't accepted their invite`,
    description: `Starts in ${NEW_HIRE.startsIn}`,
    timestamp: new Date(Date.now() - 40 * 60_000),
  },
];

const SORTS = [
  { id: "name", label: "Name" },
  { id: "role", label: "Role" },
  { id: "steps", label: "Steps owned" },
];

/* Sort order for the role field — alphabetical would put Admin above Owner
   and read as a hierarchy that isn't one. */
const ROLE_ORDER = ROLES.map((r) => r.id);

export default function PeoplePage() {
  const [people, setPeople] = React.useState(INITIAL);
  const [query, setQuery] = React.useState("");
  const [roles, setRoles] = React.useState<string[]>([]);
  const [statuses, setStatuses] = React.useState<string[]>([]);
  const [sort, setSort] = React.useState<SortState>({
    field: "name",
    direction: "asc",
  });

  const owners = people.filter((p) => p.role === "owner").length;
  const invited = people.filter((p) => p.status === "invited").length;

  function setRole(email: string, role: Role) {
    setPeople((prev) =>
      prev.map((p) => (p.email === email ? { ...p, role } : p)),
    );
  }

  const q = query.trim().toLowerCase();
  const shown = people
    .filter((p) => {
      if (roles.length && !roles.includes(p.role)) return false;
      if (statuses.length && !statuses.includes(p.status)) return false;
      if (!q) return true;
      return `${p.name} ${p.email} ${p.title}`.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const dir = sort.direction === "asc" ? 1 : -1;
      switch (sort.field) {
        case "role":
          return (ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)) * dir;
        case "steps":
          return ((a.ownsSteps ?? 0) - (b.ownsSteps ?? 0)) * dir;
        default:
          return a.name.localeCompare(b.name) * dir;
      }
    });

  const filtering = Boolean(q || roles.length || statuses.length);

  function clear() {
    setQuery("");
    setRoles([]);
    setStatuses([]);
  }

  return (
    <AppShell
      title="People"
      nav={<PeopleNav count={people.length} invited={invited} />}
      notifications={NOTIFICATIONS}
      account={ACCOUNT}
      actions={
        <Button size="sm" variant="secondary">
          <PersonAdd />
          Invite
        </Button>
      }
    >
      <div className="mx-auto w-full max-w-3xl py-10">
        <header className="mb-5 flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">People</h1>
          <p className="text-md text-text-muted">
            Everyone with a seat, and what they&apos;re allowed to do. {invited}{" "}
            invite{invited === 1 ? "" : "s"} still pending.
          </p>
        </header>

        <FilterBar
          className="mb-3"
          shown={shown.length}
          total={people.length}
          noun="people"
          onClear={clear}
        >
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search people"
            className="w-56"
          />
          <FilterChip
            label="Role"
            options={ROLES.map((r) => ({ id: r.id, label: r.label }))}
            selected={roles}
            onChange={setRoles}
          />
          <FilterChip
            label="Status"
            options={[
              { id: "active", label: "Active" },
              { id: "invited", label: "Invited" },
            ]}
            selected={statuses}
            onChange={setStatuses}
          />
          <SortControl
            className="ml-auto"
            value={sort}
            options={SORTS}
            onChange={setSort}
          />
        </FilterBar>

        {shown.length > 0 ? (
          <List>
            {shown.map((p) => (
              <PersonRow
                key={p.email}
                person={p}
                isOnlyOwner={p.role === "owner" && owners === 1}
                isYou={p.email === ACCOUNT.email}
                onRole={(role) => setRole(p.email, role)}
              />
            ))}
          </List>
        ) : (
          <EmptyState
            className="border-dashed"
            icon={<Search />}
            title="Nobody matches that"
            description="Katalis has four people, so it doesn't take much to filter them all out."
            action={
              <Button size="sm" variant="secondary" onClick={clear}>
                Clear filters
              </Button>
            }
          />
        )}

        <div className="pt-8">
          <ListSection title="What each role can do" count={ROLES.length}>
            <List>
              {ROLES.map((r) => (
                <ListItem
                  key={r.id}
                  title={r.label}
                  description={r.description}
                  /* Dimmed when a role filter is on and this isn't in it, so
                     the legend keeps agreeing with the list above it. */
                  className={
                    filtering && roles.length && !roles.includes(r.id)
                      ? "opacity-45"
                      : undefined
                  }
                />
              ))}
            </List>
          </ListSection>
        </div>
      </div>
    </AppShell>
  );
}

function PersonRow({
  person: p,
  isOnlyOwner,
  isYou,
  onRole,
}: {
  person: Person;
  isOnlyOwner: boolean;
  isYou: boolean;
  onRole: (role: Role) => void;
}) {
  return (
    <ListItem
      leading={<Avatar name={p.name} size="md" />}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {p.name}
          {isYou && (
            <Badge tone="neutral" size="sm">
              You
            </Badge>
          )}
          {/* Not a StatusPill — that vocabulary belongs to workflow steps, and
              its "awaiting" label reads "Awaiting review", which an unaccepted
              invite isn't. */}
          {p.status === "invited" && (
            <Badge tone="warning" size="sm">
              Invited
            </Badge>
          )}
        </span>
      }
      description={`${p.title} · ${p.email}`}
      footnote={p.note}
      meta={p.ownsSteps ? `owns ${p.ownsSteps} steps` : undefined}
      trailing={
        <>
          <div className="w-40">
            {isOnlyOwner ? (
              /* The last owner can't be demoted. Rendering a picker that
                 refuses on submit would be worse than not offering the choice
                 — locking yourself out of your own account is unrecoverable. */
              <span
                title="There has to be an owner"
                className="flex h-8 items-center gap-2 rounded-md border border-dashed border-border px-2.5 text-base text-text-muted"
              >
                Owner
                <Warning className="ml-auto size-3.5 shrink-0 text-text-subtle" />
              </span>
            ) : (
              <SelectMenu
                label={`Role for ${p.name}`}
                value={p.role}
                onChange={(role) => onRole(role as Role)}
                options={ROLES.map((r) => ({
                  id: r.id,
                  label: r.label,
                  description: r.description,
                }))}
              />
            )}
          </div>

          <DropdownMenu
            label={`${p.name} actions`}
            align="end"
            width="w-48"
            trigger={
              <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-hover hover:text-text">
                <MoreHoriz className="size-4" />
              </span>
            }
            items={[
              p.status === "invited"
                ? { id: "resend", label: "Resend invite", icon: <Mail /> }
                : { id: "email", label: "Email", icon: <Mail /> },
              {
                id: "remove",
                label: isOnlyOwner
                  ? "Can't remove the owner"
                  : "Remove from Katalis",
                icon: <Delete />,
                destructive: !isOnlyOwner,
                disabled: isOnlyOwner,
                separatorBefore: true,
              },
            ]}
          />
        </>
      }
    />
  );
}

function PeopleNav({ count, invited }: { count: number; invited: number }) {
  return (
    <AdminNav>
      <div className="flex flex-col gap-2 px-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Seats
        </p>
        <NavStat label="People" value={count} />
        <NavStat
          label="Pending"
          value={invited}
          tone={invited > 0 ? "warning" : "neutral"}
        />
      </div>

      <Separator />

      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        Only owners and admins can publish a workflow. Everyone else can
        complete the steps assigned to them.
      </p>
    </AdminNav>
  );
}
