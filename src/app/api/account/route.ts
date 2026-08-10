import { NextResponse } from "next/server";
import { currentUser } from "@/lib/craig/current-user";
import { SESSION_COOKIE } from "@/lib/craig/contract";
import { eraseAccount } from "@/lib/craig/erase";

/**
 * Closing an account, for good.
 *
 * ## Why the address has to be typed
 *
 * The body must carry the signed-in address, spelled out. Not because it
 * authorises anything — the cookie already did that, and a field the browser
 * sends cannot prove anything about who is pressing the button — but because
 * it is the difference between a click and a decision. Everything else on this
 * account can be undone or asked for again; this cannot. A confirmation that
 * costs nothing to give is a confirmation nobody reads.
 *
 * It is compared against the *session* address rather than one from the body,
 * so the only account this route can ever erase is the one making the request.
 * There is no id parameter and no admin form of this on purpose: with one
 * admin per account, "delete somebody else's account" is not a thing this
 * product does.
 *
 * ## What it refuses
 *
 * A live subscription. `eraseAccount` explains why at length; the short of it
 * is that Stripe keeps billing regardless of what we delete, and the only
 * thing erasing first accomplishes is destroying the record of what the
 * charges were for. The refusal carries the subscription id so the message can
 * be specific.
 */
export async function DELETE(request: Request) {
  const session = await currentUser();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "You're not signed in." },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    confirm?: unknown;
  } | null;

  const typed = typeof body?.confirm === "string" ? body.confirm.trim() : "";

  if (typed.toLowerCase() !== session.email.trim().toLowerCase()) {
    return NextResponse.json(
      {
        ok: false,
        error: `Type ${session.email} to confirm. Nothing has been deleted.`,
      },
      { status: 400 },
    );
  }

  const result = await eraseAccount(session.email);

  if (!result.ok) {
    /* 409 rather than 400: the request was well formed and the account exists.
       What is wrong is the state it is in, and that is something they can
       change and come back. */
    return NextResponse.json(
      { ok: false, error: result.reason, subscriptionId: result.subscriptionId },
      { status: 409 },
    );
  }

  /* The cookie outlives the account it points at, so it goes here rather than
     being left for the next request to trip over. */
  const response = NextResponse.json({ ok: true, erased: result });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
