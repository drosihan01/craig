import {
  MaxTurnsExceededError,
  ModelBehaviorError,
  ModelRefusalError,
  ToolCallError,
  UserError,
  run,
  type AgentInputItem,
} from "@openai/agents";
import { currentUser } from "@/lib/showcase/current-user";
import {
  craig,
  describeToolCall,
  seedNotebook,
} from "@/lib/showcase/craig-agent";
import {
  MAX_TURNS,
  REQUEST_TIMEOUT_MS,
  rateLimit,
} from "@/lib/showcase/rate-limit";
import { attachmentNote } from "@/lib/showcase/craig-prompt";
import type { ChatEvent, ChatRequest, ChatTurn } from "@/lib/showcase/contract";

/**
 * Craig, actually answering.
 *
 * The first route in this codebase that costs money when it runs, which sets
 * most of what follows. It's guarded before it does anything else, it refuses
 * payloads it hasn't agreed to pay for, and every way it can fail has a line
 * the person on the other end can act on.
 *
 * All of it translation. The Agents SDK's event stream comes in, our NDJSON
 * goes out, and nothing about the SDK's shape survives the trip — no run item
 * types, no call ids that mean anything to it, no provider error text. The
 * client should not be able to tell what is behind here; the day it can,
 * changing the model or dropping the SDK becomes a front-end change.
 */

/**
 * What one request may contain. The limits on how many requests, how long the
 * agent may loop and how long it may hold the connection all live in
 * `rate-limit.ts`, with the other spend guards.
 *
 * `MAX_MESSAGES` counts the conversation, not the agent's planning loop — those
 * are different numbers with the same instinct behind them, and they were both
 * called `MAX_TURNS` until the two ended up in this file together. A
 * conversation this long is already past the point where Craig should have
 * produced a workflow, so the cap costs nothing real and stops a tab left open
 * overnight from replaying its whole history on every turn.
 */
const MAX_MESSAGES = 40;
const MAX_CHARS_PER_TURN = 8_000;
const MAX_CHARS_TOTAL = 60_000;
const MAX_ATTACHMENTS = 12;
/** Per list — gaps and facts are capped separately. */
const MAX_NOTES = 40;
const MAX_NOTE_CHARS = 300;

/* --- The wire ------------------------------------------------------------- */

const encoder = new TextEncoder();

const line = (event: ChatEvent) => encoder.encode(JSON.stringify(event) + "\n");

const STREAM_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  /* Nothing about a model's answer is reusable, and a proxy that buffers this
     turns a live stream into one late paragraph. */
  "Cache-Control": "no-store, no-transform",
  "X-Accel-Buffering": "no",
};

/**
 * A stream that only says what went wrong.
 *
 * Failures that happen before the agent starts still come back as an error
 * event rather than a bare status, so the client has exactly one place to read
 * a failure from. Being rate limited is the case that needs both: a `429` with
 * `Retry-After` for anything speaking HTTP, and the event underneath it,
 * because the limiter's message is the one worth showing and a status code
 * can't carry it.
 */
function errorStream(
  message: string,
  init?: { status?: number; headers?: Record<string, string> },
) {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(line({ type: "error", message }));
        controller.close();
      },
    }),
    {
      status: init?.status ?? 200,
      headers: { ...STREAM_HEADERS, ...init?.headers },
    },
  );
}

/* --- Validation ----------------------------------------------------------- */

/** Whatever came in, or a reason it can't be used. */
function parse(body: unknown):
  | {
      ok: true;
      messages: ChatTurn[];
      attachments: string[];
      known: { gaps: string[]; facts: string[] };
    }
  | { ok: false; reason: string } {
  if (typeof body !== "object" || body === null)
    return { ok: false, reason: "Expected an object." };

  const { messages, attachments, known } = body as ChatRequest;

  if (!Array.isArray(messages) || messages.length === 0)
    return { ok: false, reason: "Expected at least one message." };

  if (messages.length > MAX_MESSAGES)
    return { ok: false, reason: `Too many messages (limit ${MAX_MESSAGES}).` };

  let total = 0;
  for (const turn of messages) {
    if (
      typeof turn?.content !== "string" ||
      (turn.role !== "user" && turn.role !== "assistant")
    )
      return { ok: false, reason: "Each message needs a role and content." };

    if (turn.content.length > MAX_CHARS_PER_TURN)
      return { ok: false, reason: "One of those messages is too long." };

    total += turn.content.length;
  }

  if (total > MAX_CHARS_TOTAL)
    return { ok: false, reason: "That conversation is too long to send." };

  const files = Array.isArray(attachments)
    ? attachments
        .filter((name): name is string => typeof name === "string")
        .slice(0, MAX_ATTACHMENTS)
        /* Only the name is ever used, and it goes into the prompt — so the
           newlines come out, or a filename can write its own instructions. */
        .map((name) => name.replace(/\s+/g, " ").slice(0, 120).trim())
        .filter(Boolean)
    : [];

  return {
    ok: true,
    messages,
    attachments: files,
    known: {
      gaps: notes(known?.gaps),
      facts: notes(known?.facts),
    },
  };
}

