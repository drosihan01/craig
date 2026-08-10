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
/*  Branding                                                              */
/* ---------------------------------------------------------------------- */

/**
 * The company's logo, as everything downstream of the upload sees it.
 *
 * It lives here rather than beside `Account` in `accounts.ts` because both ends
 * of the product need it and one of them runs in a browser: the Settings panel
 * that previews it and the email preview that draws it are `"use client"`, and
 * `accounts.ts` is `server-only`. A type in the contract is the seam those two
 * halves already meet at.
 *
 * ## The URL is public, and that is the whole design
 *
 * `url` is an ordinary `https://` address that anybody can fetch — no session,
 * no cookie, no signed token, no expiry. That is not a convenience, it is the
 * only shape that works: this URL's real reader is Gmail's image proxy or
 * Outlook opening a message three weeks after it arrived, neither of which has
 * ever heard of a Craig session, and a signed URL that has expired by then is a
 * broken image in a welcome email. `data:` is closed off too — Gmail, Outlook
 * and Apple Mail all strip or refuse it.
 *
 * So it follows that anybody who guesses one of these URLs can see it. Said out
 * loud, because a public bucket arrived at by accident is a leak and this one is
 * arrived at on purpose: what they get is a company's logo, the single most
 * published asset that company owns — it is on their website, their careers
 * page and their invoices. Nothing else is in the bucket, the object path names
 * nobody (see `accounts.ts`), and the private half of this product — documents,
 * transcripts, joiners — stays in the `documents` bucket, which is private and
 * signed and must never be made to look like this one.
 *
 * ## Why the size travels with it
 *
 * `width` and `height` are the picture's own, in pixels, read out of the file's
 * header when it was uploaded. An `<img>` in an email needs a real dimension
 * attribute — Outlook renders through Word, which scales an unsized image by
 * the system's DPI — and knowing the natural ratio is what lets the renderer
 * pick a width and be certain what height it will draw at. Everything about
 * *how big it appears* is decided in `lib/email/html.ts`; this is just the fact.
 */
export interface CompanyLogo {
  /** Absolute `https://`. Fetchable by a mail client with nothing attached. */
  url: string;
  /** The image's own pixel width, from its header. Always > 0. */
  width: number;
  /** The image's own pixel height, from its header. Always > 0. */
  height: number;
}

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
 * Three, because three are wired end to end. A workflow block can say "collect
 * their details" in a dozen ways, but a form can only be rendered for a field
 * somebody has written a form for — so this names the ones that exist rather
 * than pretending the set is open. A block that maps to none of them is real
 * work that simply isn't the new starter's to do here, and it says so.
 *
 * `personal-details` and `payroll-details` are the odd ones and the reason the
 * two above them no longer describe the shape. Those two name one input each and
 * are answered with one string; these are forms with a dozen boxes on them,
 * answered with a structured payload that is sealed before it touches the
 * database. See `PersonalDetails` and `PayrollDetails` below, and
 * `sealed-answer.ts` for the one envelope they share.
 */
export type JoinerField =
  | "middle-name"
  | "date-of-birth"
  | "personal-details"
  | "payroll-details";

/** Preset ids that produce a step the new starter can actually answer. */
export const JOINER_FIELD_BY_PRESET: Record<string, JoinerField> = {
  "middle-name": "middle-name",
  "date-of-birth": "date-of-birth",
  "personal-details": "personal-details",
  "payroll-details": "payroll-details",
};

/* --- Personal details ----------------------------------------------------- */

