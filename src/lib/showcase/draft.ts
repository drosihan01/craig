import type { WorkflowBlock } from "@/components/ui";
import {
  ALL_PRESETS,
  BLOCK_LIBRARY,
  WHEN_OPTIONS,
  blockFromPreset,
  findPreset,
  missingRequired,
  type BlockPreset,
  type SetupField,
} from "@/lib/workflow/library";

/**
 * The block library, handed to Craig as something he can draft with.
 *
 * He used to emit free text — a title, a kind, an owner, a sentence about what
 * it needed first. Every step that arrived was a generic block with nothing
 * inside it, so there was nothing to check: "Slack" and "Slack, but nobody has
 * said which channels" were the same draft. Whether a workflow was ready to
 * publish had to be decided by a second rule invented for the purpose, and two
 * rules about the same thing eventually disagree.
 *
 * Picking real presets makes the existing machinery do that work. A preset
 * knows which of its setup fields are required, `missingSetup` sees the ones he
 * left empty, and the badge, the count and the Publish gate all read the same
 * answer. The gaps he leaves stop being prose and become the thing the editor
 * is already built to show.
 *
 * Everything here is derived from `BLOCK_LIBRARY` at module load. Nothing about
 * the library is restated, so a preset added tomorrow is draftable tomorrow and
 * a field that becomes required is a gap he starts leaving open — without this
 * file being touched.
 */

/* --- The closed set ------------------------------------------------------- */

/**
 * Every preset id, for `z.enum`.
 *
 * The point of putting this in the schema rather than checking it afterwards is
 * that the model is handed the list it must choose from, in the same object
 * that says what a step is. An id outside the library isn't rejected — it
 * cannot be expressed.
 */
export const PRESET_IDS = ALL_PRESETS.map((p) => p.id) as [string, ...string[]];

/* --- The catalogue -------------------------------------------------------- */

/**
 * What a field will accept, in as few words as it takes.
 *
 * Option *ids* rather than labels, because ids are what get stored and the slugs
 * read closely enough to their labels to be picked correctly.
 *
 * Hints come along only where the field has options, and that line is drawn on
 * purpose. A hint on a list is advice about choosing — "start at the lowest that
 * lets them work", "only the ones the role needs" — and it's the difference
 * between a guessed `read` and a guessed `admin`. A hint on a free text field is
 * an *example answer*: "katalis.ai", "MacBook Pro 14, M4, 24GB", "their home
 * address, usually". Shown one of those, the model writes it into somebody
 * else's workflow, which is the exact failure the empty field exists to avoid.
 */
function fieldSpec(f: SetupField): string {
  /* The shared timing vocabulary is stated once at the top rather than spelled
     out on all fourteen fields that use it. A `when` field that carries its own
     options is a different, narrower list and still prints in full. */
  if (f.kind === "when" && !f.options) return `${f.id} (when)`;

  if (f.options) {
    const ids = f.options.map((o) => o.id).join(", ");
    const advice = f.hint ? ` — ${f.hint}` : "";
    return `${f.id} (${f.kind === "multiselect" ? "any of" : "one of"}: ${ids}${advice})`;
  }

  switch (f.kind) {
    case "person":
      return `${f.id} (a name)`;
    case "file":
      return `${f.id} (a filename)`;
    case "url":
      return `${f.id} (a URL)`;
    case "multiselect":
      return `${f.id} (a list, in her words)`;
    default:
      return `${f.id} (text)`;
  }
}

/**
 * Required fields only.
 *
 * They're the ones that decide whether a step is ready, so they're the ones
 * worth spending prompt on. An optional field he doesn't know about costs
 * nothing — leaving it empty is already the right answer.
 */
function presetEntry(p: BlockPreset): string {
  const head = `${p.id}${p.unavailable ? " [by hand]" : ""} — ${p.label}. ${p.description}`;
  const needs = p.setup.filter((f) => f.required);
  return needs.length === 0
    ? head
    : `${head}\n    needs: ${needs.map(fieldSpec).join("; ")}`;
}

/**
 * The whole library, small enough to put in front of him.
 *
 * Thirty-odd presets is a page. The alternative — a search tool he calls before
 * drafting — costs a turn and a small model that has to look something up
 * before it can start often just doesn't, and writes the generic thing instead.
 *
 * The category headings come along because they carry ordering: "run by someone
 * outside the company, so they take days and need consent first" is the reason
 * a background check goes near the top, stated once where it can't drift from
 * what the picker says.
 */
