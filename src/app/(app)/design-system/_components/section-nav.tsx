"use client";

import * as React from "react";
import { Search } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { ALL_IDS, SECTIONS } from "../sections";

export function SectionNav() {
  const [active, setActive] = React.useState(ALL_IDS[0]);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    const els = ALL_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => Boolean(el),
    );

    // The callback only receives entries that *changed*, so we keep our own
    // running set and pick the first still-visible section in document order.
    const visible = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const first = ALL_IDS.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: "-100px 0px -70% 0px", threshold: 0 },
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const q = query.trim().toLowerCase();
  const groups = SECTIONS.map((g) => ({
    ...g,
    items: q
      ? g.items.filter((i) => i.label.toLowerCase().includes(q))
      : g.items,
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-text-subtle" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter…"
          aria-label="Filter components"
          className="h-7 w-full rounded-md border border-border bg-surface pl-7 pr-2 text-sm text-text placeholder:text-text-subtle focus:border-accent-ring focus:outline-none focus:ring-[3px] focus:ring-accent-ring/20 [&::-webkit-search-cancel-button]:appearance-none"
        />
      </div>

      <nav aria-label="Design system sections" className="flex flex-col gap-5">
        {groups.map((group) => (
          <div key={group.group} className="flex flex-col gap-0.5">
            <p className="px-2 pb-1 text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
              {group.group}
            </p>
            {group.items.map((item) => {
              const isActive = !q && active === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "rounded-md px-2 py-1 text-sm transition-colors duration-150",
                    isActive
                      ? "bg-accent-subtle font-medium text-accent-subtle-fg"
                      : "text-text-muted hover:bg-surface-hover hover:text-text",
                  )}
                >
                  {item.label}
                </a>
              );
            })}
          </div>
        ))}

        {groups.length === 0 && (
          <p className="px-2 text-sm text-text-subtle">No matches</p>
        )}
      </nav>
    </div>
  );
}
