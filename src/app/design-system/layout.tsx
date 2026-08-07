import { AppShell, Badge, type AppNotification } from "@/components/ui";
import { ACCOUNT } from "@/lib/demo";
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
    description: "24 sections, zero UI dependencies.",
    timestamp: new Date(Date.now() - 20 * 60_000),
  },
];

export default function DesignSystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
