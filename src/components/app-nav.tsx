"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Badge, NavTreeItem, Separator } from "@/components/ui";

/**
 * The admin's left panel — one nav across every admin screen, so moving
 * between the home prompt and a workflow doesn't change what's on the left.
 *
 * The current item is derived from the pathname rather than passed in, so a
 * page can't render a nav that disagrees with the route it's on.
 *
 * Product nav only. The sandbox is a builder's tool, not an admin's, so it
 * lives in the account menu instead.
 */

const ITEMS = [
  { label: "Home", href: "/" },
  { label: "Workflows", href: "/builder" },
  { label: "Resources", href: "/resources" },
  { label: "Email", href: "/email" },
  { label: "People", href: "/people" },
  { label: "Settings", href: "/settings" },
];

export function AdminNav({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        {ITEMS.map((item) => {
          const current =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

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

/** Label + count row, for the page-specific block under the nav. */
export function NavStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "warning";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-muted">{label}</span>
      <Badge tone={tone} size="sm">
        {value}
      </Badge>
    </div>
  );
}
