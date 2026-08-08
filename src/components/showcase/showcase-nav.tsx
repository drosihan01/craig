"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { NavTree, NavTreeItem, Separator } from "@/components/ui";
import { AltRoute, Groups } from "@/components/ui/icons";

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

/**
 * Iconed, which is the menu row as the design system draws it.
 *
 * These were bare labels — the right component, given none of what makes it
 * legible. `NavTreeItem` puts the icon in a bordered tile that fills with the
 * accent on the row you're on, so the current page is marked twice over rather
 * than by weight alone; without one the row loses that and the column reads as
 * two words stacked in a margin.
 *
 * The icons are the ones each thing already wears elsewhere. A workflow is
 * `AltRoute` on every row of the list and on its own empty state, and a nav
 * that picked something else would be introducing a second symbol for a thing
 * the product has already named.
 */
const ITEMS = [
  { label: "Workflows", href: "/showcase/workflows", icon: <AltRoute /> },
  { label: "People", href: "/showcase/people", icon: <Groups /> },
];

export function ShowcaseNav({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-5">
      <NavTree>
        {ITEMS.map((item) => (
          <NavTreeItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            current={pathname.startsWith(item.href)}
          />
        ))}
      </NavTree>

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