/**
 * Everything the "Personal details" block collects, as one answer.
 *
 * **Why one step and not twelve.** `joiner_steps.value` holds a single string
 * and `JoinerField` names a single input, so the obvious way to collect twelve
 * things was twelve steps — and it would have been a terrible product. A new
 * starter's screen shows one plan in the order it happens; twelve rows reading
 * "Provide your suburb", "Provide your postcode" is not a plan, it is a form
 * torn into strips and dealt out as chores, each with its own round trip and
 * its own tick. Worse, half of them only make sense together: an address is
 * one fact about somebody, not four, and a workflow that can be half-way
 * through an address is a workflow that can hold half an address.
 *
 * So the step keeps one answer and the answer has parts. `joiner_steps.run`
 * already puts a typed document in a column for the same reason — a run has
 * eight fields nobody queries individually — so this is the schema's own
 * precedent rather than a new idea. The difference is that a run is written by
 * us and this is written by a stranger's browser, which is why nothing that
 * arrives is trusted: `parsePersonalDetails` rebuilds this object field by
 * field from the request rather than casting it.
 *
 * **Flat, deliberately.** An address and an emergency contact are each a
 * grouping a person would draw, and nesting them would read better right here
 * and cost three special cases in every loop that touches the shape —
 * validating, sealing, masking, listing, rendering the form. `group` on the
 * field descriptor below carries the grouping for the one place that wants it,
 * which is the screen.
 *
 * **Australian, and it says so.** `state` is a state or territory and
 * `postcode` is four digits, because the spec this was built from says
 * "state/territory" and every date in this product is already formatted
 * `en-AU`. That is a real limit rather than an oversight: the day somebody
 * onboards in Auckland or Austin, this needs a country on it and the two
 * fields become "region" and "postal code" with per-country rules. Better to
 * name the assumption than to pretend a free-text address was universal.
 */
export interface PersonalDetails {
  /** As written on their passport or licence, not what they go by. */
  legalFirstName: string;
  /** Plural, and optional. Plenty of people have none and some have three. */
  middleNames?: string;
  legalSurname: string;
  /** What they'd like to be called, when that isn't their legal first name. */
  preferredName?: string;
  /** `YYYY-MM-DD`, same as every other date this product stores. */
  dateOfBirth: string;
  /** Their own address, not the one being created for them at work. */
  personalEmail: string;
  mobile: string;
  street: string;
  suburb: string;
  /** One of `AU_STATES`. Stored as the code, shown as the label. */
  state: string;
  postcode: string;
  /** Only when the admin asked for one — see `askEmergencyContact`. */
  emergencyName?: string;
  emergencyRelationship?: string;
  emergencyPhone?: string;
}

export type PersonalDetailKey = keyof PersonalDetails;

/**
 * How a field is entered, and — because the two are the same question asked
 * twice — how what comes back is checked.
 *
 * Not `FieldKind` from the block library. That vocabulary is for the *admin*
 * configuring a block ("person", "file", "when"); this one is for the new
 * starter answering one, and the overlap is two words out of six. Sharing them
 * would put the picker's file-upload kind in a union that has to be exhaustive
 * over a form that has no uploads.
 */
export type PersonalDetailKind =
  | "text"
  /** `YYYY-MM-DD` from a calendar, checked as a real date in the past. */
  | "date"
  | "email"
  /** Digits and the punctuation people put between them. */
  | "phone"
  /** A choice from `AU_STATES`. */
  | "state"
  /** Four digits. */
  | "postcode";

/** The heading a field sits under, on both screens. */
export type PersonalDetailGroup = "name" | "contact" | "address" | "emergency";

export interface PersonalDetailField {
  key: PersonalDetailKey;
  group: PersonalDetailGroup;
  kind: PersonalDetailKind;
  /** What the new starter is asked. Second person, because they're reading it. */
  label: string;
  /** What the admin's screen calls it. Third person, for the same reason. */
  adminLabel: string;
  hint?: string;
  /** Refused when empty. Absent means genuinely optional, not "nice to have". */
  required?: boolean;
  /**
   * Longest we'll store. Generous, because a name that doesn't fit is an
   * insult and the storage is a sealed blob rather than a column per field —
   * but bounded, because the payload is written by a stranger's browser.
   */
  max: number;
  /** The browser's own autofill hint. Filling this in from a saved profile is
      the one bit of this form nobody should have to type. */
  autoComplete?: string;
  /** Only asked when the admin ticked the emergency contact option. */
  emergency?: boolean;
}

