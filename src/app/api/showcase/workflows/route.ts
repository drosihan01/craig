import { NextResponse } from "next/server";
import { currentUser } from "@/lib/craig/current-user";
import {
  listWorkflows,
  removeWorkflows,
  saveWorkflows,
  type StoredWorkflow,
} from "@/lib/craig/workflows";

/**
 * The workflow sync: read on arrival, write as you go.
 *
 * Two verbs and no more. `GET` is what a browser asks when it opens Craig
 * without knowing what this account has built; `POST` is the browser saying
 * what changed since it last spoke. There is no per-block endpoint, because the
 * browser is the author of a workflow and sends the whole document — see
 * `lib/craig/workflows.ts` for why a partial write would need a merge nobody
 * can perform.
 *
 * Both verbs answer for the signed-in account and only that account. The id in
 * the body never selects whose workflow is written; the session does.
 */

const MAX_WORKFLOWS = 100;
/** Generous, but a bound. A block list is small; a hostile one need not be. */
const MAX_BODY_BLOCKS = 400;

export async function GET() {
  const session = await currentUser();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const workflows = await listWorkflows(session.email);
  return NextResponse.json({ workflows });
}

/**
 * `{ save: Workflow[], remove: string[] }` — both optional, applied in that
 * order.
 *
 * Order matters and it is the safe one: saving before removing means a
 * workflow that appears in both lists ends up deleted rather than resurrected.
 * A client that sends both for the same id has a bug, and the outcome should be
 * the destructive one it asked for last rather than a row that quietly comes
 * back.
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

  const { save, remove } = (body ?? {}) as {
    save?: unknown;
    remove?: unknown;
  };

  const toSave = Array.isArray(save) ? save.slice(0, MAX_WORKFLOWS) : [];
  const toRemove = Array.isArray(remove)
    ? remove.filter((id): id is string => typeof id === "string").slice(0, MAX_WORKFLOWS)
    : [];

  /* Shape-checked rather than trusted. This lands in a jsonb column that the
     editor later reads back and renders, so a workflow with no id or a blocks
     value that isn't an array is dropped here rather than stored and crashed
     on later. Dropping one is the right size of failure: the browser still has
     it, and the next sync tries again. */
  const clean: StoredWorkflow[] = [];
  for (const item of toSave) {
    if (!item || typeof item !== "object") continue;
    const w = item as Partial<StoredWorkflow>;
    if (typeof w.id !== "string" || !w.id) continue;
    if (typeof w.name !== "string") continue;
    if (!Array.isArray(w.blocks) || w.blocks.length > MAX_BODY_BLOCKS) continue;

    clean.push({
      id: w.id,
      name: w.name,
      blocks: w.blocks,
      createdAt:
        typeof w.createdAt === "string" ? w.createdAt : new Date().toISOString(),
      published: w.published === true,
      draftedBy: typeof w.draftedBy === "string" ? w.draftedBy : undefined,
      revealedAt: typeof w.revealedAt === "string" ? w.revealedAt : undefined,
    });
  }

  await saveWorkflows(session.email, clean);
  await removeWorkflows(session.email, toRemove);

  return NextResponse.json({ ok: true, saved: clean.length, removed: toRemove.length });
}
