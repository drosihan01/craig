import type { WorkflowBlock } from "@/components/ui";

/**
 * The seams between the showcase's three halves.
 *
 * Everything before this was a horizontal prototype: every screen, no depth.
 * The showcase is the first thing with a real backend behind it — a session
 * you can actually fail to have, and a model that actually answers. These
 * types are the contract those pieces meet at, declared once so the auth, the
 * chat route and the screen can be built against each other rather than after
 * each other.
 *
 * Deliberately small. A contract that describes everything anybody might want
 * is a contract nobody can implement.
 */

/* ---------------------------------------------------------------------- */
/*  Auth                                                                  */
/* ---------------------------------------------------------------------- */

export interface Session {
  email: string;
  /** Display name, derived from the email when there's nothing better. */
  name: string;
  /**
   * The company they signed up as.
   *
   * Sign-up has always asked for this and the account has always stored it —
   * it just stopped at the account, so every screen past the door had to talk
   * about "your company" while holding the name of it. Craig especially: he
   * opens by asking about a company he could have named.
   *
   * Optional because a session minted before this existed won't carry one, and
   * a signed token can't be edited after the fact. Callers fall back.
   */
  company?: string;
  /** Unix seconds. */
  issuedAt: number;
}

/** Where an unauthenticated request is sent, and where it comes back to. */
export const SIGN_IN_PATH = "/showcase/sign-in";
export const AFTER_SIGN_IN = "/showcase/welcome";
export const SESSION_COOKIE = "craig_session";

/* ---------------------------------------------------------------------- */
/*  Chat                                                                  */
/* ---------------------------------------------------------------------- */

export type Role = "user" | "assistant";

export interface ChatTurn {
  role: Role;
  content: string;
}

/**
 * How much conversation one request may carry.
 *
 * Shared rather than a number in the route, because the thread now runs across
 * two screens — discovery, then the editor — and the client is the only side
 * that can decide *which* turns to drop. It keeps the newest, because the early
 * facts already travel separately in `known` and the recent ones are what the
 * next answer follows from. The route still checks: a cap only the client
 * enforces is a cap.
 */
export const MAX_MESSAGES = 40;

/**
 * One step of the workflow that's open in front of them.
 *
 * A summary rather than the block, and the difference is the point: Craig is
 * being told what he may name, not handed a canvas to rewrite. `id` is how he
 * addresses a step, `preset` is which of the library's fields it has, and
 * `open` is the required ones still empty — the shortlist of what he could
 * usefully close, derived from the same `missingRequired` the badge and the
 * publish gate read.
 *
 * Config values are deliberately absent. He can't repeat back a Slack workspace
 * he was never told, and a step's answers are the person's business rather than
 * something to replay through a model on every turn.
 */
export interface OpenStep {
  id: string;
  preset: string;
  title: string;
  owner?: string;
  /** Ids of required setup fields with no value yet. */
  open: string[];
}

/** The workflow being edited, as much of it as Craig needs to change it. */
export interface OpenWorkflow {
  id: string;
  steps: OpenStep[];
}

/** POST /api/chat */
export interface ChatRequest {
  messages: ChatTurn[];
  /** Names of files the user says they've attached. No upload yet — Craig is
      told they exist so he can ask about them, which is honest and is what
      actually happens in the demo scripts. */
  attachments?: string[];
  /**
   * What Craig has already worked out, sent back to him each turn.
   *
   * The route is stateless and his notebook dies with the response, so without
   * this his own "what have I been told" tool can only see the turn it's in —
   * it returns nothing, he asks again, and the person watches him forget. The
   * durable copy lives in the client's store with everything else the showcase
   * accumulates, which is where this repo keeps state; sending it back is what
   * makes the server's statelessness free rather than a memory leak upward.
   */
  known?: { gaps: string[]; facts: string[] };
  /**
   * The workflow open in the editor, when the turn came from there.
   *
   * Absent during discovery, and that absence is what tells him which job he's
   * doing. Sent for the same reason `known` is — the route is stateless — but
   * it buys something `known` can't: he cannot set a field on a step he can't
   * name, and he shouldn't propose adding a step that's already on the canvas.
   * Both of those need the workflow itself, not a memory of drafting it.
   */
  workflow?: OpenWorkflow;
  /**
   * Collapse whatever he drafts to the one-step test workflow.
   *
   * A builder's switch, off in the sandbox, and it travels on the request
   * rather than living on the server because the sandbox and the chat client
   * are both in the browser — a server-side flag would need a second endpoint
   * to set it and would then apply to everybody at once. The substitution still
   * happens on the server, where the blocks are built, so his own account of
   * what he drafted matches what landed.
   */
  simpleDraft?: boolean;
}