export const BLOCK_CATALOGUE = [
  `A field marked (when) takes one of: ${WHEN_OPTIONS.map((o) => o.id).join(", ")}.`,
  ...BLOCK_LIBRARY.map(
    (c) =>
      `${c.label} — ${c.description}\n${c.presets.map(presetEntry).join("\n")}`,
  ),
].join("\n\n");

/* --- Turning what he said into blocks -------------------------------------- */

export interface Draft {
  name: string;
  blocks: WorkflowBlock[];
}

/**
 * The trigger, and it isn't his to choose.
 *
 * Craig runs onboarding and onboarding starts when somebody is given a seat, so
 * every workflow in the product opens with this exact block — drafted, blank or
 * from a template. Offering it as a step he could pick would only ever give him
 * a way to get it wrong.
 */
const TRIGGER: WorkflowBlock = {
  id: "trigger",
  kind: "trigger",
  title: "New seat added",
  summary:
    "Runs whenever someone is given a seat in People. Every workflow starts here.",
};

/**
 * The same trigger, for a workflow nobody drafted.
 *
 * A copy rather than the constant itself. The editor writes blocks back by
 * replacing the list, but it patches fields in place on the way there, and one
 * shared object sitting at the top of two different workflows is a rename in
 * one of them showing up in the other.
 */
export const blankTrigger = (): WorkflowBlock => ({ ...TRIGGER });

/**
 * Said on the block, because a plan is not an automation script.
 *
 * `unavailable` means Craig can't run the step himself — no provider account,
 * no calendar access, an API that won't manage members. It has never meant the
 * step isn't real onboarding, and a draft without "meet your manager" or "first
 * task" in it is a thin, software-only draft. So he may draft any of them, and
 * the block says plainly which half of the deal it is.
 *
 * Not `incomplete`, which would be the obvious home: that field feeds
 * `isUnconfigured` and would hold Publish shut on a workflow whose only fault
 * is containing a step a person does. Nobody can close that gap.
 */
const BY_HAND = "Craig can't run this one — somebody ticks it off.";

/**
 * The single block a forced draft collapses to.
 *
 * A preset rather than a hand-built block, so nothing about it is special: it
 * has one required select with two options, which is the shortest path from a
 * fresh account through draft, configure and publish that still exercises the
 * real gate. Somebody testing that path shouldn't have to talk to Craig for six
 * turns first.
 */
const SIMPLE_PRESET = "details";

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Told to leave a field open, a model will often write down that it's open.
 *
 * "TBD" is worse than nothing, and precisely because it looks like something: it
 * has a value, so `missingSetup` counts the field as answered, the warning badge
 * goes away and Publish unlocks on a step that says "to be determined" where the
 * address should be. An empty field already says this, and says it somewhere the
 * product can act on.
 */
const NOT_AN_ANSWER =
  /^(tbd|tbc|n\/?a|none|unknown|pending|todo|to be (determined|confirmed|decided|advised)|not (yet )?(known|set|sure|specified|decided|provided)|unspecified|\?+|-+)$/i;

/** An option id, if what he said names one. */
function optionId(
  options: { id: string; label: string }[],
  value: string,
): string | undefined {
  const k = key(value);
  return options.find((o) => key(o.id) === k || key(o.label) === k)?.id;
}

/**
 * One field's answer, or nothing if what he said doesn't fit it.
 *
 * The two halves are asymmetric on purpose, and each follows what the editor
 * does with the value. A multiselect draws anything it doesn't recognise as its
 * own chip, so "#standup" survives as "#standup" rather than disappearing. A
 * select draws nothing at all for a value outside its options — it would read
 * "Not set" over a field counted as answered — so an answer that isn't one of
 * them is left open, which is the truth.
 */
function valueFor(
  f: SetupField,
  said: string[],
): string | string[] | undefined {
  const options = f.options ?? (f.kind === "when" ? WHEN_OPTIONS : undefined);

  if (f.kind === "multiselect") {
    const parts = said
      .flatMap((v) => v.split(","))
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => (options ? (optionId(options, v) ?? v) : v));
    return parts.length > 0 ? [...new Set(parts)] : undefined;
  }

  const value = said[0];

  /* A url field takes something addressable, which is the same rule as a select
     taking one of its options — the kind says what the field is, so a value that
     isn't one isn't an answer. Told to leave a workspace address open, this
     model writes "Slack URL" into it, and a field holding its own name back is
     configured as far as everything downstream can tell. */
  if (f.kind === "url")
    return /^[^\s]+[./][^\s]*$/.test(value) ? value : undefined;

  /* Text, files and people. A `person` field has no options because the team is
     account data rather than a closed vocabulary — this one is empty until
     somebody is invited, and dropping "Astrid countersigns" because Astrid
     isn't in it yet would throw away the answer to a question he asked. */
  if (!options) return value;
  return optionId(options, value);
}

