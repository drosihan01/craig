"use client";

import * as React from "react";
import {
  CHAT_ENDPOINT,
  type ChatEvent,
  type ChatTurn,
  type Role,
} from "@/lib/showcase/contract";
import {
  addWorkflow,
  recordFact,
  recordGap,
  showcaseState,
} from "@/lib/showcase/store";

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
 * Notes go to the store as well as into this hook's state, and the store is the
 * copy that matters. A gap Craig found is the thing the conversation produced —
 * the transcript is how it got there. Keeping it only in here would mean
 * navigating away from the chat destroys the findings, which is the failure the
 * activity ledger exists to prevent.
 */

export interface CraigMessage extends ChatTurn {
  /** Stable across the streaming appends, so React keeps the same node. */
  id: string;
  /** True while deltas are still landing on this message. */
  streaming?: boolean;
}

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
   * Everything he's noted, oldest first, across the whole conversation.
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
}

/** Nothing here is persisted, so a counter is enough and stays stable in SSR. */
let nextId = 0;
const makeId = (role: Role) => `${role}-${++nextId}`;

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
/** "Nothing" is how the model says a step can go first, and isn't worth saying. */
function preconditionOf(needs: string): string | undefined {
  const trimmed = needs.trim();
  if (!trimmed || /^(nothing|none|n\/a)\.?$/i.test(trimmed)) return undefined;
  return `Needs ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
}

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

export function useCraigChat(): CraigChat {
  const [messages, setMessages] = React.useState<CraigMessage[]>([]);
  const [phase, setPhase] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState<CraigNote[]>([]);
  const [tools, setTools] = React.useState<CraigToolRun[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const abortRef = React.useRef<AbortController | null>(null);
  /**
   * The transcript as the server should see it.
   *
   * Kept beside the state rather than read out of it, because `send` would
   * otherwise have to close over `messages` and every keystroke-triggered
   * re-render would hand back a different `send`. The screen can then treat it
   * as a stable callback, which is what a prompt bar wants.
   */
  const historyRef = React.useRef<ChatTurn[]>([]);

  const send = React.useCallback((text: string, attachments?: string[]) => {
    const content = text.trim();
    if (!content) return;

    /* A second send wins. The first one's partial answer stays on screen —
       it was really said, and deleting text somebody has already started
       reading is worse than leaving a short reply. */
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const question: CraigMessage = {
      id: makeId("user"),
      role: "user",
      content,
    };
    const answerId = makeId("assistant");

    historyRef.current = [...historyRef.current, { role: "user", content }];
    const history = historyRef.current;

    setError(null);
    setBusy(true);
    setPhase(null);
    setTools([]);
    setMessages((prev) => [
      ...prev.map((m) => ({ ...m, streaming: false })),
      question,
      { id: answerId, role: "assistant", content: "", streaming: true },
    ]);

    const append = (text: string) =>
      setMessages((prev) =>
        prev.map((m) =>
          m.id === answerId ? { ...m, content: m.content + text } : m,
        ),
      );

    const finish = () => {
      setMessages((prev) =>
        prev.map((m) => (m.id === answerId ? { ...m, streaming: false } : m)),
      );
      setPhase(null);
      /* Nothing is still running once the turn is over, whatever the last
         event said — a stream that drops mid-tool would otherwise leave a
         spinner going forever. */
      setTools((prev) => prev.map((t) => ({ ...t, running: false })));
      setBusy(false);
    };

    void (async () => {
      let answer = "";

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
          }),
        });

        if (response.status === 401) {
          setError("You're not signed in.");
          finish();
          return;
        }

        /* Status alone doesn't decide this. Being rate limited comes back as a
           429 carrying our own error event, and the limiter's message — which
           says whether to wait a minute or come back tomorrow — is the whole
           value of it. So the body is read whenever there's one to read, and
           the generic line is kept for responses that genuinely say nothing. */
        const streamed = (response.headers.get("content-type") ?? "").includes(
          "application/x-ndjson",
        );

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
              answer += event.text;
              append(event.text);
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
                { id: `note-${++nextId}`, kind: note.kind, text: note.text },
              ]);
            } else if (event.type === "workflow") {
              addWorkflow({
                id: crypto.randomUUID(),
                name: "Onboarding",
                draftedBy: "Craig",
                createdAt: new Date().toISOString(),
                blocks: event.steps.map((step, i) => ({
                  id: `step-${i + 1}`,
                  kind: step.kind,
                  title: step.title,
                  owner: step.owner || undefined,
                  /* `WorkflowBlock` has no field for a precondition — the
                     builder expresses order by position — so what a step waits
                     on is carried as prose rather than dropped. Not
                     `incomplete`: that means a gap somebody has to close, and
                     a satisfied dependency isn't one. */
                  summary: preconditionOf(step.needs),
                })),
              });
            } else if (event.type === "tool") {
              const call = event;
              setTools((prev) => {
                /* The done event carries no label — it's the same call, so the
                   one from the running event is the one to keep. */
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

      /* Whatever arrived is what he said, so that's what he gets replayed as
         on the next turn. Dropping a partial answer would leave him with no
         memory of a reply the person can still see. */
      if (answer)
        historyRef.current = [
          ...history,
          { role: "assistant", content: answer },
        ];

      if (abortRef.current === controller) abortRef.current = null;
      finish();
    })();
  }, []);

  return { messages, send, phase, notes, tools, busy, error };
}
