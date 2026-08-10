"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import {
  CraigMark,
  NavRail,
  NavRailItem,
  NavTree,
  NavTreeItem,
} from "@/components/ui";
import { Checklist } from "@/components/ui/icons";
import { JOINER_ASK_PATH, JOINER_HOME } from "@/lib/craig/contract";

/**
 * The new starter's left column: two rows, and deliberately only two.
 *
 * They get the product's own frame rather than a page of their own, which is
 * the point — the same shell, the same shape, the same place the nav lives.
 * What differs is what is in it. The admin's nav lists Home, People, Workflows
 * and Resources; this lists the two things a person being onboarded can
 * actually do, which is work through their plan and ask about it.
 *
 * This is a *different component*, not the admin's with rows filtered out, and
 * the reason is the same argument `joiner-agent.ts` makes about tools. A nav
 * that holds every row and hides four of them is a nav one bad conditional away
 * from showing a new starter the door to People — and the failure is silent,
 * because a link that should not be there still renders perfectly. Two lists
 * cannot leak into each other.
 *
 * There is no account cell under this, and that is also deliberate.
 * `AppShell`'s is wired to Settings and to a Sign out that clears the *admin's*
 * cookie — for a joiner both would be controls that look like they work and do
 * nothing, which is the worst way for a Sign out in particular to fail.
 */

const ITEMS = [
  {
    label: "Your tasks",
    href: JOINER_HOME,
    icon: <Checklist />,
  },
  {
    label: "Ask Craig",
    href: JOINER_ASK_PATH,
    icon: <CraigMark />,
  },
];

/**
 * Exact matching, not prefix.
 *
 * The admin's nav uses a prefix test because its sections have children;
 * these two do not, and `"/me/ask".startsWith("/me")` is true — a prefix test
 * would light both rows up the moment somebody opened the conversation.
 */
const isCurrent = (pathname: string, href: string) => pathname === href;

export function JoinerNav({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-4">
      <NavTree>
        {ITEMS.map((item) => (
          <NavTreeItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            current={isCurrent(pathname, item.href)}
          />
        ))}
      </NavTree>
      {children}
    </div>
  );
}

/** The same two rows once the column has collapsed to icons. */
export function JoinerNavRail() {
  const pathname = usePathname();

  return (
    <NavRail>
      {ITEMS.map((item) => (
        <NavRailItem
          key={item.href}
          href={item.href}
          label={item.label}
          icon={item.icon}
          current={isCurrent(pathname, item.href)}
        />
      ))}
    </NavRail>
  );
}
