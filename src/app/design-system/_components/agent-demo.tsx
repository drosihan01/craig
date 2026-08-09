"use client";

import * as React from "react";
import {
  ActivityFeed,
  AgentPhase,
  AgentQuestion,
  Button,
  CertaintyPill,
  CraigMark,
  PersonTurn,
  useAgentWork,
  type ActivityEntry,
  type Certainty,
} from "@/components/ui";

/**
 * Live demos for the agent sections.
 *
 * They run the real hook rather than a scripted animation, because the thing
 * being documented is the timing — how long a phase holds, whether the change
 * lands with the first label or the last — and a fake would let that drift
 * away from what the product does.
 */

const PHASES = [
  "Looking at what Jason is in",
  "Checking which ones a new engineer needs",
  "Adding them to the Slack step",
];

export function AgentWorkDemo() {
  const [done, setDone] = React.useState(false);
  const work = useAgentWork();

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex min-h-16 flex-col gap-2 rounded-lg border border-border bg-surface p-3">
        {!done && !work.phase && (
          <p className="text-sm text-text-subtle">Nothing running.</p>
        )}
        <AgentPhase label={work.phase} mark />
        {done && !work.phase && (
          <div className="flex items-start gap-2">
            <CraigMark className="mt-0.5 size-4 shrink-0 text-accent" />
            <p className="text-sm leading-relaxed text-text-muted">
              Done — #general, #engineering, #incidents. That was the last thing
              Slack needed.
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            setDone(false);
            /* The change lands with the last phase, not the first. A panel
               that updates while he's still "checking" gives the game away. */
            work.run(PHASES, () => setDone(true));
          }}
        >
          Run
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            work.cancel();
            setDone(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function AgentTurnsDemo() {
  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <CraigMark className="size-5 text-accent" />
        <p className="text-base leading-relaxed text-text-muted">
          Two steps still need you, and one of them I can probably work out
          myself.
        </p>
        <AgentQuestion>
          Nobody has said which Slack channels Nils should be in — I could copy
          whichever ones Jason is in. Want me to?
        </AgentQuestion>
      </div>

      <PersonTurn>Yes — copy Jason&apos;s.</PersonTurn>
      <PersonTurn size="sm">
        Small, for a 300px panel where the bubble is most of the width.
      </PersonTurn>
    </div>
  );
}

const CERTAINTIES: { certainty: Certainty; step: string }[] = [
  { certainty: "verified", step: "Google Workspace" },
  { certainty: "confirmed", step: "Lab induction" },
  { certainty: "assumed", step: "Read the handbook" },
];

export function CertaintyDemo() {
  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      {CERTAINTIES.map((c) => (
        <div
          key={c.certainty}
          className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2"
        >
          <span className="min-w-0 flex-1 truncate text-sm">{c.step}</span>
          <CertaintyPill certainty={c.certainty} size="sm" />
        </div>
      ))}
    </div>
  );
}

const FEED: ActivityEntry[] = [
  {
    id: "a1",
    verb: "Set",
    what: "the Slack channels from what you told me",
    when: "Just now",
  },
  {
    id: "a2",
    verb: "Chased",
    what: "it again — it's the only thing holding up the rest of his week",
    when: "Yesterday",
  },
  {
    id: "a3",
    verb: "Checked",
    what: "his Google Workspace account exists and he's in all three groups",
    when: "Monday",
  },
  {
    id: "a4",
    verb: "Noticed",
    what: "he's nine hours ahead, so nothing gets sent to him after 3pm his time",
    when: "Monday",
  },
];

export function ActivityDemo() {
  return (
    <div className="flex w-full flex-wrap gap-8">
      <div className="flex w-64 flex-col gap-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          stamp=&quot;newest&quot;
        </p>
        <ActivityFeed items={FEED} stamp="newest" />
      </div>
      <div className="flex w-64 flex-col gap-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          stamp=&quot;each&quot; · limit=&#123;3&#125;
        </p>
        <ActivityFeed items={FEED} stamp="each" limit={3} />
      </div>
    </div>
  );
}
