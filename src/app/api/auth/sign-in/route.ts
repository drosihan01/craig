import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/showcase/contract";
import { verifyCredentials } from "@/lib/showcase/accounts";
import { clientKey, rateLimit } from "@/lib/showcase/rate-limit";
import {
  createSession,
  SESSION_COOKIE_OPTIONS,
  SESSION_MAX_AGE,
} from "@/lib/showcase/session";

/**
 * The only door in, once there's something to come in to.
 *
 * Checked against the account store rather than against the environment. The
 * account is created by signing up now, so this verifies a password somebody
 * actually chose against a hash derived from it — which is the version worth
 * demonstrating, and the version where getting the comparison right matters.
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

  const account = await verifyCredentials(email, password);
  if (!account) {
    return NextResponse.json({ error: REJECTION }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    SESSION_COOKIE,
    await createSession(account.email, account.name, account.company),
    { ...SESSION_COOKIE_OPTIONS, maxAge: SESSION_MAX_AGE },
  );
  return response;
}
