"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { NavTreeItem, Separator } from "@/components/ui";

/**
 * The left panel for demo v3.
 *
 * The same component as the admin nav in every respect except where the links
 * point. It's a copy rather than a prop on that one because v3 is a demo with
 * an expiry date — when it goes it should take its routes with it, not leave a
 * branch behind in the product's own navigation.
 *
 * Three items, not the admin's six. The demo never opens Resources, Email or
 * Settings, and a nav is a promise about what the product does — listing rooms
 * you can't walk into is a worse first impression than a short list.
 *
 * The current item is derived from the pathname rather than passed in, so a
 * page can't render a nav that disagrees with the route it's on.
 */

const ITEMS = [
  { label: "Home", href: "/v3/home" },
  { label: "Workflows", href: "/v3/workflows" },
  { label: "People", href: "/v3/people" },
];

export function V3Nav({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        {ITEMS.map((item) => {
          const current = pathname.startsWith(item.href);

          return (
            <NavTreeItem
              key={item.href}
              href={item.href}
              label={item.label}
              current={current}
            />
          );
        })}
      </div>

      {/* Page-specific detail sits under the nav, not instead of it. */}
      {children && (
        <>
          <Separator />
          {children}
        </>
      )}
    </div>
  );
}
