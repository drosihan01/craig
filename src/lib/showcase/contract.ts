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

import type { BlockKind } from "@/components/ui";

/* ---------------------------------------------------------------------- */
/*  Auth                                                                  */
/* ---------------------------------------------------------------------- */

export interface Session {
  email: string;
  /** Display name, derived from the email when there's nothing better. */
  name: string;
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
}

/**
 * A step in the workflow Craig drafts.
 *
 * `kind` is the closed set the builder's engine actually runs, asked of the
 * model directly rather than guessed from the title on the way in. A draft that
 * arrives as six blocks all typed "task" is a draft somebody has to redo.
 */
export interface WorkflowDraftStep {
  title: string;
  kind: BlockKind;
  /** A named person, or the new starter. */
  owner: string;
  /** What has to be true before it can run. */
  needs: string;
}

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
  | { type: "workflow"; steps: WorkflowDraftStep[] }
  /** A chunk of the answer. Append. */
  | { type: "delta"; text: string }
  /** The turn is finished. */
  | { type: "done" }
  /** Something failed. `message` is safe to show a user. */
  | { type: "error"; message: string };

export const CHAT_ENDPOINT = "/api/chat";
