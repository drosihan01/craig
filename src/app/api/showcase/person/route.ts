import { NextResponse } from "next/server";
import { currentUser } from "@/lib/craig/current-user";
import { getJoiner } from "@/lib/craig/joiners";
import { eraseJoiner } from "@/lib/craig/erase";
import { rateLimit } from "@/lib/craig/rate-limit";

/**
 * Taking somebody's seat back, and their answers with it.
 *
 * A sibling of the tick route rather than another verb bolted onto it. The two
 * are both writes the admin's page makes and they share the ownership check
 * word for word, but `DELETE /api/showcase/tick` would be a path that lies
 * about half of what the file does — and a route somebody has to read the body
 * of to find out which of two things it is, is a route somebody will eventually
 * wire up wrong.
 *
 * The id travels in the query string, not a body. `DELETE` with a body is legal
 * and is stripped by enough proxies and fetch shims to be a bad thing to depend
 * on; the id is a UUID we generated, so there is nothing sensitive about it
 * appearing in a URL that the URL of the page it was removed from didn't
 * already reveal.
 *
 * The check that matters is the same one the page makes, and it matters more
 * here because this one destroys: the joiner store is shared by every account
 * on the deployment, so a route that trusted the id it was handed would let any
 * signed-in stranger delete a person — and their date of birth — off somebody
 * else's account, permanently, by posting a UUID. Missing and not-yours get the
 * same refusal for the same reason as everywhere else: distinguishing them
 * would confirm which ids exist.
 *
 * What this cannot do is un-send anything. The invitation is already in their
 * inbox and the link in it is what stops working; the screen offering this has
 * to say so, and it does.
 */

/** Deleting a row spends nothing from OpenAI's budget — see the note on `spend`
    in rate-limit.ts. The daily cap protects the model key, and a route that
    never touches it must not be able to exhaust it. */
const LIMIT_OPTIONS = { spend: false } as const;

/** Ours, never read by anyone. Long enough for a UUID, short enough not to be
    a payload. */
const MAX_ID = 64;

const noStore = { "Cache-Control": "no-store" };

const refuse = (error: string, status: number) =>
  NextResponse.json({ ok: false, error }, { status, headers: noStore });

/**
 * Folded to lower case, matching `listJoiners`. If this compared exactly and
 * that one folded, a person could sit on somebody's list and then refuse to be
 * removed from it — which reads as a broken button rather than as two functions
 * disagreeing about a string.
 */
const sameAccount = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

export async function DELETE(request: Request) {
  const session = await currentUser();
  if (!session) return refuse("Not signed in.", 401);

  const limit = await rateLimit(`showcase-person:${session.email}`, LIMIT_OPTIONS);
  if (!limit.ok) {
    /* Its own wording rather than the limiter's, which is written for the chat
       and talks about messages. See the note in the tick route: `spend: false`
       rules out the daily branch, so a minute and an hour are the only windows
       left and one sentence covers both. */
    return NextResponse.json(
      {
        ok: false,
        error: "That's a lot of changes very quickly. Give it a moment.",
      },
      {
        status: 429,
        headers: limit.retryAfter
          ? { ...noStore, "Retry-After": String(limit.retryAfter) }
          : noStore,
      },
    );
  }

  const id = (new URL(request.url).searchParams.get("id") ?? "")
    .trim()
    .slice(0, MAX_ID);

  const joiner = id ? await getJoiner(id) : null;
  if (!joiner || !sameAccount(joiner.accountEmail, session.email)) {
    return refuse("That person isn't on this account.", 404);
  }

  /* `eraseJoiner` rather than a row delete, because Postgres cascades and
     object storage does not: their signed contract is a file with only a
     column pointing at it, and deleting the row would leave the PDF — their
     name, their signature, the address on the contract, the IPs they signed
     from — sitting in the bucket with nothing referencing it. See `erase.ts`.

     A `null` here means the record went between the read above and this line —
     two tabs on the same account, most likely. Removing somebody who is
     already removed is the outcome the caller asked for, so it is reported as
     success rather than as an error about a race the person pressing the
     button had no part in. */
  await eraseJoiner(session.email, joiner.id);

  return NextResponse.json({ ok: true, id: joiner.id }, { headers: noStore });
}
