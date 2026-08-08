"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { NavTreeItem, Separator } from "@/components/ui";

/**
 * The showcase's left column.
 *
 * Every screen here was built on its own and each one rolled its own nav, so
 * none of them linked to any of the others — you could finish a workflow and
 * have no way out of the page you were on. This is the fix, and it belongs in
 * one place: a nav is a promise about what the product does, and three
 * different navs is three different promises.
 *
 * Two items, not six. The showcase does workflows and people, and listing
 * rooms you can't walk into is a worse first impression than a short list.
 *
 * Current is derived from the pathname rather than passed in, so a page can't
 * render a nav that disagrees with the route it's on.
 */

const ITEMS = [
  { label: "Workflows", href: "/showcase/workflows" },
  { label: "People", href: "/showcase/people" },
];

export function ShowcaseNav({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        {ITEMS.map((item) => (
          <NavTreeItem
            key={item.href}
            href={item.href}
            label={item.label}
            current={pathname.startsWith(item.href)}
          />
        ))}
      </div>

      {/* Page-specific detail sits under the nav, not instead of it — which
          is exactly the mistake that stranded the setup screen. */}
      {children && (
        <>
          <Separator />
          {children}
        </>
      )}
    </div>
  );
}
