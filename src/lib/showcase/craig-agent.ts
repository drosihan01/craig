import "server-only";

import {
  Agent,
  RunContext,
  setTracingDisabled,
  tool,
  webSearchTool,
} from "@openai/agents";
import { z } from "zod";
import {
  PRESET_IDS,
  byHand,
  openSetup,
  parseDraft,
  type Draft,
} from "@/lib/showcase/draft";
import {
  CHAT_MODEL,
  CHAT_TEMPERATURE,
  craigSystemPrompt,
} from "@/lib/showcase/craig-prompt";

/**
 * Craig, with hands.
 *
 * The phase line has been a lie in every demo so far — a list of labels on a
 * timer, chosen to take about as long as the work would have taken. It read
 * well because the labels were honest about what the work *would* be. Nothing
 * was happening.
 *
 * These tools are that same list, made real. "Writing that down" appears
 * because `note_gap` is executing, and it stops appearing when the call
 * returns. The screen can't tell the difference — that's the point — but the
 * product can now only claim things it did.
 *
 * Four of them are ours and run in this process. The fifth is `webSearchTool`,
 * which runs inside OpenAI's response and is the only one that can come back
 * with something untrue — see the note above it, and the section of the prompt
 * it exists to be governed by.
 *
 * `note_gap` is the one that matters. Finding what nobody wrote down is the
 * argument this whole codebase makes for Craig existing, and it has always
 * been prose he emits and the reader has to notice. A tool call makes it an
 * artefact: the UI can collect them, and a conversation that produced no gaps
 * is now visibly a conversation where he didn't earn his keep.
 *
 * State lives in a `Notebook` on the run context, one per request, and dies
 * with the response — the server keeps nothing between turns. The durable copy
 * is the client's showcase store, which sends it back as `known` on every turn
 * and gets it seeded into a fresh notebook here. That keeps state where the
 * rest of this repo keeps it, and it's what makes `recall` mean anything: for
 * one version it could only see the turn it was called in, so it answered
 * "nothing written down yet" every time and cost a turn to learn that.
 */

/**
 * Off, deliberately.
 *
 * Tracing is on by default and POSTs the full conversation — prompt, tool
 * arguments, output — to OpenAI's tracing endpoint on a background task. That's
 * a second network call per turn we don't need and somebody's business handed
 * to a dashboard nobody in this project reads.
 */
setTracingDisabled(true);

/* --- What he's gathered --------------------------------------------------- */

export interface Gap {
  what: string;
  whyItMatters: string;
}

/** One turn's memory, seeded with what the client says he already knows. */
export interface Notebook {
  gaps: Gap[];
  facts: { key: string; value: string }[];
  workflow: Draft | null;
  /** Whoever is signed in. Carried on the context because the prompt is built
      per run, and the alternative was a module-level constant that named one
      person for everybody. */
  firstName: string;
}

/**
 * The route is stateless and this dies with the response, so anything Craig is
 * meant to remember has to arrive with the request.
 *
 * Without the seed, `recall` could only ever see the turn it was called in — it
 * returned "nothing written down yet" every time, which is worse than not
 * having the tool, because he'd spend a turn calling it and learn nothing. The
 * facts are in the transcript either way; what the seed restores is his ability
 * to *check*, and to stop re-asking what he was told two turns ago.
 *
 * Seeded values arrive as plain strings because that's what the client has kept
 * — the key/value split is only used for display back to the model, so the
 * label is dropped rather than faked.
 */
export function seedNotebook(
  firstName: string,
  known?: { gaps: string[]; facts: string[] },
): Notebook {
  return {
    gaps: (known?.gaps ?? []).map((what) => ({ what, whyItMatters: "" })),
    facts: (known?.facts ?? []).map((value) => ({ key: "", value })),
    workflow: null,
    firstName,
  };
}

/* --- The tools ------------------------------------------------------------ */

/**
 * `context` is optional on the SDK's execute signature because a tool can be
 * invoked outside a run. Ours never are, so this narrows once instead of at
 * four call sites — and throwing beats a silent no-op that looks like a tool
 * that ran and recorded nothing.
 *
 * `tool()` will not infer its `Context` generic from `Agent<Notebook>`; the two
 * are related only at `run()`, so a tool written without the explicit parameter
 * below types its context as `unknown` and this reads as a mismatch. Every tool
 * therefore names both generics, which is also why the schemas are hoisted —
 * the first generic is the schema's own type.
 */
function notebookOf(context?: RunContext<Notebook>): Notebook {
  if (!context?.context) throw new Error("No notebook on this run.");
  return context.context;
}

