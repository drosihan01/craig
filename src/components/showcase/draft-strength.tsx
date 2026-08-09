"use client";

import type { ReactNode } from "react";
import { Check } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/**
 * How good a workflow Craig could draft from what he has so far.
 *
 * This column began as two lists — what he'd recorded, and what nobody had
 * written down. Both were accurate and neither did anything. A list that
 * accumulates reports what already happened; it gives nobody a reason to answer
 * one more question, which is the only thing this screen actually needs from
 * the person sitting in front of it.
 *
 * Same data, read forwards instead of backwards. The facts he's recorded are
 * checked off against the things a workflow can't be built without, so the
 * column says what's still worth telling him rather than what he's already
 * been told — and a gap stops being a note about the company's untidiness and
 * becomes the next thing that would improve the draft.
 *
 * The meter is derived on every render and stored nowhere, for the same reason
 * `isUnconfigured` is derived in the builder: a cached score is a score that
 * can disagree with the thing it scores, and it will, on the turn somebody
 * cares about.
 *
 * It cannot reach "complete", and that isn't modesty. A picture assembled from
 * a five-minute conversation is never the whole picture, and a full bar would
 * be this product making exactly the claim it spent three demos arguing
 * against. The top of the scale is "enough to draft from", which is a true
 * thing to say about six answered questions and a much more useful one.
 */

export interface StrengthNote {
  id: string;
  text: string;
}

/**
 * What a workflow can't be written without.
 *
 * Six, and they're the six the builder's own blocks imply: you cannot order
 * steps without knowing which tools exist, cannot assign an owner without
 * knowing who can create an account, and cannot date anything without knowing
 * when somebody starts. Craig is told to record facts about all of these, so
 * this list and his instructions describe the same job from two ends.
 *
 * Matched by keyword against the facts he's recorded, which is crude and
 * deliberately biased: the patterns are narrow, so the failure mode is a
 * dimension that stays open slightly too long. That direction costs a question
 * somebody has already answered. The other direction would tick something
 * nobody ever said, which is the meter lying about the draft.
 */
interface Dimension {
  id: string;
  /** What it is, in the panel. */
  title: string;
  /** Sent to Craig when somebody clicks it. An invitation, not an answer. */
  ask: string;
  match: RegExp;
}

export const DIMENSIONS: Dimension[] = [
  {
    id: "what",
    title: "What the company does",
    ask: "Ask me what we actually do.",
    match:
      /\b(sells?|selling|sold|product|products|service|services|customers?|clients?|agency|studio|consultanc|saas|platform|b2b|b2c|industry|market)\b/i,
  },
  {
    id: "who",
    title: "Who's in the team",
    ask: "Ask me who's in the team and what they each do.",
    match:
      /\b(headcount|employees?|staff|teammates?|founders?|co-?founder|contractors?|freelancers?|part-?time|full-?time|remote|the team|\d+ (of us|people|staff))\b/i,
  },
  {
    id: "hire",
    title: "The role and start date",
    ask: "Ask me about the person who's starting.",
    match:
      /\b(new starter|new hire|starts?|starting|start date|joins?|joining|first day|day one|notice period|their role|the role|job title)\b/i,
  },
  {
    id: "tools",
    title: "The tools and accounts",
    ask: "Ask me which tools nobody could do the job without.",
    /* No bare "software" — the most common first fact anybody gives is what
       they sell, and half of them sell software. That would tick this on the
       opening sentence of every other conversation. */
    match:
      /\b(tools?|accounts?|workspace|slack|github|gitlab|linear|jira|notion|figma|hubspot|salesforce|xero|aws|gcp|azure|1password|crm|licen[cs]e|subscriptions?|laptop|inbox)\b/i,
  },
  {
    id: "access",
    title: "Who can create accounts",
    ask: "Ask me who can actually create accounts.",
    match:
      /\b(admin|administrator|owns|owner|provisions?|grants?|permissions?|credentials?|passwords?|api keys?|invites?)\b|\bonly \w+ (can|could|has|knows)\b|\b(creates?|creating|sets? up|setting up) (the |their |an? |new )?(accounts?|logins?|users?|seats?)\b/i,
  },
  {
    id: "before",
    title: "What happens before day one",
    ask: "Ask me what has to happen before their first day.",
    match:
      /\b(contracts?|payroll|offer letter|right to work|visas?|background checks?|police checks?|references?|equipment|induction|policies|policy|training|nda|handbook|paperwork|expenses|bank details)\b/i,
  },
];

/* The wording is what changes as the picture fills, not just the number — "4"
   is a fact about a list and says nothing about whether it's worth drafting
   from yet. */