/**
 * One change to the open workflow, as Craig makes it.
 *
 * Granular rather than a new block list, because the server was only ever shown
 * a summary — it doesn't hold the config values the person has typed, so it
 * can't hand back a whole workflow without erasing them. Each of these is a
 * change to apply on top of what the store already has.
 */
export type WorkflowEdit =
  /** A real block, built from the library on the server. `after` is a step id. */
  | { type: "step-added"; block: WorkflowBlock; after?: string }
  /** Merged into the step's config. Only fields that survived the filters. */
  | {
      type: "step-set";
      stepId: string;
      config: Record<string, string | string[]>;
    }
  | { type: "step-removed"; stepId: string };

/**
 * The stream is newline-delimited JSON, one object per line.
 *
 * Not the provider's wire format: the client shouldn't have to know what's
 * behind the route, and the moment it does, changing the model or the SDK
 * becomes a front-end change.
 *
 * The shape carries more than text because Craig does more than talk. Running
 * on the Agents SDK, his "thinking" is not a decorative label on a timer — it
 * is a real tool call that really happened, and the difference matters. A
 * progress line that says "Writing that down" while nothing is being written
 * is the exact dishonesty this product spent three demos arguing against.
 */
export type ChatEvent =
  /** Craig working. Derived from a real step, not invented. */
  | { type: "phase"; label: string }
  /** A tool actually running, and then finishing. */
  | {
      type: "tool";
      /** Stable across the running/done pair, so the UI can update in place. */
      id: string;
      label: string;
      state: "running" | "done";
    }
  /**
   * Something Craig recorded while working.
   *
   * `gap` is the valuable one and the reason he exists: a thing nobody has
   * written down. Surfaced as its own event rather than buried in prose so
   * the UI can collect them — that list is the artefact of the conversation,
   * the same way the workflow is the artefact of the builder.
   */
  | { type: "note"; kind: "gap" | "fact"; text: string }
  /**
   * The draft Craig built, once he knows enough to order the steps.
   *
   * Its own event rather than a `note`, because it isn't an observation — it's
   * the artefact the whole conversation was for, and the screen turns it into
   * a real workflow rather than a line in a list.
   */
  /**
   * A workflow Craig drafted.
   *
   * Real blocks, not a description of blocks. He picks from the same preset
   * library the builder's own picker offers, so what arrives can be dropped
   * straight onto the canvas — and, more importantly, the derived machinery
   * works on it unchanged: a preset knows which of its setup fields are
   * required, so `isUnconfigured` can see the holes he left and Publish gates
   * on them without anybody writing a second rule.
   *
   * The alternative — free text describing steps — would have meant every
   * drafted step arriving as a generic task with nothing to check, and a
   * publish gate that had to be invented separately and could disagree.
   */
  | { type: "workflow"; name: string; blocks: WorkflowBlock[] }
  /**
   * Craig changing the workflow that's open, one edit at a time.
   *
   * The canvas moving while he works is the whole appeal of talking to him in
   * the editor — "Priya provisions Slack" is four words against three
   * deliberate acts of selecting, finding the field and typing. Emitted per
   * edit rather than as a finished workflow so the change lands as it happens
   * and the person can see which step it landed on.
   *
   * `workflowId` because a panel left open on one workflow must not have
   * another one's edits applied to it.
   */
  | { type: "edit"; workflowId: string; edit: WorkflowEdit }
  /**
   * A page the web search actually used, one event per site.
   *
   * Carried beside the prose rather than left in it, and that is a fix rather
   * than a decoration. The model writes its citations inline — a bracketed
   * markdown link in the middle of a sentence — which breaks every voice rule
   * this product has at once, and it does it after being told not to, because
   * the behaviour lives in the provider's post-search generation rather than in
   * anything a prompt reaches. Taking the citation out of the text and sending
   * it as its own event solves that structurally: the sentence reads as a
   * sentence, and where it came from is still one click away.
   */
  | { type: "source"; url: string; title: string }
  /** A chunk of the answer. Append. */
  | { type: "delta"; text: string }
  /** The turn is finished. */
  | { type: "done" }
  /** Something failed. `message` is safe to show a user. */
  | { type: "error"; message: string };

