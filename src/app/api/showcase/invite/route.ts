import { NextResponse } from "next/server";
import { currentUser } from "@/lib/showcase/current-user";
import { getAccount } from "@/lib/showcase/accounts";
import { rateLimit } from "@/lib/showcase/rate-limit";
import { findTemplate, SENDER } from "@/lib/email";
import { renderEmail } from "@/lib/email/html";
import { sendEmail } from "@/lib/email/send";

/**
 * Giving somebody a seat, which is the first thing in this product that
 * actually reaches a stranger.
 *
 * Everything else that sends is addressed to the person who pressed the button.
 * This one is addressed to whoever they typed, so it is the first route here
 * with the shape of an open relay — and the mitigations are the whole design of
 * the file rather than a check at the top of it:
 *
 * 1. **The words are ours.** The caller picks no template and writes no prose.
 *    One template, chosen here by name, and the only things they supply are the
 *    values that make it about a particular person — a name, a role, a date. So
 *    the worst message a determined caller can compose is a genuine invitation
 *    to a company they don't work for, which is spam nobody would pay for.
 * 2. **One recipient.** One address, checked against a shape that admits no
 *    separator and no newline, so this cannot be turned into a list.
 * 3. **Every merged value is flattened to one line and cut short.** A newline in
 *    a name is how a merge field becomes a mail header, and eighty characters is
 *    more than a job title needs and less than a message.
 * 4. **Signed in, and limited.** The session is what stands between a stranger
 *    and somebody else's provider key; the limiter is what stands between a
 *    signed-in caller and the same key, because a cookie doesn't stop a loop.
 *
 * What remains after all four is a signed-in user mailing a small number of
 * addresses of their choosing a fixed, honest invitation. That is the product,
 * and it is also the residual risk — which is why the copy is fixed and the
 * volume is capped rather than the address being trusted.
 */

/** The trigger email. Not the caller's choice — see above. */
const TEMPLATE_ID = "seat-invite";

/** Spends nothing from OpenAI's budget, and mustn't pretend otherwise — see
    the note on `spend` in rate-limit.ts. An invite that drained the chat's daily
    cap would let this button switch Craig off for the day. */
const LIMIT_OPTIONS = { spend: false } as const;

/**
 * Who gets a silent copy of every invitation.
 *
 * So the person whose product this is can read what a stranger actually
 * received, rather than trusting a green tick. The default is in code rather
 * than only in `.env.example`, because a copy that silently stops arriving when
 * an environment is missing a variable is worse than no copy at all.
 */
const BCC =
  process.env.SHOWCASE_INVITE_BCC?.trim() || "dzakyayrosihan@gmail.com";

/** Longer than any real name or job title, shorter than a message. */
const MAX_FIELD = 80;

/** RFC 5321's ceiling on an address. Anything longer is not a mistake. */
const MAX_ADDRESS = 254;

const noStore = { "Cache-Control": "no-store" };

/**
 * A caller-supplied value, as one harmless line.
 *
 * Control characters first, whitespace second. A newline is caught by either,
 * but the unprintable ones either side of it — NUL, and the C0 range generally
 * — are only caught by the first, and those are the characters that survive a
 * naive trim and end up in a header.
 */
function oneLine(value: unknown, max = MAX_FIELD): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * One address, or nothing.
 *
 * Deliberately two tests rather than one long expression. The shape check is
 * the usual "something, an @, something with a dot" — permissive, because
 * addresses are stranger than people think and refusing a real one is a bug the
 * person can't work around. The forbidden set is the part that matters: comma
 * and semicolon are how one field becomes several recipients, angle brackets
 * and quotes are how it becomes a display name wrapping somebody else's
 * address, and whitespace covers every newline that turns a value into a
 * header. An apostrophe is allowed through, because o'brien@ is a person.
 */
function oneAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const address = value.trim();

  if (address.length === 0 || address.length > MAX_ADDRESS) return null;
  if (/[\s,;<>"\\\u0000-\u001f\u007f]/.test(address)) return null;
  if (!/^[^@]+@[^@]+\.[^@]{2,}$/.test(address)) return null;

  return address;
}

/**
 * `2026-08-24` as "Monday 24 August".
 *
 * Built from the parts rather than passed to `new Date(string)`, which reads a
 * bare date as UTC midnight and then formats it in the server's timezone —
 * anywhere west of Greenwich, that is yesterday. A start date that is one day
 * out in the invitation is the kind of error nobody notices until somebody
 * turns up on the wrong morning.
 */
function readableDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!parts) return null;

  const date = new Date(
    Number(parts[1]),
    Number(parts[2]) - 1,
    Number(parts[3]),
  );
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