/**
 * The whole form, once, as data.
 *
 * One list feeding five things — the joiner's form, the validator, the sealed
 * payload, the admin's masked summary and the revealed one — because the
 * alternative is five lists that agree until somebody adds a field to four of
 * them. The compiler catches a `key` that isn't on `PersonalDetails`; nothing
 * would have caught a field the form asks for and the validator drops.
 */
export const PERSONAL_DETAIL_FIELDS: readonly PersonalDetailField[] = [
  {
    key: "legalFirstName",
    group: "name",
    kind: "text",
    label: "Legal first name",
    adminLabel: "Legal first name",
    hint: "As it's written on your passport or licence.",
    required: true,
    max: 60,
    autoComplete: "given-name",
  },
  {
    key: "middleNames",
    group: "name",
    kind: "text",
    label: "Middle name or names",
    adminLabel: "Middle names",
    hint: "Leave it empty if you haven't got one.",
    max: 80,
    autoComplete: "additional-name",
  },
  {
    key: "legalSurname",
    group: "name",
    kind: "text",
    label: "Legal surname",
    adminLabel: "Legal surname",
    required: true,
    max: 60,
    autoComplete: "family-name",
  },
  {
    key: "preferredName",
    group: "name",
    kind: "text",
    label: "Preferred name",
    adminLabel: "Goes by",
    hint: "What you'd like to be called day to day, if it isn't the above.",
    max: 60,
    autoComplete: "nickname",
  },
  {
    key: "dateOfBirth",
    group: "name",
    kind: "date",
    label: "Date of birth",
    adminLabel: "Date of birth",
    hint: "Payroll needs this to match your ID exactly.",
    required: true,
    max: 10,
    autoComplete: "bday",
  },
  {
    key: "personalEmail",
    group: "contact",
    kind: "email",
    label: "Personal email",
    adminLabel: "Personal email",
    hint: "Your own address — not the work one being set up for you.",
    required: true,
    max: 120,
    autoComplete: "email",
  },
  {
    key: "mobile",
    group: "contact",
    kind: "phone",
    label: "Mobile number",
    adminLabel: "Mobile",
    required: true,
    max: 24,
    autoComplete: "tel",
  },
  {
    key: "street",
    group: "address",
    kind: "text",
    label: "Street address",
    adminLabel: "Street",
    hint: "Unit or apartment number too, if you have one.",
    required: true,
    max: 120,
    autoComplete: "street-address",
  },
  {
    key: "suburb",
    group: "address",
    kind: "text",
    label: "Suburb",
    adminLabel: "Suburb",
    required: true,
    max: 80,
    autoComplete: "address-level2",
  },
  {
    key: "state",
    group: "address",
    kind: "state",
    label: "State or territory",
    adminLabel: "State",
    required: true,
    max: 3,
    autoComplete: "address-level1",
  },
  {
    key: "postcode",
    group: "address",
    kind: "postcode",
    label: "Postcode",
    adminLabel: "Postcode",
    required: true,
    max: 4,
    autoComplete: "postal-code",
  },
  {
    key: "emergencyName",
    group: "emergency",
    kind: "text",
    label: "Their name",
    adminLabel: "Emergency contact",
    required: true,
    emergency: true,
    max: 80,
  },
  {
    key: "emergencyRelationship",
    group: "emergency",
    kind: "text",
    label: "Their relationship to you",
    adminLabel: "Relationship",
    hint: "Partner, parent, friend — whatever they are to you.",
    required: true,
    emergency: true,
    max: 40,
  },
  {
    key: "emergencyPhone",
    group: "emergency",
    kind: "phone",
    label: "Their phone number",
    adminLabel: "Emergency phone",
    required: true,
    emergency: true,
    max: 24,
  },
];

/** The headings, in the order the form asks for them. */
export const PERSONAL_DETAIL_GROUPS: {
  id: PersonalDetailGroup;
  label: string;
}[] = [
  { id: "name", label: "Who you are" },
  { id: "contact", label: "How to reach you" },
  { id: "address", label: "Where you live" },
  { id: "emergency", label: "Who to call if something happens" },
];

