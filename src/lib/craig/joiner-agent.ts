import "server-only";

import { Agent, tool } from "@openai/agents";
import { z } from "zod";
import { CHAT_MODEL, CHAT_TEMPERATURE } from "@/lib/craig/craig-prompt";
import { progressOf } from "@/lib/craig/joiners";
import { searchResourcesForJoiner } from "@/lib/craig/documents";
import { resourceSnippets } from "@/lib/craig/retrieval";
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
 * So the boundary is structural instead. Everything this agent knows arrives in
 * the system prompt below, assembled by `briefFor` from exactly one source: the
 * joiner's own record.
 *
 * The same argument rules out `webSearchTool`. It is the one tool in the other
 * agent that can return something untrue, and the blast radius of Craig
 * inventing a fact about somebody's new employer, to that person, in their first
 * week, is not worth what it buys.
 *
 * ## The one tool, and why it is admissible
 *
 * This agent shipped with **no tools at all**, and the note left here said any
 * addition needed the argument made in full first. This is it.
 *
 * `search_resources` is admissible because of what it *cannot be asked*. It
 * takes a search string and nothing else — no document id, no account, no
 * visibility — and resolves everything else from the `Joiner` on the run
 * context, which came from a signed cookie rather than from anything the model
 * or the client can influence. Underneath, `search_shared_documents` writes
 * `visibility = 'shared'` into the SQL function body rather than accepting it as
 * a parameter, so there is no argument anywhere in the chain that widens what
 * comes back.
 *
 * That is the rule for the next one too: **a tool here may take a question, and
 * must never take an identifier.** The moment a tool accepts "which document",
 * the question of whether that document was theirs moves out of the query and
 * into somebody's memory of writing the check.
 *
 * It is still the only tool. Nothing here can write, and the six editing tools
 * remain a different agent's business.
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

/**
 * What travels on the run context: the joiner, and only the joiner.
 *
 * Carried rather than closed over so the tool resolves its scope from the same
 * record the route authenticated, at the moment it runs. There is nothing else
 * on here on purpose — a context that also held, say, an account id would be a
 * second way to answer "whose documents", and two answers is how they drift.
 */
export interface JoinerContext {
  joiner: Joiner;
}

const searchResourcesParams = z.object({
  query: z
    .string()
    .describe(
      "What to look for, in the new starter's own words — e.g. 'parking', 'dress code', 'how much annual leave'.",
    ),
});

/**
 * Looking something up in what the company shared.
 *
 * Takes a question and nothing else. Whose documents these are comes off the
 * run context, and `shared` is written into the SQL rather than passed — see the
 * header for why that is the whole argument for this tool existing.
 *
 * Returns the document's name beside each snippet so Craig can say where an
 * answer came from. A new starter told "the policy says X" has to take it on
 * faith; told "the handbook says X" they can go and read it, and the list above
 * this conversation has it.
 */