const refuse = (error: string, status: number) =>
  NextResponse.json({ ok: false, error }, { status, headers: noStore });

export async function POST(request: Request) {
  const session = await currentUser();
  if (!session) return refuse("Not signed in.", 401);

  const limit = rateLimit(`showcase-invite:${session.email}`, LIMIT_OPTIONS);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: limit.message ?? "Too many invitations at once." },
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
    return refuse("Expected JSON.", 400);
  }

  const input = (body ?? {}) as Record<string, unknown>;

  const name = oneLine(input.name);
  if (!name) return refuse("Enter their name.", 400);

  const to = oneAddress(input.email);
  if (!to) return refuse("That doesn't look like an email address.", 400);

  const startDate = readableDate(input.startDate);
  if (!startDate) return refuse("Pick the day they start.", 400);

  const role = oneLine(input.role);
  const workflowId = oneLine(input.workflowId, 64);
  const workflowName = oneLine(input.workflowName) || "Onboarding";

  /* The company is read from the account, never from the request. It is the
     name the invitation is signed with, and a value the caller could set would
     let this route send a convincing welcome to a company they have nothing to
     do with — the one merge field where being wrong is a lie rather than a
     typo. */
  const account = getAccount(session.email);
  if (!account) return refuse("Not signed in.", 401);
  if (!account.company) {
    return refuse(
      "Your account has no company name on it, and the invitation goes out under it.",
      400,
    );
  }

  const template = findTemplate(TEMPLATE_ID);
  if (!template) {
    return refuse("The invitation template is missing.", 500);
  }

  /* Every token in the vocabulary, not merely the ones this template reads
     today. `render` fills anything absent from the *preview's* fixtures — so a
     token left out here doesn't arrive blank, it arrives as a stranger's name
     in somebody's real welcome email, and it does that the day the copy gains a
     merge field rather than the day anyone changes this file.

     Which is why the two with nothing real behind them at invite time are
     supplied empty. An invitation with a visible gap in it is a bug somebody
     reports; an invitation naming a person from a demo company reads as
     correct.

     `link` empty is what suppresses the button. There is no page for a new
     starter to land on yet, and in a real invitation a "Get started" that goes
     nowhere is worse than no button at all. */
  const values = {
    first_name: name.split(" ")[0],
    full_name: name,
    company: account.company,
    role,
    start_date: startDate,
    sender: session.name,
    workflow: workflowName,
    step: "",
    owner: "",
    link: "",
  };

  const { subject, html, text } = renderEmail(template, values);
  const fromName = SENDER.name(account.company);

  const result = await sendEmail({
    to,
    bcc: BCC,
    subject,
    html,
    text,
    fromName,
  });

  if (!result.ok) {
    /* Configuration this deployment got wrong is a 500 — the caller did nothing
       unusual and can't fix it by asking differently. A provider that refused
       or vanished is a 502. Neither ever carries Resend's own words. */
    const status =
      result.reason === "rate-limited"
        ? 429
        : result.reason === "unreachable" || result.reason === "rejected"
          ? 502
          : 500;

    return NextResponse.json(
      { ok: false, reason: result.reason, error: result.message },
      {
        status,
        headers: result.retryAfter
          ? { ...noStore, "Retry-After": String(result.retryAfter) }
          : noStore,
      },
    );
  }

  /* Enough for the caller to say what happened without guessing at it, and the
     id is the part that makes "it sent" checkable against the Resend dashboard
     rather than a claim this route makes about itself. The bcc is echoed for
     the same reason: it goes to whoever runs this deployment, and it is the one
     recipient the response is the only evidence of. */
  return NextResponse.json(
    {
      ok: true,
      id: result.id,
      to,
      bcc: BCC,
      from: `${fromName} <${SENDER.address}>`,
      subject,
      person: { name, role, startDate },
      workflow: { id: workflowId, name: workflowName },
    },
    { headers: noStore },
  );
}
