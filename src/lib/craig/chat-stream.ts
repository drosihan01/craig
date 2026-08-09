import "server-only";

import type { ChatEvent } from "@/lib/craig/contract";

/**
 * The wire both chat routes speak.
 *
 * NDJSON — one `ChatEvent` per line — read by `use-craig-chat.ts` at the other
 * end. `ChatEvent` itself has always lived in `contract.ts` because the client
 * needs it; the three things here are the rest of that agreement, and they lived
 * privately inside the admin's route until there was a second route that had to
 * frame bytes identically.
 *
 * Extracted rather than copied. A framing convention duplicated across two
 * routes is a thing that drifts — the half that gets a trailing-newline fix or a
 * new buffering header is never the half the reader is on — and the failure is
 * not a type error, it is a stream that hangs behind somebody's proxy.
 *
 * Only the framing is here. Everything the admin's route does with tools, edits
 * and citations stays there, because none of it is shared: the joiner's Craig
 * has no tools by design (see `joiner-agent.ts`), so it has nothing to announce
 * and nothing to cite.
 */

const encoder = new TextEncoder();

export const line = (event: ChatEvent) =>
  encoder.encode(JSON.stringify(event) + "\n");

export const STREAM_HEADERS = {
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
export function errorStream(
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
