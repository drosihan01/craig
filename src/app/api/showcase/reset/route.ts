import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/showcase/contract";
import { clearAccounts } from "@/lib/showcase/accounts";
import { clearJoiners } from "@/lib/showcase/joiners";
import { SESSION_COOKIE_OPTIONS } from "@/lib/showcase/session";

/**
 * Back to nothing. The sandbox's reset button.
 *
 * The showcase's argument is that it starts empty and only contains what
 * actually happened, which is only demonstrable if there's a way to make it
 * empty again. Without this, every sign-up is permanent until someone restarts
 * the server, and "watch it run from nothing" becomes a thing you get one
 * attempt at.
 *
 * Every account goes, not just the caller's. This is a demo control, not an
 * account-deletion feature — it exists so the next person sees the empty
 * showcase, which only works if it's genuinely empty.
 *
 * POST for the same reason sign-out is: a prefetcher, an image tag or a link in
 * somebody's mail can issue a GET, and none of them should be able to delete
 * the account.
 *
 * The session cookie goes too. `currentUser` already refuses a session whose
 * account has gone, so this isn't what makes the reset safe — it's what stops
 * the caller sitting on a token that looks valid until the next server render
 * quietly disagrees.
 */
export async function POST() {
  clearAccounts();

  /* The people those accounts invited go with them. They are the other half of
     the same state — the only half that lives on the server — and an account
     store emptied while the joiners survive leaves onboardings belonging to
     nobody, still reachable by anyone holding a link from before the reset. */
  clearJoiners();

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: 0,
  });
  return response;
}
