import { AppShell, Badge } from "@/components/ui";
import { SectionNav } from "./_components/section-nav";
import { ShellAside } from "./_components/shell-aside";

/**
 * The design system runs on the product's own shell rather than a bespoke
 * layout — if the frame breaks, it breaks here first.
 */
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
      account={{
        name: "Dzaky Rosihan",
        email: "dzaky.rosihan@kmart.com.au",
        role: "Admin",
      }}
    >
      {children}
    </AppShell>
  );
}