export const CHAT_ENDPOINT = "/api/chat";

/* --- The new starter ------------------------------------------------------ */

/**
 * What a step actually asks the person who's arriving.
 *
 * Two, because two are wired end to end. A workflow block can say "collect
 * their details" in a dozen ways, but a form can only be rendered for a field
 * somebody has written a form for — so this names the ones that exist rather
 * than pretending the set is open. A block that maps to neither is real work
 * that simply isn't the new starter's to do here, and it says so.
 */
export type JoinerField = "middle-name" | "date-of-birth";

/** Preset ids that produce a step the new starter can actually answer. */
export const JOINER_FIELD_BY_PRESET: Record<string, JoinerField> = {
  "middle-name": "middle-name",
  "date-of-birth": "date-of-birth",
};

/**
 * Preset ids the admin ticks off themselves.
 *
 * The other half of a workflow, and the half that makes it a plan rather than
 * a form. Somebody at the company writes the name tag, orders the laptop,
 * books the desk — nothing to collect and nobody to collect it from, just work
 * that has to be marked done by the person who did it.
 *
 * Kept as a list beside the fields rather than inferred from "has no field",
 * because those are different things and the difference is visible on both
 * screens: an admin step is waiting for the admin, and a step that is neither
 * is waiting for something this showcase doesn't run yet. Collapsing them
 * would put a tick box next to work nobody here can do.
 */
export const ADMIN_TICK_PRESETS = new Set<string>(["name-tag"]);

/** Who a step is waiting on. Absent means neither — nothing to do here yet. */
export type StepActor = "joiner" | "admin";

export interface JoinerStep {
  /** The block's id in the workflow this was taken from. */
  id: string;
  title: string;
  /**
   * Who this one is waiting on.
   *
   * Absent means nobody here: real work that neither side can complete from
   * these screens. Those steps are kept and shown rather than dropped, because
   * a plan with its middle removed misrepresents both what is happening and how
   * far through it is.
   */
  actor?: StepActor;
  /** Only on `actor: "joiner"` steps. Which form they're shown. */
  field?: JoinerField;
  /** What they gave, once they've given it. */
  value?: string;
  /** ISO. Set together with `value`, and the only record that it happened. */
  completedAt?: string;
}

/**
 * Somebody who was given a seat, and everything their onboarding knows.
 *
 * Server-side, unlike the rest of the showcase. It has to be: the admin and the
 * new starter are two different people in two different browsers, and progress
 * kept in either one's `localStorage` could never be seen by the other. This is
 * the one piece of showcase state that two parties both read.
 *
 * The steps are a *snapshot* taken when the invitation went out, not a
 * reference to the workflow. The admin can edit or delete that workflow
 * afterwards, and a person half-way through onboarding must not have the
 * remaining half rewritten under them — nor lose the record of what they
 * already did because the step it belonged to no longer exists.
 */
export interface Joiner {
  id: string;
  email: string;
  name: string;
  role: string;
  /** `YYYY-MM-DD`, the same date the invitation gave them. */
  startDate: string;
  /** Which account invited them, so one account can't read another's people. */
  accountEmail: string;
  company: string;
  workflowId: string;
  workflowName: string;
  steps: JoinerStep[];
  /** ISO. */
  invitedAt: string;
}

/** Where a magic link lands before it becomes a session. */
export const JOIN_PATH = "/showcase/join";
/** The new starter's own screen, once the link has been accepted. */
export const JOINER_HOME = "/showcase/me";
/** Separate from the admin's cookie: they are different people, possibly at once. */
export const JOINER_COOKIE = "craig_joiner";
