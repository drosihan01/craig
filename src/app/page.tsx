"use client";

import * as React from "react";
import {
  AppShell,
  Badge,
  Card,
  CraigMark,
  PromptBar,
  Separator,
  type AppNotification,
} from "@/components/ui";
import { Campaign, Code, Groups, Schedule } from "@/components/ui/icons";
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

/**
 * Starting points, not finished workflows. Each one is a shape an admin can
 * recognise for a role they're actually hiring — describing the company in
 * prose is the better path, but it's a blank box, and a blank box is where
 * most people stop.
 *
 * Step counts are deliberately small. A twenty-step template for a
 * three-person company is a template nobody finishes.
 */
const TEMPLATES = [
  {
    id: "engineer",
    icon: Code,
    title: "Engineer",
    description:
      "Repo and infra access, a walkthrough of who owns what, and a prod sign-off before anything ships.",
    steps: 8,
    tag: "Most used",
  },
  {
    id: "first-hire",
    icon: Groups,
    title: "First non-founder hire",
    description:
      "For when nothing is written down yet. Heavier on context and introductions than on process.",
    steps: 6,
  },
  {
    id: "contractor",
    icon: Schedule,
    title: "Contractor or part-time",
    description:
      "Scoped access, a clear end date, and an offboarding step that actually fires.",
    steps: 5,
  },
  {
    id: "gtm",
    icon: Campaign,
    title: "Sales and GTM",
    description:
      "CRM access, the pitch, and shadowing calls in the first fortnight.",
    steps: 7,
  },
];

export default function AdminHomePage() {
  const [sent, setSent] = React.useState<string | null>(null);
  const [files, setFiles] = React.useState<File[]>([]);

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
        </div>

        <div className="pt-8">
          <PromptBar
            autoFocus
            placeholder="we're 3 people doing AI infra…"
            onSubmit={setSent}
            onAttach={setFiles}
            footnote="Attach a handbook if you have one — however out of date it is"
          />
        </div>

        <div className="flex flex-col gap-3 pt-8">
          <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
            Or start from a template
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {TEMPLATES.map((t) => (
              <Card
                key={t.id}
                interactive
                role="button"
                tabIndex={0}
                onClick={() => setSent(t.title)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSent(t.title);
                  }
                }}
                className="flex flex-col gap-2 p-4"
              >
                <div className="flex items-start gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent-subtle-fg">
                    <t.icon className="size-4" />
                  </span>
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate text-base font-medium">
                      {t.title}
                    </span>
                    {t.tag && (
                      <Badge tone="accent" size="sm" className="shrink-0">
                        {t.tag}
                      </Badge>
                    )}
                  </div>
                </div>

                <p className="text-sm leading-relaxed text-text-muted">
                  {t.description}
                </p>

                <span className="mt-auto pt-1 text-2xs text-text-subtle">
                  {t.steps} steps · you edit before anything goes live
                </span>
              </Card>
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
                  {files.length > 0
                    ? `${files.length} file${files.length > 1 ? "s" : ""} attached. Nothing is created yet — this is where the generated draft would appear.`
                    : "Nothing is created yet. This is where the generated draft would appear for you to review."}
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
