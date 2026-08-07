"use client";

import * as React from "react";
import Link from "next/link";
import {
  AppShell,
  Badge,
  CraigMark,
  PromptBar,
  Separator,
  type AppNotification,
} from "@/components/ui";

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
    description: "Start by describing your company below.",
    timestamp: new Date(Date.now() - 3 * 60_000),
  },
];

const SUGGESTIONS = [
  "We're a retail chain with 40 stores across VIC and NSW",
  "Hospitality — casual staff, high turnover, lots of compliance",
  "A 30-person software team, mostly remote",
];

export default function AdminHomePage() {
  const [sent, setSent] = React.useState<string | null>(null);

  return (
    <AppShell
      title="Home"
      nav={<AdminNav />}
      notifications={NOTIFICATIONS}
      account={{
        name: "Dzaky Rosihan",
        email: "dzaky.rosihan@kmart.com.au",
        role: "Admin",
      }}
    >
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-2xl flex-col justify-center py-16">
        <div className="flex flex-col items-center gap-4 text-center">
          <CraigMark className="size-14 text-accent" />
          <h1 className="text-4xl font-semibold tracking-[-0.03em]">
            Tell me a little bit about your company
          </h1>
          <p className="max-w-md text-md leading-relaxed text-text-muted">
            What you do, roughly how many people, and what a new starter&apos;s
            first week usually looks like. I&apos;ll draft the onboarding
            workflows from there — you&apos;ll edit them before anything goes
            live.
          </p>
        </div>

        <div className="pt-8">
          <PromptBar
            autoFocus
            placeholder="We're a retail chain with…"
            onSubmit={setSent}
            footnote="Craigson Lambda 2.0 · your answer stays internal"
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
                  Got it. From that I&apos;d start you with three workflows —
                  one per role family — each with a pre-boarding stage, a day
                  one stage and a 30-day check-in.
                </p>
                <p className="text-sm text-text-subtle">
                  Nothing is created yet. This is where the generated drafts
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

function AdminNav() {
  const items = [
    { label: "Home", href: "/", current: true },
    { label: "Workflows", href: "/builder" },
    { label: "People", href: "#" },
    { label: "Settings", href: "#" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            aria-current={item.current ? "page" : undefined}
            className={
              item.current
                ? "rounded-md bg-accent-subtle px-2 py-1 text-sm font-medium text-accent-subtle-fg"
                : "rounded-md px-2 py-1 text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
            }
          >
            {item.label}
          </Link>
        ))}
      </div>

      <Separator />

      <div className="flex flex-col gap-2 px-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Getting started
        </p>
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-muted">Workflows</span>
          <Badge size="sm">0</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-muted">New starters</span>
          <Badge size="sm">0</Badge>
        </div>
      </div>

      <Separator />

      <Link
        href="/design-system"
        className="px-2 text-xs text-text-subtle underline-offset-4 hover:text-text hover:underline"
      >
        Design system →
      </Link>
    </div>
  );
}
