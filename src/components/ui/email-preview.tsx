"use client";

import * as React from "react";
import { CraigMark } from "./craig-mark";
import { render, SENDER, type EmailTemplate } from "@/lib/email";
import { cn } from "@/lib/cn";

/**
 * What lands in the inbox.
 *
 * Two parts, because they fail differently. The inbox row — sender, subject,
 * preheader — is the only bit most people ever read, and it's the bit template
 * editors usually don't show. The body is what you get if they open it.
 *
 * Deliberately not theme-aware: email renders on the recipient's terms, not
 * ours, and showing a dark-mode preview of something that will arrive on white
 * is a preview that lies. So it's light, always, inside a frame that makes
 * clear it's a different surface to the app around it.
 */

export function EmailPreview({
  template,
  values,
  className,
}: {
  template: EmailTemplate;
  /** Overrides for the merge fields; anything absent uses the example. */
  values?: Record<string, string>;
  className?: string;
}) {
  const subject = render(template.subject, values);
  const preheader = render(template.preheader, values);
  const body = render(template.body, values);
  const company = render("{{company}}", values);
  const from = SENDER.name(company);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-[#f4f2ef]",
        className,
      )}
    >
      {/* The inbox row. Everything that decides whether the rest gets read. */}
      <div className="flex items-start gap-2.5 border-b border-black/8 bg-white px-4 py-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#efece7]">
          <CraigMark className="size-4 text-[#3d332c]" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-semibold text-[#1f1d1a]">
              {from}
            </span>
            <span className="shrink-0 text-2xs text-[#8a8279]">now</span>
          </div>
          {/* The address, not just the display name. It's what a suspicious
              reader checks, and what deliverability actually turns on. */}
          <span className="truncate text-2xs text-[#8a8279]">
            {SENDER.address}
          </span>
          <span className="truncate text-sm font-medium text-[#1f1d1a]">
            {subject}
          </span>
          <span className="truncate text-xs text-[#8a8279]">{preheader}</span>
        </div>
      </div>

      {/* The body. 600px is the width every email client agrees on. */}
      <div className="px-4 py-6">
        <div className="mx-auto w-full max-w-[600px] rounded-lg bg-white px-6 py-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div className="flex flex-col gap-4">
            {body.split("\n\n").map((para, i) => (
              <p
                key={i}
                className="whitespace-pre-line text-sm leading-relaxed text-[#33302b]"
              >
                {para}
              </p>
            ))}

            {template.cta && (
              <span className="mt-1 inline-flex w-fit items-center rounded-md bg-[#3d332c] px-3.5 py-2 text-sm font-medium text-white">
                {render(template.cta, values)}
              </span>
            )}
          </div>

          <div className="mt-6 border-t border-black/8 pt-4">
            {/* No unsubscribe, on purpose. These are transactional — there's
                no list to leave, and offering one would imply there is. */}
            <p className="text-2xs leading-relaxed text-[#8a8279]">
              Sent by Craig on behalf of {company}. You got this because
              someone there added you to an onboarding, not because you signed
              up for anything. Reply to this and it reaches a person —{" "}
              {SENDER.replyTo}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
