import "server-only";

import { Agent } from "@openai/agents";
import { CHAT_MODEL, CHAT_TEMPERATURE } from "@/lib/craig/craig-prompt";
import { progressOf } from "@/lib/craig/joiners";
import type { Joiner } from "@/lib/craig/contract";

/**
 * Craig, for the person being onboarded rather than the person doing it.
 *
 * A new starter gets a magic link, lands on `/me`, and sees a checklist. That is
 * the whole product from their chair — no way to ask "who is my manager?", "what
 * do I need before Monday?", "what is this step actually asking me for?", which
 * are the questions somebody in their first week actually has and currently has
 * to email a stranger to get answered.
 *
 * ## Why this is a second agent and not a flag on the first
 *
 * `craig-agent.ts` builds one `Agent` carrying ten tools and picks a trailing
 * instruction off flags on the notebook — `home`, `editing`, `simpleDraft`. The
 * obvious move is an eleventh flag, `joiner`, and it is the wrong one.
 *
 * The tools are the boundary. `note_gap`, `record_fact`, `draft_workflow`,
 * `add_step`, `set_step_config`, `remove_step` and `rename_workflow` all write
 * to the *employer's* workflow, and `recall` reads back the discovery
 * conversation in which somebody described their own company's problems
 * candidly. A flag that gates them is one refactor away from not gating them,
 * and the failure is silent: nothing breaks, a new hire is just quietly handed
 * the admin's notes about how badly organised the place is.
 *
 * So the boundary is structural instead. This agent has **no tools**, which is
 * not a stub — it is the design, and it is why there is nothing here to audit.
 * There is no call it can make, so there is no call that can reach the wrong
 * row. Everything it knows arrives in the system prompt below, assembled by
 * `briefFor` from exactly one source: the joiner's own record.
 *
 * The same argument rules out `webSearchTool`. It is the one tool in the other
 * agent that can return something untrue, and the blast radius of Craig
 * inventing a fact about somebody's new employer, to that person, in their first
 * week, is not worth what it buys.
 *
 * ## What it may know
 *
 * A joiner thread hangs off the employer's `account_id`, because `threads`
 * requires one and a joiner is deliberately not an auth user. That makes the
 * account the *ambient* scope and therefore the thing to be careful about:
 * everything in it is the company's — other joiners' progress, seat counts,
 * billing, Craig's notes. None of it is this person's to see, and none of it is
 * reachable from here, because `briefFor` takes a `Joiner` and never a client.
 *
 * When documents arrive this is where "read the documents" will attach, and it
 * will need its first tool. The rule it must keep is the one above: the tool
 * takes the joiner's id and resolves what *they* may read, rather than taking a
 * document id and trusting the caller.
 */

/** Everything this Craig is allowed to know, and the only thing he is told. */
export interface JoinerBrief {
  firstName: string;
  fullName: string;
  company: string;
  role: string;
  /** Their own address — the personal one they were hired through. */
  email: string;
  /** `YYYY-MM-DD`, or null once it is in the past. */
  startsOn: string | null;
  workflowName: string;
  steps: BriefStep[];
  done: number;
  total: number;
  /** Their half finished, which is not the same as everything being finished. */
  finished: boolean;
}

interface BriefStep {
  title: string;
  /** Whose move this is, in words rather than the stored enum. */
  owner: "you" | "the company" | "automatic";
  state: "done" | "next" | "later";
  /** What they answered, when they have answered. */
  answer?: string;
}

/**
 * A joiner's record, reduced to what may be said out loud.
 *
 * An allowlist rather than a redaction, and that is deliberate: a function that
 * deletes the sensitive fields is one new column away from leaking, while one
 * that names the safe fields simply never learns about the new column. The
 * `Joiner` record it reads from is already scoped to one person, so there is no
 * second row to filter — but the day it grows an `internalNotes` or a
 * `flightRisk`, this shape is what stops it travelling.
 *
 * `run.message` is the pointed omission. It is written for whoever can fix a
 * broken integration and names environment variables, consent screens and
 * Google console pages — the same reason `/me` never prints it.
 */
export function briefFor(joiner: Joiner): JoinerBrief {
  const progress = progressOf(joiner);
  const nextId = progress.next?.id ?? null;

  return {
    firstName: joiner.name.split(" ")[0] || joiner.name,
    fullName: joiner.name,
    company: joiner.company,
    role: joiner.role,
    email: joiner.email,
    startsOn: upcoming(joiner.startDate) ? joiner.startDate : null,
    workflowName: joiner.workflowName,
    steps: joiner.steps.map((step) => ({
      title: step.title,
      owner:
        step.actor === "joiner"
          ? "you"
          : step.actor === "craig"
            ? "automatic"
            : "the company",
      state: step.completedAt ? "done" : step.id === nextId ? "next" : "later",
      answer: step.value || undefined,
    })),
    done: progress.done,
    total: progress.total,
    finished: progress.finished,
  };
}

