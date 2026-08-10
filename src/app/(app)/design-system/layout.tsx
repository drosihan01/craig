import { AppShell, Badge, type AppNotification } from "@/components/ui";
import { requireUser } from "@/lib/craig/current-user";
import { ACCOUNT } from "@/lib/demo";
import { ALL_IDS } from "./sections";
import { SectionNav } from "./_components/section-nav";
import { ShellAside } from "./_components/shell-aside";

/**
 * The design system runs on the product's own shell rather than a bespoke
 * layout — if the frame breaks, it breaks here first.
 */
const NOTIFICATIONS: AppNotification[] = [
  {
    id: "d1",
    kind: "info",
    title: "Design system v0.1",
    /* Counted rather than written down — it was three sections out of date
       the moment someone added one. */
    description: `${ALL_IDS.length} sections, zero UI dependencies.`,
    timestamp: new Date(Date.now() - 20 * 60_000),
  },
];

/**
 * The guard sits on the layout rather than the page, because the page is
 * `"use client"` and cannot redirect. It covers this route and anything added
 * under it, which is the property worth having: a section added later inherits
 * the door instead of having to remember it.
 *
 * This lived outside the router until now and so needed no guard — it was
 * served to nobody. Giving it a URL is what makes the guard necessary, and
 * doing both in one change is deliberate: a route reachable for even one deploy
 * before it is guarded is a route somebody can find.
 */
export default async function DesignSystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();

  return (
    <AppShell
      title="Design system"
      nav={<SectionNav />}
      aside={<ShellAside />}
      asideTitle="On this page"
      actions={<Badge tone="neutral">v0.1</Badge>}
      notifications={NOTIFICATIONS}
      account={ACCOUNT}
    >
      {children}
    </AppShell>
  );
}
