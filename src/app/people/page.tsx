"use client";

import * as React from "react";
import {
  AppShell,
  Avatar,
  Badge,
  Button,
  DropdownMenu,
  List,
  ListItem,
  SelectMenu,
  Separator,
  type AppNotification,
} from "@/components/ui";
import {
  Delete,
  Mail,
  MoreHoriz,
  PersonAdd,
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

export default function PeoplePage() {
  const [people, setPeople] = React.useState(INITIAL);

  const owners = people.filter((p) => p.role === "owner").length;
  const invited = people.filter((p) => p.status === "invited").length;

  function setRole(email: string, role: Role) {
    setPeople((prev) =>
      prev.map((p) => (p.email === email ? { ...p, role } : p)),
    );
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
            {people.length} people · {invited} invite
            {invited === 1 ? "" : "s"} pending
          </p>
        </header>

        <List>
          {people.map((p) => (
            <PersonRow
              key={p.email}
              person={p}
              isOnlyOwner={p.role === "owner" && owners === 1}
              isYou={p.email === ACCOUNT.email}
              onRole={(role) => setRole(p.email, role)}
            />
          ))}
        </List>

        <div className="flex flex-col gap-2 pt-8">
          <h2 className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
            What each role can do
          </h2>
          <List>
            {ROLES.map((r) => (
              <ListItem
                key={r.id}
                title={r.label}
                description={r.description}
              />
            ))}
          </List>
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
