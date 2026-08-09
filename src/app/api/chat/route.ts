import {
  MaxTurnsExceededError,
  ModelBehaviorError,
  ModelRefusalError,
  ToolCallError,
  UserError,
  run,
  type AgentInputItem,
} from "@openai/agents";
import { currentUser } from "@/lib/craig/current-user";
import {
  craig,
  describeCitation,
  describeToolCall,
  describeWebSearch,
  seedNotebook,
  splitCitations,
} from "@/lib/craig/craig-agent";
import {
  MAX_TURNS,
  REQUEST_TIMEOUT_MS,
  rateLimit,
} from "@/lib/craig/rate-limit";
import { attachmentNote } from "@/lib/craig/craig-prompt";
import { STREAM_HEADERS, errorStream, line } from "@/lib/craig/chat-stream";
import {
  MAX_MESSAGES,
  type ChatEvent,
  type ChatRequest,
  type ChatTurn,
  type OpenStep,
  type OpenWorkflow,
  DRAFT_REQUEST,
} from "@/lib/craig/contract";

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
 * called `MAX_TURNS` until the two ended up in this file together. It moved to
 * the contract when the thread started spanning two screens: the client is the
 * only side that can choose *which* turns to drop, so it trims to the newest
 * and this stays as the check that the trimming happened.
 */
const MAX_CHARS_PER_TURN = 8_000;
const MAX_CHARS_TOTAL = 60_000;
const MAX_ATTACHMENTS = 12;
/** Per list — gaps and facts are capped separately. */
const MAX_NOTES = 40;
const MAX_NOTE_CHARS = 300;
/** The open workflow. Bigger than any real onboarding, small enough to bill. */
const MAX_STEPS = 40;
/** Ids, presets and field names — none of them prose. */
const MAX_ID_CHARS = 64;
/** A header, a list row and a delete confirmation all have to show it. */
const MAX_NAME_CHARS = 60;
/** Titles and owners, which do reach the prompt as words. */
const MAX_LABEL_CHARS = 120;

/* --- The wire ------------------------------------------------------------- */

/* Moved to `chat-stream.ts` when the joiner's route needed to frame bytes the
   same way. The framing is the half both routes share; everything below about
   tools, edits and citations is this route's alone. */

/* --- Validation ----------------------------------------------------------- */

/** Whatever came in, or a reason it can't be used. */
function parse(body: unknown):
  | {
      ok: true;
      messages: ChatTurn[];
      attachments: string[];
      known: { gaps: string[]; facts: string[] };
      workflow?: OpenWorkflow;
      simpleDraft: boolean;
      home: boolean;
    }
  | { ok: false; reason: string } {
  if (typeof body !== "object" || body === null)
    return { ok: false, reason: "Expected an object." };

  const { messages, attachments, known, workflow, simpleDraft, home } =
    body as ChatRequest;

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
    workflow: openWorkflow(workflow),
    simpleDraft: simpleDraft === true,
    home: home === true,
  };
}

const label = (value: unknown, limit: number) =>
  typeof value === "string"
    ? value.replace(/\s+/g, " ").slice(0, limit).trim()
    : "";

/**
 * The workflow the client says is open, believed only as far as it is checked.
 *
 * Capped like `known` and for the same reason — the titles and owners in here
 * are printed into the prompt, so an unbounded list is an unbounded bill, and a
 * title carrying newlines is a title that can write its own instructions. What
 * it is *not* is trusted: nothing here decides anything on its own. Craig can
 * only name a step the client sent, and the client only applies an edit to a
 * step it still has, so a lie in this payload costs the liar their own canvas.
 */