/**
 * The brief as the sentences he is given.
 *
 * Built per run rather than cached, because it is per person and there is
 * exactly one person per request. Rendered as prose rather than JSON for the
 * same reason the rest of the prompts are: a model reading "Ana starts on
 * Monday 24 August" writes a better sentence back than one reading
 * `{"startsOn":"2026-08-24"}`, and there is no parsing to get wrong.
 */
export function joinerSystemPrompt(brief: JoinerBrief): string {
  const steps = brief.steps
    .map((step) => {
      const who =
        step.owner === "you"
          ? "yours"
          : step.owner === "automatic"
            ? "handled automatically"
            : `${brief.company}'s`;
      const state =
        step.state === "done"
          ? step.answer
            ? `done — you gave "${step.answer}"`
            : "done"
          : step.state === "next"
            ? "this is the one to do next"
            : "still to come";
      return `- ${step.title} (${who}; ${state})`;
    })
    .join("\n");

  return `You are Craig. You help ${brief.firstName} start at ${brief.company}.

They are joining as ${brief.role}${brief.startsOn ? `, starting ${brief.startsOn}` : ", and have already started"}. Their onboarding is called "${brief.workflowName}". ${brief.done} of ${brief.total} steps are done.

Their steps:
${steps}

## Who you are talking to

${brief.firstName} is the new starter, not the employer. They are one week into a new job and every question they ask you is one they would otherwise have to ask a stranger. Be warm, brief and concrete. Answer in two or three sentences unless they ask for more.

## What you know and what you do not

Everything above is everything you have. You do not know who their manager is, what the wifi password is, where the office is, what the holiday policy says, or anything else about ${brief.company} that is not written above — because nobody has told you. When they ask something you cannot answer, say so plainly in one sentence and tell them to ask whoever invited them. Do not guess, do not infer it from the company name, and never soften a "don't know" into a maybe.

You especially do not know anything about **other people** at ${brief.company} — who else is joining, how they are getting on, what the company pays for, or how their onboarding is set up behind the scenes. If asked, say that is not something you can see.

## What you cannot do

You cannot change their steps, mark anything done, chase anybody, send email, or edit the onboarding. If they want something changed, the answer is to ask whoever invited them — say that rather than implying you will handle it. Never say you have done something you have not done.

## Their email

Their address here is ${brief.email}. If a step mentions a company address, that is a different address and it may not exist yet — do not tell them to check an inbox they cannot open.`;
}

/**
 * Whether a start date is still ahead.
 *
 * Plain string comparison, which works because both sides are `YYYY-MM-DD` and
 * that format sorts as text. The same trick `/me` uses, and for the same reason:
 * it sidesteps the timezone trap rather than handling it, and "you start on
 * Monday" said to somebody who started a fortnight ago is the small wrongness
 * that tells a person nobody is really watching.
 */
function upcoming(iso: string): boolean {
  const now = new Date();
  const today = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-${`${now.getDate()}`.padStart(2, "0")}`;
  return iso >= today;
}

/**
 * The agent itself.
 *
 * `instructions` is a plain string set per request rather than the other
 * agent's `instructionsFor` callback, because there is no run context to read:
 * the brief is known before the run starts and nothing during the run can
 * change it. `joinerCraigFor` builds one per request for that reason — an
 * `Agent` is cheap, and a module-level singleton would either need the brief
 * threaded through a context it has no other use for, or would name one person
 * for everybody.
 *
 * `maxTokens` is lower than the admin's 900. Every honest answer here is two or
 * three sentences, and the failure mode of a chatty one is a new starter reading
 * six paragraphs of hedging about a question Craig should have answered "ask
 * Priya" to.
 */
export function joinerCraigFor(brief: JoinerBrief): Agent {
  return new Agent({
    name: "Craig",
    instructions: joinerSystemPrompt(brief),
    model: CHAT_MODEL,
    modelSettings: { temperature: CHAT_TEMPERATURE, maxTokens: 400 },
    /* Not an oversight, and not a stub. See the header: the absence of tools is
       the access boundary, so anything added here needs the argument made in
       full before it goes in. */
    tools: [],
  });
}
