import { after, NextResponse } from "next/server";
import { currentJoiner } from "@/lib/craig/current-joiner";
import { fireNextAutomatedStep } from "@/lib/craig/automation";
import { completeStep, getJoiner } from "@/lib/craig/joiners";
/* The date rule lives beside the personal details now, because two fields want
   it — the standalone date-of-birth block and the one inside that form — and
   two copies of "what counts as a birthday" is two answers waiting to
   disagree. */
import {
  birthDateProblem,
  parsePersonalDetails,
  sealPersonalDetails,
} from "@/lib/craig/personal-details";
import {
  parsePayrollDetails,
  sealPayrollDetails,
} from "@/lib/craig/payroll-details";
import {
  completeSealedStep,
  type SealResult,
} from "@/lib/craig/sealed-answer";
import { rateLimit } from "@/lib/craig/rate-limit";

/**
 * A new starter answering one of their own steps.
 *
 * The whole security of this route is one decision: **who** is never taken from
 * the request. The body says which step and what the answer is, and nothing
 * else — the person is resolved from the signed cookie. A `joinerId` in the
 * body would be an id anybody could type, and typing somebody else's would let
 * a stranger fill in their onboarding for them, or overwrite a date of birth
 * that payroll is about to read. There is no version of that field that is
 * safe, so it doesn't exist.
 *
 * What the caller does control is checked twice over, and the checks are here
 * rather than only in the store because the store's refusal is a backstop, not
 * a design:
 *
 * 1. **The step has to be one of theirs.** It is looked up in *their* snapshot,
 *    so a step id from another person's workflow finds nothing. `completeStep`
 *    refuses anything that isn't an `actor: "joiner"` step as well, which means
 *    an admin's step — the name tag somebody at the company ticks off — cannot
 *    be closed from this side even if a request names it.
 * 2. **The value has to fit the field.** A date of birth is checked as a date,
 *    because "next Thursday" typed into a field payroll reads is a mistake
 *    worth catching on the way in rather than in three weeks.
 * 3. **A structured answer is rebuilt rather than accepted.** The personal
 *    details and payroll details blocks each post a form's worth of fields at
 *    once, and not one of them is taken as given: the parser reads only the
 *    keys its shape names, checks each against its kind, and drops everything
 *    else. The result is then sealed before it goes anywhere near a row — see
 *    `sealed-answer.ts` for why that is not optional, and `payroll-details.ts`
 *    for the one field on either form that is regulated in its own right.
 *
 * Limited, and deliberately not against the model budget — see `spend` below.
 *
 * Since Craig got steps of his own, this is also where the workflow *moves*.
 * Answering a step can unblock an automated one, and if it does, that step is
 * claimed here and run after the response — see `fireNextAutomatedStep`. The
 * ordering matters and is the whole reason it isn't simply awaited: this person
 * is on their phone finishing a form, and making them hold the connection open
 * while somebody else's API creates a mailbox would turn a hundred-millisecond
 * save into however long Google feels like taking.
 */

/** Longer than any name, and far longer than a date. */
const MAX_VALUE = 80;

/** Block ids are generated, so this is a sanity bound rather than a rule. */
const MAX_ID = 64;

/**
 * Nothing here reaches OpenAI, so nothing here may drain the day's allowance
 * for the things that do. A new starter working through four steps must not be
 * able to switch the chat off for everybody, and the limiter still does its
 * real job: the per-minute and per-hour buckets are what stop a loop.
 */
const LIMIT_OPTIONS = { spend: false } as const;

const noStore = { "Cache-Control": "no-store" };

/**
 * A submitted value as one harmless line.
 *
 * Control characters first, whitespace second — the same order and the same
 * reasoning as the invite route: a newline is caught by either, but the
 * unprintable characters around it survive a naive trim, and this value is
 * shown back to the person and read by whoever runs the workflow. `\p{Cc}` is
 * that whole category by name, which is easier to be sure of than a hand-typed
 * range of things that are invisible in a diff.
 */
function oneLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/* Every message here can end up in front of the new starter, so every message
   here is written for them. Nothing about cookies, tokens or the store. */
const refuse = (error: string, status: number) =>
  NextResponse.json({ ok: false, error }, { status, headers: noStore });

