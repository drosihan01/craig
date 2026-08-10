import { currentUser } from "@/lib/craig/current-user";
import {
  deleteDocument,
  setVisibility,
  signedUrlForAccount,
  type DocumentVisibility,
} from "@/lib/craig/documents";

/**
 * One document: reading it, sharing it with new starters, or removing it.
 *
 * Both operations scope by account inside the statement that performs them (see
 * `documents.ts`), so an id belonging to somebody else's account is a 404 here
 * rather than a 403. The distinction matters: a 403 confirms the document
 * exists, which is a fact about another company's data and not one this route
 * should be handing out.
 */

const noStore = { "Cache-Control": "no-store" };

const VISIBILITIES: DocumentVisibility[] = ["private", "shared"];

/**
 * The bytes, for an admin looking at their own document.
 *
 * A redirect to a signed URL rather than proxying the file through this
 * function, and rather than handing the signed URL to the browser as JSON.
 *
 * **Not a proxy**, because streaming somebody's handbook through a serverless
 * function costs its memory and its execution time to do a job the storage
 * layer already does better, and would put a size ceiling on documents for no
 * benefit.
 *
 * **Not JSON**, because the thing that consumes this is an `<iframe src>`. A
 * URL returned as JSON has to be put into the DOM by the client, which means a
 * credential-bearing link sitting in the page for anyone glancing at devtools
 * or taking a screenshot. Pointed at this route instead, the frame's `src` is
 * an ordinary path on our own origin, the signed URL exists only in a redirect
 * the browser follows, and it stops working a minute later regardless.
 *
 * The session is checked here and the account scoping happens inside
 * `signedUrlForAccount`'s own statement, so an id belonging to another company
 * is a 404 — indistinguishable from one that never existed, which is the only
 * answer that does not confirm somebody else's document is real.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/documents/[id]">,
) {
  const session = await currentUser();
  if (!session) {
    return Response.json(
      { error: "Not signed in." },
      { status: 401, headers: noStore },
    );
  }

  const { id } = await params;
  const found = await signedUrlForAccount(session.email, id);
  if (!found) {
    return Response.json(
      { error: "No such document." },
      { status: 404, headers: noStore },
    );
  }

  /* 307 rather than 302: the method must survive the hop. Nothing sends
     anything but GET here today, and a redirect that quietly rewrites a future
     POST into a GET is the kind of thing that is discovered much later. */
  return Response.redirect(found.url, 307);
}

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
