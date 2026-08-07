import { ThemeToggle } from "@/components/ui";
import { SectionNav } from "./_components/section-nav";

/**
 * Two columns, one grid. The rule between the wordmark and the page title is
 * the same line as the sidebar's right border — it runs unbroken from the top
 * of the header to the bottom of the page.
 */
export default function DesignSystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-40 border-b border-border bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-12 max-w-[1500px] border-x border-border">
          <div className="flex shrink-0 items-center px-4 lg:w-56 lg:border-r lg:border-border">
            <span className="text-base font-semibold tracking-[-0.01em]">
              Craig.
            </span>
          </div>

          <div className="flex min-w-0 flex-1 items-center pr-4 lg:px-10">
            <span className="truncate text-base text-text-muted">
              Design system
            </span>
            <div className="ml-auto flex items-center gap-1 pl-3">
              <span className="hidden text-xs text-text-subtle sm:block">
                v0.1
              </span>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1500px] border-x border-border">
        <aside className="hidden w-56 shrink-0 border-r border-border lg:block">
          <div className="scrollbar-thin sticky top-12 max-h-[calc(100vh-3rem)] overflow-y-auto px-4 py-6">
            <SectionNav />
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-32 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
