import { currentJoiner } from "@/lib/craig/current-joiner";
import { signedCopyForJoiner } from "@/lib/craig/contract-signing";

/**
 * The new starter downloading the contract they signed.
 *
 * **They get a copy, and that is not a courtesy.** A signature the signer cannot
 * retrieve is a signature only one side holds, which is the arrangement every
 * complaint about electronic signing starts from. It is also the cheapest
 * independent check there is on everything `contract-signing.ts` claims: their
 * copy carries the source document's hash and the record seal on its
 * certificate, so a copy saved today can be held against the row a year from now
 * by somebody who does not have to trust us.
 *
 * A redirect to a signed URL rather than proxying the bytes, matching
 * `/api/joiner/documents/[id]`: the check has already happened by the time the
 * redirect is written, which is the only part that had to be ours. The URL lives
 * for a minute, because nothing about it knows who asked.
 *
 * `currentJoiner`, never `currentUser`, and `signedCopyForJoiner` rather than a
 * lookup here — that function matches on their own id in the same statement, so
 * this route has no opportunity to get the rule half right. Another person's
 * signing is the same 404 as one that was never real.
 */

const noStore = { "Cache-Control": "no-store" };

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/joiner/contract/[stepId]/signed">,
) {
  const joiner = await currentJoiner();
  if (!joiner) {
    return Response.json(
      { error: "That link has expired." },
      { status: 401, headers: noStore },
    );
  }

  const { stepId } = await params;
  const copy = await signedCopyForJoiner(joiner, stepId.slice(0, 64));

  if (!copy) {
    return Response.json(
      { error: "There's no signed copy on that step." },
      { status: 404, headers: noStore },
    );
  }

  /* 307 rather than 302: the method must survive, and a cached redirect to a
     URL that expires in sixty seconds is a broken download tomorrow. */
  return Response.redirect(copy.url, 307);
}
