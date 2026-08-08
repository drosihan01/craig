"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AppShell,
  Avatar,
  Badge,
  Button,
  EmptyState,
  List,
  ListItem,
  Separator,
} from "@/components/ui";
import {
  ShowcaseNav,
  ShowcaseNavRail,
} from "@/components/showcase/showcase-nav";
import { CheckCircle, PersonAdd } from "@/components/ui/icons";
import { NavStat } from "@/components/app-nav";
import { InviteStarter } from "@/components/showcase/invite-starter";
import { NewWorkflowDialog } from "@/components/showcase/new-workflow";
import { SeatPaywall, outOfSeats } from "@/components/showcase/seat-paywall";
import type { Session } from "@/lib/showcase/contract";
import { useShowcase } from "@/lib/showcase/store";

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
 *
 * Everyone else's row goes somewhere. "Who has a seat" is half of what anybody
 * comes here for; the other half is how the person they added is getting on,
 * and that lives a click away rather than being squeezed into a subtitle.
 */

/**
 * One row, flattened by the server from a joiner and their progress.
 *
 * Deliberately not the whole `Joiner`. The steps are the new starter's own
 * business and their page is where those belong; a list only has to answer who
 * has a seat and how far along they are.
 */
export interface SeatRow {
  id: string;
  name: string;
  email: string;
  role: string;
  startDate: string;
  workflowName: string;
  done: number;
  total: number;
  finished: boolean;
  nextStep: string | null;
}