/**
 * Craig's own notes, coming back from the client to be handed to him again.
 *
 * Capped like everything else here: they go into the prompt, so an unbounded
 * array is an unbounded bill. They're also the one input that has been out of
 * the server's hands and returned — nothing is trusted about them beyond being
 * strings, and they're only ever shown back to the model as his own notes,
 * never treated as instructions.
 */
function notes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((n): n is string => typeof n === "string")
    .slice(0, MAX_NOTES)
    .map((n) => n.replace(/\s+/g, " ").slice(0, MAX_NOTE_CHARS).trim())
    .filter(Boolean);
}

/* --- Failure -------------------------------------------------------------- */

/**
 * What to tell the person when it goes wrong.
 *
 * Never the underlying message. The SDK wraps provider errors and its own, and
 * both carry things that don't belong on a screen — organisation ids, request
 * ids, occasionally the tail of a key, and always a stack. This maps the ones
 * somebody could act on and sends everything else to the same honest shrug.
 */
function failureMessage(error: unknown): string {
  if (error instanceof MaxTurnsExceededError)
    return "Craig got stuck in a loop and I stopped him. Try rephrasing that.";

  if (error instanceof ModelRefusalError)
    return "Craig wouldn't answer that one.";

  if (error instanceof ToolCallError)
    return "Craig couldn't finish making a note. Try again.";

  if (error instanceof ModelBehaviorError)
    return "Craig gave a garbled answer. Try again.";

  /* Ours, not theirs — a missing key or a bad agent config lands here. The
     wording stays vague because the person reading it can't fix either. */
  if (error instanceof UserError) return "Craig isn't configured correctly.";

  /**
   * Provider failures are matched on `code` and `type`, not on the HTTP
   * status. The SDK's `APIError` carries a `status` property that was
   * `undefined` on every provider error seen while building this, including
   * ones the API definitely answered 429 to — so a status-based branch reads
   * as working and silently falls through to the generic line.
   */
  const { code, type } = error as { code?: string; type?: string };

  /* Out of credit is not rate limiting, and telling somebody to wait a moment
     when the account needs topping up is a message that will never come true.
     They arrive together under 429, which is why this is checked first. */
  if (type === "insufficient_quota" || code === "credit_balance_exhausted")
    return "The OpenAI account is out of credit.";

  if (code === "rate_limit_exceeded" || type === "rate_limit_exceeded")
    return "Rate limited by OpenAI. Give it a moment and try again.";

  if (code === "invalid_api_key" || type === "invalid_request_error")
    return "OpenAI rejected the key.";

  if (code === "model_not_found")
    return "That model isn't available on this account.";

  if (
    code === "ENOTFOUND" ||
    code === "ECONNREFUSED" ||
    code === "UND_ERR_CONNECT_TIMEOUT"
  )
    return "Couldn't reach OpenAI. Check the connection.";

  const status = (error as { status?: number })?.status;
  if (status === 401 || status === 403) return "OpenAI rejected the key.";
  if (status === 429)
    return "Rate limited by OpenAI. Give it a moment and try again.";
  if (status && status >= 500)
    return "OpenAI is having trouble. Try again in a moment.";

  return "Craig couldn't answer that one. Try again.";
}

/* --- The route ------------------------------------------------------------ */