function openWorkflow(value: unknown): OpenWorkflow | undefined {
  if (!value || typeof value !== "object") return undefined;

  const { id, name, steps, outstanding } = value as OpenWorkflow;
  const workflowId = label(id, MAX_ID_CHARS);
  if (!workflowId || !Array.isArray(steps)) return undefined;

  /**
   * Kept, which it was not.
   *
   * This function used to return `{ id, steps }` and drop the rest, and dropping
   * this field is not the harmless narrowing it looks like: `openWorkflowNote`
   * branches on it, and an absent list does not make it say nothing — it makes
   * it say *"Nothing. This workflow is ready to publish right now."* So the one
   * thing the screen works out where it cannot be wrong, and sends precisely so
   * that Craig's answer matches the interface beside him, was being turned into
   * its opposite on every turn. Somebody with Google Workspace unconnected and
   * three steps unanswered was told they could publish whenever they liked.
   *
   * Through `notes` because these are sentences that reach the prompt, and that
   * is already the sanitiser for exactly that — capped in count and in length,
   * whitespace collapsed, so a step title carrying newlines cannot write its own
   * instructions. Nothing here is trusted beyond being strings: it is shown to
   * him as the screen's own finding and decides nothing on the server.
   */
  const blocking = notes(outstanding);

  const kept = steps.slice(0, MAX_STEPS).flatMap((raw): OpenStep[] => {
    if (!raw || typeof raw !== "object") return [];
    const step = raw as OpenStep;
    const stepId = label(step.id, MAX_ID_CHARS);
    const preset = label(step.preset, MAX_ID_CHARS);
    if (!stepId || !preset) return [];

    return [
      {
        id: stepId,
        preset,
        title: label(step.title, MAX_LABEL_CHARS) || preset,
        owner: label(step.owner, MAX_LABEL_CHARS) || undefined,
        open: Array.isArray(step.open)
          ? step.open
              .slice(0, MAX_STEPS)
              .map((f) => label(f, MAX_ID_CHARS))
              .filter(Boolean)
          : [],
      },
    ];
  });

  /* Capped like every other string that reaches the prompt. It is shown to him
     as a fact about the workflow and decides nothing, but a name carrying
     newlines could otherwise write its own paragraph in the middle of the
     note. */
  const workflowName = label(name, MAX_NAME_CHARS);

  return {
    id: workflowId,
    name: workflowName || undefined,
    steps: kept,
    /* Absent rather than empty, because the note's two branches read it that
       way: an empty array would print the heading with nothing under it, where
       `undefined` is what makes it say plainly that nothing is outstanding. */
    outstanding: blocking.length > 0 ? blocking : undefined,
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

/**
 * The site a citation points at, and the thing two citations are the same by.
 *
 * A `URL` that won't parse is not a source anybody can be sent to, so it
 * doesn't become a chip. `www.` comes off because it's the same site and a
 * person reading two chips shouldn't have to work that out.
 */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
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


/**
 * Whether their latest turn actually asked for the workflow to be built.
 *
 * Craig decides plenty; this is not his to decide. The Generate button sends a
 * fixed sentence, so the common case is an exact match — but somebody who
 * simply types "go on then, build it" has asked just as clearly, and a gate
 * that only honoured the button would make the conversation the slower way to
 * do the thing the conversation is for.
 *
 * Read off *their* last turn only. His own replies are full of sentences like
 * "shall I draft it?", and a check that scanned the whole transcript would find
 * his suggestion and treat it as their answer.
 *
 * Deliberately narrow. A false negative costs one button press; a false
 * positive is a workflow appearing in somebody's account unasked, which is the
 * whole thing this exists to stop — so "that's everything" and "what else do
 * you need" are not matches, however finished they sound.
 */
const ASKED_TO_DRAFT =
  /\b(draft|build|make|create|generate|put together|write)\b[^.?!]{0,40}\b(it|this|that|one|workflow|onboarding)\b/i;

function askedToDraft(messages: ChatTurn[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const turn = messages[i];
    if (turn.role !== "user") continue;
    const text = turn.content.trim();
    return text === DRAFT_REQUEST || ASKED_TO_DRAFT.test(text);
  }
  return false;
}

export async function POST(request: Request) {
  /* Before anything else, and before anything is spent. `currentUser` reads the
     cookie and checks the signature; the proxy guards the app but not this,
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
  const notebook = seedNotebook(
    session.name?.split(" ")[0] || "there",
    session.company,
    parsed.known,
    parsed.workflow,
    parsed.simpleDraft,
    /* Their turns only. His own replies are full of plausible values he wrote
       himself, and a check that reads them back would agree with anything. */
    parsed.messages.flatMap((t) => (t.role === "user" ? [t.content] : [])),
    parsed.home,
    askedToDraft(parsed.messages),
  );

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

      /**
       * The edits an editing tool made, on their way to the canvas.
       *
       * Drained rather than read off the call's arguments, because an edit only
       * means anything against a workflow — which step, which fields survived
       * the filters — and the notebook is the only thing here holding one. So
       * `execute` does the work once and this ships what it did.
       */
      const flushEdits = () => {
        const workflowId = notebook.editing?.id;
        if (!workflowId) return;
        for (const edit of notebook.edits.splice(0))
          send({ type: "edit", workflowId, edit });
      };

      /**
       * The answer, one chunk behind itself.
       *
       * A citation is written into the prose and the annotation naming it
       * arrives afterwards, so there is no correcting it once sent — the only
       * place to remove one is before it goes. `splitCitations` hands back
       * what's safe to send and holds anything that might still be closing,
       * which is at most a few dozen characters and lands with the next chunk.
       */
      let held = "";
      const sendText = (text: string) => {
        const { text: ready, hold } = splitCitations(held + text);
        held = hold;
        if (ready) send({ type: "delta", text: ready });
      };
      /* Whatever never became a citation is still something he said. */
      const flushText = () => {
        const { text } = splitCitations(held);
        held = "";
        if (text) send({ type: "delta", text });
      };

      /* One chip per site. The model cites the same page for three sentences
         running, and three identical chips read as three sources. */
      const cited = new Set<string>();

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
              sendText(event.data.delta);
            }

            /* The hosted web search, which is the one tool that doesn't run
               here. It happens inside the model's response, so the SDK's run
               item for it only exists once that response is over — by which
               time the answer has already been read. The provider's own events
               come through untouched on this same stream and carry the moment
               it starts and the moment it returns, which is the only place a
               phase line for it can be true. */
            if (event.data.type === "model") {
              const search = describeWebSearch(event.data.event);
              const activity = search
                ? describeToolCall("web_search", "{}")
                : null;

              if (search && activity) {
                if (search.state === "running") {
                  send({ type: "phase", label: activity.phase });
                  phaseShowing = true;
                }
                /* The line stays up when the search returns: he is composing
                   the answer out of what he found, and it clears itself the
                   instant there are words to read. */
                send({
                  type: "tool",
                  id: search.id,
                  label: search.state === "running" ? activity.label : "",
                  state: search.state,
                });
              }

              /* The page a sentence came from. Sent as its own event so the
                 sentence doesn't have to carry it. */
              const citation = describeCitation(event.data.event);
              if (citation) {
                const host = hostOf(citation.url);
                if (host && !cited.has(host)) {
                  cited.add(host);
                  send({
                    type: "source",
                    url: citation.url,
                    title: citation.title || host,
                  });
                }
              }
            }
            continue;
          }

          if (event.type !== "run_item_stream_event") continue;

          /* A tool the model decided to call. The arguments are here, before
             it runs, which is what makes the phase line honest — it goes up as
             the work starts rather than after it finished. */
          if (event.name === "tool_called") {
            const raw = event.item.rawItem;
            /* Function calls only. A hosted tool arrives here as a
               `hosted_tool_call` long after its work — and its answer — are
               done, so it's handled off the raw stream above instead. */
            if (raw?.type !== "function_call") continue;

            const activity = describeToolCall(
              raw.name,
              raw.arguments,
              notebook,
            );
            if (!activity) continue;

            send({ type: "phase", label: activity.phase });
            phaseShowing = true;
            send({
              type: "tool",
              id: raw.callId,
              label: activity.label,
              state: "running",
            });
            for (const note of activity.notes ?? [])
              send({
                type: "note",
                kind: note.kind,
                text: note.text,
              });
            if (activity.offer)
              send({ type: "offer", offer: activity.offer });

            if (activity.workflow)
              send({
                type: "workflow",
                name: activity.workflow.name,
                blocks: activity.workflow.blocks,
              });
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
            /* After the tool finished rather than when it was called: the edit
               is what `execute` decided, and half of what he asks for gets
               dropped by the filters on the way through. */
            flushEdits();
          }
        }

        /* Nothing is awaited on the result after the loop: iterating it to
           completion is what finishes the run, and `completed` would only
           matter if we'd stopped reading early. */
        flushText();
        clearPhase();
        send({ type: "done" });
      } catch (error) {
        /* Held text is his, whatever went wrong afterwards. Dropping it would
           truncate a sentence the person was halfway through reading. */
        flushText();
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
