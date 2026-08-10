import { currentUser } from "@/lib/craig/current-user";
import { settleNote } from "@/lib/craig/notebook";

/**
 * Marking one of Craig's questions as dealt with.
 *
 * `DELETE` for a row that is updated rather than removed, because from the
 * caller's side the thing genuinely goes away: it leaves the list and does not
 * come back. The row survives so the same suggestion is not made twice, which
 * is bookkeeping this route has no reason to explain.
 *
 * One verb for both "I've written it down" and "not needed", because the table
 * cannot tell them apart and should not try — whether the words reached the
 * document is a fact about the document.
 */

const noStore = { "Cache-Control": "no-store" };

export async function DELETE(
  _request: Request,
  { params }: RouteContext<"/api/notebook/notes/[id]">,
) {
  const session = await currentUser();
  if (!session) {
    return Response.json(
      { error: "Not signed in." },
      { status: 401, headers: noStore },
    );
  }

  const { id } = await params;
  const settled = await settleNote(session.email, id);

  /* 404 rather than 403 when it belonged to somebody else — the same rule the
     documents routes follow, because a 403 confirms the row exists. */
  if (!settled) {
    return Response.json(
      { error: "No such note." },
      { status: 404, headers: noStore },
    );
  }

  return new Response(null, { status: 204, headers: noStore });
}
