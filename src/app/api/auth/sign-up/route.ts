import { NextResponse } from "next/server";
import { SESSION_COOKIE, SIGN_IN_PATH } from "@/lib/showcase/contract";
import { createAccount } from "@/lib/showcase/accounts";
import { clientKey, rateLimit } from "@/lib/showcase/rate-limit";
import { SIGN_UP_TAKEN, validateSignUp } from "@/lib/showcase/sign-up";
import {
  createSession,
  SESSION_COOKIE_OPTIONS,
  SESSION_MAX_AGE,
} from "@/lib/showcase/session";

/**
 * Sign-up, which creates the account.
 *
 * This is the showcase's front door: nothing exists until somebody comes
 * through it. That's the whole point of the screen — the product has never
 * heard of you, and then it has, because of something you did.
 *
 * It signs her straight in on success rather than sending her back to a form to
 * retype what she just typed. Everything needed to issue a session is already
 * on this request and already verified; bouncing her to sign-in would be asking
 * her to prove something we watched her establish ten milliseconds ago.
 *
 * The 409 is still here, per email now: one account per address, and "sign up
 * again" must not be a way to take over somebody else's.
 */
export async function POST(request: Request) {
  /* Not a spend guard — creating an account costs nothing but hashing, and a
     script hammering this must not be able to exhaust the chat route's budget. */
  const limit = rateLimit(`sign-up:${clientKey(request)}`, { spend: false });
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
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const { name, email, company, password } = (body ?? {}) as Record<
    string,
    unknown
  >;
  const fields = {
    name: typeof name === "string" ? name : "",
    email: typeof email === "string" ? email : "",
    company: typeof company === "string" ? company : "",
    password: typeof password === "string" ? password : "",
  };

  /* Validated here as well as in the form. A form is a suggestion; anything
     that decides is on this side of the wire, and both sides run the same
     function so the two rulesets can't drift. */
  const errors = validateSignUp(fields);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 422 });
  }

  /* One check, not two. An earlier version tested for a duplicate here as well,
     which read as belt and braces but was really two places that had to agree
     about the same invariant. The store is the one that can enforce it — it
     re-checks after its own hashing await — so this asks once and believes the
     answer. */
  const account = await createAccount(fields);
  if (!account) {
    return NextResponse.json(
      { error: SIGN_UP_TAKEN, signInPath: SIGN_IN_PATH },
      { status: 409 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    SESSION_COOKIE,
    await createSession(account.email, account.name, account.company),
    { ...SESSION_COOKIE_OPTIONS, maxAge: SESSION_MAX_AGE },
  );
  return response;
}
