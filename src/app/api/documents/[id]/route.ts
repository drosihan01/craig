import { currentUser } from "@/lib/craig/current-user";
import {
  deleteDocument,
  setVisibility,
  type DocumentVisibility,
} from "@/lib/craig/documents";

/**
 * One document: sharing it with new starters, or removing it.
 *
 * Both operations scope by account inside the statement that performs them (see
 * `documents.ts`), so an id belonging to somebody else's account is a 404 here
 * rather than a 403. The distinction matters: a 403 confirms the document
 * exists, which is a fact about another company's data and not one this route
 * should be handing out.
 */

const noStore = { "Cache-Control": "no-store" };

const VISIBILITIES: DocumentVisibility[] = ["private", "shared"];

export async function PATCH(
  request: Request,
  { params }: RouteContext<"/api/documents/[id]">,
) {
  const session = await currentUser();
  if (!session)
    return Response.json(
      { error: "Not signed in." },
      { status: 401, headers: noStore },
    );

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Expected JSON." },
      { status: 400, headers: noStore },
    );
  }

  const { visibility } = (body ?? {}) as { visibility?: unknown };
  if (!VISIBILITIES.includes(visibility as DocumentVisibility))
    return Response.json(
      { error: "Expected `visibility` to be 'private' or 'shared'." },
      { status: 400, headers: noStore },
    );

  const document = await setVisibility(
    session.email,
    id,
    visibility as DocumentVisibility,
  );

  if (!document)
    return Response.json(
      { error: "No such document." },
      { status: 404, headers: noStore },
    );

  return Response.json({ document }, { headers: noStore });
}

export async function DELETE(
  _request: Request,
  { params }: RouteContext<"/api/documents/[id]">,
) {
  const session = await currentUser();
  if (!session)
    return Response.json(
      { error: "Not signed in." },
      { status: 401, headers: noStore },
    );

  const { id } = await params;
  const removed = await deleteDocument(session.email, id);

  if (!removed)
    return Response.json(
      { error: "No such document." },
      { status: 404, headers: noStore },
    );

  return new Response(null, { status: 204, headers: noStore });
}