/**
 * The config for one step, keyed by field id.
 *
 * Driven by the preset's own fields rather than by what arrived, so a field the
 * model invented is dropped rather than stored somewhere nothing will read it.
 */
function configFrom(
  preset: BlockPreset,
  raw: unknown,
): Record<string, string | string[]> {
  if (!Array.isArray(raw)) return {};

  const said = new Map<string, string[]>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { field, value } = entry as { field?: unknown; value?: unknown };
    if (typeof field !== "string" || typeof value !== "string") continue;
    const id = key(field);
    const text = value.trim();
    if (!id || !text || NOT_AN_ANSWER.test(text)) continue;
    /* Kept rather than overwritten: one entry per value is how a multiselect
       tends to arrive, and it's the same shape a comma-separated answer takes
       once it's split. */
    said.set(id, [...(said.get(id) ?? []), text]);
  }

  const config: Record<string, string | string[]> = {};
  for (const f of preset.setup) {
    const answers = said.get(key(f.id));
    if (!answers) continue;
    const value = valueFor(f, answers);
    if (value !== undefined) config[f.id] = value;
  }
  return config;
}

const trimmed = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

/* --- Where a value came from ----------------------------------------------- */

/**
 * Everything the person has actually said, as one searchable string.
 *
 * Their turns and Craig's notes of them, because a conversation gets trimmed on
 * the way to the model and a fact recorded on turn one is still something they
 * said. Padded and stripped of punctuation so a phrase can be looked for whole:
 * "bellwether.io" and "bellwether.io," are the same answer, and "eng" is not
 * hiding inside "engineering".
 */