export async function POST(request: Request) {
  /* Before anything else, and before anything is spent. `currentUser` reads the
     cookie and checks the signature; the proxy guards `/showcase` but not this,
     and a route that spends money on an unverified caller is the actual risk. */
  const session = await currentUser();
  if (!session) {
    return Response.json(
      { error: "Not signed in." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  /* Keyed on the session rather than the IP: there is one account, and an IP is
     both easy to change and shared by everyone behind a router. Checked here,
     ahead of parsing and well ahead of the model, so a rejected request costs
     nothing — which is the entire point of having it. */
  const limit = rateLimit(session.email);
  if (!limit.ok) {
    return errorStream(
      limit.message ?? "Too many requests. Try again shortly.",
      {
        status: 429,
        headers: limit.retryAfter
          ? { "Retry-After": String(limit.retryAfter) }
          : undefined,
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }

  const parsed = parse(body);
  if (!parsed.ok)
    return Response.json({ error: parsed.reason }, { status: 400 });

  /* The SDK reads the key itself when it builds its client, and the failure if
     it's missing is a UserError thrown somewhere inside the run — true, but a
     long way from the person who has to go and add it to `.env.local`. */
  if (!process.env.OPENAI_API_KEY) return errorStream("No API key configured.");

  /* The attachment note rides on the last user turn, so it's true at the point
     it's read rather than a standing claim about the whole conversation.

     An assistant turn is not the mirror of a user turn here: replaying one
     means handing back an item the model previously produced, so it needs the
     output shape and a status. A bare `{ role, content }` pair type-checks for
     the user and is rejected for the assistant. */
  const input: AgentInputItem[] = parsed.messages.map((turn, i) => {
    const content =
      i === parsed.messages.length - 1 && turn.role === "user"
        ? turn.content + attachmentNote(parsed.attachments)
        : turn.content;

    return turn.role === "user"
      ? { role: "user", content }
      : {
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: content }],
        };
  });

  /* Seeded from what the client kept, because this dies with the response. */
  const notebook = seedNotebook(parsed.known);

  /* Cancelling stops the meter when somebody closes the tab or sends again.
     The timer is the third runaway mode: a connection that never closes holds
     the request open and keeps the model generating into nothing, which no
     per-request cap catches because every individual part of it looks fine. */
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    abort.abort();
  }, REQUEST_TIMEOUT_MS);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: ChatEvent) => {
        if (open) controller.enqueue(line(event));
      };

      /* Cleared the instant there are words to read. Leaving "Writing that
         down" above a paragraph that's already arriving is the tell that it
         was decoration — which is the exact thing the tools are here to fix. */
      let phaseShowing = false;
      const clearPhase = () => {
        if (phaseShowing) {
          send({ type: "phase", label: "" });
          phaseShowing = false;
        }
      };

      try {
        const result = await run(craig, input, {
          stream: true,
          context: notebook,
          maxTurns: MAX_TURNS,
          signal: abort.signal,
        });

        for await (const event of result) {
          if (event.type === "raw_model_stream_event") {
            if (event.data.type === "output_text_delta" && event.data.delta) {
              clearPhase();
              send({ type: "delta", text: event.data.delta });
            }
            continue;
          }

          if (event.type !== "run_item_stream_event") continue;

          /* A tool the model decided to call. The arguments are here, before
             it runs, which is what makes the phase line honest — it goes up as
             the work starts rather than after it finished. */
          if (event.name === "tool_called") {
            const raw = event.item.rawItem;
            if (raw?.type !== "function_call") continue;

            const activity = describeToolCall(raw.name, raw.arguments);
            if (!activity) continue;

            send({ type: "phase", label: activity.phase });
            phaseShowing = true;
            send({
              type: "tool",
              id: raw.callId,
              label: activity.label,
              state: "running",
            });
            if (activity.note)
              send({
                type: "note",
                kind: activity.note.kind,
                text: activity.note.text,
              });
            if (activity.workflow)
              send({ type: "workflow", steps: activity.workflow });
            continue;
          }

          if (event.name === "tool_output") {
            const raw = event.item.rawItem;
            if (raw?.type !== "function_call_result") continue;
            send({
              type: "tool",
              id: raw.callId,
              label: "",
              state: "done",
            });
          }
        }

        /* Nothing is awaited on the result after the loop: iterating it to
           completion is what finishes the run, and `completed` would only
           matter if we'd stopped reading early. */
        clearPhase();
        send({ type: "done" });
      } catch (error) {
        clearPhase();

        /* Three ways to arrive here and they need telling apart, because two of
           them abort the same signal. A timeout has somebody still waiting and
           owed an explanation; a client that hung up has nobody left to tell. */
        if (timedOut) {
          send({
            type: "error",
            message: "That took too long, so I stopped it. Try again.",
          });
        } else if (!request.signal.aborted) {
          /* The client gets a sentence it can act on, which by design throws
             away everything needed to diagnose this. That belongs in the
             server's log rather than nowhere. */
          console.error("[api/chat]", error);
          send({ type: "error", message: failureMessage(error) });
        }
      } finally {
        clearTimeout(timeout);
        open = false;
        try {
          controller.close();
        } catch {}
      }
    },

    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, { status: 200, headers: STREAM_HEADERS });
}
