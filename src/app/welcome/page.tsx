"use client";

import * as React from "react";
import { AppShell } from "@/components/ui";
import { ACCOUNT } from "@/lib/demo";
import { DraftSession } from "@/components/draft-session";

/**
 * The first thing after signing up.
 *
 * Not a setup wizard. A wizard asks a fixed set of questions in a fixed order
 * and gets a fixed answer back, which means it can only ever learn what it
 * already knew to ask. Ada's company is three people, no written process, and
 * a handbook from February — no wizard would have a field for that, and it's
 * the most important thing about her.
 *
 * So the first screen is a conversation, and the workflow falls out of it.
 *
 * **No nav and no side panel, deliberately.** Both columns are omitted rather
 * than rendered empty: at this moment the account contains nothing, so there
 * is nowhere to navigate to and nothing to show alongside. An empty panel
 * reads as broken; an absent one reads as focus. The chrome arrives when
 * there's something to put in it.
 */
export default function WelcomePage() {
  const [started, setStarted] = React.useState(false);

  return (
    <AppShell title="Welcome" account={ACCOUNT} fill={started}>
      <DraftSession onStart={() => setStarted(true)} />
    </AppShell>
  );
}
