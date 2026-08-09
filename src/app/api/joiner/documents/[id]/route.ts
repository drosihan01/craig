import { currentJoiner } from "@/lib/craig/current-joiner";
import { signedUrlForJoiner } from "@/lib/craig/documents";

/**
 * A new starter opening something their employer shared with them.
 *
 * A redirect to a signed URL rather than proxying the bytes. The file is already
 * sitting in storage behind a URL that can be minted on demand, and streaming it
 * through this route would put every megabyte of every download through a
 * serverless function for no gain — the check has already happened by the time
 * the redirect is written, which is the only part that needed to be ours.
 *
 * The signed URL lives for a minute. Long enough to follow, short enough that
 * the thing sitting in somebody's browser history is worthless. It is the
 * authorisation, so it must not be long-lived: nothing about it knows who asked.
 *
 * `currentJoiner`, never `currentUser`, and `signedUrlForJoiner` rather than a
 * lookup here — that function filters by their employer *and* by `shared` in one
 * statement, so this route has no opportunity to get the rule half right. An id
 * for another account's document, or one that has not been shared, is the same
 * 404 as an id that was never real.
 */

const noStore = { "Cache-Control": "no-store" };

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/joiner/documents/[id]">,
) {
  const joiner = await currentJoiner();
  if (!joiner)
    return Response.json(
      { error: "That link has expired." },
      { status: 401, headers: noStore },
    );

  const { id } = await params;
  const document = await signedUrlForJoiner(joiner, id);

  if (!document)
    return Response.json(
      { error: "No such document." },
      { status: 404, headers: noStore },
    );

  /* 307 rather than 302: the method must survive, and a cached redirect to a
     URL that expires in sixty seconds is a broken download tomorrow. */
  return Response.redirect(document.url, 307);
}
