import "server-only";

import { Agent, RunContext, setTracingDisabled, tool } from "@openai/agents";
import { z } from "zod";
import type { BlockKind } from "@/components/ui";
import type { WorkflowDraftStep } from "@/lib/showcase/contract";
import {
  CHAT_MODEL,
  CHAT_TEMPERATURE,
  CRAIG_SYSTEM_PROMPT,
} from "@/lib/showcase/craig-prompt";

/**
 * Craig, with hands.
 *
 * The phase line has been a lie in every demo so far — a list of labels on a
 * timer, chosen to take about as long as the work would have taken. It read
 * well because the labels were honest about what the work *would* be. Nothing
 * was happening.
 *
 * These four tools are that same list, made real. "Writing that down" appears
 * because `note_gap` is executing, and it stops appearing when the call
 * returns. The screen can't tell the difference — that's the point — but the
 * product can now only claim things it did.
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
  workflow: WorkflowDraftStep[] | null;
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
export function seedNotebook(known?: {
  gaps: string[];
  facts: string[];
}): Notebook {
  return {
    gaps: (known?.gaps ?? []).map((what) => ({ what, whyItMatters: "" })),
    facts: (known?.facts ?? []).map((value) => ({ key: "", value })),
    workflow: null,
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
 * The block types the builder's engine runs.
 *
 * `satisfies` is the point of the literal array: zod needs the values at
 * runtime, and this stops compiling the day `BlockKind` gains or loses a
 * member, which is the only way two copies of a union stay honest.
 */
const BLOCK_KINDS = [
  "trigger",
  "task",
  "approval",
  "notify",
  "branch",
  "document",
] as const satisfies readonly BlockKind[];

const draftWorkflowParams = z.object({
  steps: z
    .array(
      z.object({
        title: z
          .string()
          .describe("What happens. Short, like 'Sign contract'."),
        /* Asked for rather than guessed from the title on the way out. A draft
           that arrives as six blocks all typed "task" is one somebody has to
           redo, and the model knows which is which better than a regex would. */
        kind: z
          .enum(BLOCK_KINDS)
          .describe(
            "What sort of step it is. 'document' for something signed or read, 'approval' where somebody has to say yes, 'notify' for a message, 'branch' where it depends, 'task' for anything else a person does. 'trigger' only for what starts the whole thing.",
          ),
        owner: z
          .string()
          .describe("Who does it — a named person, or the new starter."),
        needs: z
          .string()
          .describe(
            "What has to be true before it can run. 'Nothing' if it can go first.",
          ),
      }),
    )
    .describe("In the order they should run."),
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
    "Produce the onboarding draft once you know the tools, who can create them, and roughly what week one involves. Call this whenever the user signals they have finished telling you things — 'that's everything', 'that's all I can think of', 'what else do you need'. Do not call it in the first two exchanges: a workflow built on two facts is a generic one and they will be able to tell.",
  parameters: draftWorkflowParams,
  execute: ({ steps }, context) => {
    const notebook = notebookOf(context);
    notebook.workflow = steps;
    return `Drafted ${steps.length} steps. Now tell them what you've built, in your own voice — lead line, bullets, and name anything you left open rather than guessing at.`;
  },
});

/* --- Mapping a tool call onto something a person can read ------------------ */

export interface ToolActivity {
  /** Shown on the phase line while it runs. Present tense, honest. */
  phase: string;
  /** The tool event's label. */
  label: string;
  /** Surfaced to the screen as its own event, when the tool produces one. */
  note?: { kind: "gap" | "fact"; text: string };
  /** The draft, when this was `draft_workflow` and it parsed. */
  workflow?: WorkflowDraftStep[];
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
/**
 * The draft, or nothing.
 *
 * This reads the model's arguments off the call event, which fires *before* the
 * SDK validates them against the schema — so nothing here may be assumed. A
 * step missing a title is dropped rather than passed on as a blank block, and a
 * `kind` that isn't one of ours becomes "task", which is the honest default for
 * "a person does this" and the only one that can't misrepresent the step.
 */
function parseSteps(value: unknown): WorkflowDraftStep[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const steps = value.flatMap((raw): WorkflowDraftStep[] => {
    if (!raw || typeof raw !== "object") return [];
    const step = raw as Record<string, unknown>;

    const title = typeof step.title === "string" ? step.title.trim() : "";
    if (!title) return [];

    const kind = BLOCK_KINDS.find((k) => k === step.kind) ?? "task";

    return [
      {
        title,
        kind,
        owner: typeof step.owner === "string" ? step.owner.trim() : "",
        needs: typeof step.needs === "string" ? step.needs.trim() : "",
      },
    ];
  });

  return steps.length > 0 ? steps : undefined;
}

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
    case "draft_workflow":
      return {
        phase: "Drafting the workflow",
        label: "Drafting the workflow",
        workflow: parseSteps(args.steps),
      };
    default:
      /* A tool we don't have a line for still gets a phase, because something
         is genuinely running and a blank line would be the bigger lie. */
      return { phase: "Working on it", label: name };
  }
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
  const { facts, gaps } = context.context;
  if (facts.length === 0 && gaps.length === 0) return CRAIG_SYSTEM_PROMPT;

  return [
    CRAIG_SYSTEM_PROMPT,
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
  tools: [noteGap, recordFact, recall, draftWorkflow],
});

/* How far the agent may loop is `MAX_TURNS` in `rate-limit.ts`, next to the
   other caps on what one message is allowed to cost. It was defined here first
   and that was the wrong home: a runaway planning loop is a spend problem, and
   splitting the spend guards across two files is how one of them gets raised
   without anybody noticing the other. */
