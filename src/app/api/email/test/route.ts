import { NextResponse } from "next/server";
import { currentUser } from "@/lib/showcase/current-user";
import { rateLimit } from "@/lib/showcase/rate-limit";
import { findTemplate, render, SENDER } from "@/lib/email";
import { renderEmail } from "@/lib/email/html";
import { sendEmail } from "@/lib/email/send";

/**
 * One template, to one inbox, on purpose.
 *
 * The sandbox's send harness. It exists so somebody building Craig can find out
 * what a real client does with the markup, which is not a thing a preview can
 * tell you.
 *
 * The recipient is the environment's, never the request's. A route that sends
 * to an address in its own body is an open relay wearing a test harness's
 * clothes: it costs the person whose key it is their sending reputation, and
 * the first they hear about it is a suspended account. So the only thing the
 * caller may choose is *which* template — the address is fixed at deploy time,
 * and the worst a stranger who gets through the guard can do is mail the
 * builder his own templates.
 *
 * Guarded twice, for two different reasons. `currentUser` because sending on
 * somebody else's provider key is the real risk here and a signed cookie is
 * what stands between a stranger and it. The limiter because a signed-in caller
 * can still hold the button down, and Resend counts every one of those.
 */

/** Spends nothing from OpenAI's budget, and mustn't pretend otherwise — see
    the note on `spend` in rate-limit.ts. A send that drained the chat's daily
    cap would let the mail button switch Craig off for the day. */
const LIMIT_OPTIONS = { spend: false } as const;

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const session = await currentUser();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Not signed in." },
      { status: 401, headers: noStore },
    );
  }

  const limit = rateLimit(`email-test:${session.email}`, LIMIT_OPTIONS);
  if (!limit.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: limit.message ?? "Too many sends. Try again shortly.",
      },
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
    return NextResponse.json(
      { ok: false, error: "Expected JSON." },
      { status: 400, headers: noStore },
    );
  }

  const { templateId } = (body ?? {}) as Record<string, unknown>;
  const template =
    typeof templateId === "string" ? findTemplate(templateId) : undefined;
  if (!template) {
    return NextResponse.json(
      { ok: false, error: "No template by that name." },
      { status: 400, headers: noStore },
    );
  }

  const to = process.env.NEXT_PUBLIC_CRAIG_TEST_INBOX?.trim();
  if (!to) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No NEXT_PUBLIC_CRAIG_TEST_INBOX in .env.local, so there's nowhere to send. Add your own address — never a customer's — and restart the dev server.",
      },
      { status: 500, headers: noStore },
    );
  }

  /* No merge values, which means the defaults: the same fixture names the
     preview fills in. A test that substituted different values would be testing
     something nobody has looked at. */
  const { subject, html, text } = renderEmail(template);
  const company = render("{{company}}");
  const fromName = SENDER.name(company);

  const result = await sendEmail({ to, subject, html, text, fromName });

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

  /* The id is the point of the response. It's what makes "it sent" checkable
     against the Resend dashboard rather than a claim the button makes about
     itself. */
  return NextResponse.json(
    {
      ok: true,
      id: result.id,
      to,
      from: `${fromName} <${SENDER.address}>`,
      subject,
      template: template.name,
    },
    { headers: noStore },
  );
}