const STATES = [
  {
    from: 5,
    label: "Enough to draft from",
    line: "A conversation this length never gets all of it, and he'll say what he left open.",
  },
  {
    from: 3,
    label: "Getting there",
    line: "He could draft something now. The rest of this is what stops it being generic.",
  },
  {
    from: 1,
    label: "Thin",
    line: "Not enough to build a workflow that fits this company yet.",
  },
  {
    from: 0,
    label: "Nothing yet",
    line: "Tell him about the company and this fills in as he goes.",
  },
];

export function DraftStrength({
  facts,
  gaps,
  busy,
  onAsk,
}: {
  facts: StrengthNote[];
  gaps: StrengthNote[];
  /** A turn is in flight, so asking for another one has to wait. */
  busy: boolean;
  /** Sends a dimension's `ask` as a message. */
  onAsk: (text: string) => void;
}) {
  /* Matched against every fact joined together rather than fact by fact: two
     halves of one answer often land as two records, and a dimension covered by
     the pair of them is still covered. */
  const said = facts.map((f) => f.text).join("\n");
  const covered = DIMENSIONS.filter((d) => d.match.test(said));
  const open = DIMENSIONS.filter((d) => !d.match.test(said));

  const state =
    STATES.find((s) => covered.length >= s.from) ?? STATES[STATES.length - 1];

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex flex-col gap-2">
        {/* One segment per dimension, filled left to right rather than in the
            checklist's order. The list underneath already says which ones are
            done; a bar with holes in it reads as a broken control rather than
            as a measurement. */}
        <div
          role="progressbar"
          aria-label="How much Craig has to draft from"
          aria-valuenow={covered.length}
          aria-valuemin={0}
          aria-valuemax={DIMENSIONS.length}
          aria-valuetext={`${covered.length} of ${DIMENSIONS.length} covered — ${state.label}`}
          className="flex gap-1"
        >
          {DIMENSIONS.map((d, i) => (
            <span
              key={d.id}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors duration-300",
                i < covered.length ? "bg-accent" : "bg-surface-sunken",
              )}
            />
          ))}
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-text">{state.label}</p>
          <p className="shrink-0 text-2xs tabular-nums text-text-subtle">
            {covered.length} of {DIMENSIONS.length}
          </p>
        </div>

        <p className="text-2xs leading-relaxed text-text-subtle">
          {state.line}
        </p>
      </div>

      {/* What's left comes first, and it's the only part that's a control. An
          item crossing from here to the list below is the one moment in this
          column worth noticing, so the two are kept apart rather than sorted
          into one list where the move would read as a reshuffle. */}
      {open.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <Eyebrow count={open.length}>Still to cover</Eyebrow>
          <ul className="flex flex-col gap-1">
            {open.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAsk(d.ask)}
                  title={d.ask}
                  className="group flex w-full items-start gap-2 rounded-md py-1 pl-0.5 pr-1 text-left transition-colors hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-45"
                >
                  <span
                    aria-hidden
                    className="mt-[0.2em] size-3.5 shrink-0 rounded-full border border-dashed border-border-strong transition-colors group-hover:border-accent"
                  />
                  <span className="min-w-0 flex-1 text-sm leading-snug text-text transition-colors group-hover:text-accent">
                    {d.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-2xs leading-relaxed text-text-subtle">
            Click one and he&apos;ll ask you about it.
          </p>
        </section>
      )}

      {covered.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <Eyebrow count={covered.length}>Covered</Eyebrow>
          <ul className="flex flex-col gap-1">
            {covered.map((d) => (
              <li
                key={d.id}
                className="flex items-start gap-2 py-1 pl-0.5 pr-1 text-sm leading-snug text-text-subtle"
              >
                <Check
                  aria-hidden
                  className="mt-[0.1em] size-3.5 shrink-0 text-accent"
                />
                {/* Ticked and muted, not struck through. A line through it
                    reads as cancelled — this one is done, which is the
                    opposite. */}
                <span className="min-w-0 flex-1">{d.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {gaps.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <Eyebrow count={gaps.length}>Left open</Eyebrow>
          <ul className="flex flex-col gap-2.5">
            {gaps.map((gap) => (
              <li
                key={gap.id}
                /* Plays once as it lands. Keyed by id, so it never replays for
                   something already on screen. */
                className="border-l-2 border-dotted border-accent pl-2.5 text-sm leading-relaxed text-text-muted motion-safe:animate-[step-phase_320ms_cubic-bezier(0.25,1,0.5,1)]"
              >
                {gap.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-auto pt-4 text-2xs leading-relaxed text-text-subtle">
        Craig marks what he doesn&apos;t know rather than guessing at it. Those
        stay open in the draft for you to fill in.
      </p>
    </div>
  );
}

function Eyebrow({ count, children }: { count?: number; children: ReactNode }) {
  return (
    <p className="flex items-baseline gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
      {children}
      {count !== undefined && (
        <span className="font-normal tabular-nums">{count}</span>
      )}
    </p>
  );
}