/**
 * States and territories, as codes.
 *
 * A select rather than a text box, because "NSW", "N.S.W.", "New South Wales"
 * and "nsw" are one fact typed four ways, and whoever eventually pushes this
 * into a payroll system will have to reconcile them. The code is stored and the
 * label is shown, which is the same rule the block library's `when` fields
 * follow: ids persist, labels are for reading.
 */
export const AU_STATES: { id: string; label: string }[] = [
  { id: "ACT", label: "Australian Capital Territory" },
  { id: "NSW", label: "New South Wales" },
  { id: "NT", label: "Northern Territory" },
  { id: "QLD", label: "Queensland" },
  { id: "SA", label: "South Australia" },
  { id: "TAS", label: "Tasmania" },
  { id: "VIC", label: "Victoria" },
  { id: "WA", label: "Western Australia" },
];

/**
 * The setup field the admin ticks to also ask for an emergency contact, and
 * the option inside it.
 *
 * Named here rather than typed into the preset, the invite route and the
 * snapshot separately, because those three have to agree on the string and a
 * literal in each is three chances to typo one. The symptom of a typo would be
 * a tick box that changes nothing — the worst kind, because the admin can see
 * they ticked it.
 *
 * **Why it is configurable at all.** Every other field on this block is
 * something an employer must have: you cannot pay somebody without their legal
 * name and you cannot verify them without a date of birth. An emergency
 * contact is different. It is a *third party's* name and phone number, given by
 * somebody who was not asked and cannot object, and plenty of companies have
 * no business holding one — a fully remote contractor's next of kin is not
 * their client's information. So it is asked when somebody decides to ask,
 * which is also the shape the law tends to want: collect what you need for a
 * stated purpose, and no more.
 */
export const PERSONAL_DETAILS_EXTRAS_FIELD = "extras";
export const EMERGENCY_CONTACT_EXTRA = "emergency-contact";

/**
 * One line of the answer as a screen shows it, either masked or in full.
 *
 * The same shape both ways round on purpose. The admin's page renders a list of
 * these masked, presses Reveal, and renders the same list with real values in
 * it — one component, one layout, and no chance of the revealed view showing a
 * field the masked view didn't admit existed.
 */
export interface DetailLine {
  key: PersonalDetailKey;
  group: PersonalDetailGroup;
  label: string;
  /** Masked or plain, depending on which way it was built. */
  value: string;
  /** Whether `value` has been through the mask. Drives nothing but the styling
      — a masked line is set in a mono face so the dots line up. */
  masked: boolean;
}

/** Where the admin asks to see somebody's sealed answers in full — either
    block's. One route for both: the check it performs is "is this person yours
    and is this step of theirs sealed", which does not vary by which form it
    was. */
export const DETAILS_ENDPOINT = "/api/showcase/details";

/* --- Payroll details ------------------------------------------------------ */

/**
 * Everything the "Payroll details" block collects, as one answer.
 *
 * **The other half of the paperwork, and only the other half.** The identity
 * block took the legal name, the date of birth, the contact details and the
 * address, and left a note in the library saying this block should therefore
 * drop them. It has. Asking somebody their legal name twice in one onboarding
 * teaches them something true about how joined-up the company is, and the two
 * halves are not the same kind of thing anyway: identity is a set of facts about
 * a person, and this is a set of instructions about money. The blocks can sit in
 * one workflow and between them ask each question once.
 *
 * **There is no payroll provider, and that decides the scope.** Craig does not
 * forward any of this to Deel, Gusto, Xero or anything else, and — Dzaky's call
 * — will not. The admin reads it off their screen and pays the person by bank
 * transfer themselves. Two consequences follow and both are load-bearing.
 *
 * The first is that "don't store it" was never available. A value that has to be
 * read by a human next Tuesday has to be somewhere on Tuesday, so sealing is not
 * a nice-to-have on this block; it is the only thing standing between a bank
 * account number and a plaintext column. `sealed-answer.ts` is the envelope, the
 * same one the identity block uses.
 *
 * The second is what is *absent*: there is no `system` field. The preset used to
 * offer Deel / Remote / Gusto / "Spreadsheet, for now", which was a choice
 * between four behaviours that were all one behaviour. See the library for that
 * argument written out where somebody choosing the block will read it.
 *
 * **Australian, and it says so** — the same limit the identity block named
 * rather than pretended away, and a harder one. A BSB is not a sort code and is
 * not a routing number; superannuation has no equivalent in most of the world;
 * and the tax-free threshold is a question off an ATO form. A person hired in
 * Auckland or Austin does not have a smaller version of this — they have a
 * different form entirely, and the honest response the day that happens is a
 * second block rather than a `country` field bolted onto this one.
 *
 * **Flat, deliberately**, for the reason `PersonalDetails` gives: nesting the
 * bank account and the super fund would read better in this one declaration and
 * cost three special cases in every loop that touches the shape. `group` on the
 * field descriptor carries the grouping for the one place that wants it.
 */
