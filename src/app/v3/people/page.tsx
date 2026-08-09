"use client";

import {
  AppShell,
  Avatar,
  Badge,
  List,
  ListItem,
  Separator,
} from "@/components/ui";
import { NavStat } from "@/components/app-nav";
import { V3Nav } from "@/components/v3/v3-nav";
import { V3_ACCOUNT, V3_PEOPLE, V3_STARTER } from "@/lib/v3/company";
import { runComplete, runDone, useV3 } from "@/lib/v3/store";

/**
 * Who has a seat at Calder.
 *
 * Deliberately thinner than the admin's People page. No role picker: at Calder
 * "Lab Lead" describes what Saoirse does at a bench, not what she's allowed to
 * change in Craig, and a dropdown offering to make her an admin would be
 * answering a question nobody here has. No filters either — four rows can't be
 * filtered into anything you couldn't already see.
 *
 * Only one row goes anywhere, and that's the point of the page rather than an
 * omission. Onboarding is the only thing this product knows about a person, so
 * the rows without a run behind them would open a page with nothing on it.
 */

/* Everyone who was already here. Priya is kept out of this list because she
   isn't a fixture on this page — whether she has a seat is store state, and
   the whole demo turns on the moment she gets one. */
const TEAM = [V3_PEOPLE.theo, V3_PEOPLE.saoirse, V3_PEOPLE.raf];

export default function V3PeoplePage() {
  const { seatTaken, run } = useV3();

  const done = runDone(run);
  const her = V3_STARTER.name.split(" ")[0];

  return (
    <AppShell
      title="People"
      account={V3_ACCOUNT}
      nav={<PeopleNav seatTaken={seatTaken} />}
    >
      <div className="mx-auto w-full max-w-3xl py-10">
        <header className="mb-5 flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">People</h1>
          <p className="text-md text-text-muted">
            {seatTaken
              ? `Everyone with a seat. ${her} got hers when you invited her, which is what started her workflow.`
              : "Everyone with a seat. Giving someone one is what starts their workflow."}
          </p>
        </header>

        <List>
          {TEAM.map((p) => (
            <ListItem
              key={p.email}
              leading={<Avatar name={p.name} size="md" />}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {p.name}
                  {p.email === V3_ACCOUNT.email && (
                    <Badge tone="neutral" size="sm">
                      You
                    </Badge>
                  )}
                </span>
              }
              description={`${p.role} · ${p.email}`}
              footnote={p.note}
            />
          ))}

          {seatTaken && (
            <ListItem
              href={`/v3/people/${V3_STARTER.id}`}
              leading={<Avatar name={V3_STARTER.name} size="md" />}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {V3_STARTER.name}
                  {/* Flips when she's through it. A row that still says
                      "Onboarding" beside "12 of 12" is the page arguing with
                      itself. */}
                  {runComplete(run) ? (
                    <Badge tone="success" size="sm">
                      Onboarded
                    </Badge>
                  ) : (
                    <Badge tone="accent" size="sm">
                      Onboarding
                    </Badge>
                  )}
                </span>
              }
              description={`${V3_STARTER.role} · ${V3_STARTER.email}`}
              footnote={`Starts ${V3_STARTER.startDate} · ${V3_STARTER.location}`}
              meta={`${done} of ${run.length} done`}
            />
          )}
        </List>
      </div>
    </AppShell>
  );
}

function PeopleNav({ seatTaken }: { seatTaken: boolean }) {
  return (
    <V3Nav>
      <div className="flex flex-col gap-2 px-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Seats
        </p>
        <NavStat label="People" value={TEAM.length + (seatTaken ? 1 : 0)} />
        <NavStat label="Onboarding" value={seatTaken ? 1 : 0} />
      </div>

      <Separator />

      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        A seat is the trigger. Nothing runs against anybody until they have one,
        and everything starts the second they do.
      </p>
    </V3Nav>
  );
}
