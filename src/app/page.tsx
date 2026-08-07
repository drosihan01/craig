"use client";

import * as React from "react";
import {
  AppShell,
  CraigMark,
  PromptBar,
  Separator,
  type AppNotification,
} from "@/components/ui";
import { ACCOUNT } from "@/lib/demo";
import { AdminNav, NavStat } from "@/components/app-nav";

/**
 * The admin's first screen. Craig asks before it builds — a workflow generated
 * from nothing is a workflow the admin has to correct line by line, which is
 * more work than starting empty.
 *
 * So this is a prompt, not a dashboard. There's nothing to show a metric about
 * until they've told us who they are.
 */

const NOTIFICATIONS: AppNotification[] = [
  {
    id: "h1",
    kind: "info",
    title: "Welcome to Craig",
    description: "Start by describing Katalis below.",
    timestamp: new Date(Date.now() - 3 * 60_000),
  },
];

/* In Ada's voice, not a marketing deck's — the point of the prompt is that it
   takes the company as it actually is. */
const SUGGESTIONS = [
  "we're 3 people doing AI infra, first non-founder hire starts in two weeks and i have nothing written down",
  "everything lives in slack and a notion doc i wrote at 11pm before a fundraise call",
  "async, no meetings, we ship fast and things break sometimes — that's fine, but new people don't know that",
];

export default function AdminHomePage() {
  const [sent, setSent] = React.useState<string | null>(null);

  return (
    <AppShell
      title="Home"
      nav={<HomeNav />}
      notifications={NOTIFICATIONS}
      account={ACCOUNT}
    >
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-2xl flex-col justify-center py-16">
        <div className="flex flex-col items-center gap-4 text-center">
          <CraigMark className="size-14 text-accent" />
          <h1 className="text-4xl font-semibold tracking-[-0.03em]">
            Tell me a little bit about your company
          </h1>
          <p className="max-w-md text-md leading-relaxed text-text-muted">
            What you do, roughly how many people, and what a new starter&apos;s
            first week usually looks like. Rough is fine — you can attach a
            handbook too, however out of date it is. I&apos;ll draft the
            onboarding from there, and you&apos;ll edit it before anything goes
            live.
          </p>
        </div>

        <div className="pt-8">
          <PromptBar
            autoFocus
            placeholder="we're 3 people doing AI infra…"
            onSubmit={setSent}
            footnote="Craigson Lambda 2.0 · stays inside Katalis"
          />
        </div>

        <div className="flex flex-col gap-2 pt-6">
          <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
            Or start from one of these
          </p>
          <div className="flex flex-col gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSent(s)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-left text-base text-text-muted transition-colors hover:border-border-strong hover:bg-surface-hover hover:text-text"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {sent && (
          <div className="pt-8">
            <Separator />
            <div className="flex items-start gap-2.5 pt-5">
              <CraigMark className="mt-0.5 size-6 shrink-0 text-accent" />
              <div className="flex flex-col gap-1">
                <p className="text-base leading-relaxed text-text">
                  Got it. At three people the useful thing isn&apos;t a policy
                  library — it&apos;s making sure the things only you and Jason
                  know actually get handed over. I&apos;d start with one
                  workflow for an engineering hire: access, a first-week orient,
                  and a 30-day check-in.
                </p>
                <p className="text-sm text-text-subtle">
                  Nothing is created yet. This is where the generated draft
                  would appear for you to review.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function HomeNav() {
  return (
    <AdminNav>
      <div className="flex flex-col gap-2 px-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Getting started
        </p>
        <NavStat label="Workflows" value={0} />
        <NavStat label="New hires" value={0} />
      </div>
    </AdminNav>
  );
}