export interface PayrollDetails {
  /** The name on the account, which is often not the name on their passport —
      a joint account, a maiden name, a trading name for a contractor. */
  accountName: string;
  /** Six digits, stored as `123-456`. The branch, not the account. */
  bsb: string;
  /** Digits only once stored. Australian account numbers run about 5–10. */
  accountNumber: string;
  /**
   * `yes` or `no`, from `TAX_FREE_THRESHOLD_OPTIONS`.
   *
   * A real question off the ATO's tax file number declaration, and the one
   * answer here that changes what somebody is paid: claiming it from two
   * employers at once is the most common way a person ends up with a tax bill
   * they were not expecting.
   */
  claimsTaxFreeThreshold: string;
  /**
   * Only when the admin asked for the TFN. Optional even then, and that is a
   * legal requirement rather than a kindness — see `TFN_NOTICE`.
   */
  taxFileNumber?: string;
  /** The three below are only asked when the admin ticked the super fund
      option, and are optional even then — see `PAYROLL_DETAIL_FIELDS`. */
  superFundName?: string;
  /** The fund's USI, or its ABN. Both identify the fund rather than the
      person, which is why neither is masked. */
  superUsi?: string;
  superMemberNumber?: string;
}

export type PayrollDetailKey = keyof PayrollDetails;

/**
 * How a payroll field is entered, and how what comes back is checked.
 *
 * Its own vocabulary rather than `PersonalDetailKind`'s, and the overlap is one
 * word out of six. Sharing them would put `postcode` and `state` in a union that
 * has to be exhaustive over a form with no address on it, and would mean the day
 * somebody changes what a phone number is they change what a BSB is.
 */
export type PayrollDetailKind =
  | "text"
  /** Six digits, conventionally written `123-456`. */
  | "bsb"
  /** Digits, however many they put between them. */
  | "account-number"
  /** Eight or nine digits, checksummed where the ATO's algorithm applies. */
  | "tfn"
  /** A fund's USI or ABN — alphanumeric, loosely bounded. */
  | "usi"
  /** One of the field's own `options`. */
  | "choice";

/** The heading a payroll field sits under, on both screens. */
export type PayrollDetailGroup = "bank" | "tax" | "super";

/**
 * The two things an admin can decide to also ask for.
 *
 * Named as a union rather than left as loose strings, so a field can declare
 * which tick governs it and the compiler can insist the tick exists. Both are
 * *off* by default, which is the whole design: the block collects what you
 * cannot pay somebody without, and everything beyond that is somebody
 * deliberately deciding to hold more.
 */
export type PayrollExtra = "super-fund" | "tax-file-number";

export interface PayrollDetailField {
  key: PayrollDetailKey;
  group: PayrollDetailGroup;
  kind: PayrollDetailKind;
  /** What the new starter is asked. Second person, because they're reading it. */
  label: string;
  /** What the admin's screen calls it. Third person, for the same reason. */
  adminLabel: string;
  hint?: string;
  /** Refused when empty. Absent means genuinely optional, not "nice to have". */
  required?: boolean;
  /** Longest we'll store. Bounded because the payload is written by a
      stranger's browser; generous because a fund's name can be long. */
  max: number;
  /** For `kind: "choice"`. Ids persist, labels are for reading — the same rule
      the block library's `when` fields follow. */
  options?: { id: string; label: string }[];
  autoComplete?: string;
  /** Only asked when the admin ticked this option. Absent means always asked. */
  extra?: PayrollExtra;
}

