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
export const SIGN_IN_PATH = "/sign-in";
/**
 * Home, and the first thing anybody sees after signing in.
 *
 * It used to be `/welcome`, which is the screen where Craig drafts your first
 * workflow — right for somebody's first ten minutes and wrong every time after
 * that, because it dropped a returning admin straight into building rather than
 * into their own company. Home decides which of the two you actually want: an
 * account with nothing in it is still sent on to `/welcome`, once.
 */
export const AFTER_SIGN_IN = "/";

/** Where Craig's account-wide conversation lives. Same path; named for callers
    that mean "home" rather than "wherever sign-in goes". */
export const HOME_PATH = "/";

/** The first run, and only the first run. Home forwards to it when there is
    nothing to come home to. */
export const WELCOME_PATH = "/welcome";

/**
 * Seats, and where Stripe sends somebody back to.
 *
 * A constant because the two places that need it are *outside* the app: the
 * checkout session's cancel URL and the billing portal's return URL are built
 * into strings we hand to Stripe, and they both still read `/showcase/people`
 * long after that prefix was removed. Nothing caught it — a template literal
 * does not match a search for the quoted path, and neither redirect is
 * exercised by a build or by any screen, so the only way to find out was to
 * cancel a real checkout and land on a 404.
 *
 * Named here so the next rename moves them with everything else.
 */
export const PEOPLE_PATH = "/people";
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
  /**
   * What it is currently called.
   *
   * Sent because without it he cannot answer "what's this one called?" except
   * by inventing something, and because a rename to the name it already has
   * should be a no-op rather than an edit. Absent on a client that predates
   * this, which reads as "don't claim to know".
   */
  name?: string;
  steps: OpenStep[];
  /**
   * What is standing between this workflow and being publishable, in words.
   *
   * Sent to Craig rather than worked out by him, and the difference matters:
   * half of it isn't knowable from the steps. A missing Google connection is a
   * fact about the account, and a model asked to infer it from a list of blocks
   * would either miss it or invent it. So the screen derives the list — where
   * it cannot be wrong — and he is told, so that "what's left?" gets the same
   * answer from him as from the interface beside him.
   *
   * Absent during discovery, when there is no workflow to be blocked.
   */
  outstanding?: string[];
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
  /**
   * The turn came from Home rather than the builder.
   *
   * Both send no workflow, so without this the route cannot tell a status
   * conversation from a discovery one — and they want opposite tools. See
   * `home` on the notebook in `craig-agent.ts`.
   */
  home?: boolean;
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
  | { type: "step-removed"; stepId: string }
  /**
   * The workflow's own name — the one thing he can change that is not a step.
   *
   * Whole rather than merged, because a name has no parts. Trimmed, collapsed
   * and capped on the server before it reaches here, so what arrives is
   * something that will fit in a list row.
   *
   * It exists because the alternative was worse than a missing feature. Asked
   * to rename a workflow, Craig replied "The workflow has been named 'aus
   * workflow'" and nothing happened — a product built to be trusted with work
   * nobody is watching, confidently reporting work it had not done. Nothing in
   * the product could rename a workflow at all: no store writer, no edit, no
   * control in the editor. The name was fixed at birth.
   */
  | { type: "renamed"; name: string };

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
  /**
   * Craig offering to start a workflow, from a conversation that cannot build
   * one.
   *
   * Home is a different room from the builder on purpose, and the price of that
   * is a dead end: somebody describes a new starter to Craig on Home and the
   * answer he wants to give — "let's build that" — is a thing he has no tool
   * for there. `draft_workflow` deliberately is not offered on Home, because a
   * workflow drafted out of a status conversation arrives in the account with
   * nobody having watched it being made.
   *
   * So this is not the workflow. It is a door: the screen draws a control, and
   * pressing it carries the person into the room where workflows are built,
   * with the new conversation recording which one it came from. Nothing else
   * travels — the handover is only that they want to make one, which the
   * builder's own opening question already assumes.
   */
  | { type: "offer"; offer: "new-workflow" }
  /** A chunk of the answer. Append. */
  | { type: "delta"; text: string }
  /** The turn is finished. */
  | { type: "done" }
  /** Something failed. `message` is safe to show a user. */
  | { type: "error"; message: string };

export const CHAT_ENDPOINT = "/api/chat";

/**
 * The same conversation for the person being onboarded, at its own door.
 *
 * A separate route rather than a flag on the one above, because the two are
 * authenticated by two different cookies naming two different people — and
 * because the joiner's Craig has no tools, which is the access boundary rather
 * than a missing feature. `joiner-agent.ts` makes that argument in full.
 */
export const JOINER_CHAT_ENDPOINT = "/api/joiner/chat";

/**
 * The sentence the Generate button sends.
 *
 * Here rather than beside the button, because both ends need it: the transcript
 * sends it, and the chat route reads it to decide whether Craig is allowed to
 * draft at all. It lived in `craig-conversation.tsx` while only the client
 * cared — but that file is `"use client"`, and importing a client module into a
 * route handler to borrow a string is how a `localStorage` reference eventually
 * ends up on the server.
 */
