"use client";

import * as React from "react";
import { CHAT_ENDPOINT, type ChatEvent } from "@/lib/craig/contract";
import {
  addSource,
  addWorkflow,
  adoptThread,
  appendAnswer,
  applyEdit,
  beginTurn,
  openWorkflow,
  recordFact,
  recordGap,
  settleAnswers,
  showcaseState,
  useShowcase,
  type CraigMessage,
} from "@/lib/craig/store";
import { graduate, openThread } from "@/lib/craig/thread-sync";

/**
 * The conversation, from the screen's side.
 *
 * Everything the route knows about — models, keys, SSE frames, which provider
 * is even answering — stops at the fetch. What comes back out is a list of
 * turns, a line saying what he's doing, and two booleans. If this hook ever
 * needs changing because the model changed, the seam has leaked.
 *
 * No state is set in an effect, anywhere. React 19's lint rule fails the build
 * on it, and the rule is right here: the stream is an async handler that owns
 * its own updates, so there's nothing an effect would be synchronising to.
 *
 * `useAgentWork` from `@/components/ui` is deliberately not used. It runs a
 * fixed list of labels on a timer, which is exactly right for the scripted
 * demos it was built for and wrong here — these phases arrive from the server
 * when the work actually changes, and putting them on a beat would re-introduce
 * the pretending that this screen exists to stop. `AgentPhase` is the other
 * half of that file and does fit: pass it `phase` and it renders unchanged.
 *
 * The transcript itself is not in here. It's in the store, because the
 * conversation runs across two screens — discovery, then the workflow it
 * produced — and a thread that restarts when you open your own workflow is two
 * conversations pretending to be one. Notes and drafts were already written
 * there for the same reason: what a conversation produced outlives the page it
 * happened on. What stays local is what is only true of the turn in flight.
 *
 * Given a workflow id, the same hook is Craig in the editor: the workflow goes
 * out with each turn and his edits come back as events to apply. The tools
 * behind that only exist on a turn that carries one, so the id is the whole
 * difference between discovery and editing.
 */

export type { CraigMessage };

/** Something Craig wrote down. `gap` is the one worth showing prominently. */
export interface CraigNote {
  id: string;
  kind: "gap" | "fact";
  text: string;
}

/** A tool that really ran, while it's running and after. */
export interface CraigToolRun {
  id: string;
  label: string;
  running: boolean;
}

export interface CraigChat {
  messages: CraigMessage[];
  /** Adds the turn and streams the reply. Cancels any reply still arriving. */
  send: (text: string, attachments?: string[]) => void;
  /** What he's doing, or null. Feed it straight to `AgentPhase`. */
  phase: string | null;
  /**
   * Everything he's noted this session, oldest first.
   *
   * Accumulated rather than per-turn because it's the artefact the screen is
   * building — the list of things nobody had written down is what the person
   * takes away, and it would be a strange thing to clear when they type again.
   */
  notes: CraigNote[];
  /** The tools this turn ran. Cleared by the next send. */
  tools: CraigToolRun[];
  /** A turn is in flight. */
  busy: boolean;
  /** The last failure, in words a person can act on. Cleared by the next send. */
  error: string | null;
  /**
   * The workflow *this conversation* produced, once Craig's draft tool fires.
   *
   * Reported from the stream rather than inferred, and that is the whole point
   * of it existing. The welcome screen used to work this out by watching the
   * account's workflow count grow past what it was at mount, which cannot tell
   * "Craig just drafted one" from "the sync finished and told us about the
   * three you already had" — so a returning admin who opened this screen to
   * build a second workflow was thrown into the editor of their first the
   * moment `hydrate` landed.
   *
   * Null until it happens, and it only ever happens once per conversation.
   */
  drafted: string | null;
  /**
   * Craig has offered a door to somewhere he cannot go himself.
   *
   * Only ever `"new-workflow"` today: Home has no drafting tool, so when what
   * somebody describes needs a workflow that does not exist, the answer is a
   * control rather than a canvas.
   *
   * It stays up until the conversation changes. Clearing it on the next send
   * was the obvious reading — the door belongs to the answer that offered it —
   * and it was wrong in practice: somebody who keeps describing the role they
   * want watches the way out vanish mid-sentence, and Craig has no reason to
   * offer it twice because he already has. The offer is a standing fact about
   * this conversation, not a decoration on one turn of it.
   */
  offer: "new-workflow" | null;
}

/** Nothing here is persisted, so a counter is enough and stays stable in SSR. */
let nextNote = 0;
const noteId = () => `note-${++nextNote}`;

