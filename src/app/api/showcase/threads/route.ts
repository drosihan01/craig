import { NextResponse } from "next/server";
import { currentUser } from "@/lib/showcase/current-user";
import {
  graduateOnboarding,
  listThreads,
  onboardingThread,
  readThread,
  saveMessages,
  startGodThread,
  threadForWorkflow,
  titleThread,
  type ThreadKind,
} from "@/lib/showcase/threads";

/**
 * The conversation sync.
 *
 * `GET` answers two questions and no others: what conversations does this
 * account have (`?list=`), and what was said in this one (`?id=`). `POST` opens
 * a thread or writes turns into one.
 *
 * Every verb answers for the signed-in account and only that account. No id in
 * a query string or a body ever selects *whose* conversation is read or
 * written; the session does, and `threads.ts` scopes each statement by account
 * as well as by id. A thread id is a UUID minted in a browser, which makes
 * guessing one impractical — and "impractical" is not the standard somebody's
 * transcript should be protected by.
 */

/** A conversation is long, but not unbounded, and a hostile one need not be. */
const MAX_TURNS = 400;
const MAX_CONTENT = 40_000;

const KINDS: ThreadKind[] = ["god", "workflow", "onboarding"];
const isKind = (v: unknown): v is ThreadKind =>
  typeof v === "string" && (KINDS as string[]).includes(v);

const isUuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export async function GET(request: Request) {
  const session = await currentUser();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Unknown thread." }, { status: 400 });
    }
    const found = await readThread(session.email, id);
    /* 404 rather than 403 for a thread belonging to somebody else. The two are
       indistinguishable from here by design — telling a caller that an id
       exists but is not theirs is the one fact this route should never leak. */
    if (!found) {
      return NextResponse.json({ error: "Unknown thread." }, { status: 404 });
    }
    return NextResponse.json(found);
  }

  const kind = url.searchParams.get("kind");
  const threads = await listThreads(
    session.email,
    isKind(kind) ? kind : undefined,
  );
  return NextResponse.json({ threads });
}

/**
 * Open a thread, or write turns into one.
 *
 * `{ open: { kind, id, workflowId?, from? } }` returns the thread to use —
 * get-or-create for the two singular kinds, always-new for a god thread.
 *
 * `{ threadId, messages: [{ id, role, content, seq, sources? }] }` writes the
 * transcript. Whole turns rather than deltas, because the browser is holding
 * the finished text either way and "insert once then patch" would be two write
 * paths for one object.
 */
export async function POST(request: Request) {
  const session = await currentUser();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const { open, graduate, threadId, messages, title } = (body ?? {}) as {
    open?: unknown;
    graduate?: unknown;
    threadId?: unknown;
    messages?: unknown;
    title?: unknown;
  };

  /* The onboarding conversation becoming the workflow's own. Its own verb
     rather than a flag on `open`, because it changes a thread that already
     exists and the caller is not asking to be given one — see
     `graduateOnboarding` for why this is a flip rather than a copy. */
  if (graduate && typeof graduate === "object") {
    const { workflowId } = graduate as { workflowId?: unknown };
    if (!isUuid(workflowId)) {
      return NextResponse.json({ error: "Malformed request." }, { status: 400 });
    }
    const thread = await graduateOnboarding(session.email, workflowId);
    return NextResponse.json({ thread });
  }

  if (open && typeof open === "object") {
    const {
      kind,
      id,
      workflowId,
      from,
    } = open as {
      kind?: unknown;
      id?: unknown;
      workflowId?: unknown;
      from?: { threadId?: unknown; messageId?: unknown };
    };

    /* The id is minted by the browser, like a workflow's, so the screen can
       render against it before the round trip lands. Checked as a UUID rather
       than trusted: it becomes a primary key. */
    if (!isKind(kind) || !isUuid(id)) {
      return NextResponse.json({ error: "Malformed request." }, { status: 400 });
    }

    if (kind === "workflow") {
      if (!isUuid(workflowId)) {
        return NextResponse.json(
          { error: "Malformed request." },
          { status: 400 },
        );
      }
      const thread = await threadForWorkflow(session.email, workflowId, id);
      return NextResponse.json({ thread });
    }

    if (kind === "onboarding") {
      const thread = await onboardingThread(
        session.email,
        id,
        isUuid(from?.threadId) ? from.threadId : undefined,
      );
      return NextResponse.json({ thread });
    }

    const thread = await startGodThread(
      session.email,
      id,
      isUuid(from?.threadId)
        ? {
            threadId: from.threadId,
            messageId: isUuid(from?.messageId) ? from.messageId : undefined,
          }
        : undefined,
    );
    return NextResponse.json({ thread });
  }

  if (!isUuid(threadId)) {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  if (typeof title === "string") {
    await titleThread(session.email, threadId, title);
  }

  const turns = Array.isArray(messages) ? messages.slice(0, MAX_TURNS) : [];

  /* Shape-checked rather than trusted. These are rendered back into a
     transcript, so a turn with no id or a role nobody recognises is dropped
     here rather than stored and crashed on later. Dropping one is the right
     size of failure: the browser still holds it and the next sync retries. */
  const clean = [];
  for (const [i, item] of turns.entries()) {
    if (!item || typeof item !== "object") continue;
    const m = item as {
      id?: unknown;
      role?: unknown;
      content?: unknown;
      seq?: unknown;
      sources?: unknown;
    };
    if (!isUuid(m.id)) continue;
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (typeof m.content !== "string") continue;

    clean.push({
      id: m.id,
      role: m.role,
      content: m.content.slice(0, MAX_CONTENT),
      seq: typeof m.seq === "number" && Number.isFinite(m.seq) ? m.seq : i,
      sources: Array.isArray(m.sources) ? m.sources : undefined,
    });
  }

  await saveMessages(session.email, threadId, clean);
  return NextResponse.json({ ok: true, saved: clean.length });
}