export const DRAFT_REQUEST =
  "Draft the workflow from what I've told you so far.";

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

/**
 * The things Craig does himself, keyed by the preset that produces them.
 *
 * The third kind of step, and the first one in this product that is work rather
 * than bookkeeping. A joiner step waits for somebody to type; an admin step
 * waits for somebody to say they did it; this one waits for nobody, because
 * when the step before it completes Craig goes and does it.
 *
 * A map rather than a set, deliberately, and the same shape as
 * `JOINER_FIELD_BY_PRESET` for the same reason: a preset is the admin's choice
 * of block and the automation is what that choice *means* here, and the two are
 * not the same list. Two presets could one day want the same automation with
 * different wording, and a set would have collapsed that into "is it one of the
 * automated ones" — which is the question, right up until somebody adds the
 * second entry.
 */
export type StepAutomation = "google-workspace";

export const AUTOMATION_BY_PRESET: Record<string, StepAutomation> = {
  "google-workspace": "google-workspace",
};

/** Who a step is waiting on. Absent means neither — nothing to do here yet. */
export type StepActor = "joiner" | "admin" | "craig";

/**
 * Where an automated step has got to.
 *
 * Done and not-done is enough for a step a person completes, because a person
 * completing something is instantaneous from the outside — they either typed it
 * or they didn't. A step that reaches across the internet is not: it can be
 * queued behind something, in flight, finished, or broken, and every one of
 * those is a different sentence on both screens.
 *
 * `awaiting` is the state the other four don't cover and the one this feature
 * turns on. The account exists — that happened in a second, weeks before
 * anybody uses it — but an account nobody has signed into is not a person with
 * an email address. Google says so itself, in `agreedToTerms`, and this is the
 * state we sit in while we wait for that to flip. Folding it into `done` would
 * mean the step reported itself complete at the moment it was least true, and
 * folding it into `running` would claim something is happening when nothing is.
 */
export type RunState =
  /** Not attempted, or attempted and there was nothing to attempt it with. */
  | "waiting"
  /** Claimed. Something is in flight, or was when the process last spoke. */
  | "running"
  /** The seat exists and nobody has taken it yet. */
  | "awaiting"
  /** They signed in and accepted. This is what completes the step. */
  | "done"
  /** It broke, and somebody has to do something about it. */
  | "failed";

/**
 * Why a run is where it is, in the only three flavours the screens branch on.
 *
 * Named for who has to act rather than for what Google said, because that is
 * the distinction the interface is built on and the one it is easiest to get
 * wrong. `src/lib/google/result.ts` makes the argument at length: two of its
 * failure reasons are not failures at all, and a screen that paints them red is
 * lying about a product that spends most of its life in them.
 *
 * The Google reason itself is deliberately *not* stored. It would be a second
 * vocabulary, imported from a `server-only` module into a record that a client
 * component reads — and the three cases below are the whole of what anybody
 * renders differently. The specifics travel in `message`, which is already a
 * sentence written for a person.
 */
export type RunProblem =
  /** Nobody has connected Google Workspace. Calm: it is a to-do, not a fault. */
  | "not-set-up"
  /** They connected and it has stopped working. Loud: new starters are stuck. */
  | "needs-reconnect"
  /** Google, or we, refused. Loud, and the message says what happened. */
  | "refused";

/**
 * What an automated step has done so far, and the record that stops it doing it
 * twice.
 *
 * This is the stored state the whole double-run guard rests on. Nothing here is
 * derived at read time and nothing here is optimistic: `state` moves to
 * `running` in the same synchronous turn that decides to run, *before* anything
 * leaves the process, so a second request arriving a millisecond later reads
 * `running` and stands down. See `claimAutomatedStep` in `joiners.ts`.
 *
 * What is conspicuously absent is the temporary password. It is generated
 * inside `createUser`, handed to one email, and dropped — see the note on
 * `CreatedSeat` in `directory.ts`, and the report. Storing it would put a live
 * credential for somebody's work account in a JSON file on disk, readable by
 * anything that can read the joiner store, to save an administrator one click
 * in a console they already have open.
 */
