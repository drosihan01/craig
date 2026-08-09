import { UserError, run, type AgentInputItem } from "@openai/agents";
import { currentJoiner } from "@/lib/craig/current-joiner";
import { briefFor, joinerCraigFor } from "@/lib/craig/joiner-agent";
import { STREAM_HEADERS, errorStream, line } from "@/lib/craig/chat-stream";
import { REQUEST_TIMEOUT_MS, rateLimit } from "@/lib/craig/rate-limit";
import {
  MAX_MESSAGES,
  type ChatEvent,
  type ChatTurn,
} from "@/lib/craig/contract";

/**
 * The new starter's Craig, answering.
 *
 * `/api/chat`'s counterpart, and deliberately the same order of operations —
 * guard, limit, parse, then spend — for the same reason: this is a route that
 * costs money when it runs, and every check that happens after the model has
 * started is a check that has already been paid for.
 *
 * What is different is who is on the other end, and that changes three things.
 *
 * **The identity.** `currentJoiner()`, never `currentUser()`. They are two
 * different people with two different cookies, possibly in two different
 * browsers, and this route must not accept the admin's — not because an admin
 * reading a joiner's Craig would leak anything, but because it would silently
 * answer as though the admin were the joiner, using whichever joiner the
 * *cookie* named. There is no joiner id in the request body on purpose: the
 * only thing that says who this is, is the signed cookie.
 *
 * **The budget.** Keyed on the joiner rather than the account. Sharing the
 * admin's bucket would mean five new starters asking questions on a Monday
 * morning could lock the person paying out of their own product — or, read the
 * other way, that one joiner's runaway tab is charged to a limit somebody else
 * is relying on. Different people, different buckets.
 *
 * **The shape.** No tools, so no phase lines, no tool events, no edits, and no
 * citations to split. What comes back is text and, if something goes wrong, an
 * error. That is the whole vocabulary. It reads as a simpler version of the
 * admin's route because it genuinely is one — see `joiner-agent.ts` for why the
 * absence of tools is the access boundary rather than an unfinished feature.
 */

/** Their questions are short and there is no draft to accumulate. */
const MAX_JOINER_MESSAGES = Math.min(MAX_MESSAGES, 24);

interface Parsed {
  ok: true;
  messages: ChatTurn[];
}

interface Rejected {
  ok: false;
  reason: string;
}

/**
 * The request, believed only as far as it has been checked.
 *
 * Nothing here is trusted to name the person — see the header. The body carries
 * the conversation and nothing else, which is why there is no `known`, no
 * `workflow` and no joiner id to validate: there is nothing a caller could put
 * in this payload that would change whose record gets read.
 */
function parse(body: unknown): Parsed | Rejected {
  if (typeof body !== "object" || body === null)
    return { ok: false, reason: "Expected an object." };

  const { messages } = body as { messages?: unknown };
  if (!Array.isArray(messages))
    return { ok: false, reason: "Expected `messages` to be an array." };
  if (messages.length === 0)
    return { ok: false, reason: "Expected at least one message." };
  if (messages.length > MAX_JOINER_MESSAGES)
    return { ok: false, reason: "That conversation is too long to continue." };

  const turns: ChatTurn[] = [];
  for (const turn of messages) {
    if (typeof turn !== "object" || turn === null)
      return { ok: false, reason: "Every message must be an object." };

    const { role, content } = turn as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant")
      return { ok: false, reason: "Every message needs a role." };
    if (typeof content !== "string")
      return { ok: false, reason: "Every message needs text." };

    turns.push({ role, content });
  }

  return { ok: true, messages: turns };
}

export async function POST(request: Request) {
  /* Before anything else, and before anything is spent. The proxy turns
     anonymous requests away at the app's edge but excludes `/api` — this is its
     own front door, and it is the only thing here that knows whether the person
     the cookie names still has a seat. */
  const joiner = await currentJoiner();
  if (!joiner) {
    return Response.json(
      { error: "That link has expired." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  /* Namespaced so a joiner id can never collide with an account email in the
     limiter's map. They are different keyspaces sharing one store. */
  const limit = rateLimit(`joiner:${joiner.id}`);
  if (!limit.ok) {
    return errorStream(limit.message ?? "Too many questions at once. Give it a moment.", {
      status: 429,
      headers: limit.retryAfter
        ? { "Retry-After": String(limit.retryAfter) }
        : undefined,
    });
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

  /* The SDK reads the key itself and fails somewhere inside the run, a long way
     from whoever has to go and set it. */
  if (!process.env.OPENAI_API_KEY) return errorStream("No API key configured.");

  const input: AgentInputItem[] = parsed.messages.map((turn) =>
    turn.role === "user"
      ? { role: "user", content: turn.content }
      : {
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: turn.content }],
        },
  );

  /* Built from the joiner's own record, on the server, from the cookie. The
     client never sends context and could not usefully forge any if it tried. */
  const agent = joinerCraigFor(briefFor(joiner));

  /* Cancelling stops the meter when somebody closes the tab or sends again. The
     timer is the third runaway mode: a connection that never closes holds the
     request open and keeps the model generating into nothing. */
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

      try {
        const result = await run(agent, input, {
          stream: true,
          /* The joiner rides the context so `search_resources` resolves whose
             documents these are from the record this route authenticated,
             rather than from anything the model produced. */
          context: { joiner },
          /* Two: one to call `search_resources`, one to answer with what it
             returned. Not more — there is a single tool and nothing it can
             return that warrants calling it again, so a higher ceiling would
             only buy a loop. */
          maxTurns: 2,
          signal: abort.signal,
        });

        for await (const event of result) {
          if (
            event.type === "raw_model_stream_event" &&
            event.data.type === "output_text_delta" &&
            event.data.delta
          ) {
            send({ type: "delta", text: event.data.delta });
          }
        }

        await result.completed;
      } catch (error) {
        /* Their words, not the library's. A new starter reading "AbortError"
           on their onboarding learns only that something is broken and that
           nobody thought about them reading it. The real message goes to the
           log, where somebody can act on it. */
        console.error("Joiner chat failed", error);

        /* A client that hung up gets nothing, because there is nobody there to
           read it. The distinction matters: `abort` fires both when they close
           the tab and when the timer trips, and only one of those is a thing
           that happened to a person still looking at the screen. */
        const abandoned = abort.signal.aborted && !timedOut;

        if (!abandoned) {
          send({
            type: "error",
            message: timedOut
              ? "That took too long. Ask me again?"
              : error instanceof UserError
                ? "Craig isn't set up properly here yet. Whoever invited you can sort it out."
                : "Something went wrong at my end. Try asking again.",
          });
        }
      } finally {
        clearTimeout(timeout);
        open = false;
        controller.close();
      }
    },
    cancel() {
      clearTimeout(timeout);
      abort.abort();
    },
  });

  return new Response(stream, { status: 200, headers: STREAM_HEADERS });
}
