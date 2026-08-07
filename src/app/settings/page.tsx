"use client";

import * as React from "react";
import { AppShell, Separator } from "@/components/ui";
import { ACCOUNT } from "@/lib/demo";
import { AdminNav } from "@/components/app-nav";
import { EmptyPage } from "@/components/empty-page";

/** Nothing here yet, and it says so. See EmptyPage for why. */
export default function SettingsPage() {
  return (
    <AppShell
      title="Settings"
      nav={<SettingsNav />}
      account={ACCOUNT}
      notifications={[]}
    >
      <EmptyPage
        say="Nothing here yet, honestly."
        detail="Once there's billing, notification preferences and somewhere to set your company details, this is where they'll live."
      />
    </AppShell>
  );
}

function SettingsNav() {
  return (
    <AdminNav>
      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        Company details, billing and notifications will end up here.
      </p>
      <Separator />
    </AdminNav>
  );
}
