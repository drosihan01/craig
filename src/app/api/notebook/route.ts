import { currentUser } from "@/lib/craig/current-user";
import { saveNotebook } from "@/lib/craig/notebook";

/**
 * Saving the notebook.
 *
 * The whole document every time, and no merge. Two people editing one
 * markdown file is a conflict nobody can resolve well, and with one admin per
 * account there is exactly one editor by construction — so last-write-wins is
 * not a compromise here, it is the accurate model.
 */

const noStore = { "Cache-Control": "no-store" };

export async function PUT(request: Request) {
  const session = await currentUser();
  if (!session) {
    return Response.json(
      { error: "Not signed in." },
      { status: 401, headers: noStore },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "That didn't arrive in one piece." },
      { status: 400, headers: noStore },
    );
  }

  const content = (body as { content?: unknown } | null)?.content;
  if (typeof content !== "string") {
    return Response.json(
      { error: "Nothing to save." },
      { status: 400, headers: noStore },
    );
  }

  try {
    const saved = await saveNotebook(session.email, content);
    return Response.json(
      { ok: true, updatedAt: saved.updatedAt },
      { headers: noStore },
    );
  } catch (cause) {
    console.error("[notebook] save failed:", cause);
    return Response.json(
      { error: "That didn't save. Your words are still on screen — try again." },
      { status: 500, headers: noStore },
    );
  }
}
