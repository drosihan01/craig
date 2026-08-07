"use client";

import * as React from "react";
import {
  LeftPanelClose,
  LeftPanelOpen,
  Logout,
  Person,
  ExpandLess,
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
 * right panel. The account sits in the bottom cell of the left panel — nav and
 * account are both sticky, so they hold while the page scrolls.
 *
 * The header is three cells and the body is three columns, sharing the same
 * two vertical rules — so each rule runs unbroken from the top of the header to
 * the bottom of the page. That only holds while a header cell and its column
 * stay the same width, hence the shared constants below. The header segment of
 * each rule is dotted and the column below it is solid — the line is continuous
 * but changes weight at the header boundary, which is deliberate.
 *
 * Clipping is deliberately NOT on the <aside>. `overflow: hidden` makes an
 * element a scroll container, which would become the scrollport for the sticky
 * panel inside it — the panel would offset by `top` immediately and then never
 * stick, because that container never scrolls. So the aside only animates its
 * width, and an inner sticky wrapper does the clipping.
 */

/* Written out, not templated: Tailwind extracts class names statically, so a
   `lg:${NAV_W}` would produce no CSS at all. */
const NAV_W = "w-56";
const NAV_W_LG = "lg:w-56";
const ASIDE_W = "w-72";
const ASIDE_W_LG = "lg:w-72";

export interface AccountInfo {
  name: string;
  email?: string;
  role?: string;
}

/* localStorage is the source of truth for panel state, and it's external to
   React — so it's read through useSyncExternalStore rather than mirrored into
   state via an effect. That keeps the server snapshot explicit (`initial`),
   avoids a render pass that sets state, and syncs across tabs for free. */

const panelListeners = new Set<() => void>();

function subscribePanels(cb: () => void) {
  panelListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    panelListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function readPanel(key: string, fallback: boolean) {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : stored === "1";
  } catch {
    return fallback;
  }
}

function usePersistedPanel(key: string, initial: boolean) {
  const open = React.useSyncExternalStore(
    subscribePanels,
    () => readPanel(key, initial),
    () => initial,
  );

  const toggle = React.useCallback(() => {
    try {
      localStorage.setItem(key, open ? "0" : "1");
    } catch {}
    panelListeners.forEach((l) => l());
  }, [key, open]);

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
          {/* Left cell — same width as the nav column, same rule. */}
          <div
            className={cn(
              "flex shrink-0 items-center gap-1 pl-4 pr-2 transition-[width] duration-200 ease-out-quart lg:border-r lg:border-dotted lg:border-border",
              navOpen && nav ? NAV_W_LG : "lg:w-auto",
            )}
          >
            <span className="text-base font-semibold tracking-[-0.01em]">
              Craig.
            </span>
            {nav && (
              <PanelToggle
                open={navOpen}
                onToggle={toggleNav}
                side="left"
                className="ml-auto hidden lg:inline-flex"
              />
            )}
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-3 px-4">
            {title && (
              <span className="truncate text-base text-text-muted">{title}</span>
            )}
          </div>

          {/* Right cell — same width as the details column, same rule. */}
          <div
            className={cn(
              "flex shrink-0 items-center justify-end gap-1 pl-2 pr-4 transition-[width] duration-200 ease-out-quart lg:border-l lg:border-dotted lg:border-border",
              asideOpen && aside ? ASIDE_W_LG : "lg:w-auto",
            )}
          >
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
      </header>

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1500px] border-x border-border">
        {nav && (
          <Panel
            side="left"
            open={navOpen}
            width={NAV_W}
            footer={account ? <AccountMenu account={account} /> : undefined}
          >
            <div className={cn("px-4 py-6", NAV_W)}>{nav}</div>
          </Panel>
        )}

        <main className="min-w-0 flex-1 px-4 pb-24 lg:px-8">{children}</main>

        {aside && (
          <Panel side="right" open={asideOpen} width={ASIDE_W}>
            <div className={cn("p-4", ASIDE_W)}>
              <p className="pb-3 text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
                {asideTitle}
              </p>
              {aside}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

/**
 * The <aside> owns width (and so the collapse animation); the sticky wrapper
 * inside owns clipping and scrolling. Keeping `overflow: hidden` off the aside
 * is what lets the wrapper stick to the viewport instead of to the aside.
 *
 * The wrapper is a full-height flex column: the body scrolls, `footer` is
 * pinned to the bottom of the panel. Both stay put as the page scrolls.
 */
function Panel({
  side,
  open,
  width,
  footer,
  children,
}: {
  side: "left" | "right";
  open: boolean;
  width: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <aside
      className={cn(
        "hidden shrink-0 transition-[width] duration-200 ease-out-quart lg:block",
        open
          ? cn(
              width,
              "border-border",
              side === "left" ? "border-r" : "border-l",
            )
          : "w-0 border-0",
      )}
    >
      <div className="sticky top-12 flex h-[calc(100vh-3rem)] flex-col overflow-x-hidden">
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>
        {footer && (
          <div className={cn("shrink-0 border-t border-border p-2", width)}>
            {footer}
          </div>
        )}
      </div>
    </aside>
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
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-hover hover:text-text",
        className,
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

/** Pinned to the bottom cell of the left panel. */
function AccountMenu({ account }: { account: AccountInfo }) {
  return (
    <DropdownMenu
      label="Account"
      align="start"
      side="top"
      width="w-52"
      className="w-full"
      triggerClassName="w-full"
      trigger={
        <span className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-surface-hover">
          <Avatar name={account.name} size="md" />
          <span className="flex min-w-0 flex-1 flex-col items-start">
            <span className="w-full truncate text-sm font-medium text-text">
              {account.name}
            </span>
            {account.role && (
              <span className="w-full truncate text-2xs text-text-subtle">
                {account.role}
              </span>
            )}
          </span>
          <ExpandLess className="ml-1 size-4 shrink-0 text-text-subtle" />
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
  );
}