/**
 * Claiming the tax-free threshold, as the ATO asks it.
 *
 * A choice rather than a tick box, and the difference matters on a form
 * somebody fills in once. An unticked box is indistinguishable from a box
 * nobody read, and the two answers have opposite consequences for what lands in
 * their account — so this makes them say which, rather than defaulting somebody
 * into the more common one and being wrong for the person with two jobs.
 */
export const TAX_FREE_THRESHOLD_OPTIONS: { id: string; label: string }[] = [
  { id: "yes", label: "Yes — this is my main job" },
  { id: "no", label: "No — I claim it somewhere else" },
];

/**
 * What the new starter must be told when a tax file number is asked for.
 *
 * **Not copy. A legal requirement, quoted where it is enforceable.** The Privacy
 * (Tax File Number) Rule 2015, made under s 17 of the Privacy Act 1988, requires
 * a TFN recipient collecting TFN information to inform the individual of the law
 * authorising the collection, the purpose, **that declining is not an offence**,
 * and what happens if they decline. All four are in the sentences below, and the
 * third is the one that decides the shape of the field: `taxFileNumber` is
 * optional even when the admin has asked for it, because a form that refuses to
 * submit without one is a form that has made declining an offence in practice
 * whatever it says underneath.
 *
 * `payroll-details.ts` carries the rest of the obligation — the collection
 * purpose test, the use-as-identifier prohibition, the destruction rule, and the
 * argument that Craig should probably not be holding one of these at all.
 */
export const TFN_NOTICE = {
  /** Under the field itself, where somebody deciding whether to type it looks. */
  hint: "You don't have to give this, and it isn't an offence to leave it blank — but without it your employer has to withhold tax at the highest rate.",
  /** Under the group, saying who is asking and what for. */
  purpose:
    "Your employer asks for this under the Taxation Administration Act, so they can work out how much tax to withhold from your pay. It's encrypted here and it isn't sent anywhere else.",
} as const;

/**
 * The whole payroll form, once, as data.
 *
 * One list feeding five things — the joiner's form, the validator, the sealed
 * payload, the admin's masked summary and the revealed one — because the
 * alternative is five lists that agree until somebody adds a field to four of
 * them. The compiler catches a `key` that isn't on `PayrollDetails`; nothing
 * would have caught a field the form asks for and the validator drops.
 *
 * **Why the super fields are optional even when asked**, which is a departure
 * from the emergency contact's all-or-nothing rule and is deliberate. An
 * emergency contact with a name and no number is not somebody you can call, so
 * half of one is worth nothing. A super fund is different: in Australia an
 * employee who names no fund is paid into their stapled fund or the employer's
 * default, which is a real and common outcome rather than a failure — and plenty
 * of first-job starters genuinely have no fund yet. Requiring it would trap
 * exactly the people it is most likely to be a first job for.
 */
