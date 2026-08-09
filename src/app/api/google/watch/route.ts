import { NextResponse } from "next/server";
import { currentUser } from "@/lib/showcase/current-user";
import { ensureWatch, notificationAddress } from "@/lib/showcase/google-watch";

/**
 * One account asking to be told when its own directory changes.
 *
 * The manual half of the subscription. A channel is normally created without
 * anybody asking — on the redirect back from consent, and again by the renewal
 * sweep — and this is the door for the cases where neither happened: a Workspace
 * connected before this feature existed, a deployment that only gained a public
 * address afterwards, or somebody who has just been told their new starter's
 * step is not settling and would like to know why.
 *
 * `POST`, because it is not a read: it can create a subscription at Google. That
 * it does so idempotently makes it safe to press twice, not safe to prefetch.
 *
 * Deliberately not rate limited, which is worth a sentence because every other
 * route here is. `ensureWatch` short-circuits on a channel that is live and not
 * due before it decrypts anything or opens a socket, so pressing this in a loop
 * costs two indexed reads per press and reaches Google only when a renewal was
 * genuinely owed. The expensive path is already gated by the thing that makes
 * the endpoint correct.
 *
 * `GET` is not implemented on purpose. The obvious "what is my channel doing"
 * read would describe a subscription by id and expiry, and none of that is a
 * fact a customer can act on — the connect screen already tells them the two
 * things they can (whether they are connected, and whether it still works).
 */

const noStore = { "Cache-Control": "no-store" };

export async function POST() {
  const session = await currentUser();
  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Sign in to the showcase first — a notification channel belongs to an account.",
      },
      { status: 401, headers: noStore },
    );
  }

  /* Only ever this session's own account. The email comes from the session and
     never from the request, so there is no spelling of this call that
     subscribes to somebody else's directory. */
  const outcome = await ensureWatch(session.email);

  if (!outcome.ok) {
    /* 200 with `ok: false`, not a 4xx, and the reason is the one
       `lib/google/result.ts` makes at length: two of these are not faults.
       "Nothing is connected" and "this deployment has no public address" are
       ordinary states of a working system, and a status code that says the
       request was malformed would be a screen going red about a to-do.
       `refused` travels the same way so the caller has one shape to render. */
    return NextResponse.json(
      { ok: false, reason: outcome.reason, error: outcome.message },
      { headers: noStore },
    );
  }

  /* The address is echoed so somebody setting this up can see where Google was
     actually told to deliver. It is not a secret — it is a public URL on this
     deployment, and it is in Google's own console under the channel — and it is
     the single most useful thing to have in front of you when notifications are
     arriving nowhere. The channel token is not echoed, and has no field here
     to travel in. */
  return NextResponse.json(
    {
      ok: true,
      state: outcome.state,
      address: notificationAddress().address,
    },
    { headers: noStore },
  );
}