export function PeopleList({
  user,
  people,
}: {
  user: Session;
  /**
   * From the server, not from the browser's copy.
   *
   * This is the one part of the showcase two different people write to. The
   * new starter fills their steps in on their own device; nothing they did
   * could ever reach this page through `localStorage`, so who holds a seat and
   * how far through they are is read on the server and handed down.
   */
  people: SeatRow[];
}) {
  const state = useShowcase();

  /* The server's list is already everyone except whoever is reading this: the
     account holder holds an account rather than a seat, so there is nothing to
     filter out. Kept under its own name because that is the distinction every
     count on this screen turns on, the seat limit included — they are about the
     people who were invited, never about the row that is deliberately not
     drawn. */
  const guests = people;

  const [inviting, setInviting] = React.useState(false);
  /**
   * The list is the confirmation, so there is nothing to announce.
   *
   * A green panel saying "Nils has been invited" sat above a list that didn't
   * have Nils in it — the notice and the evidence disagreed, and the notice was
   * the weaker of the two. The row is better in every way: it says the same
   * thing, it says it in the place you'd look next, and it is still there
   * tomorrow.
   *
   * So the invite refreshes the server data instead. `router.refresh()` re-runs
   * the page that read the seats, which is what puts them on the list — and
   * they arrive as a seat member with a step to their name, not as a message
   * about something that happened.
   */
  const router = useRouter();

  /* The two reasons adding somebody can't go ahead, each with a screen of its
     own rather than a disabled button. Both are things the account can change,
     and a control that quietly refuses teaches nobody how. */
  const [choosing, setChoosing] = React.useState(false);
  const [paywall, setPaywall] = React.useState(false);

  /* The one that would actually run. A draft can be given a seat in the sense
     that a form would accept it, and then nothing happens — so the invitation
     is offered against a published workflow or not offered at all. */
  const live = state.workflows.find((w) => w.published) ?? null;

  /**
   * One button, three outcomes, and the two that stop short say why.
   *
   * Adding somebody needs a plan to put them through and a seat to put them in,
   * and neither is a condition the person pressing this can be expected to know
   * about in advance. Hiding the button until both hold would leave the page
   * silent about the only two things standing in the way — and the account most
   * likely to hit either is a brand new one, which is exactly the account with
   * nobody around to explain it.
   *
   * Seats are checked before the workflow. Being out of seats is the harder
   * stop of the two: sending somebody off to write a workflow they then can't
   * use is a wasted trip, and the price is the thing they'd want to have been
   * told first. The count it checks is the server's — a seat given up on
   * another device is a seat this page can offer again, and it could not have
   * known that while it was counting a copy of its own.
   *
   * With no workflow it opens the chooser rather than a notice about needing
   * one. The empty state has already said why — this is the same press
   * carrying on into the thing that has to happen next, rather than a dialog
   * whose only outcome is another dialog.
   */
  const addPerson = React.useCallback(() => {
    if (outOfSeats(guests.length)) setPaywall(true);
    else if (!live) setChoosing(true);
    else setInviting(true);
  }, [guests.length, live]);

  const close = React.useCallback(() => setInviting(false), []);

  return (
    <AppShell
      title="People"
      account={{ name: user.name, email: user.email }}
      navRail={<ShowcaseNavRail />}
      nav={
        <ShowcaseNav>
          <PeopleNav seats={guests.length + 1} onboarding={guests.length} />
        </ShowcaseNav>
      }
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

          {/* Only once somebody else is on the list. While it's empty the
              empty state below is the whole page and already carries this
              button with an explanation beside it, and the same offer made
              twice on a screen with two rows on it reads as a page that
              doesn't know what it wants you to do. */}
          {guests.length > 0 && (
            <Button size="sm" onClick={addPerson} className="shrink-0">
              <PersonAdd />
              Add person
            </Button>
          )}
        </header>

        {/* Kept on screen rather than flashed as a toast. This is the one action
            here that can't be undone, and "did that send?" is a question worth
            being able to answer by looking. */}

        {/* No row for whoever is reading this. They know who they are, and a
            page about the people they've brought in shouldn't open with
            themselves — the seat they hold isn't onboarding and has no progress
            to show, so the row could only ever be a name with an empty half.
            The account is in the corner of every screen already. */}
        {/* Only when somebody is in it. `List` draws its own frame, so an
            empty one collapsed to a bare rule sitting between the heading and
            the empty state — a divider with nothing on either side of it,
            which reads as a section that failed to load. */}
        {guests.length > 0 && (
          <List>
            {guests.map((person) => (
              <ListItem
                key={person.id}
                /* The row is the way in to what's actually happening to them.
                 A list of names that does nothing when you press one is a
                 list that answers "who" and refuses "how are they getting
                 on" — which is the question anybody opens this page with. */
                href={`/showcase/people/${person.id}`}
                leading={<Avatar name={person.name} size="md" />}
                title={person.name}
                description={`${person.role} · ${person.email}`}
                /* What's actually happening to them, not just when they arrive.
                 A start date is the same line every day until it passes; the
                 step they're waiting on is the thing that changed since you
                 last looked, which is what anybody opens this page to find
                 out. The date keeps its place beside it, because "how far
                 along" only means something against "starting when". */
                footnote={
                  person.finished
                    ? `Finished · starts ${readable(person.startDate)}`
                    : person.nextStep
                      ? `${person.nextStep} · starts ${readable(person.startDate)}`
                      : `Starts ${readable(person.startDate)}`
                }
                meta={
                  person.finished ? (
                    <Badge tone="success" size="sm">
                      <CheckCircle />
                      Done
                    </Badge>
                  ) : (
                    /* The count rather than the word "Onboarding". Everyone on
                     this list is onboarding — a badge that says so on every
                     row is a column of the same word, and it was sitting
                     exactly where the one number worth reading could go. */
                    <Badge tone="accent" size="sm">
                      {person.done} of {person.total}
                    </Badge>
                  )
                }
              />
            ))}
          </List>
        )}

        {/* One empty state and one button, whatever the account is missing.
            It used to be two — one offering the invitation, one sending you
            off to write a workflow first — and the second was a page telling
            somebody about a rule before they had shown any sign of wanting to
            break it. The rule is easier to read as an answer than as a
            warning, so the button is always the same and the answer comes
            when it's actually relevant. */}
        {guests.length === 0 && (
          <EmptyState
            className="mt-4"
            icon={<PersonAdd />}
            title="Nobody else has a seat yet"
            /* The reason the button sometimes opens a workflow chooser
               instead of a form, said before it does rather than after. A
               seat with nothing behind it does nothing, and somebody who
               reads that here is choosing how to write one a moment later
               rather than being redirected. */
            description={
              live
                ? `Add the first person and ${live.name} starts against them the moment you do.`
                : "A seat is what sets a workflow running, so there needs to be a published one first — Craig can write it."
            }
            action={
              <Button size="sm" onClick={addPerson}>
                <PersonAdd />
                Add person
              </Button>
            }
          />
        )}
      </div>

      {live && (
        <InviteStarter
          open={inviting}
          onClose={close}
          workflowId={live.id}
          onInvited={() => router.refresh()}
        />
      )}

      {/* The chooser Workflows opens, not a version of it written here. Both
          screens are asking the same question — Craig or a blank canvas — and
          a second dialog making the same offer in its own words is one that
          will eventually recommend something different to the same person
          depending on which page they were standing on. */}
      <NewWorkflowDialog open={choosing} onClose={() => setChoosing(false)} />

      <SeatPaywall
        open={paywall}
        onClose={() => setPaywall(false)}
        holder={guests[0]?.name}
      />
    </AppShell>
  );
}

/**
 * `2026-08-24` as "Monday 24 August".
 *
 * Built from the parts rather than handed to `new Date(string)`, which reads a
 * bare date as UTC midnight and renders it a day early for anybody west of
 * Greenwich. It has to agree with the date the invitation gave them.
 *
 * Exported for the person's own page, which prints the same start date one
 * click away. Two copies of this would be two chances to fix the timezone bug
 * in one of them — and a start date that reads Monday on the list and Sunday on
 * the page is the sort of disagreement nobody catches until somebody turns up
 * on the wrong morning.
 */
export function readable(iso: string) {
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
