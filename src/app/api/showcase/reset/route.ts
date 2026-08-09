import { NextResponse } from "next/server";
import { clearAccounts } from "@/lib/craig/accounts";
import { clearJoiners } from "@/lib/craig/joiners";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Back to nothing. The sandbox's reset button.
 *
 * The showcase's argument is that it starts empty and only contains what
 * actually happened, which is only demonstrable if there's a way to make it
 * empty again. Without this, every sign-up is permanent, and "watch it run
 * from nothing" becomes a thing you get one attempt at.
 *
 * Every account goes, not just the caller's — and with Supabase that now
 * means the auth users too, which `clearAccounts` handles: a reset that left
 * the sign-ins behind would make every email permanently "taken" by a user
 * whose account no longer exists.
 *
 * POST for the same reason sign-out is: a prefetcher, an image tag or a link
 * in somebody's mail can issue a GET, and none of them should be able to
 * delete the account.
 *
 * The caller's own session goes too. `currentUser` already refuses a session
 * whose account has gone, so this isn't what makes the reset safe — it's what
 * stops the caller sitting on a token that looks valid until the next server
 * render quietly disagrees.
 */
export async function POST() {
  await clearAccounts();

  /* The people those accounts invited go with them — by cascade now, but
     called explicitly anyway: the cascade covers joiners whose account row
     still existed, and this covers any orphan a partial failure ever leaves.
     A reset that can't over-delete has no reason to under-delete. */
  await clearJoiners();

  const supabase = await supabaseServer();
  await supabase.auth.signOut({ scope: "local" });

  return NextResponse.json({ ok: true });
}
