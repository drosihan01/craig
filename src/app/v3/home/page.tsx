"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell, Button, buttonVariants, CraigMark } from "@/components/ui";
import { Add, Description, PersonAdd } from "@/components/ui/icons";
import { V3Nav } from "@/components/v3/v3-nav";
import { V3AddSeat } from "@/components/v3/v3-add-seat";
import { CelebrateDialog } from "@/components/v3/celebrate-dialog";
import { PaywallDialog } from "@/components/v3/paywall-dialog";
import { V3_ACCOUNT, V3_FOUNDER, V3_STARTER } from "@/lib/v3/company";
import { V3_WORKFLOW } from "@/lib/v3/workflow";
import type { V3RunStep } from "@/lib/v3/run";
import { openBlocks, runComplete, runDone, useV3 } from "@/lib/v3/store";

/**
 * Calder's home, for Theo.
 *
 * Craig speaks first and says one thing, because that's the difference between
 * an agent and a dashboard: a dashboard renders state and waits to be
 * interpreted, an agent tells you what it did, what it's chasing, and what it
 * needs from you — and only the last of those is Theo's problem.
 *
 * Which of those three he gets depends entirely on where the demo is. Before
 * Priya has a seat the page is one question. While she's running it's a
 * progress report and nothing to do. Once she's finished it's the sentence he
 * actually wanted, which is that the record exists and it's inside the
 * deadline. All of it is read from the store rather than typed in, so Home
 * can't claim something the run page disagrees with.
 */

const FIRST = V3_FOUNDER.name.split(" ")[0];
const HER = V3_STARTER.name.split(" ")[0];

interface OpenItem {
  id: string;
  /** The thing, phrased as Craig asking rather than as a chore. */
  ask: string;
  detail: string;
  cta: string;
  /** Where the button goes. Omitted for the one that opens the seat dialog. */
  href?: string;
}