const noteGapParams = z.object({
  what: z
    .string()
    .describe("The gap itself, in one plain sentence. No preamble."),
  why_it_matters: z
    .string()
    .describe(
      "What actually goes wrong because of it, concretely. Not 'this is a risk'.",
    ),
});

const recordFactParams = z.object({
  /* The label is shown to the person as-is, so "start date" reads and
     "start_date_of_new_hire" does not. */
  key: z
    .string()
    .describe(
      "Short label in plain words, like 'headcount' or 'who owns AWS'. Never snake_case.",
    ),
  value: z.string().describe("The fact itself."),
});

const recallParams = z.object({});

/**
 * A step is a preset from the library, and nothing else can be said.
 *
 * `PRESET_IDS` is built from `BLOCK_LIBRARY` at module load, so the enum in the
 * schema is the same list the picker offers — an id that isn't in the library
 * isn't rejected after the fact, it's unsayable. The block's `kind` comes with
 * the preset, which is why the model is no longer asked for one: it was the
 * best available guess when a step was free text, and a preset knows.
 *
 * `config` is a list of pairs rather than an object keyed by field id, because
 * strict function schemas can't carry an open-ended map — `additionalProperties`
 * has to be `false`, and a `z.record` is exactly the thing that isn't. Which
 * fields exist is in the prompt, and `parseDraft` drops any that don't.
 */
const draftWorkflowParams = z.object({
  name: z
    .string()
    .describe(
      "What this workflow is for, in a few words — usually the role, like 'Engineer onboarding'.",
    ),
  steps: z
    .array(
      z.object({
        preset: z
          .enum(PRESET_IDS)
          .describe("The id of a block from the library. Exactly as listed."),
        owner: z
          .string()
          .describe("Who does it — a named person, or the new starter."),
        config: z
          .array(
            z.object({
              field: z
                .string()
                .describe("A setup field's id, from that preset's needs line."),
              value: z
                .string()
                .describe(
                  "What she actually said. Several values in one entry, separated by commas.",
                ),
            }),
          )
          .optional()
          .describe(
            "Only fields she gave you an answer to, in a sentence you could point at. Leave out anything else — especially a filename, a URL, an account name, a permission level or a list of channels. An empty field is a gap she can see and close; an invented one is a step nobody ever checks.",
          ),
      }),
    )
    .describe(
      "In the order they should run. The trigger is added for you, so don't include it.",
    ),
});

const factLine = (f: { key: string; value: string }) =>
  f.key ? `- ${f.key}: ${f.value}` : `- ${f.value}`;

const gapLine = (g: Gap) =>
  g.whyItMatters ? `- ${g.what} (${g.whyItMatters})` : `- ${g.what}`;

const noteGap = tool<typeof noteGapParams, Notebook>({
  name: "note_gap",
  description:
    "Record something that is not written down anywhere, that only one person knows, or that nobody owns. Call this as soon as it comes up, before replying. Examples that must be recorded: 'we have nothing written down', 'only I can create accounts', 'nobody has done this before', 'it's all in his head'. Err towards calling it.",
  parameters: noteGapParams,
  execute: ({ what, why_it_matters }, context) => {
    const notebook = notebookOf(context);
    notebook.gaps.push({ what, whyItMatters: why_it_matters });
    return `Noted. That's ${notebook.gaps.length} gap${notebook.gaps.length === 1 ? "" : "s"} so far.`;
  },
});

const recordFact = tool<typeof recordFactParams, Notebook>({
  name: "record_fact",
  description:
    "Record one concrete fact about the company: its name, what it sells, headcount, a person's role, a start date, a tool they use, who owns an account. One fact per call — if the user's message contains four facts, call this four times, before replying. Call it as you learn each fact rather than summarising at the end.",
  parameters: recordFactParams,
  execute: ({ key, value }, context) => {
    const notebook = notebookOf(context);
    notebook.facts.push({ key, value });
    return `Got it: ${key} — ${value}`;
  },
});

