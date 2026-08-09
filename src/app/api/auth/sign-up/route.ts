import { NextResponse } from "next/server";
import { SIGN_IN_PATH } from "@/lib/showcase/contract";
import { createAccount } from "@/lib/showcase/accounts";
import { clientKey, rateLimit } from "@/lib/showcase/rate-limit";
import { SIGN_UP_TAKEN, validateSignUp } from "@/lib/showcase/sign-up";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Sign-up, which creates the account.
 *
 * This is the showcase's front door: nothing exists until somebody comes
 * through it. That's the whole point of the screen — the product has never
 * heard of you, and then it has, because of something you did.
 *
 * It signs her straight in on success rather than sending her back to a form to
 * retype what she just typed. The password now lives with Supabase Auth, so
 * "signs her in" means asking GoTrue to verify the credential it stored ten
 * milliseconds ago and set its session cookies — the same outcome the
 * hand-rolled HMAC cookie delivered, minted by the thing that owns the
 * password instead of beside it.
 *
 * The 409 is still here, per email now: one account per address, and "sign up
 * again" must not be a way to take over somebody else's.
 */

/**
 * Whether a stranger may make an account here at all.
 *
 * An account is not an inert row. It can immediately call the invite route,
 * which sends a real, well-designed email from a domain we have verified, to an
 * address of the sender's choosing, signed with the company name they typed
 * into this form. Open sign-up plus that endpoint is, in two API calls, a relay
 * for convincing phishing — and the cost of that landing lands on the deployment
 * as a suspended provider account and a burnt sending domain, not on whoever
 * did it.
 *
 * So production has to say yes on purpose. Two variables, and the order they
 * are read in is the policy:
 *
 * `SHOWCASE_SIGN_UP_ALLOW` is a comma-separated list of addresses and `@domain`
 * suffixes. When it is set it is the whole answer, in every environment
 * including development — a guard you can only exercise in production is a guard
 * nobody has ever seen work. It is read first so that setting `SHOWCASE_SIGN_UP`
 * as well cannot widen it; a restriction that a second variable switches off is
 * not a restriction.
 *
 * `SHOWCASE_SIGN_UP=open` is the deliberate keystroke that says "yes, anybody".
 * It is what a public showcase wants and it is one line in an environment file,
 * which is the point: openness is a decision somebody made rather than a default
 * they inherited.
 *
 * With neither set, development is open and production is closed. That is the
 * fail-closed direction and it is the right way round — the failure mode of
 * getting it wrong is "the owner has to set a variable", not "strangers were
 * sending mail from our domain all weekend". Local work is untouched, because
 * `NODE_ENV` is not `production` there and never has been.
 */
function signUpOpenTo(email: string): boolean {
  const allow = (process.env.SHOWCASE_SIGN_UP_ALLOW ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (allow.length > 0) {
    const address = email.trim().toLowerCase();
    const domain = address.split("@")[1] ?? "";
    /* An entry beginning with `@` is a domain, and it is matched against the
       domain rather than with `endsWith` on the whole address. `endsWith`
       would let `evil-northgate.io` through an allowlist of `@northgate.io`,
       which is the classic way this check is written wrong. */
    return allow.some((entry) =>
      entry.startsWith("@") ? domain === entry.slice(1) : address === entry,
    );
  }

  if (process.env.NODE_ENV !== "production") return true;

  return process.env.SHOWCASE_SIGN_UP?.trim().toLowerCase() === "open";
}

/**
 * One sentence for a closed instance and for an address that isn't on the list,
 * because they are the same thing as far as the person reading it is concerned
 * and telling them apart would confirm that an allowlist exists and that theirs
 * is not on it — which is the first thing worth knowing if you are trying to
 * find an address that is.
 */
const SIGN_UP_CLOSED = "Sign-up isn't open at the moment.";
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

  /* After validation and before the store is touched at all. Before, because a
     closed instance that still checked for a duplicate would answer differently
     for an address that has an account than for one that doesn't, and that
     difference is an account-enumeration oracle sitting behind a door that is
     supposed to be shut. */
  if (!signUpOpenTo(fields.email)) {
    return NextResponse.json({ error: SIGN_UP_CLOSED }, { status: 403 });
  }

  /* One check, not two. The store asks GoTrue to create the user, and GoTrue's
     uniqueness guarantee is the one that holds — this asks once and believes
     the answer. */
  const account = await createAccount(fields);
  if (!account) {
    return NextResponse.json(
      { error: SIGN_UP_TAKEN, signInPath: SIGN_IN_PATH },
      { status: 409 },
    );
  }

  /* The session, from the credential's owner. This sets Supabase's cookies on
     the response via the server client's cookie bridge — nothing here touches
     a cookie by name, which is what keeps sign-in and sign-out symmetric. */
  const supabase = await supabaseServer();
  const signedIn = await supabase.auth.signInWithPassword({
    email: account.email,
    password: fields.password,
  });
  if (signedIn.error) {
    /* The account exists and the password was set two calls ago, so this is
       infrastructure misbehaving rather than the person. The account is real:
       send them to sign-in rather than pretending nothing happened. */
    return NextResponse.json(
      {
        error:
          "The account was created but signing you in didn't take. Sign in with the details you just chose.",
        signInPath: SIGN_IN_PATH,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