/**
 * The sentence out of a response that isn't a stream.
 *
 * Everything the route rejects before it starts streaming answers in JSON, and
 * the message it carries is already written to be shown to a person — "give it
 * a minute", "the account is out of credit". Collapsing all of those into one
 * generic line throws away the only part that told anybody what to do about it.
 *
 * `message` first: the limiter and the chat route both use it. `error` is what
 * the validation replies and the auth route use.
 */
async function failureFrom(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object") {
      const { message, error } = body as { message?: unknown; error?: unknown };
      for (const candidate of [message, error]) {
        if (typeof candidate === "string" && candidate.trim())
          return candidate.trim();
      }
    }
  } catch {
    /* A 502 from something in front of the app answers in HTML. */
  }
  return "Craig couldn't be reached. Try again.";
}

export function useCraigChat(
  workflowId?: string,
  /* What the screen already knows is blocking publication, so his answer to
     "what's left?" is the same as the one on screen beside him. */
  outstanding?: string[],
  /* Home. Both this and the builder send no workflow, and they want opposite
     tools — see `HOME_NOTE` in `craig-agent.ts`. */
  home = false,
): CraigChat {
  /* Which kind of conversation a first send should create. The editor never
     reaches this — its thread is opened on arrival, because a workflow's
     conversation is a thing that already exists. */
  const threadKind = home ? ("god" as const) : ("draft" as const);
  /* Through a ref so `send` keeps one identity. It changes whenever a field is
     answered, and rebuilding the callback on every keystroke would remount the
     composer under whoever is typing into it. */
  const outstandingRef = React.useRef(outstanding);
  outstandingRef.current = outstanding;

  const { messages, threadId } = useShowcase();
  const [phase, setPhase] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState<CraigNote[]>([]);
  const [tools, setTools] = React.useState<CraigToolRun[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [drafted, setDrafted] = React.useState<string | null>(null);
  const [offer, setOffer] = React.useState<"new-workflow" | null>(null);

  /**
   * The door belongs to the conversation it was offered in.
   *
   * It survives every turn *within* a thread — see `offer` on `CraigChat` — but
   * picking an older conversation out of the history, or starting a new one,
   * must not leave the previous one's offer standing over it.
   *
   * Adjusted during render rather than in an effect. React documents this as
   * the way to reset state when something it derives from changes, and it is
   * also the only way here: this codebase fails the build on `setState` in an
   * effect, and an effect would in any case paint the stale door for one frame
   * before removing it.
   */
  const [offerThread, setOfferThread] = React.useState(threadId);
  if (offerThread !== threadId) {
    setOfferThread(threadId);
    setOffer(null);
  }

  const abortRef = React.useRef<AbortController | null>(null);

  const send = React.useCallback(
    (text: string, attachments?: string[]) => {
      const content = text.trim();
      if (!content) return;

      /* A second send wins. The first one's partial answer stays on screen —
         it was really said, and deleting text somebody has already started
         reading is worse than leaving a short reply. */
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      /* The store decides both halves at once: what goes on screen, and what
         goes on the wire trimmed to the turns that still fit. */
      const { answerId, history } = beginTurn(content);

      /* The conversation comes into existence here rather than when the screen
         loaded, so glancing at a screen and leaving does not leave an empty
         thread in the history — and, on the builder, so that arriving starts a
         new conversation rather than resuming whichever old one the server
         found. Fired alongside the answer rather than before it: the turn is
         already on screen and already in the store, and making somebody wait on
         a round trip to *name* their conversation before Craig starts writing
         it would be the one latency this product cannot afford. `adoptThread`
         keeps the transcript and only attaches the id, so the sentence that
         caused the thread to exist is the first thing in it. */
      if (!showcaseState().threadId) {
        void openThread(threadKind).then((thread) => {
          /* Guarded, because opening is a fetch and somebody can navigate or
             pick a conversation out of history while it is in flight. Adopting
             then would move this turn into a thread it does not belong to. */
          if (thread && !showcaseState().threadId) adoptThread(thread.id);
        });
      }

      setError(null);
      setBusy(true);
      setPhase(null);
      setTools([]);

      const finish = () => {
        settleAnswers();
        setPhase(null);
        /* Nothing is still running once the turn is over, whatever the last
           event said — a stream that drops mid-tool would otherwise leave a
           spinner going forever. */
        setTools((prev) => prev.map((t) => ({ ...t, running: false })));
        setBusy(false);
      };

      void (async () => {
        try {
          /* Read at send time, not captured in a subscription — the route is
             stateless, so this is the only thing standing between Craig and
             asking her again what she told him two turns ago. */
          const store = showcaseState();

          const response = await fetch(CHAT_ENDPOINT, {
            method: "POST",
            signal: controller.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: history,
              attachments,
              known: {
                gaps: store.gaps.map((g) => g.text),
                facts: store.facts.map((f) => f.text),
              },
              /* Only when there's one open. Its absence is what tells him this
                 is discovery, and it's what keeps the editing tools out of a
                 conversation that has nothing to edit. */
              workflow: workflowId
                ? openWorkflow(workflowId, outstandingRef.current)
                : undefined,
              simpleDraft: store.simpleDraft,
              home,
            }),
          });

          if (response.status === 401) {
            setError("You're not signed in.");
            finish();
            return;
          }

          /* Status alone doesn't decide this. Being rate limited comes back as
             a 429 carrying our own error event, and the limiter's message —
             which says whether to wait a minute or come back tomorrow — is the
             whole value of it. So the body is read whenever there's one to
             read, and the generic line is kept for responses that say nothing. */
          const streamed = (
            response.headers.get("content-type") ?? ""
          ).includes("application/x-ndjson");

          if (!streamed || !response.body) {
            setError(await failureFrom(response));
            finish();
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            /* One event per line, and a chunk can split one in half — so the
               last piece is always kept back until a newline proves it whole. */
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const raw of lines) {
              if (!raw.trim()) continue;

              let event: ChatEvent;
              try {
                event = JSON.parse(raw) as ChatEvent;
              } catch {
                continue;
              }

              if (event.type === "delta") {
                appendAnswer(answerId, event.text);
              } else if (event.type === "phase") {
                setPhase(event.label || null);
              } else if (event.type === "note") {
                const note = event;
                /* The durable copy. Both writes de-duplicate on the text, so a
                   resent turn adds nothing twice. */
                if (note.kind === "gap") recordGap(note.text);
                else recordFact(note.text);

                setNotes((prev) => [
                  ...prev,
                  { id: noteId(), kind: note.kind, text: note.text },
                ]);
              } else if (event.type === "workflow") {
                /* Blocks, not a description of blocks. Nothing is derived here
                   and nothing needs to be: they were built from the library on
                   the server, so what lands in the store is what the canvas and
                   the publish gate already know how to read. */
                const made = crypto.randomUUID();
                addWorkflow({
                  id: made,
                  name: event.name,
                  draftedBy: "Craig",
                  createdAt: new Date().toISOString(),
                  blocks: event.blocks,
                });

                /* The conversation that produced it becomes the conversation
                   *about* it. Every step in this draft exists because of
                   something said in the turns above, so opening the workflow and
                   finding an empty transcript beside it would throw away the
                   only record of why it looks like that. The server flips this
                   very thread rather than copying it — named explicitly,
                   because a server left to find "the" draft conversation is what
                   used to hand somebody a months-old one.

                   Awaited before the screen is told, so the editor cannot mount
                   and open the workflow's thread while graduation is still in
                   flight — which would create an empty one and strand this
                   conversation behind it. */
                const from = showcaseState().threadId;
                if (from) await graduate(from, made);

                /* Announced to the screen, which owns what happens next. The
                   builder navigates into the editor on it; the editor itself
                   ignores it. A transcript should not be the thing that decides
                   where somebody ends up. */
                setDrafted(made);
              } else if (event.type === "source") {
                /* On the message rather than in this hook's state: it's part of
                   what he said, and it has to survive the same navigation the
                   sentence it belongs to survives. */
                addSource(answerId, { url: event.url, title: event.title });
              } else if (event.type === "edit") {
                /* Applied as it arrives, so the canvas moves while he's still
                   talking. That's the entire reason to say it to him rather
                   than click it yourself. */
                applyEdit(event.workflowId, event.edit);
              } else if (event.type === "tool") {
                const call = event;
                setTools((prev) => {
                  /* The done event carries no label — it's the same call, so
                     the one from the running event is the one to keep. */
                  const seen = prev.find((t) => t.id === call.id);
                  if (!seen)
                    return [
                      ...prev,
                      {
                        id: call.id,
                        label: call.label,
                        running: call.state === "running",
                      },
                    ];
                  return prev.map((t) =>
                    t.id === call.id
                      ? { ...t, running: call.state === "running" }
                      : t,
                  );
                });
              } else if (event.type === "offer") {
                setOffer(event.offer);
              } else if (event.type === "error") {
                setError(event.message);
              }
            }
          }
        } catch {
          /* An abort is this hook's own doing — the newer send owns the UI now,
             so it must not paint an error over it or clear its busy flag. */
          if (controller.signal.aborted) return;
          setError("The connection dropped. Try again.");
        }

        if (abortRef.current === controller) abortRef.current = null;
        finish();
      })();
    },
    [workflowId, home, threadKind],
  );

  return { messages, send, phase, notes, tools, busy, error, drafted, offer };
}
