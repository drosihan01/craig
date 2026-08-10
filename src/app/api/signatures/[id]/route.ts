import { currentUser } from "@/lib/craig/current-user";
import { signedCopyForAccount } from "@/lib/craig/contract-signing";

/**
 * The employer downloading a contract one of their people signed.
 *
 * Its own route rather than a branch on the joiner's, and that is the same rule
 * `documents.ts` sets out: separate routes per audience, never one route with a
 * flag in it. The two callers are different people asking different questions —
 * "my copy" and "my employee's copy" — and the checks have nothing in common
 * beyond the word signed. A shared handler would be one ownership rule standing
 * in for two, and the day one of them changed they would disagree silently.
 *
 * `signedCopyForAccount` matches the signing id *and* this account's id in one
 * statement, so a uuid belonging to another company's contract selects nothing
 * and reads exactly like one that never existed. There is deliberately no
 * separate "not yours" — anything else confirms that a guessed id is real, which
 * is the one fact the check exists to withhold.
 *
 * A redirect to a one-minute signed URL rather than the bytes, matching every
 * other download in this product. The audit record itself is not here: it is
 * rendered on the person's page, where it sits beside the rest of what is known
 * about that onboarding rather than being a JSON endpoint somebody has to
 * assemble a story out of.
 */

const noStore = { "Cache-Control": "no-store" };

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/signatures/[id]">,
) {
  const user = await currentUser();
  if (!user) {
    return Response.json(
      { error: "Not signed in." },
      { status: 401, headers: noStore },
    );
  }

  const { id } = await params;
  const copy = await signedCopyForAccount(user.email, id.slice(0, 64));

  if (!copy) {
    return Response.json(
      { error: "No such signed contract." },
      { status: 404, headers: noStore },
    );
  }

  return Response.redirect(copy.url, 307);
}