const recall = tool<typeof recallParams, Notebook>({
  name: "recall",
  description:
    "Read back everything you've gathered so far in this conversation. Use it before drafting the workflow, or when you want to check whether something has already been covered.",
  parameters: recallParams,
  execute: (_args, context) => {
    const { facts, gaps } = notebookOf(context);
    if (facts.length === 0 && gaps.length === 0)
      return "Nothing written down yet.";

    /* Seeded entries come back without their label or their why — the client
       kept the sentence, not the pair — so both are rendered conditionally
       rather than printing "- : three people" or a trailing "()". */
    return [
      facts.length > 0 ? `Facts:\n${facts.map(factLine).join("\n")}` : "",
      gaps.length > 0 ? `Gaps:\n${gaps.map(gapLine).join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  },
});

const draftWorkflow = tool<typeof draftWorkflowParams, Notebook>({
  name: "draft_workflow",
  description:
    "Produce the onboarding draft once you know the tools, who can create them, and roughly what week one involves. Every step is a preset id from the block library in your instructions. Call this whenever the user signals they have finished telling you things — 'that's everything', 'that's all I can think of', 'what else do you need'. Do not call it in the first two exchanges: a workflow built on two facts is a generic one and they will be able to tell.",
  parameters: draftWorkflowParams,
  execute: (args, context) => {
    const notebook = notebookOf(context);
    const draft = parseDraft(args);
    if (!draft) return "None of those steps matched a block. Try again.";

    notebook.workflow = draft;

    /* Read back off the blocks he just made rather than off what he meant to
       do, so the reply names the holes that are actually there. Without it he
       reliably announces a step as done and leaves its required fields empty. */
    const open = openSetup(draft.blocks);
    const manual = byHand(draft.blocks);

    return [
      `Drafted ${draft.blocks.length - 1} steps as ${draft.name}.`,
      open.length > 0
        ? `Still open, and you must name these: ${open.join("; ")}.`
        : "Nothing left open.",
      manual.length > 0
        ? `Done by a person, not by you — say so: ${manual.join(", ")}.`
        : "",
      "Now tell them what you've built. Lead line, then bullets. No headings and no bold.",
    ]
      .filter(Boolean)
      .join(" ");
  },
});

/**
 * The one tool that isn't ours, and the only one that can be wrong.
 *
 * Hosted: the search happens inside OpenAI's response rather than in this
 * process, so there is no `execute` to write and nothing it finds ever reaches
 * the notebook by itself. That asymmetry is the whole reason the prompt has a
 * section about it. Every other tool here records something *she* said; this one
 * returns something a stranger wrote, and the two must not end up looking the
 * same in her notes. What comes back is a claim to put to her, and it becomes a
 * fact only when she agrees and he calls `record_fact` on her answer.
 *
 * What it is actually for is the thing a founder of four genuinely cannot be
 * expected to know: that hiring in Australia means a VEVO check rather than a UK
 * right-to-work one. That is a fact about the world rather than about her
 * company, it maps onto a real option id in `verify-identity`, and getting it
 * right without asking her to research her own employment law is the product
 * working.
 *
 * `searchContextSize: "low"` because these are lookups with short answers — the
 * name of a check, what a company sells — and the setting governs how much
 * retrieved page text is billed into the model's context. `medium`, the default,
 * would buy depth this conversation never reads. No `userLocation`: we don't
 * know where she is, and the jurisdiction that matters is the one she employs
 * people in, which is a thing she tells him rather than a thing to infer from an
 * IP address.
 */
const lookItUp = webSearchTool({ searchContextSize: "low" });

/** What the tool is called when it's sent, and what a call comes back named. */
const WEB_SEARCH_TOOL = "web_search";
const WEB_SEARCH_ITEM = "web_search_call";

/* --- Mapping a tool call onto something a person can read ------------------ */

export interface ToolActivity {
  /** Shown on the phase line while it runs. Present tense, honest. */
  phase: string;
  /** The tool event's label. */
  label: string;
  /** Surfaced to the screen as its own event, when the tool produces one. */
  note?: { kind: "gap" | "fact"; text: string };
  /** The draft, when this was `draft_workflow` and it parsed. */
  workflow?: Draft;
}

/**
 * Lives here rather than in the route because it's knowledge about these four
 * tools' arguments, and a route that reaches into a tool's argument shape is
 * one rename away from silently emitting blank notes.
 *
 * Arguments arrive as an unparsed JSON string, and the model is capable of
 * producing one that doesn't match the schema — the SDK rejects those before
 * `execute`, but this runs off the call event, which fires first. So every
 * field is checked before it's read.
 */
export function describeToolCall(
  name: string,
  rawArguments: string,
): ToolActivity | null {
  let args: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(rawArguments || "{}");
    if (parsed && typeof parsed === "object")
      args = parsed as Record<string, unknown>;
  } catch {
    /* Fall through with no args — the label is still worth showing. */
  }

  const text = (key: string) =>
    typeof args[key] === "string" ? (args[key] as string).trim() : "";

  switch (name) {
    case "note_gap": {
      const what = text("what");
      const why = text("why_it_matters");
      return {
        phase: "Writing that down",
        label: "Noting a gap",
        note: what
          ? { kind: "gap", text: why ? `${what} — ${why}` : what }
          : undefined,
      };
    }
    case "record_fact": {
      const key = text("key");
      const value = text("value");
      return {
        phase: "Making a note",
        label: "Recording what you've told me",
        note: value
          ? { kind: "fact", text: key ? `${key}: ${value}` : value }
          : undefined,
      };
    }
    case "recall":
      return {
        phase: "Checking what you've told me so far",
        label: "Reading back my notes",
      };
    /* Both spellings: the tool is sent as `web_search` and a call comes back
       named `web_search_call`, and which one this is handed depends on whether
       the route read it off the provider's stream or the SDK's run item. */
    case WEB_SEARCH_TOOL:
    case WEB_SEARCH_ITEM:
      return {
        /* An agent that quietly goes to the internet is worse than one that
           says so, and this is the only line that says so — there's no note
           event, because nothing he found is his to write down yet. */
        phase: "Looking that up",
        label: "Looking that up",
      };
    case "draft_workflow":
      return {
        phase: "Drafting the workflow",
        label: "Drafting the workflow",
        /* The same blocks `execute` builds, from the same arguments — the
           screen gets them here because this event carries them and the result
           event carries a sentence. Deterministic in, deterministic out, so
           there is one draft rather than two that agree by luck. */
        workflow: parseDraft(args),
      };
    default:
      /* A tool we don't have a line for still gets a phase, because something
         is genuinely running and a blank line would be the bigger lie. */
      return { phase: "Working on it", label: name };
  }
}

/**
 * A hosted tool does not arrive the way ours do.
 *
 * The four function tools are announced as a `tool_called` run item *before*
 * they execute, which is what makes their phase line honest. A web search has
 * already happened by the time the SDK produces that item: it runs inside the
 * model's own response, so the run item is emitted after the reply has finished
 * streaming. A "Looking that up" that appears underneath a finished answer is
 * worse than no phase line at all — it's the decoration this whole file exists
 * to have stopped.
 *
 * The provider's own events come through the same stream and do carry the
 * moment. `response.output_item.added` fires as the search starts and
 * `response.output_item.done` when it returns, so the line goes up and comes
 * down with the work.
 *
 * Nothing about the shape is assumed. This is an untyped passthrough of somebody
 * else's wire format, so every field is checked before it's read and an event
 * that isn't a web search is simply not one.
 */
export function describeWebSearch(
  event: unknown,
): { id: string; state: "running" | "done" } | null {
  if (!event || typeof event !== "object") return null;

  const { type, item } = event as { type?: unknown; item?: unknown };
  const state =
    type === "response.output_item.added"
      ? "running"
      : type === "response.output_item.done"
        ? "done"
        : null;
  if (!state) return null;

  if (!item || typeof item !== "object") return null;
  const { type: itemType, id } = item as { type?: unknown; id?: unknown };
  if (itemType !== WEB_SEARCH_ITEM || typeof id !== "string" || !id)
    return null;

  return { id, state };
}

/* --- The agent ------------------------------------------------------------ */

/**
 * One instance, built at module load.
 *
 * The tools are stateless — everything mutable is on the run context — so
 * there's nothing per-request to build, and rebuilding four zod schemas on
 * every keystroke-triggered turn would be work for its own sake.
 */
/**
 * What he already knows, put in front of him rather than left in the tool.
 *
 * `recall` makes checking possible; this makes re-asking unlikely, which is the
 * failure a person actually notices. Craig asking on turn four about something
 * he was told on turn one reads as not listening, and no amount of good prose
 * recovers from it.
 *
 * Appended to the tuned prompt rather than woven into it, so the voice rules
 * stay exactly as written and this is plainly a briefing note on top.
 */
function instructionsFor(context: RunContext<Notebook>): string {
  const { facts, gaps, firstName } = context.context;
  const base = craigSystemPrompt(firstName);
  if (facts.length === 0 && gaps.length === 0) return base;

  return [
    base,
    "",
    "## What you already know",
    "",
    "From earlier in this conversation. Don't ask about these again, and don't record them a second time.",
    facts.length > 0 ? `\nEstablished:\n${facts.map(factLine).join("\n")}` : "",
    gaps.length > 0
      ? `\nGaps you've already found:\n${gaps.map(gapLine).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export const craig = new Agent<Notebook>({
  name: "Craig",
  instructions: instructionsFor,
  model: CHAT_MODEL,
  modelSettings: { temperature: CHAT_TEMPERATURE, maxTokens: 900 },
  tools: [noteGap, recordFact, recall, draftWorkflow, lookItUp],
});

/* How far the agent may loop is `MAX_TURNS` in `rate-limit.ts`, next to the
   other caps on what one message is allowed to cost. It was defined here first
   and that was the wrong home: a runaway planning loop is a spend problem, and
   splitting the spend guards across two files is how one of them gets raised
   without anybody noticing the other. */