export interface StepRun {
  state: RunState;
  /**
   * ISO. When the current attempt claimed the step — the timestamp on the lock.
   *
   * Its only job is to tell a run that is happening from a run that stopped
   * happening without saying so, which is what a process killed mid-flight
   * leaves behind. A `running` older than a couple of minutes is not running.
   */
  startedAt?: string;
  /** ISO. When it stopped, however it stopped. */
  endedAt?: string;
  /** Which kind of stuck this is. Absent on a run that hasn't been tried. */
  problem?: RunProblem;
  /**
   * Safe to show the admin, and never shown to the new starter.
   *
   * Written for somebody who can act: which environment variable is missing,
   * who has to reconnect, that the tenant is out of licences. None of that is
   * the new starter's business or within their power, so their screen says
   * their account is being set up and stops there.
   */
  message?: string;
  /**
   * The address the seat was created at.
   *
   * Derived rather than random — first name, surname, the customer's domain —
   * which is what makes an interrupted run recoverable: the address a lost
   * attempt would have used can be worked out again and looked up, so "did it
   * get through?" is a question with an answer rather than a guess.
   */
  seatEmail?: string;
  /** ISO, as Google returned it. */
  seatCreatedAt?: string;
  /**
   * Why the welcome email didn't go, when it didn't.
   *
   * Its own field rather than a `failed` state, because the two failures are
   * not the same size: the account exists and is fine, and only the one copy of
   * the password is gone. That needs saying loudly to the admin — an
   * administrator has to reset it in the Google console — without reporting a
   * seat that was created successfully as a seat that wasn't.
   */
  emailProblem?: string;
  /** ISO. The last time Google was asked whether they'd accepted. */
  checkedAt?: string;
}

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
  /** Only on `actor: "craig"` steps. Which job it is Craig goes and does. */
  automation?: StepAutomation;
  /**
   * Only on `actor: "craig"` steps. How far that job has got.
   *
   * Optional because it is optional on disk: the store predates this and holds
   * people invited before automated steps existed. Everything that reads it
   * treats absent as `waiting`, which is what those steps have always been.
   */
  run?: StepRun;
  /**
   * Days from their first day, copied off the block when they were invited.
   *
   * Snapshotted with the rest of the step for the same reason: the admin can
   * move a deadline afterwards, and somebody who was told Thursday should not
   * find it silently became Tuesday. Absent when the step has no deadline,
   * which is most of them.
   */
  due?: number;
  /** What they gave, once they've given it. */
  value?: string;
  /**
   * ISO. The one field that means "this step is finished", whoever finished it.
   *
   * Set with `value` when the new starter answers, on its own when the admin
   * ticks, and together with `run.state: "done"` when Google says the person
   * has accepted their seat. Deliberately still the single thing `progressOf`
   * and both screens read: a third kind of step arriving with a third way of
   * being complete is how a progress bar starts disagreeing with the list under
   * it.
   */
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
export const JOIN_PATH = "/join";
/** The new starter's own screen, once the link has been accepted. */
export const JOINER_HOME = "/me";
/**
 * Where a new starter asks Craig, as its own room rather than a panel.
 *
 * A route rather than a drawer because it is a nav destination now: the joiner
 * gets the product's own shell, and a shell's nav points at addresses. It also
 * means the conversation survives a reload and can be linked to, neither of
 * which a panel managed.
 */
export const JOINER_ASK_PATH = "/me/ask";

/** Separate from the admin's cookie: they are different people, possibly at once. */
export const JOINER_COOKIE = "craig_joiner";

/* --- The subscription ----------------------------------------------------- */

/**
 * Where a subscription stands, in Stripe's own words.
 *
 * Copied rather than simplified, and that is the decision worth defending. The
 * obvious alternative — a boolean, or three names of our own — moves the
 * translation to whoever writes the webhook, which is the one place it must not
 * live: a status arrives as a string from Stripe, and code that has already
 * decided "this one counts as active" has thrown away the only thing anybody
 * could later check against Stripe's documentation.
 *
 * Note there is no `none`. An account nobody has ever paid for holds `null`,
 * which is a different fact from any status here — Stripe has no opinion about
 * a customer it has never met, and inventing one would put "never subscribed"
 * and "subscribed and cancelled" in the same field, which are opposite
 * sentences to the person reading the paywall.
 */
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "canceled"
  | "paused";

/**
 * The same statuses as a value, so a record off disk can be checked.
 *
 * Written directly under the union and maintained with it — a new status goes
 * in both or in neither. It is here rather than in the store because the union
 * is what it enumerates, and a list of strings kept in a different file from
 * the type it mirrors is a list that drifts silently: the compiler will catch a
 * member that isn't in the union, and nothing but proximity will catch a member
 * that is missing from the list.
 */
export const SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "canceled",
  "paused",
] as const satisfies readonly SubscriptionStatus[];

/**
 * What this deployment remembers about a Stripe subscription.
 *
 * A snapshot, not a cache to be trusted forever: Stripe is the record and this
 * is what it last told us. Everything here is either an identifier we need to
 * ask Stripe about it again, or a fact a screen has to be able to state without
 * a network call — because the screens that care are a paywall and a page
 * gating an invitation, and neither can afford to wait on Stripe to find out
 * whether somebody may add a colleague.
 *
 * Nothing in here is a credential. The two ids address objects in an account
 * only our secret key can reach, so they are safe to hand to a screen, which is
 * what lets the dialog say something true about a plan somebody already has.
 */
export interface Subscription {
  /** `cus_…`. Stable across subscriptions, which is what makes it the key. */
  customerId: string;
  /** `sub_…`. */
  subscriptionId: string;
  status: SubscriptionStatus;
  /**
   * What the plan entitles them to.
   *
   * From Stripe rather than from our own constant, because these two can
   * legitimately disagree — a price changes, somebody is on last year's plan,
   * support grants an extra seat — and when they do, the number the customer is
   * actually paying for is the true one. `PAID_SEATS` is what we offer; this is
   * what they bought.
   */
  seats: number;
  priceId: string;
  /** Unix seconds. */
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  /** ISO. When we last heard, so a stale record can be recognised as stale. */
  updatedAt: string;
}