export const PAYROLL_DETAIL_FIELDS: readonly PayrollDetailField[] = [
  {
    key: "accountName",
    group: "bank",
    kind: "text",
    label: "Account name",
    adminLabel: "Account name",
    hint: "Exactly as it appears on your statement.",
    required: true,
    max: 80,
  },
  {
    key: "bsb",
    group: "bank",
    kind: "bsb",
    label: "BSB",
    adminLabel: "BSB",
    hint: "Six digits, usually written 123-456.",
    required: true,
    /* `123-456` is seven characters. Stored normalised, so the cap is the
       stored form rather than the longest thing somebody might type. */
    max: 7,
    autoComplete: "off",
  },
  {
    key: "accountNumber",
    group: "bank",
    kind: "account-number",
    label: "Account number",
    adminLabel: "Account number",
    hint: "Usually between five and ten digits.",
    required: true,
    max: 10,
    autoComplete: "off",
  },
  {
    key: "claimsTaxFreeThreshold",
    group: "tax",
    kind: "choice",
    label: "Are you claiming the tax-free threshold from this job?",
    adminLabel: "Tax-free threshold",
    hint: "Claim it from the job that pays you most, and only from one at a time.",
    required: true,
    max: 3,
    options: TAX_FREE_THRESHOLD_OPTIONS,
  },
  {
    key: "taxFileNumber",
    group: "tax",
    kind: "tfn",
    label: "Tax file number",
    adminLabel: "Tax file number",
    hint: TFN_NOTICE.hint,
    /* Never `required`. See `TFN_NOTICE` — declining is not an offence, and a
       form that will not submit without one has quietly made it one. */
    max: 11,
    autoComplete: "off",
    extra: "tax-file-number",
  },
  {
    key: "superFundName",
    group: "super",
    kind: "text",
    label: "Super fund name",
    adminLabel: "Super fund",
    hint: "Leave the whole section blank if you haven't got a fund yet — you'll be asked again.",
    max: 100,
    extra: "super-fund",
  },
  {
    key: "superUsi",
    group: "super",
    kind: "usi",
    label: "Fund USI or ABN",
    adminLabel: "Fund USI / ABN",
    hint: "It's on your fund's statement, or on their website.",
    max: 24,
    extra: "super-fund",
  },
  {
    key: "superMemberNumber",
    group: "super",
    kind: "text",
    label: "Your member number",
    adminLabel: "Member number",
    max: 40,
    extra: "super-fund",
  },
];

/** The headings, in the order the form asks for them. */
export const PAYROLL_DETAIL_GROUPS: {
  id: PayrollDetailGroup;
  label: string;
}[] = [
  { id: "bank", label: "Where your pay goes" },
  { id: "tax", label: "Tax" },
  { id: "super", label: "Your super fund" },
];

/**
 * The setup field the admin ticks to ask for more than the minimum, and the two
 * options inside it.
 *
 * Named here rather than typed into the preset, the invite route and the
 * snapshot separately, because those three have to agree on the strings and a
 * literal in each is three chances to typo one. The symptom of a typo would be a
 * tick box that changes nothing — the worst kind, because the admin can see they
 * ticked it.
 *
 * Its own field id rather than sharing `PERSONAL_DETAILS_EXTRAS_FIELD`. The two
 * blocks can sit in one workflow, each holding its own config, and a shared id
 * would be readable — right up until somebody reasonably assumed one list of
 * extras and put an emergency contact tick on a payroll block.
 *
 * **Why either is configurable at all**, which is the same argument the
 * emergency contact makes and a stronger one each time. The bank details are
 * something an employer cannot do without: there is no paying somebody by bank
 * transfer without an account to transfer to. The other two are not.
 *
 * A super fund is a choice the employee may not have made yet, and an employer
 * who is going to pay into the stapled fund has no use for the question.
 *
 * A tax file number is in a category of its own, and the tick is the mechanism
 * that keeps it out of a default deployment: it is regulated under the Privacy
 * (Tax File Number) Rule 2015 as well as the Privacy Act, its misuse is an
 * offence under the Taxation Administration Act rather than merely a privacy
 * interference, and — the part that decides it here — Craig has no payroll
 * system to compute withholding in, so nothing in this product does the one job
 * that would authorise collecting it. `payroll-details.ts` argues that out in
 * full. Off by default is the least this file can do about it; deleting the
 * option outright is the recommendation.
 */
export const PAYROLL_DETAILS_EXTRAS_FIELD = "payroll-extras";

/**
 * Every block config key that carries "which extra fields did the admin tick".
 *
 * One list, because the two places that read it are a browser and a server and
 * the failure mode when they disagree is silence. The invite client strips
 * anything not named here before the request is sent; the invite route accepts
 * only what is named here after it arrives. A key present in one list and
 * absent from the other means the admin ticks a box, publishes, invites, and
 * the new starter is never asked — with nothing thrown, nothing logged, and a
 * step that renders correctly with the field simply missing.
 *
 * That has now happened twice, once per block that added a multiselect. Adding
 * a third means adding its id here and nowhere else.
 */
