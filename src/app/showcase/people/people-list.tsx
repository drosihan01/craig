"use client";

import * as React from "react";
import Link from "next/link";
import {
  AppShell,
  Avatar,
  Badge,
  Button,
  buttonVariants,
  Callout,
  EmptyState,
  List,
  ListItem,
  Separator,
} from "@/components/ui";
import { AltRoute, CheckCircle, PersonAdd } from "@/components/ui/icons";
import { NavStat } from "@/components/app-nav";
import {
  InviteStarter,
  type InvitedPerson,
} from "@/components/showcase/invite-starter";
import type { Session } from "@/lib/showcase/contract";
import { invited, useShowcase } from "@/lib/showcase/store";

/**
 * Everyone with a seat, which on a new account is one person.
 *
 * That single row is the design rather than a state to apologise for. A team
 * page that pads itself out with sample colleagues is lying about the only
 * thing this screen knows, and the founder of a three-person company already
 * knows how many people work there. So the row is theirs, and the panel under
 * it is the invitation — the page is a list and a next step, at every size it
 * will ever be.
 *
 * The account holder is rendered from the session rather than read out of the
 * store. They exist because they signed in, not because anything happened, and
 * writing them into the store on first paint would mean this page's own render
 * was the event that put them there.
 */

export function PeopleList({ user }: { user: Session }) {
  const state = useShowcase();
  const guests = invited(state);

  const [inviting, setInviting] = React.useState(false);
  const [sent, setSent] = React.useState<InvitedPerson | null>(null);

  /* The one that would actually run. A draft can be given a seat in the sense
     that a form would accept it, and then nothing happens — so the invitation
     is offered against a published workflow or not offered at all. */
  const live = state.workflows.find((w) => w.published) ?? null;

  const open = React.useCallback(() => setInviting(true), []);
  const close = React.useCallback(() => setInviting(false), []);

  return (
    <AppShell
      title="People"
      account={{ name: user.name, email: user.email }}
      nav={<PeopleNav seats={guests.length + 1} onboarding={guests.length} />}
    >
      <div className="mx-auto w-full max-w-3xl py-10">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">
              People
            </h1>
            <p className="text-md text-text-muted">
              Everyone with a seat. Giving somebody one is what starts their
              workflow — nothing runs against them until they have one.
            </p>
          </div>

          {live && (
            <Button size="sm" onClick={open} className="shrink-0">
              <PersonAdd />
              Invite someone
            </Button>
          )}
        </header>

        {/* Kept on screen rather than flashed as a toast. This is the one action
            here that can't be undone, and "did that send?" is a question worth
            being able to answer by looking. */}
        {sent && (
          <Callout
            tone="success"
            icon={<CheckCircle />}
            title={`${sent.name.split(" ")[0]} has been invited`}
            className="mb-5"
          >
            Their first email is on its way to {sent.email}.
          </Callout>
        )}

        <List>
          <ListItem
            leading={<Avatar name={user.name} size="md" />}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {user.name}
                <Badge tone="neutral" size="sm">
                  You
                </Badge>
              </span>
            }
            description={user.email}
            footnote="Holds the account"
          />

          {guests.map((person) => (
            <ListItem
              key={person.id}
              leading={<Avatar name={person.name} size="md" />}
              title={person.name}
              description={`${person.role} · ${person.email}`}
              footnote={
                person.startDate
                  ? `Starts ${readable(person.startDate)}`
                  : undefined
              }
              meta={
                <Badge tone="accent" size="sm">
                  Onboarding
                </Badge>
              }
            />
          ))}
        </List>

        {guests.length === 0 &&
          (live ? (
            <EmptyState
              className="mt-4"
              icon={<PersonAdd />}
              title="Just you, so far"
              description={`Invite the first person and ${live.name} starts against them the moment you do.`}
              action={
                <Button size="sm" onClick={open}>
                  Invite someone
                </Button>
              }
            />
          ) : (
            <EmptyState
              className="mt-4"
              icon={<AltRoute />}
              title="Just you, so far"
              description="An invitation starts a published workflow, so there needs to be one first. Craig writes it; you publish it."
              action={
                <Link
                  href="/showcase/workflows"
                  className={buttonVariants({
                    size: "sm",
                    variant: "secondary",
                  })}
                >
                  Open workflows
                </Link>
              }
            />
          ))}
      </div>

      {live && (
        <InviteStarter
          open={inviting}
          onClose={close}
          workflowId={live.id}
          onInvited={setSent}
        />
      )}
    </AppShell>
  );
}

/**
 * `2026-08-24` as "Monday 24 August".
 *
 * Built from the parts rather than handed to `new Date(string)`, which reads a
 * bare date as UTC midnight and renders it a day early for anybody west of
 * Greenwich. It has to agree with the date the invitation gave them.
 */
function readable(iso: string) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!parts) return iso;

  const date = new Date(
    Number(parts[1]),
    Number(parts[2]) - 1,
    Number(parts[3]),
  );
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function PeopleNav({
  seats,
  onboarding,
}: {
  seats: number;
  onboarding: number;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 px-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Seats
        </p>
        <NavStat label="With a seat" value={seats} />
        <NavStat label="Onboarding" value={onboarding} />
      </div>

      <Separator />

      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        A seat is the trigger. Nothing is sent to anybody until they have one,
        and the first email goes the second they do.
      </p>
    </div>
  );
}
