"use client";

import * as React from "react";
import {
  LeftPanelClose,
  LeftPanelOpen,
  Logout,
  Person,
  RightPanelClose,
  RightPanelOpen,
  Settings,
} from "./icons";
import { Avatar } from "./avatar";
import { DropdownMenu } from "./dropdown";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/cn";

/**
 * The product's frame: brand cell, collapsible left nav, content, collapsible
 * right panel, account bottom-right.
 *
 * One vertical rule runs from the top of the header down the full page — the
 * brand cell's right border and the nav's right border are the same line. That
 * only holds if the header cell and the nav column stay the same width, so both
 * read from NAV_W.
 *
 * Collapse state is persisted per side, and read synchronously on first render
 * so a collapsed panel doesn't flash open before hydration settles.
 */

/* Written out, not templated: Tailwind extracts class names statically, so a
   `lg:${NAV_W}` would produce no CSS at all. The header cell and the nav column
   must stay the same width for the vertical rule to line up, so they're
   declared together here. */
const NAV_W = "w-56";
const NAV_W_LG = "lg:w-56";

export interface AccountInfo {
  name: string;
  email?: string;
  role?: string;
}

function usePersistedPanel(key: string, initial: boolean) {
  const [open, setOpen] = React.useState(initial);

  // localStorage isn't available during SSR, so read it after mount. The panel
  // is CSS-animated, so a one-frame correction isn't visible as a jump.
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) setOpen(stored === "1");
    } catch {}
  }, [key]);

  const toggle = React.useCallback(() => {
    setOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {}
      return next;
    });
  }, [key]);

  return [open, toggle] as const;
}

export function AppShell({
  title,
  nav,
  aside,
  asideTitle = "Details",
  account,
  actions,
  children,
}: {
  title?: React.ReactNode;
  nav?: React.ReactNode;
  aside?: React.ReactNode;
  asideTitle?: string;
  account?: AccountInfo;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [navOpen, toggleNav] = usePersistedPanel("craig-nav", true);
  const [asideOpen, toggleAside] = usePersistedPanel("craig-aside", true);

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-40 border-b border-border bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-12 max-w-[1500px] border-x border-border">
          <div
            className={cn(
              "flex shrink-0 items-center gap-1 pl-4 pr-2 transition-[width] duration-200 ease-out-quart lg:border-r lg:border-border",
              navOpen ? NAV_W_LG : "lg:w-auto",
            )}
          >
            <span className="text-base font-semibold tracking-[-0.01em]">
              Craig.
            </span>
            <PanelToggle
              open={navOpen}
              onToggle={toggleNav}
              side="left"
              className="ml-auto hidden lg:inline-flex"
            />
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-3 px-4 lg:px-6">
            {title && (
              <span className="truncate text-base text-text-muted">{title}</span>
            )}
            <div className="ml-auto flex items-center gap-1">
              {actions}
              <ThemeToggle />
              {aside && (
                <PanelToggle
                  open={asideOpen}
                  onToggle={toggleAside}
                  side="right"
                  className="hidden lg:inline-flex"
                />
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1500px] border-x border-border">
        {nav && (
          <aside
            className={cn(
              "hidden shrink-0 overflow-hidden border-r border-border transition-[width] duration-200 ease-out-quart lg:block",
              navOpen ? NAV_W : "w-0 border-r-0",
            )}
          >
            <div
              className={cn(
                "scrollbar-thin sticky top-12 max-h-[calc(100vh-3rem)] overflow-y-auto px-4 py-6",
                NAV_W,
              )}
            >
              {nav}
            </div>
          </aside>
        )}

        <main className="min-w-0 flex-1 px-4 pb-24 lg:px-8">{children}</main>

        {aside && (
          <aside
            className={cn(
              "hidden shrink-0 overflow-hidden border-l border-border transition-[width] duration-200 ease-out-quart lg:block",
              asideOpen ? "w-72" : "w-0 border-l-0",
            )}
          >
            <div className="scrollbar-thin sticky top-12 max-h-[calc(100vh-3rem)] w-72 overflow-y-auto p-4">
              <p className="pb-3 text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
                {asideTitle}
              </p>
              {aside}
            </div>
          </aside>
        )}

        {account && <AccountMenu account={account} />}
      </div>
    </div>
  );
}

function PanelToggle({
  open,
  onToggle,
  side,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  side: "left" | "right";
  className?: string;
}) {
  const Icon =
    side === "left"
      ? open
        ? LeftPanelClose
        : LeftPanelOpen
      : open
        ? RightPanelClose
        : RightPanelOpen;

  const label = `${open ? "Collapse" : "Expand"} ${side} panel`;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      aria-expanded={open}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-hover hover:text-text",
        className,
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

/**
 * Bottom-right, floating over the content. Fixed rather than pinned to the
 * sidebar so it stays put whichever panels are collapsed.
 */
function AccountMenu({ account }: { account: AccountInfo }) {
  return (
    <div className="fixed bottom-4 right-4 z-30">
      <DropdownMenu
        label="Account"
        align="end"
        side="top"
        width="w-60"
        trigger={
          <span className="flex items-center gap-2 rounded-full border border-border bg-surface-raised py-1 pl-1 pr-3 shadow-e3 transition-colors hover:bg-surface-hover">
            <Avatar name={account.name} size="md" />
            <span className="flex min-w-0 flex-col items-start">
              <span className="max-w-32 truncate text-sm font-medium text-text">
                {account.name}
              </span>
              {account.role && (
                <span className="max-w-32 truncate text-2xs text-text-subtle">
                  {account.role}
                </span>
              )}
            </span>
          </span>
        }
        items={[
          {
            id: "profile",
            label: account.name,
            description: account.email,
            icon: <Person />,
          },
          { id: "settings", label: "Settings", icon: <Settings /> },
          {
            id: "signout",
            label: "Sign out",
            icon: <Logout />,
            destructive: true,
            separatorBefore: true,
          },
        ]}
      />
    </div>
  );
}