export async function POST(request: Request) {
  const joiner = await currentJoiner();
  if (!joiner) {
    return refuse(
      "This page has stopped recognising you. Open the link from your email again, or ask whoever invited you for a new one.",
      401,
    );
  }

  /* Keyed to the person, not the address they're on. Two new starters behind
     one office router are two people working through their own onboarding, and
     counting them together would have the second one told to slow down for
     something the first did. */
  const limit = await rateLimit(`showcase-step:${joiner.id}`, LIMIT_OPTIONS);
  if (!limit.ok) {
    /* The limiter's own wording, passed through. It is written for whoever
       reads it rather than for the chat it started on, so there is nothing here
       to translate — and a sentence written locally would be this route's own
       opinion of a limit it doesn't own. */
    return NextResponse.json(
      { ok: false, error: limit.message },
      {
        status: 429,
        headers: limit.retryAfter
          ? { ...noStore, "Retry-After": String(limit.retryAfter) }
          : noStore,
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse("That didn't arrive in one piece. Try it again.", 400);
  }

  const input = (body ?? {}) as Record<string, unknown>;

  const stepId = oneLine(input.stepId, MAX_ID);
  if (!stepId) {
    return refuse("Reload the page and give that another go.", 400);
  }

  /* Their own snapshot, which is what makes another person's step id useless
     here: it simply isn't in this list. */
  const step = joiner.steps.find((s) => s.id === stepId);
  if (!step || step.actor !== "joiner" || !step.field) {
    return refuse("That one isn't yours to fill in.", 400);
  }

  /* The two fields whose answer is a document rather than a line, and the two
     that never touch the plaintext column. They leave through their own store
     function, so there is no path where a `PersonalDetails` or a
     `PayrollDetails` reaches `completeStep` and gets stringified into `value`.

     **Every "was this asked for" flag is read off *their snapshot*, never off
     the request.** `askEmergencyContact`, `askSuperFund` and `askTaxFileNumber`
     each decide whether a group of fields is stored *at all* rather than merely
     whether it is required, so a client that could set one would be a client
     that could opt a company into holding a third party's phone number, or a
     tax file number, that nobody decided to collect. The last of those is not
     only rude — collecting a TFN without an authorised purpose is an offence
     under the Taxation Administration Act, and "the browser said to" is not a
     purpose. See `payroll-details.ts`. */
  if (step.field === "personal-details" || step.field === "payroll-details") {
    let sealed: SealResult;

    if (step.field === "personal-details") {
      const parsed = parsePersonalDetails(input.details, {
        emergencyContact: Boolean(step.askEmergencyContact),
      });
      if (!parsed.ok) return refuse(parsed.problem, 400);
      sealed = sealPersonalDetails(parsed.details, joiner.id, stepId);
    } else {
      const parsed = parsePayrollDetails(input.details, {
        superFund: Boolean(step.askSuperFund),
        taxFileNumber: Boolean(step.askTaxFileNumber),
      });
      if (!parsed.ok) return refuse(parsed.problem, 400);
      sealed = sealPayrollDetails(parsed.details, joiner.id, stepId);
    }

    if (!sealed.ok) {
      /* The deployment cannot encrypt this, so it does not take it. The
         message the key check produces names an environment variable and is
         written for whoever can set it, which is not the person on the other
         end of this request — so they get a sentence of their own and the real
         one goes to the log, where somebody who can act will find it.

         The log line carries the key check's message and the field, and
         nothing the person typed. That is not squeamishness about a failed
         write: this branch is reached with a fully parsed bank account or tax
         file number in scope, and a `console.error` that included the payload
         "for debugging" is exactly how one ends up in a log aggregator. */
      console.error(`[${step.field}] ${sealed.message}`);
      return refuse(
        "I can't store this safely just yet, so I haven't stored it at all. Nothing you typed has been kept — tell whoever invited you, and try again once they've sorted it.",
        503,
      );
    }

    const written = await completeSealedStep(
      joiner.id,
      stepId,
      step.field,
      sealed.sealed,
    );
    if (!written) {
      return refuse(
        "That didn't save. Reload the page and try once more.",
        409,
      );
    }

    /* Re-read rather than patched, for the same reason the plain path returns
       the store's copy: what happens next is decided by the record as it is
       now, and a copy read at the top of this handler predates the write. */
    const settled = await getJoiner(joiner.id);
    if (settled) await fireNextAutomatedStep(settled, stepId, after);

    /* The record back, minus the answer — `toStep` never carries the sealed
       envelope, so this is a joiner whose sealed step is finished and holds
       nothing. That is the right shape to hand a browser: the screen re-reads
       itself from the server anyway, and the one thing it does not need is a
       form's worth of PII travelling back to be thrown away. */
    return NextResponse.json(
      { ok: true, joiner: settled ?? joiner },
      { headers: noStore },
    );
  }

  const value = oneLine(input.value, MAX_VALUE);
  if (!value) return refuse("There's nothing in that one yet.", 400);

  if (step.field === "date-of-birth") {
    const problem = birthDateProblem(value);
    if (problem) return refuse(problem, 400);
  }

  const updated = await completeStep(joiner.id, stepId, value);
  if (!updated) {
    /* The store had the last word and said no — which at this point means the
       seat went away between reading it and writing to it. Rare, and worth
       answering honestly rather than reporting a save that didn't happen. */
    return refuse("That didn't save. Reload the page and try once more.", 409);
  }

  /* The workflow moving, on the record as it is *after* the answer landed —
     `updated` rather than `joiner`, because whether the next step is due is
     decided by the completion that just happened, and the copy read at the top
     of this handler predates it by a few lines and one write.

     The claim is taken here, synchronously, which is what makes a double-submit
     harmless: a second request arriving while this one is still in the handler
     finds the step already claimed and does nothing. Only the slow half is
     deferred. */
  await fireNextAutomatedStep(updated, stepId, after);

  /* The whole record back, not just an acknowledgement. It is what the screen
     is a view of, so a caller that wants to show the answer it just saved can
     do it from the response instead of guessing at what the server made of it.
     Safe to return in full: it is this person's own onboarding, and it is the
     same data their screen was rendered from a moment ago. */
  return NextResponse.json({ ok: true, joiner: updated }, { headers: noStore });
}