export const EXTRAS_FIELDS = [
  PERSONAL_DETAILS_EXTRAS_FIELD,
  PAYROLL_DETAILS_EXTRAS_FIELD,
] as const;
export const SUPER_FUND_EXTRA: PayrollExtra = "super-fund";
export const TAX_FILE_NUMBER_EXTRA: PayrollExtra = "tax-file-number";

/**
 * One line of a payroll answer as a screen shows it, masked or in full.
 *
 * A sibling of `DetailLine` rather than the same type, because `key` and `group`
 * are drawn from different unions and collapsing them to `string` would lose the
 * one property those fields are typed for. The two are structurally identical
 * otherwise, which is what lets one component render either — see
 * `SealedLines` on the admin's page.
 */
export interface PayrollDetailLine {
  key: PayrollDetailKey;
  group: PayrollDetailGroup;
  label: string;
  /** Masked or plain, depending on which way it was built. */
  value: string;
  /** Whether `value` has been through the mask. Drives nothing but the styling. */
  masked: boolean;
}

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
  /**
   * Only on `field: "personal-details"`. Whether that form also asks who to
   * call in an emergency.
   *
   * Snapshotted off the block's setup when the invitation went out, for exactly
   * the reason the steps themselves are snapshotted: the admin can untick that
   * option afterwards, and somebody half-way through the form must not have a
   * question vanish under them — nor have one appear the morning after they
   * finished. It is stored per step rather than looked up from the workflow for
   * the same reason `title` and `due` are.
   *
   * Absent reads as false, which is what every step written before this
   * existed means.
   */
  askEmergencyContact?: boolean;
  /**
   * Only on `field: "payroll-details"`. Whether that form also asks for their
   * super fund, and whether it also asks for their tax file number.
   *
   * Snapshotted at invitation time for exactly the reason `askEmergencyContact`
   * above is: the admin can untick either afterwards, and somebody half-way
   * through the form must not have a question vanish under them, nor find one
   * has appeared the morning after they finished.
   *
   * `askTaxFileNumber` carries more than a form's shape. It is the record that
   * somebody deliberately decided to collect a regulated identifier on this
   * onboarding — which, under the TFN Rule's security and destruction
   * obligations, is a fact an employer may one day have to be able to state
   * about a particular person rather than about the product in general. It is
   * its own column for that reason as much as for the form's.
   *
   * Both absent read as false, which is what every step written before they
   * existed means.
   */
  askSuperFund?: boolean;
  askTaxFileNumber?: boolean;
  /** Only on `actor: "craig"` steps. Which job it is Craig goes and does. */
  automation?: StepAutomation;
  /**
   * Whether this step waits for a second factor as well as for acceptance.
   *
   * Copied onto the step when somebody is invited rather than read live from
   * the workflow, so editing the workflow afterwards cannot reopen a step that
   * already completed under the old rule. A run is judged by what was asked of
   * it at the time.
   *
   * Only meaningful on the Google Workspace automation today. Absent means
   * false, which is what every step on disk before this meant.
   */
  requireMfa?: boolean;
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
  /**
   * What they gave, once they've given it.
   *
   * Plaintext, and it stays that way for the two fields that are one short
   * string. A `personal-details` step has **nothing here even when it is
   * finished**: its answer is sealed into columns of its own and never travels
   * on this record, so everything that reads a `Joiner` — the admin's page, the
   * joiner's own Craig, a future export — gets silence rather than an identity
   * bundle it never asked for. `completedAt` is what says the step is done;
   * `personal-details.ts` is the only door to what was said.
   */
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
  /**
   * How many times Craig has chased them, and when he last did.
   *
   * On the person rather than on each step, because a chase is one email about
   * everything they still owe. See `nudges.ts` for the cadence and for why
   * there is a ceiling on it at all.
   */
  nudgeCount: number;
  /** ISO, or null if he never has. */
  nudgedAt: string | null;
  /**
   * When Craig stopped chasing and told the admin instead, if he has.
   *
   * Set once. It is both the record of the handover and the thing that stops
   * it happening twice — an escalation that repeats is the nagging it was
   * supposed to replace, aimed at somebody else.
   */
  handedOverAt: string | null;
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
