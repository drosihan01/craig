import { NextResponse } from "next/server";
import { currentUser } from "@/lib/craig/current-user";
import { getJoiner } from "@/lib/craig/joiners";
import {
  describeDetails,
  noteReveal,
  readPersonalDetails,
  sealingProblem,
} from "@/lib/craig/personal-details";
import { rateLimit } from "@/lib/craig/rate-limit";

/**
 * The admin asking to see one person's personal details in full.
 *
 * **Why this is a request rather than a prop.** The person page already knows
 * these details — it decrypts them server-side to draw the masked summary — so
 * the lazy version of this feature is to send the lot down with the page and
 * hide them behind a `useState`. That is not hiding anything. The values would
 * be in the HTML of a page somebody leaves open on a second monitor, shares in
 * a screen recording, or screenshots to ask a colleague about a start date, and
 * every browser extension with DOM access would have them. Making the reveal a
 * fetch means the address and the date of birth cross the wire when somebody
 * presses the button and at no other time, which is the difference between
 * "masked" and "masked".
 *
 * **What it checks, in the order it checks it.** A session, because a signed-out
 * caller is nobody. Then that the joiner belongs to *this* account — the same
 * `belongsTo` rule the page itself applies, restated here because a route is
 * reachable without the page and an endpoint that trusted the page's check
 * would be an endpoint with no check. Then that the step named is a
 * personal-details step of theirs. A person who isn't yours reads identically
 * to a person who doesn't exist, for the reason the page argues at length:
 * anything else confirms that a guessed id is real.
 *
 * **POST, for a read.** Deliberately. A GET would be linkable, prefetchable and
 * loggable with its parameters in the URL, and — the part that actually decides
 * it — a browser or a proxy is entitled to cache one. This is an act rather
 * than an address: somebody pressed Reveal, once.
 */

/** Block ids are generated, so this is a sanity bound rather than a rule. */
const MAX_ID = 64;

const noStore = { "Cache-Control": "no-store" };

/* Written for the admin, who can act on all of it. */
const refuse = (error: string, status: number) =>
  NextResponse.json({ ok: false, error }, { status, headers: noStore });

const oneLine = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) {
    return refuse("Sign in again — this page has stopped recognising you.", 401);
  }

  /* Keyed to the reader. This route decrypts, which is the one thing on this
     deployment worth making expensive to do in a loop: a session that has
     somehow been taken should not be able to sweep every person's details as
     fast as the network allows. Not against the model budget — nothing here
     reaches OpenAI, and a reveal must never be able to switch the chat off. */
  const limit = rateLimit(`showcase-details:${user.email}`, { spend: false });
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: limit.message },
      {
        status: 429,
        headers: limit.retryAfter
          ? { ...noStore, "Retry-After": String(limit.retryAfter) }
          : noStore,
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse("That didn't arrive in one piece. Try it again.", 400);
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const joinerId = oneLine(input.joinerId, MAX_ID);
  const stepId = oneLine(input.stepId, MAX_ID);
  if (!joinerId || !stepId) {
    return refuse("Reload the page and try that again.", 400);
  }

  const joiner = await getJoiner(joinerId);
  /* One sentence for "not yours" and "not there", and it is the not-there one.
     A separate refusal for a person who exists but belongs to somebody else
     would confirm the id is real, which is precisely what the ownership check
     is for. */
  if (
    !joiner ||
    joiner.accountEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()
  ) {
    return refuse("That person isn't on your account.", 404);
  }

  const step = joiner.steps.find((s) => s.id === stepId);
  if (!step || step.field !== "personal-details") {
    return refuse("There are no details on that step.", 400);
  }

  const details = (await readPersonalDetails(joiner.id)).get(stepId);
  if (!details) {
    /* Three quite different situations, one honest sentence, because from here
       they are indistinguishable: the key is unset, the key has been rotated
       since this was sealed, or the row was edited. The first has a specific
       message written for whoever can act, so it is offered when it applies. */
    return refuse(
      sealingProblem() ??
        "I can't open these details. That means the key they were encrypted with has changed since they were given, and they'll have to be asked for again.",
      409,
    );
  }

  /* One line in the runtime log per reveal. Not an audit trail — this product
     has no table for that and saying otherwise would be theatre — but the
     difference between "only their admin can read this" being a claim and
     being something anybody can check afterwards. Never the values. */
  noteReveal(joiner.id, stepId, user.email);

  return NextResponse.json(
    { ok: true, lines: describeDetails(details) },
    { headers: noStore },
  );
}
