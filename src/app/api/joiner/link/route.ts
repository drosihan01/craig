import { NextResponse } from "next/server";
import { logoForAccount } from "@/lib/craig/accounts";
import { JOIN_PATH } from "@/lib/craig/contract";
import { createJoinerToken } from "@/lib/craig/joiner-session";
import { latestJoinerByEmail } from "@/lib/craig/joiners";
import { clientKey, rateLimit } from "@/lib/craig/rate-limit";
import { findTemplate, SENDER } from "@/lib/email";
import { renderEmail } from "@/lib/email/html";
import { sendEmail } from "@/lib/email/send";

/**
 * A new link, for the new starter who lost the first one.
 *
 * Until this existed, an invitation was a one-shot credential delivered by
 * email: lose the message and the only way back was to ask the person who
 * invited you to do something about it — which the "this link didn't work"
 * screen said out loud, and which meant somebody's onboarding stopped until an
 * admin read a message and remembered how to resend. For a product whose entire
 * promise is that things keep moving while nobody is watching, that was the
 * wrong place to need a person.
 *
 * **The answer is the same whether the address exists or not, and that is the
 * whole design of this route.** Everything else here follows from it.
 *
 * A joiner's email is not a public fact. It is the address of somebody a
 * particular company has just hired, and "does Craig have an invitation for
 * this address" is a question with a genuinely sensitive answer: it discloses
 * that a named person has taken a job somewhere, to anybody who can type. So
 * this route reports success for every well-formed address, sends only when
 * there is somewhere to send, and — the part that is easy to get wrong — takes
 * the same *shape* either way: no extra round trip on a hit, no early return on
 * a miss, no difference a stopwatch could read. The reply says "if that address
 * has an invitation" and means it.
 *
 * The rate limit is what stops that guarantee being used as a mailing list. Two
 * ceilings, because they stop different things: per address, so one person's
 * inbox cannot be filled by somebody who knows where they work; and per client,
 * so a script cannot walk a list of addresses to find out which ones bounce.
 * Neither spends the daily global budget — that one guards the OpenAI key, and
 * letting a stranger drain it by asking for links would be a denial of service
 * built out of a safety feature.
 *
 * A send that fails is not reported either. The person on the other end cannot
 * act on "Resend refused this address", and telling them apart from the silent
 * case would give back exactly the distinction the route exists to withhold.
 * Failures go to the log, where somebody who can act is already looking.
 */

const TEMPLATE_ID = "joiner-link";

/** Long enough for a real address, short enough not to be a payload. */
const MAX_EMAIL = 254;

const noStore = { "Cache-Control": "no-store" } as const;

/**
 * What everybody is told, whatever happened.
 *
 * One constant rather than the same sentence written at four exits, because
 * four copies is four chances for one of them to drift into saying something
 * true about this particular address.
 */
const SAME_ANSWER =
  "If that address has an invitation, a new link is on its way. It can take a minute to arrive, and it's worth checking spam.";

/**
 * Deliberately not the sign-up validator.
 *
 * That one is written to help somebody fix a typo while they are looking at the
 * field — it distinguishes a missing `@` from a missing domain. Here, any
 * refusal that is more specific than "that isn't an address" is a refusal that
 * tells a stranger something about what we hold. This is the crudest test that
 * still stops a value that could not possibly be an email from spending a rate
 * limit slot.
 */
function usableAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length < 3 || trimmed.length > MAX_EMAIL) return null;
  if (!/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Malformed request." },
      { status: 400, headers: noStore },
    );
  }

  const email = usableAddress((body as { email?: unknown })?.email);
  if (!email) {
    /* The one refusal that says something specific, and it can: it is a fact
       about what they typed rather than about what we hold. */
    return NextResponse.json(
      { ok: false, error: "That doesn't look like an email address." },
      { status: 400, headers: noStore },
    );
  }

  /* Both ceilings are checked before anything is read, so a rate-limited
     request costs a map lookup and reveals nothing. `spend: false` on both —
     see the note above about the global budget. */
  const perAddress = await rateLimit(`joiner-link:${email}`, { spend: false });
  if (!perAddress.ok) {
    return NextResponse.json(
      { ok: false, error: perAddress.message },
      { status: 429, headers: noStore },
    );
  }

  const perClient = await rateLimit(`joiner-link-ip:${clientKey(request)}`, {
    spend: false,
  });
  if (!perClient.ok) {
    return NextResponse.json(
      { ok: false, error: perClient.message },
      { status: 429, headers: noStore },
    );
  }

  try {
    const joiner = await latestJoinerByEmail(email);

    if (joiner) {
      const template = findTemplate(TEMPLATE_ID);
      if (!template) {
        /* Ours, not theirs, and invisible to them by design. */
        console.error(`[joiner/link] no template "${TEMPLATE_ID}"`);
      } else {
        const token = await createJoinerToken(joiner.id);
        const link = `${new URL(request.url).origin}${JOIN_PATH}?token=${encodeURIComponent(token)}`;

        /* Every token in the vocabulary, including the ones this template does
           not read — the invite route explains why at length and it is the same
           hazard: `render` fills anything absent from the *preview's* fixtures,
           so a token left out arrives as a person from a demo company rather
           than as a visible blank.

           The four supplied empty are the four this message must not carry.
           Role, start date, step and owner are all facts about somebody's job,
           and this message is sent to an address somebody typed. The person it
           is really for already knows them; anybody else must not learn them
           from us. */
        /* Their employer's logo, from the joiner's own record.
         *
         * This route answers identically whether or not the address it was
         * given belongs to anybody, and the logo does not change that: it is
         * only read inside the branch where a joiner was actually found, and it
         * only ever reaches that joiner's own inbox. Nothing about it is
         * observable from the response, which is the one property this route
         * exists to protect. */
        const logo = await logoForAccount(joiner.accountEmail);

        const { subject, html, text } = renderEmail(
          template,
          {
            first_name: joiner.name.split(" ")[0] || joiner.name,
            full_name: joiner.name,
            company: joiner.company,
            role: "",
            start_date: "",
            sender: "",
            step: "",
            owner: "",
            link,
          },
          logo,
        );

        const sent = await sendEmail({
          to: joiner.email,
          subject,
          html,
          text,
          fromName: SENDER.name(joiner.company),
          /* No blind copy, and this one is not the invitation. An invitation is
             bcc'd so whoever runs the deployment can read what a stranger
             received; this message is triggered by an unauthenticated form, so
             the same bcc would let anybody who knows an address post a copy of
             a working magic link into somebody else's inbox. */
          sensitive: true,
        });

        if (!sent.ok) {
          /* Logged and not reported. `send.ts` writes for whoever runs this
             deployment, and the person waiting cannot act on any of it. */
          console.error(`[joiner/link] send failed: ${sent.reason}`);
        }
      }
    }
  } catch (cause) {
    /* Swallowed on purpose, after logging. Anything thrown here — a missing
       `SESSION_SECRET`, the database being unreachable — is ours, and letting
       it change the reply would turn an outage into the one signal this route
       is built to withhold. */
    console.error("[joiner/link] couldn't send a link:", cause);
  }

  return NextResponse.json(
    { ok: true, message: SAME_ANSWER },
    { headers: noStore },
  );
}