const searchResources = tool<typeof searchResourcesParams, JoinerContext>({
  name: "search_resources",
  description:
    "Search the documents this company shared with new starters — handbooks, policies, anything they uploaded. Use it whenever you are asked something that a company document would answer rather than saying you don't know. Returns nothing if they haven't shared anything about it.",
  parameters: searchResourcesParams,
  execute: async ({ query }, context) => {
    const joiner = context?.context.joiner;
    /* No joiner means no scope, and a search with no scope is the one thing
       this tool must never run. Refusing beats defaulting. */
    if (!joiner) return "Nothing to search.";

    const hits = await searchResourcesForJoiner(joiner, query);
    if (hits.length === 0)
      return "Nothing in what they've shared mentions that.";

    /* Through `retrieval.ts`, which is where this tool's caveat came from —
       having had none at all until then. It returned bare fragments of an
       employer's handbook to a new starter with nothing attached, which is the
       highest-stakes result in the product: a snippet is two sentences lifted
       out of a policy with the sentence that qualifies it left behind, and the
       person receiving it is the one least able to notice. */
    return resourceSnippets(hits);
  },
});

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
  /**
   * What the company has written down, as headings only.
   *
   * The same index the admin's Craig gets, and safe to hand a new starter for
   * one reason held upstream: the notebook holds company facts and never a
   * person, so there is nothing in it to withhold. That rule is what buys one
   * document for two audiences with no visibility column — see `notebook.ts`.
   *
   * Headings rather than the text, for the reason the other agent has them
   * that way: accuracy falls as input grows, and a new starter's question is
   * usually about one of these.
   */
  notebookHeadings: string[];
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
export function briefFor(
  joiner: Joiner,
  /* Passed in rather than read here, so this stays a pure allowlist over one
     record. The moment it fetches, it stops being the thing you can read top
     to bottom to see exactly what reaches a new starter. */
  notebookHeadings: string[] = [],
): JoinerBrief {
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
    notebookHeadings,
    steps: joiner.steps.map((step) => ({
      title: step.title,
      owner:
        step.actor === "joiner"
          ? "you"
          : step.actor === "craig"
            ? "automatic"
            : "the company",
      state: step.completedAt ? "done" : step.id === nextId ? "next" : "later",
      /* Empty on either sealed step even when it is finished, because a sealed
         answer never travels on the record — and that is the right outcome
         rather than a gap to fix. Craig can say the step is done, which is what
         anybody asks; putting a date of birth, a home address or a bank account
         into a model prompt so he can read them back would send them to a third
         party on every turn, for a question nobody has. A tax file number would
         be that and an unauthorised disclosure of one besides. */
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
/**
 * One section of the company notebook, for a new starter.
 *
 * The same shape as the admin's, and safe for the same reason: the notebook
 * holds company facts and never a person, so there is nothing here to withhold
 * from them. That rule is enforced upstream — in what gets written, not in who
 * may read — which is what lets one document serve both audiences.
 *
 * **It takes a heading, never an identifier.** The rule this file is built on:
 * a tool here may take a question and must never take a way of naming somebody
 * else's row. A heading is a question about the company.
 */
const readNotebookParams = z.object({
  section: z
    .string()
    .describe("The heading to read, from the list you were given."),
});

const readNotebook = tool<typeof readNotebookParams, JoinerContext>({
  name: "read_notebook",
  description:
    "Read one section of the company's notebook by heading. Use it whenever they ask something the headings cover. If nothing comes back, say plainly that it isn't written down and that you'll flag it.",
  parameters: readNotebookParams,
  execute: async ({ section }, context) => {
    const joiner = context?.context.joiner;
    /* Same refusal as `search_resources`: no joiner means no scope, and a read
       with no scope is the one thing a tool on this agent must never do. */
    if (!joiner) return "Nothing to read.";

    const { notebookForJoiner } = await import("./notebook");
    const { sectionOf } = await import("./notebook-text");
    const content = await notebookForJoiner(joiner);
    const found = sectionOf(content, section);

    if (!found) {
      return `Nothing under "${section}". Tell them it isn't written down and that you'll pass it on — don't guess at it.`;
    }

    /* The caveat travels with the section rather than sitting in the system
       prompt, because it is the last thing read before the answer. Craig
       reported an annual-leave figure as a parental-leave policy when this
       lived in the prompt alone. For a new starter that is a claim about their
       own contract, and they have no way to tell it from the real thing. */
    return [
      `From ${joiner.company}'s notebook, under "${section}":`,
      "",
      found,
      "",
      `— That section is titled "${section}". If it does not answer what they asked, look at the heading list again and read a better one before concluding — the closest heading is often not the first one that came to mind. Only when nothing covers it, say it isn't written down and that you'll pass it on. Never move a figure from one kind of leave, notice or payment to another.`,
    ].join("\n");
  },
});

export function joinerSystemPrompt(brief: JoinerBrief): string {
  /* What the company has written down, as headings. The same index the admin's
     Craig gets — and the instruction is the same too: read the section rather
     than answer from memory, and when nothing covers it, say so plainly rather
     than inventing a policy. A new starter cannot tell a guess from a fact, and
     the guess is about their own employment. */
  const notebook =
    brief.notebookHeadings.length === 0
      ? ""
      : [
          `\n## What ${brief.company} has written down`,
          "",
          "Headings only — call `read_notebook` with one to read it.",
          "",
          brief.notebookHeadings.map((h) => `- ${h}`).join("\n"),
          "",
          "If a heading covers what they asked, read it and answer from it, and say which heading.",
          "",
          "**A section answers only what it literally says.** \"How leave works\" giving a number of days for annual leave tells you nothing about parental leave, notice periods or sick pay. Never carry a figure from one to another — for a new starter that is a claim about their own contract, and they cannot tell your guess from their employer's policy.",
          "",
          "If nothing covers it, say it isn't written down and that you'll pass it on. Never invent a policy and never soften it into a maybe.",
        ].join("\n");

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

  /* Today, and the start date as a person would say it.
  
     A new starter's questions are mostly about time — when do I start, how
     long have I got to do this, when is my first payday — and he had no way
     to answer any of them: no today, and a start date handed over as a raw
     `2026-09-01`. Reading an ISO string aloud to somebody in their first week
     is the tell that you are talking to a form. */
  const today = new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Sydney",
  });
  const startsOn = brief.startsOn
    ? new Date(`${brief.startsOn}T00:00:00+10:00`).toLocaleDateString("en-AU", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Australia/Sydney",
      })
    : null;

  return `You are Craig. You help ${brief.firstName} start at ${brief.company}.

They are joining as ${brief.role}${startsOn ? `, starting ${startsOn}` : ", and have already started"}. Their onboarding is called "${brief.workflowName}". ${brief.done} of ${brief.total} steps are done.

Today is ${today}. Work out anything they ask about timing from that, and give them the day rather than a date they have to decode.

Their steps:
${steps}

## Who you are talking to

${brief.firstName} is the new starter, not the employer. They are one week into a new job and every question they ask you is one they would otherwise have to ask a stranger. Be warm, brief and concrete. Answer in two or three sentences unless they ask for more.

## What you know and what you do not

Everything above is everything you know by heart.
${notebook}

You also have **search_resources**, which searches the documents ${brief.company} has shared with new starters. Use it before saying you don't know anything a company document might answer — a handbook, a policy, dress code, leave, expenses, parking, what to bring on day one. Search first, answer second.

When it comes back with something, say which document it came from, so they can go and read it themselves — the list of those documents is on this same screen. Answer from what it returned and not from what you expect a policy to say. If it returns nothing, say that ${brief.company} hasn't shared anything about it, rather than answering from general knowledge.

Outside your steps and those documents you know nothing: not who their manager is, not the wifi password, not where the office is. Say so plainly in one sentence and tell them to ask whoever invited them. Do not guess, do not infer it from the company name, and never soften a "don't know" into a maybe.

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
export function joinerCraigFor(brief: JoinerBrief): Agent<JoinerContext> {
  return new Agent<JoinerContext>({
    name: "Craig",
    instructions: joinerSystemPrompt(brief),
    model: CHAT_MODEL,
    modelSettings: { temperature: CHAT_TEMPERATURE, maxTokens: 400 },
    /* One tool, and the argument for it is in the header. Anything added beside
       it needs the same argument: it may take a question, never an
       identifier. */
    tools: [searchResources, readNotebook],
  });
}