export default function V3HomePage() {
  const router = useRouter();
  const { scene, blocks, seatTaken, run, feed } = useV3();

  const [adding, setAdding] = React.useState(false);
  /* Dismissal is local. The scene belongs to whoever is driving the demo, and
     closing a modal shouldn't rewind their script. */
  const [congratulated, setCongratulated] = React.useState(false);
  const [askedForAnother, setAskedForAnother] = React.useState(false);
  const [refusedPlan, setRefusedPlan] = React.useState(false);

  const gaps = openBlocks(blocks);
  const finished = runComplete(run);
  const items = openItems(gaps, seatTaken);

  const line = craigLine({
    finished,
    seatTaken,
    gaps: gaps.length,
    done: runDone(run),
    total: run.length,
    next: run.find((s) => s.status !== "complete"),
  });

  /* Her finishing is the trigger, not a scene change — the run can complete
     before anything moves the story on, and the congratulations shouldn't wait
     for that. It stops coming back once he's past it either way. */
  const celebrating =
    finished && !congratulated && scene !== "paywall" && scene !== "done";
  const paywalled = (askedForAnother || scene === "paywall") && !refusedPlan;

  function addAnother() {
    setRefusedPlan(false);
    setAskedForAnother(true);
  }

  return (
    <AppShell
      title="Home"
      nav={<V3Nav />}
      account={V3_ACCOUNT}
      asideTitle="What I've done"
      aside={<Activity feed={feed} />}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-10">
        {/* No card. A card is a boundary and there's nothing here for it to be
            a boundary against. */}
        <div className="flex flex-col gap-3">
          <CraigMark className="size-8 text-accent" />
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-[-0.02em]">
              Hey, {FIRST}
            </h1>
            <p className="text-md leading-relaxed text-text-muted">{line}</p>
          </div>
        </div>

        {items.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
              I need you for{" "}
              {items.length === 1 ? "one thing" : `${items.length} things`}
            </p>

            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-sunken px-3 py-2.5"
              >
                <span className="min-w-0 flex-1 text-base">
                  {item.ask}
                  <span className="block text-xs text-text-subtle">
                    {item.detail}
                  </span>
                </span>
                {item.href ? (
                  <Link
                    href={item.href}
                    className={buttonVariants({
                      size: "sm",
                      variant: "secondary",
                    })}
                  >
                    {item.cta}
                  </Link>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setAdding(true)}
                  >
                    {item.cta}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* The three nouns Craig works on — start one, rather than go to the
            section, which the nav already does. */}
        <div className="flex flex-wrap gap-2">
          {/* His second hire is where the free plan runs out, so the chip that
              starts one is where he finds that out. */}
          <QuickAdd
            icon={<PersonAdd />}
            label="Add a person"
            onClick={seatTaken ? addAnother : () => setAdding(true)}
          />
          <QuickAdd icon={<Add />} label="New workflow" href="/v3/workflows" />
          {/* Documents have no screen of their own in v3, so this points at the
              only place they're visible: the workflow says which of Theo's
              three it was written from. */}
          <QuickAdd
            icon={<Description />}
            label="Add a document"
            href={`/v3/workflows/${V3_WORKFLOW.id}`}
          />
        </div>
      </div>

      {/* The same dialog the builder uses, because it's the same act. Inviting
          her from Home lands on her run, which is where anyone who just pressed
          it wants to be. */}
      <V3AddSeat
        open={adding}
        onClose={() => setAdding(false)}
        onInvited={() => {
          setAdding(false);
          router.push(`/v3/people/${V3_STARTER.id}`);
        }}
      />

      <CelebrateDialog
        open={celebrating}
        onClose={() => setCongratulated(true)}
      />
      <PaywallDialog
        open={paywalled}
        onClose={() => {
          setRefusedPlan(true);
          setAskedForAnother(false);
        }}
      />
    </AppShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  What Craig says                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The one line under the greeting: what he's handled, and what he's waiting on.
 *
 * A string rather than a node, because it's a sentence and nothing else. The
 * numbers in it are counted from the run, so it can't drift out of step with
 * the page that lists it.
 */
function craigLine({
  finished,
  seatTaken,
  gaps,
  done,
  total,
  next,
}: {
  finished: boolean;
  seatTaken: boolean;
  gaps: number;
  done: number;
  total: number;
  next?: V3RunStep;
}): string {
  if (finished) {
    return `${HER} is fully onboarded, and her training record is signed and approved — four working days after she started, where §5.2 allows you five. Nothing needs you.`;
  }

  if (seatTaken) {
    /* Zero done isn't a stalled workflow on the day she's invited, and a bare
       "0 of 12" reads like one. */
    const progress =
      done === 0
        ? `${HER} is under way. Nothing has come back yet — her contract and her police check both went out the moment she had a seat.`
        : `${HER} is ${done} of ${total} steps through, and nothing is stuck.`;
    if (!next) return progress;

    const who = next.waitingOn ?? next.owner;
    return who === V3_FOUNDER.name
      ? `${progress} What's left is “${next.title}”, which is yours to approve — everything it attests to is done.`
      : `${progress} The one I'm chasing is “${next.title}”, and that sits with ${who.split(" ")[0]}. You'll hear from me if it stalls.`;
  }

  if (gaps > 0) {
    return `I've written ${V3_WORKFLOW.name} from SOP-014 and your induction checklist. There ${gaps === 1 ? "is" : "are"} ${gaps === 1 ? "one step" : `${gaps} steps`} I couldn't answer without you, so I've left ${gaps === 1 ? "it" : "them"} open rather than guess.`;
  }

  return `${V3_WORKFLOW.name} is finished and ready to run, and nobody is in it yet. ${HER} starts in ${V3_STARTER.startsIn}, and the police check is the one step nobody here controls.`;
}

/**
 * Everything that genuinely needs Theo, derived rather than listed.
 *
 * An unconfigured step is one row each, not one row saying "2 steps need
 * setting up" — a number you have to go and decode isn't a thing you can
 * finish. The seat sits at the bottom and is the only row that isn't
 * housekeeping: a founder who answers every question and never adds anybody has
 * got nothing out of Craig at all.
 */
function openItems(
  gaps: { id: string; title: string; incomplete?: string }[],
  seatTaken: boolean,
): OpenItem[] {
  const items: OpenItem[] = gaps.map((block) => ({
    id: block.id,
    ask: `What should I use for “${block.title}”?`,
    detail: block.incomplete ?? "Something is missing",
    href: `/v3/workflows/${V3_WORKFLOW.id}`,
    cta: "Answer",
  }));

  if (!seatTaken) {
    items.push({
      id: "seat",
      ask: "Add your first person",
      detail:
        gaps.length > 0
          ? `${V3_WORKFLOW.name} can't run until ${gaps.length === 1 ? "that is" : "those are"} answered`
          : `${HER} starts in ${V3_STARTER.startsIn}, and a police check takes up to 15 business days — that clock starts when she has a seat`,
      cta: "Add someone",
    });
  }

  return items;
}

/* -------------------------------------------------------------------------- */
/*  Panel                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Craig's running commentary, beside the work rather than inside it.
 *
 * It's also the answer to "what has this thing actually done", which is the
 * question a founder who has been burned by software asks on day three.
 */
function Activity({
  feed,
}: {
  feed: { id: string; note: string; when: string }[];
}) {
  if (feed.length === 0) {
    return (
      <p className="text-xs leading-relaxed text-text-subtle">
        Nothing yet. Anything I do gets written down here with the time it
        happened, which is most of what a training record is.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {feed.slice(0, 8).map((entry) => (
        <div key={entry.id} className="flex flex-col gap-0.5">
          <p className="text-xs leading-relaxed text-text-muted">
            {entry.note}
          </p>
          <p className="text-2xs text-text-subtle">{entry.when}</p>
        </div>
      ))}
    </div>
  );
}

function QuickAdd({
  icon,
  label,
  href,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
}) {
  const className =
    "inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-hover hover:text-text [&_svg]:size-3.5 [&_svg]:text-text-subtle";

  return href ? (
    <Link href={href} className={className}>
      {icon}
      {label}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {icon}
      {label}
    </button>
  );
}