export const spoken = (parts: string[]) =>
  ` ${parts
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

const heard = (said: string, phrase: string) => {
  const needle = phrase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return needle !== "" && said.includes(` ${needle} `);
};

/**
 * Whether a stored value is one they gave him, or one he thought of.
 *
 * The filters above are about *shape* — is this a URL, is this one of the
 * options, is this the word "TBD". They pass anything plausible, which is
 * exactly what a helpful model produces: asked to finish the Slack step it
 * writes `bellwetheranalytics.slack.com`, a perfectly well-formed workspace
 * address for a workspace that may not exist. Shape cannot catch that. Only
 * provenance can.
 *
 * So the value has to appear in what they said. Option-backed fields are
 * checked against the id *and* the label, because "#engineering" is how a
 * person writes the option stored as `eng`, and a person who says "member" has
 * chosen `member`. A field this rejects stays empty, which is the outcome the
 * whole product prefers: an empty field is a question somebody can answer, and
 * a filled one is a decision nobody made.
 */
function grounded(f: SetupField, said: string, value: string): boolean {
  const options = f.options ?? (f.kind === "when" ? WHEN_OPTIONS : undefined);
  const option = options?.find((o) => o.id === value);
  return option
    ? heard(said, option.id) || heard(said, option.label)
    : heard(said, value);
}

/** The config, less anything he made up. `said` empty means nothing is checked. */
function onlyWhatTheySaid(
  preset: BlockPreset,
  config: Record<string, string | string[]>,
  said: string,
): Record<string, string | string[]> {
  const kept: Record<string, string | string[]> = {};

  for (const f of preset.setup) {
    const value = config[f.id];
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      const heardOnes = value.filter((v) => grounded(f, said, v));
      if (heardOnes.length > 0) kept[f.id] = heardOnes;
      continue;
    }
    if (grounded(f, said, value)) kept[f.id] = value;
  }

  return kept;
}

/**
 * One step, from a preset id and whatever he said about it.
 *
 * The same function whether it arrives in a twelve-step draft or on its own as
 * "add a background check", which is the point: a step added in the editor gets
 * the by-hand summary, the owner and the config filters identically, so the two
 * routes into a workflow cannot produce two different kinds of block.
 *
 * `said` is only passed by the editing tools. Drafting is a different bargain —
 * he is building the whole thing out of a conversation he has just had, and the
 * prompt's field-by-field rule governs it; editing is one field at a time onto
 * a step somebody is watching, and that is where a guess reads as an answer.
 */
export function buildStep(
  presetId: unknown,
  id: string,
  owner: unknown,
  rawConfig: unknown,
  said?: string,
): WorkflowBlock | undefined {
  const preset =
    typeof presetId === "string" ? findPreset(presetId) : undefined;
  if (!preset) return undefined;

  const config = configFrom(preset, rawConfig);

  const block = blockFromPreset(preset, id);
  return {
    ...block,
    summary: preset.unavailable ? BY_HAND : block.summary,
    owner: trimmed(owner) || undefined,
    config: said ? onlyWhatTheySaid(preset, config, said) : config,
  };
}

/**
 * The setup he said, for a step that already exists.
 *
 * Runs the same gauntlet a drafted step's config does — the placeholder list,
 * the URL shape, the option ids, the fields the preset doesn't have — and then
 * the one drafting doesn't: it has to be something they said. Filling a field
 * here is the one action that makes a step *look* Ready, so it must not be the
 * one action with the weaker filter.
 */
export function parseConfig(
  presetId: string,
  raw: unknown,
  said: string,
): Record<string, string | string[]> {
  const preset = findPreset(presetId);
  if (!preset) return {};
  return onlyWhatTheySaid(preset, configFrom(preset, raw), said);
}

/** Required fields with nothing in them, by id — what he may usefully ask about. */
export const stillOpen = (
  presetId: string,
  config: Record<string, string | string[]> | undefined,
) => missingRequired(presetId, config).map((f) => f.id);

/**
 * The draft, or nothing.
 *
 * Reads the model's arguments off the tool-call event, which fires *before* the
 * SDK validates them against the schema — so nothing here may be assumed, not
 * even the preset id the enum makes impossible. A step naming something the
 * library doesn't have is dropped rather than turned into a blank block; a
 * missing name falls back rather than shipping an untitled workflow.
 */
export function parseDraft(raw: unknown, simple = false): Draft | undefined {
  const { name, steps } =
    raw && typeof raw === "object"
      ? (raw as { name?: unknown; steps?: unknown })
      : {};

  /* The whole draft thrown away and replaced by one empty step. Everything
     downstream is untouched, which is the point of doing it here: it is a real
     preset with a real required field, so the badge, the counter and the
     Publish gate are the ones under test rather than a special case beside
     them. His own readback comes off these blocks too, so he describes what
     actually landed. */
  if (simple) {
    const block = buildStep(SIMPLE_PRESET, "step-1", undefined, undefined);
    return block
      ? { name: trimmed(name) || "Onboarding", blocks: [TRIGGER, block] }
      : undefined;
  }

  if (!Array.isArray(steps)) return undefined;

  const kept = steps.flatMap(
    (value): { preset: BlockPreset; step: Record<string, unknown> }[] => {
      if (!value || typeof value !== "object") return [];
      const step = value as Record<string, unknown>;
      const preset =
        typeof step.preset === "string" ? findPreset(step.preset) : undefined;
      return preset ? [{ preset, step }] : [];
    },
  );

  /* Numbered after the dropping rather than during it, so a step that didn't
     survive doesn't leave a hole in the ids. */
  const blocks = kept.flatMap(({ preset, step }, i) => {
    const block = buildStep(
      preset.id,
      `step-${i + 1}`,
      step.owner,
      step.config,
    );
    return block ? [block] : [];
  });

  if (blocks.length === 0) return undefined;

  return {
    name: trimmed(name) || "Onboarding",
    blocks: [TRIGGER, ...blocks],
  };
}

/* --- Reading the draft back to him ----------------------------------------- */

/**
 * What he left open, in the words the editor will use for it.
 *
 * Handed back as the tool's result so his reply can name the actual holes
 * instead of remembering which ones he meant to leave. It's derived from the
 * blocks he just produced, so it can't flatter them.
 */
export function openSetup(blocks: WorkflowBlock[]): string[] {
  return blocks.flatMap((b) => {
    const missing = missingRequired(b.preset, b.config);
    if (missing.length === 0) return [];
    return [
      `${b.title} — ${missing.map((f) => f.label.toLowerCase()).join(", ")}`,
    ];
  });
}

/** The steps a person does themselves, so he can say so rather than imply it. */
export function byHand(blocks: WorkflowBlock[]): string[] {
  return blocks.flatMap((b) => {
    const preset = b.preset ? findPreset(b.preset) : undefined;
    return preset?.unavailable ? [b.title] : [];
  });
}
