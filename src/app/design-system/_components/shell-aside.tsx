"use client";

import * as React from "react";
import Link from "next/link";
import { Badge, Separator } from "@/components/ui";
import { SECTIONS } from "../sections";

/** Stands in for the real right panel — enough to exercise collapsing. */
export function ShellAside() {
  const counts = SECTIONS.map((g) => ({
    group: g.group,
    count: g.items.length,
  }));
  const total = counts.reduce((n, g) => n + g.count, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {counts.map((g) => (
          <div key={g.group} className="flex items-center justify-between">
            <span className="text-sm text-text-muted">{g.group}</span>
            <Badge size="sm">{g.count}</Badge>
          </div>
        ))}
      </div>

      <Separator />

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">{total} sections</p>
        <p className="text-xs leading-relaxed text-text-subtle">
          This panel collapses from the toggle at the far right of the header.
          The nav collapses from the one beside the wordmark. Both remember
          their state.
        </p>
      </div>

      <Separator />

      <div className="flex flex-col gap-1.5">
        <p className="pb-0.5 text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Pages
        </p>
        {[
          { href: "/", label: "Admin home" },
          { href: "/builder", label: "Workflow builder" },
          { href: "/sign-in", label: "Sign in" },
        ].map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="-mx-1 rounded-md px-1 py-0.5 text-xs text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
          >
            {r.label} →
          </Link>
        ))}
      </div>

      <Separator />

      <div className="flex flex-col gap-1.5">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Stack
        </p>
        <ul className="flex flex-col gap-1 text-xs text-text-muted">
          <li>Next.js 16 · React 19</li>
          <li>Tailwind v4</li>
          <li>Google Sans Flex</li>
          <li>Material Symbols</li>
          <li>Zero UI dependencies</li>
        </ul>
      </div>
    </div>
  );
}
