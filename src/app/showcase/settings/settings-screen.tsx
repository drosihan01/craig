"use client";

import * as React from "react";
import { AppShell, Separator } from "@/components/ui";
import {
  ShowcaseNav,
  ShowcaseNavRail,
} from "@/components/showcase/showcase-nav";
import { GoogleWorkspaceConnect } from "@/components/showcase/google-workspace";
import { Google } from "@/components/ui/brand-icons";
import type { Session } from "@/lib/showcase/contract";

/**
 * The settings screen, which today is one connection and says so.
 *
 * A page with a single card on it is a fair criticism and the wrong fix. The
 * alternatives were leaving Google in the builder's sandbox, where consenting
 * attached a real company's Workspace to whichever test account happened to be
 * signed in, or inventing five more settings nobody asked for so that this one
 * had company. Somewhere to *disconnect* from, findable without hunting for a
 * workflow that mentions Google, is worth a short page.
 *
 * The nav is the standard two rooms. No third item for this page — see the note
 * on the route — and no current row highlighted, which is honest: settings is
 * not one of the places the product is about, it is the drawer underneath them.
 *
 * The account is drawn in the panel rather than in a header block of its own.
 * It is not general context here; it is one half of the pairing the connection
 * makes, and it belongs beside the button that makes it rather than in
 * furniture at the top of the page that the eye learns to skip.
 */
export function SettingsScreen({
  user,
  /** The `?google=` code the connect flow redirected back with, if any. */
  outcome,
}: {
  user: Session;
  outcome: string | null;
}) {
  return (
    <AppShell
      title="Settings"
      account={{ name: user.name, email: user.email }}
      navRail={<ShowcaseNavRail />}
      nav={<ShowcaseNav />}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 py-10">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">
            Settings
          </h1>
          <p className="text-md text-text-muted">
            Everything this account has connected to, and how to take it back.
          </p>
        </header>

        <Separator />

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Google className="size-4" />
              <h2 className="text-xl font-semibold tracking-[-0.01em]">
                Google Workspace
              </h2>
            </div>
            <p className="text-md leading-relaxed text-text-muted">
              Connected once, as a super admin, so Craig can create a new
              starter&apos;s account on the morning it is needed without anybody
              being there. It is the one permission this product asks for, and
              it can be taken back here at any time.
            </p>
          </div>

          {/* The same component the block panel renders, given a different
              lead. The panel introduces the connection as something a step
              depends on; this introduces it as something the account holds.
              Neither owns a second copy of the button. */}
          <GoogleWorkspaceConnect
            account={{
              name: user.name,
              email: user.email,
              company: user.company,
            }}
            outcome={outcome}
          />
        </section>
      </div>
    </AppShell>
  );
}
