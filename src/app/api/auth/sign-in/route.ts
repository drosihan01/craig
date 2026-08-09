import { NextResponse } from "next/server";
import { getAccount } from "@/lib/showcase/accounts";
import { clientKey, rateLimit } from "@/lib/showcase/rate-limit";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * The only door in, once there's something to come in to.
 *
 * The credential check moved to Supabase Auth: GoTrue stores the password,
 * GoTrue verifies it, and this route's job is to ask and to keep its answers
 * indistinguishable. GoTrue's own comparison is constant-time and its "no such
 * user" and "wrong password" are the same error, which is exactly the property
 * the old hand-rolled check spent a dummy PBKDF2 derivation buying.
 *
 * One check GoTrue can't make: whether the *account* still exists. A reset
 * deletes rows and auth users together, but the two are separate systems and
 * this route must not mint a session for a sign-in whose account row has gone
 * — so it verifies, then looks, and signs back out if the look comes up empty.
 */

/** Deliberately identical for a wrong email, a wrong password, and no account
    at all. Saying which one it was turns "guess a credential pair" into
    "confirm an address, then guess a password" — a far shorter job. */
const REJECTION = "That email and password don't match an account.";

export async function POST(request: Request) {
  /* Guesses cost an attacker nothing and cost us everything to get wrong, so
     here the limit is the security control rather than a spend guard. Hence
     `spend: false`: failed logins must not eat the chat route's daily budget,
     or password-guessing becomes a way to switch the product off. */
  const limit = rateLimit(`sign-in:${clientKey(request)}`, { spend: false });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a minute and try again." },
      {
        status: 429,
        headers: limit.retryAfter
          ? { "Retry-After": String(limit.retryAfter) }
          : undefined,
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: REJECTION }, { status: 400 });
  }

  const { email, password } = (body ?? {}) as Record<string, unknown>;
  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: REJECTION }, { status: 400 });
  }

  const supabase = await supabaseServer();
  const signedIn = await supabase.auth.signInWithPassword({ email, password });
  if (signedIn.error) {
    return NextResponse.json({ error: REJECTION }, { status: 401 });
  }

  /* A valid credential for a vanished account is still a rejection — and the
     freshly minted session goes with it, or the browser would hold cookies
     that every page refuses. */
  const account = await getAccount(email);
  if (!account) {
    await supabase.auth.signOut({ scope: "local" });
    return NextResponse.json({ error: REJECTION }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
