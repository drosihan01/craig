"use client";

import * as React from "react";
import { AppShell, Separator, type AppNotification } from "@/components/ui";
import { ACCOUNT } from "@/lib/demo";
import { DraftSession } from "@/components/draft-session";
import { AdminNav } from "@/components/app-nav";
import { BackLink } from "@/components/ui";

/**
 * Draft a workflow by describing the company.
 *
 * The third way to start one, next to blank and from-a-template. It used to be
 * the whole of Home, which meant an occasional, high-intent task held the home
 * screen's real estate permanently. It lives here now, where somebody is
 * already thinking about workflows.
 *
 * Same component as Home's empty state, so the conversation can't drift
 * between the two places it appears.
 */

const NOTIFICATIONS: AppNotification[] = [];

export default function NewWorkflowPage() {
  const [started, setStarted] = React.useState(false);

  return (
    <AppShell
      title="Workflows"
      nav={<NewWorkflowNav />}
      notifications={NOTIFICATIONS}
      account={ACCOUNT}
      fill={started}
    >
      {!started && (
        <div className="pt-6">
          <BackLink href="/builder">Back to workflows</BackLink>
        </div>
      )}
      <DraftSession
        heading="What kind of hire is this for?"
        onStart={() => setStarted(true)}
      />
    </AppShell>
  );
}

function NewWorkflowNav() {
  return (
    <AdminNav>
      <Separator />
      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        Craig drafts, you edit. Nothing is created until you publish it, and
        nothing runs until someone is assigned to it.
      </p>
    </AdminNav>
  );
}
