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
  buildStep,
  byHand,
  openSetup,
  parseConfig,
  parseDraft,
  spoken,
  stillOpen,
  type Draft,
} from "@/lib/showcase/draft";
import {
  CHAT_MODEL,
  CHAT_TEMPERATURE,
  craigSystemPrompt,
  openWorkflowNote,
  SIMPLE_DRAFT_NOTE,
} from "@/lib/showcase/craig-prompt";
import type {
  OpenStep,
  OpenWorkflow,
  WorkflowEdit,
} from "@/lib/showcase/contract";

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
 * All but one are ours and run in this process. The exception is
 * `webSearchTool`, which runs inside OpenAI's response and is the only one that
 * can come back with something untrue — see the note above it, and the section
 * of the prompt it exists to be governed by.
 *
 * They split in half. The first four are discovery: they write things down and
 * eventually produce a workflow out of nothing. The three after them change a
 * workflow that already exists, and they only work when the client says one is
 * open — which is what stops him editing a canvas nobody is looking at, and
 * what tells him, without being told, which of the two jobs this turn is.
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
  /**
   * The company they signed up as, when the session carries one.
   *
   * Alongside `firstName` and for the same reason: he was told who he was
   * talking to and nothing about where they worked, so he opened by asking
   * about a company whose name was sitting in the account the whole time.
   */
  company?: string;
  /**
   * The workflow open in the editor, or null during discovery.
   *
   * Mutated by the editing tools as they run, so a second call in the same turn
   * sees the first one's work — he can add a step and then fill a field on it,
   * and the step is there to be named.
   */
  editing: OpenWorkflow | null;
  /**
   * What he's changed this turn, drained by the route as it happens.
   *
   * The edits are produced by `execute` rather than read back off the tool
   * call's arguments, which is the opposite of how `draft_workflow` works and
   * is right for the same reason that one is right: a draft is built purely
   * from what he said, and an edit is what he said *applied to* a workflow only
   * the notebook holds. Deriving it twice would mean two readings of a moving
   * target, and the tool's own reply would eventually describe a canvas the
   * person isn't looking at.
   */
  edits: WorkflowEdit[];
  /**
   * Everything they've actually said, for the editing tools to check against.
   *
   * The one guard shape can't provide. Asked to finish a step, this model
   * writes a well-formed workspace address for a workspace nobody mentioned —
   * and a URL filter has no way to tell that from the real one.
   */
  said: string;
  /** The sandbox's switch: collapse any draft to the one-step test workflow. */
  simpleDraft: boolean;
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
  company: string | undefined,
  known?: { gaps: string[]; facts: string[] },
  editing?: OpenWorkflow,
  simpleDraft = false,
  theirWords: string[] = [],
): Notebook {
  return {
    gaps: (known?.gaps ?? []).map((what) => ({ what, whyItMatters: "" })),
    facts: (known?.facts ?? []).map((value) => ({ key: "", value })),
    workflow: null,
    firstName,
    company,
    /* Their turns and his notes of them together: a conversation gets trimmed
       on the way here, and a fact recorded on turn one is still something they
       said. */
    said: spoken([
      ...theirWords,
      ...(known?.facts ?? []),
      ...(known?.gaps ?? []),
    ]),
    /* Copied rather than held by reference: the tools rewrite it as they work
       and the caller's parsed request shouldn't change underneath it. */
    editing: editing ? { id: editing.id, steps: [...editing.steps] } : null,
    edits: [],
    simpleDraft,
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

/**
 * A list, not one fact.
 *
 * One-per-call cost a turn each, and a dense first message — "we're X, four of
 * us, A does this, B starts on the 2nd, nothing's written down" — has six
 * facts in it. Six calls plus the reply is the whole `MAX_TURNS` budget, and
 * the person sees "Craig got stuck in a loop" for saying one useful paragraph.
 *
 * Batching is the fix rather than a higher ceiling: the limit exists to stop a
 * runaway, and raising it to fit normal use would blunt the thing that catches
 * an actual loop.
 */
const recordFactParams = z.object({
  facts: z
    .array(
      z.object({
        /* The label is shown to the person as-is, so "start date" reads and
           "start_date_of_new_hire" does not. */
        key: z
          .string()
          .describe(
            "Short label in plain words, like 'headcount' or 'who owns AWS'. Never snake_case.",
          ),
        value: z.string().describe("The fact itself."),
      }),
    )
    .describe(
      "Every fact in their message. Send them together, not one by one.",
    ),
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
      "What kind of hire this workflow is for, in a few words. Name the role or the company, never the person: 'Designer onboarding', 'Contractor onboarding', 'Magitech onboarding'. Never 'Onboarding for Priya Raman'. The workflow is run again for the next hire and the one after, so a person's name in it is wrong the moment they finish.",
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

/**
 * The setup pairs, shared by the tool that adds a step and the one that fills
 * one in. Same shape and the same warning, because the temptation to invent a
 * value is identical and it does more damage on an existing step — that one is
 * on screen with a badge somebody is trying to clear.
 */
const configPairs = z.array(
  z.object({
    field: z
      .string()
      .describe("A setup field's id, exactly as listed on that step."),
    value: z
      .string()
      .describe(
        "What they actually said. Several values in one entry, separated by commas.",
      ),
  }),
);

const addStepParams = z.object({
  preset: z
    .enum(PRESET_IDS)
    .describe("The id of a block from the library. Exactly as listed."),
  owner: z
    .string()
    .describe("Who does it — a named person, or the new starter."),
  after: z
    .string()
    .optional()
    .describe(
      "The id of the step it should follow. Leave out to put it at the end.",
    ),
  config: configPairs
    .optional()
    .describe(
      "Only fields they gave you an answer to. Leave out anything else — a URL, an account name, a permission level, a list of channels. An empty field is a gap they can see and close; an invented one is a step nobody ever checks.",
    ),
});

const setStepConfigParams = z.object({
  steps: z
    .array(z.string())
    .describe(
      "The ids of the steps to set this on, exactly as listed. Several at once when one answer covers several steps.",
    ),
  config: configPairs.describe(
    "The fields they answered, and nothing else. A field you fill flips the step to Ready, so a guess here is a step that looks decided when nobody decided it.",
  ),
});

const removeStepParams = z.object({
  step: z
    .string()
    .describe("The id of the step to take out, exactly as listed."),
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
    "Record concrete facts about the company: its name, what it sells, headcount, a person's role, a start date, a tool they use, who owns an account. Pass every fact in their message in one call, before replying — not one call each, and not a summary at the end.",
  parameters: recordFactParams,
  execute: ({ facts }, context) => {
    const notebook = notebookOf(context);
    const kept = facts.filter((f) => f.key.trim() && f.value.trim());
    notebook.facts.push(...kept);
    return kept.length === 0
      ? "Nothing recorded — every entry was blank."
      : `Got it:\n${kept.map((f) => `- ${f.key} — ${f.value}`).join("\n")}`;
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

    /* Refused rather than allowed to build a second workflow beside the one
       they're looking at. The prompt says so too, but a tool that quietly
       creates a duplicate is a worse failure than a tool that says no. */
    if (notebook.editing)
      return "They already have a workflow open. Change that one with add_step, set_step_config or remove_step.";

    const draft = parseDraft(args, notebook.simpleDraft);
    if (!draft) return "None of those steps matched a block. Try again.";

    notebook.workflow = draft;

    /* Read back off the blocks he just made rather than off what he meant to
       do, so the reply names the holes that are actually there. Without it he
       reliably announces a step as done and leaves its required fields empty. */
    const open = openSetup(draft.blocks);
    const manual = byHand(draft.blocks);

    return [
      `Drafted ${draft.blocks.length - 1} steps as ${draft.name}.`,
      /* The substitution has to be said, not just done. Left to the count
         alone he describes the twelve steps he asked for over a canvas holding
         one, which is the product lying about its own output — the exact thing
         reading the holes off the blocks exists to stop. */
      notebook.simpleDraft
        ? "None of the steps you asked for were used: every one was replaced by a single step, Details. Describe only that step. Do not mention any of the others."
        : "",
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

/* --- Editing the workflow that's already there ----------------------------- */

/**
 * What the workflow still needs, handed back after every edit.
 *
 * Read off the summary he's been mutating rather than off what he meant to do,
 * for the same reason `draft_workflow` reads its holes off the blocks: told
 * only that a call succeeded, this model announces the workflow as finished.
 */
function openSummary(workflow: OpenWorkflow): string {
  const left = workflow.steps.filter((s) => s.open.length > 0);
  return left.length === 0
    ? "Nothing is left open on this workflow."
    : `Still open: ${left
        .map((s) => `${s.title} (${s.open.join(", ")})`)
        .join("; ")}.`;
}

/** Distinct from `step-N` and from the editor's own ids, so nothing collides. */
let added = 0;
const stepId = () => `craig-${Date.now().toString(36)}-${added++}`;

const noWorkflow = "There's no workflow open — you can't edit one from here.";

const addStep = tool<typeof addStepParams, Notebook>({
  name: "add_step",
  description:
    "Add one step to the workflow they have open, when they ask for one — 'add a background check', 'we also need to order a laptop'. Only then: a message that answers a question about an existing step is not a request for a new one, and rounding the workflow out with steps nobody asked for is how somebody ends up publishing work they never agreed to. The preset is a block id from the library in your instructions; check the steps you were shown first, because a second copy of one that's already there is worse than not adding it.",
  parameters: addStepParams,
  execute: ({ preset, owner, after, config }, context) => {
    const notebook = notebookOf(context);
    const open = notebook.editing;
    if (!open) return noWorkflow;

    const id = stepId();
    const block = buildStep(preset, id, owner, config, notebook.said);
    if (!block) return "That isn't a block in the library.";

    /* An `after` naming a step that isn't there means the end of the workflow
       rather than a failure — he got the position wrong, not the step. */
    const at = open.steps.some((s) => s.id === after) ? after : undefined;
    notebook.edits.push({ type: "step-added", block, after: at });

    const step: OpenStep = {
      id,
      preset,
      title: block.title,
      owner: block.owner,
      open: stillOpen(preset, block.config),
    };
    const index = at
      ? open.steps.findIndex((s) => s.id === at) + 1
      : open.steps.length;
    open.steps.splice(index, 0, step);

    return [
      `Added ${block.title} as ${id}.`,
      step.open.length > 0
        ? `You must ask about these rather than fill them in: ${step.open.join(", ")}.`
        : "",
      openSummary(open),
    ]
      .filter(Boolean)
      .join(" ");
  },
});

const setStepConfig = tool<typeof setStepConfigParams, Notebook>({
  name: "set_step_config",
  description:
    "Fill in setup fields on steps that already exist, which is how a step stops being unconfigured and becomes Ready. Use it the moment they answer something a step was waiting on — 'Priya provisions all the accounts' sets the owner on every account step at once. Only ever with a value they said; a field is not a form to complete.",
  parameters: setStepConfigParams,
  execute: ({ steps, config }, context) => {
    const notebook = notebookOf(context);
    const open = notebook.editing;
    if (!open) return noWorkflow;

    const set: string[] = [];
    const refused: string[] = [];
    const unknown: string[] = [];

    for (const id of steps) {
      const step = open.steps.find((s) => s.id === id);
      if (!step) {
        unknown.push(id);
        continue;
      }

      /* The same filters a drafted step's config goes through. A value the
         field can't take — a placeholder, something that isn't a URL, an
         option that doesn't exist — leaves the field empty, which is the
         truth, rather than answered with a word that looks like an answer. */
      const values = parseConfig(step.preset, config, notebook.said);
      if (Object.keys(values).length === 0) {
        refused.push(step.title);
        continue;
      }

      notebook.edits.push({ type: "step-set", stepId: id, config: values });
      step.open = step.open.filter((f) => !(f in values));
      set.push(`${step.title} (${Object.keys(values).join(", ")})`);
    }

    return [
      set.length > 0 ? `Set ${set.join("; ")}.` : "",
      refused.length > 0
        ? `They never said any of that, so ${refused.join(", ")} ${refused.length === 1 ? "is" : "are"} still empty. Ask them for it — do not send a value they haven't given you.`
        : "",
      unknown.length > 0 ? `No step called ${unknown.join(", ")}.` : "",
      openSummary(open),
    ]
      .filter(Boolean)
      .join(" ");
  },
});

const removeStep = tool<typeof removeStepParams, Notebook>({
  name: "remove_step",
  description:
    "Take one step out of the workflow they have open. Only when they've said they don't want it — a step they haven't answered yet is unconfigured, not unwanted, and removing it hides the question instead of answering it.",
  parameters: removeStepParams,
  execute: ({ step }, context) => {
    const notebook = notebookOf(context);
    const open = notebook.editing;
    if (!open) return noWorkflow;

    const index = open.steps.findIndex((s) => s.id === step);
    if (index === -1) return `There's no step called ${step}.`;

    const [gone] = open.steps.splice(index, 1);
    notebook.edits.push({ type: "step-removed", stepId: step });
    return `Removed ${gone.title}. ${openSummary(open)}`;
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
  /** Surfaced to the screen as their own events. A batched call produces
      several — one tool call is not one note. */
  notes?: { kind: "gap" | "fact"; text: string }[];
  /** The draft, when this was `draft_workflow` and it parsed. */
  workflow?: Draft;
}

/**
 * Lives here rather than in the route because it's knowledge about these tools'
 * arguments, and a route that reaches into a tool's argument shape is one
 * rename away from silently emitting blank notes.
 *
 * Arguments arrive as an unparsed JSON string, and the model is capable of
 * producing one that doesn't match the schema — the SDK rejects those before
 * `execute`, but this runs off the call event, which fires first. So every
 * field is checked before it's read.
 *
 * The editing tools produce nothing here on purpose: their result depends on
 * the workflow rather than only on the arguments, so they push onto the
 * notebook as they run and the route drains that instead. `notebook` is passed
 * anyway for the one thing this function does need to know about the workflow —
 * whether there is one, which decides if a stray `draft_workflow` is allowed to
 * put a second one in the account.
 */
export function describeToolCall(
  name: string,
  rawArguments: string,
  notebook?: Notebook,
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
        notes: what
          ? [{ kind: "gap", text: why ? `${what} — ${why}` : what }]
          : undefined,
      };
    }
    case "record_fact": {
      /* The arguments arrive as an unparsed string and the model can produce
         one that doesn't match the schema, so every level is checked before
         it's read — this runs off the call event, which fires before the SDK
         has validated anything. */
      const raw = Array.isArray(args.facts) ? args.facts : [];
      const notes = raw.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const { key, value } = entry as { key?: unknown; value?: unknown };
        const k = typeof key === "string" ? key.trim() : "";
        const v = typeof value === "string" ? value.trim() : "";
        if (!v) return [];
        return [{ kind: "fact" as const, text: k ? `${k}: ${v}` : v }];
      });
      return {
        phase: "Making a note",
        label:
          notes.length > 1
            ? `Recording ${notes.length} things you've told me`
            : "Recording what you've told me",
        notes: notes.length > 0 ? notes : undefined,
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
           there is one draft rather than two that agree by luck.
           Withheld when a workflow is already open, matching the refusal in
           `execute`: he is meant to edit that one, and the two halves of this
           tool must not disagree about whether the call counted. */
        workflow: notebook?.editing
          ? undefined
          : parseDraft(args, notebook?.simpleDraft),
      };
    case "add_step":
      return { phase: "Adding a step", label: "Adding a step" };
    case "set_step_config":
      return { phase: "Filling that in", label: "Filling in a step" };
    case "remove_step":
      return { phase: "Taking that out", label: "Removing a step" };
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

/* --- Citations ------------------------------------------------------------- */

/**
 * A page the search used, off the provider's own stream.
 *
 * `response.output_text.annotation.added` carries a `url_citation` with the
 * page's title and address. It arrives *after* the deltas covering the span it
 * annotates, which is why the text has to be held back rather than corrected:
 * by the time we know a citation exists, the sentence containing it has already
 * been written.
 *
 * Untyped passthrough of somebody else's wire format, so every field is checked
 * and anything that isn't a URL citation is simply not one.
 */
export function describeCitation(
  event: unknown,
): { url: string; title: string } | null {
  if (!event || typeof event !== "object") return null;

  const { type, annotation } = event as {
    type?: unknown;
    annotation?: unknown;
  };
  if (type !== "response.output_text.annotation.added") return null;
  if (!annotation || typeof annotation !== "object") return null;

  const a = annotation as { type?: unknown; url?: unknown; title?: unknown };
  if (a.type !== "url_citation" || typeof a.url !== "string" || !a.url)
    return null;

  return {
    url: a.url,
    title: typeof a.title === "string" ? a.title : "",
  };
}

/**
 * One complete inline citation, as the model writes them.
 *
 * `([nationalcrimecheck.com.au](https://…))` — a markdown link, or several
 * comma-separated, inside brackets, usually with a space in front. Matched
 * rather than approximated because the shape is the provider's and it is
 * stable; a looser rule would eat real parentheses out of his prose.
 */
const INLINE_CITATION =
  /[ \t]*\(\[[^\]]*\]\([^)]*\)(?:,[ \t]*\[[^\]]*\]\([^)]*\))*\)/g;

/**
 * The prose so far, and the part that might still be turning into a citation.
 *
 * Complete citations are cut. What's left is checked for an opening `([` — after
 * the cut, any that remains is by definition unfinished — and everything from
 * there is held back until the next chunk completes it. Without the hold, half
 * a citation streams onto the screen and is then never taken away, which is the
 * one outcome worse than leaving them in.
 *
 * Stripping here rather than at render time means the clean text is what lands
 * in the transcript, and so what comes back as his own previous turn on the
 * next request. A model shown its own bracketed citations writes more of them.
 */
export function splitCitations(buffered: string): {
  text: string;
  hold: string;
} {
  const stripped = buffered.replace(INLINE_CITATION, "");
  const start = stripped.lastIndexOf("([");
  if (start === -1) return { text: stripped, hold: "" };

  /* The space before an opening bracket goes with it, or removing the citation
     leaves a gap in front of the full stop. */
  const from = /[ \t]$/.test(stripped.slice(0, start)) ? start - 1 : start;
  return { text: stripped.slice(0, from), hold: stripped.slice(from) };
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
  const { facts, gaps, firstName, company, editing, simpleDraft } =
    context.context;

  /* Each block appears once and only once. His notes are here and in `recall`,
     which is the same list read two ways rather than two lists; the workflow is
     here and nowhere else, because `known` carries notes and never steps. */
  const known =
    facts.length === 0 && gaps.length === 0
      ? ""
      : [
          "## What you already know",
          "",
          "From earlier in this conversation. Don't ask about these again, and don't record them a second time.",
          facts.length > 0
            ? `\nEstablished:\n${facts.map(factLine).join("\n")}`
            : "",
          gaps.length > 0
            ? `\nGaps you've already found:\n${gaps.map(gapLine).join("\n")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");

  return [
    craigSystemPrompt(firstName, company),
    known,
    /* Only while there's still a workflow to draft. Once one is open the
       editing note is the thing that governs, and a second instruction about
       what may be drafted would be answering a question nobody is asking. */
    editing
      ? openWorkflowNote(editing, simpleDraft)
      : simpleDraft
        ? SIMPLE_DRAFT_NOTE
        : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const craig = new Agent<Notebook>({
  name: "Craig",
  instructions: instructionsFor,
  model: CHAT_MODEL,
  modelSettings: { temperature: CHAT_TEMPERATURE, maxTokens: 900 },
  tools: [
    noteGap,
    recordFact,
    recall,
    draftWorkflow,
    addStep,
    setStepConfig,
    removeStep,
    lookItUp,
  ],
});

/* How far the agent may loop is `MAX_TURNS` in `rate-limit.ts`, next to the
   other caps on what one message is allowed to cost. It was defined here first
   and that was the wrong home: a runaway planning loop is a spend problem, and
   splitting the spend guards across two files is how one of them gets raised
   without anybody noticing the other. */
