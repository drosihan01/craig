import { ThemeToggle } from "@/components/ui";
import { SectionNav } from "./_components/section-nav";

export default function DesignSystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-40 border-b border-border bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-12 max-w-[1500px] items-center gap-3 px-4">
          <div className="flex w-56 items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded bg-accent text-2xs font-bold text-accent-fg">
              c
            </span>
            <span className="text-base font-semibold tracking-[-0.01em]">
              craig
            </span>
            <span className="h-3.5 w-px bg-border" />
            <span className="text-base text-text-muted">Design system</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <span className="mr-1 hidden text-xs text-text-subtle sm:block">
              v0.1
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1500px] px-4">
        <aside className="hidden w-56 shrink-0 border-r border-border lg:block">
          <div className="scrollbar-thin sticky top-12 max-h-[calc(100vh-3rem)] overflow-y-auto py-6 pr-4">
            <SectionNav />
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-32 lg:pl-10">{children}</main>
      </div>
    </div>
  );
}
