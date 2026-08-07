"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ExpandLess,
  LeftPanelClose,
  LeftPanelOpen,
  Logout,
  Menu,
  Person,
  RightPanelClose,
  Science,
  RightPanelOpen,
  Settings,
} from "./icons";
import { Avatar } from "./avatar";
import { CraigMark } from "./craig-mark";
import { NotificationBell, type AppNotification } from "./notifications";
import { DropdownMenu } from "./dropdown";
import { DialogClose } from "./dialog";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/cn";

/**
 * The product's frame: brand cell, collapsible left nav, content, collapsible
 * right panel. The account sits in the bottom cell of the left panel — nav and
 * account are both sticky, so they hold while the page scrolls.
 *
 * Header layout: the brand cell holds the nav toggle on its right edge, the
 * centre cell holds the page (title, actions, theme), and the right cell holds
 * the details-panel toggle on its left edge with notifications in the corner.
 * Each panel's toggle sits against the rule it actually moves.
 *
 * The header is three cells and the body is three columns, sharing the same two
 * vertical rules — so each rule runs unbroken from the top of the header to the
 * bottom of the page. That only holds while a header cell and its column stay
 * the same width, which is why both read the same CSS variable rather than a
 * width class. The header segment of each rule is dotted, the column below it
 * solid.
 *
 * Both panels start at the same width and are drag-resizable independently, so
 * the widths are CSS variables applied through the .craig-col-* / .craig-panel-*
 * classes in globals.css. Two variables per side:
 *
 *   --craig-*-w        the column's actual width, 0 when collapsed
 *   --craig-*-open-w   the resized width, never 0
 *
 * Panel content sizes off the *open* width so it doesn't reflow while the
 * collapse animation runs — it slides out at full width instead of squashing.
 *
 * Clipping is deliberately NOT on the <aside>. `overflow: hidden` makes an
 * element a scroll container, which would become the scrollport for the sticky
 * panel inside it — the panel would offset by `top` immediately and then never
 * stick, because that container never scrolls. So the aside only owns width,
 * and an inner sticky wrapper owns clipping and scrolling.
 */

const DEFAULT_W = 224;
const MIN_W = 176;
const MAX_W = 440;
/** Arrow-key step for the resize handle. */
const NUDGE = 16;

export interface AccountInfo {
  name: string;
  email?: string;
  role?: string;
}

const clamp = (n: number) => Math.min(MAX_W, Math.max(MIN_W, Math.round(n)));

/* localStorage is the source of truth for panel state, and it's external to
   React — so it's read through useSyncExternalStore rather than mirrored into
   state via an effect. That keeps the server snapshot explicit, avoids a render
   pass that sets state, and syncs across tabs for free. */

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
  listeners.forEach((l) => l());
}

function usePersistedPanel(key: string) {
  const open = React.useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key) !== "0";
      } catch {
        return true;
      }
    },
    () => true,
  );

  const toggle = React.useCallback(() => {
    write(key, open ? "0" : "1");
  }, [key, open]);

  return [open, toggle] as const;
}

function usePersistedWidth(key: string) {
  const width = React.useSyncExternalStore(
    subscribe,
    () => {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? DEFAULT_W : clamp(Number(raw) || DEFAULT_W);
      } catch {
        return DEFAULT_W;
      }
    },
    () => DEFAULT_W,
  );

  const setWidth = React.useCallback(
    (n: number) => write(key, String(clamp(n))),
    [key],
  );

  return [width, setWidth] as const;
}

/**
 * Whether the viewport is wide enough for the side columns.
 *
 * Read through useSyncExternalStore rather than an effect, matching how the
 * panel state is read: setting state in an effect to answer "how wide is the
 * window" is the exact pattern React 19 warns about.
 *
 * The server snapshot is `true` — desktop. Craig is a desktop tool with a
 * canvas in it, so guessing desktop means the common case never flashes; a
 * phone corrects itself on hydration.
 */
const DESKTOP = "(min-width: 64rem)";

function useIsDesktop() {
  return React.useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(DESKTOP);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => true,
  );
}

export function AppShell({
  title,
  nav,
  aside,
  asideTitle,
  account,
  actions,
  fill,
  notifications,
  onNotificationSelect,
  onMarkAllRead,
  children,
}: {
  title?: React.ReactNode;
  nav?: React.ReactNode;
  aside?: React.ReactNode;
  /** Eyebrow above the aside. Omit when the panel's own content already says
      what it is — a heading that repeats the thing under it is just a line of
      shouting. The drawer still gets a name, since a sheet with no title is
      unlabelled to a screen reader. */
  asideTitle?: string;
  account?: AccountInfo;
  actions?: React.ReactNode;
  /** Omit entirely to hide the bell — an empty array still shows it, correctly
      reading as "you have none" rather than "this app has no notifications". */
  /** For pages that manage their own full-height layout — a chat with a pinned
      composer, or a canvas. Drops the content column's bottom padding, which
      would otherwise make the document taller than the viewport and let the
      whole page scroll under a supposedly fixed element. */
  fill?: boolean;
  notifications?: AppNotification[];
  onNotificationSelect?: (id: string) => void;
  onMarkAllRead?: () => void;
  children: React.ReactNode;
}) {
  const [navOpen, toggleNav] = usePersistedPanel("craig-nav");
  const [asideOpen, toggleAside] = usePersistedPanel("craig-aside");
  const [navW, setNavW] = usePersistedWidth("craig-nav-w");
  const [asideW, setAsideW] = usePersistedWidth("craig-aside-w");

  const isDesktop = useIsDesktop();
  /* Not persisted, unlike the column state. A drawer is a thing you opened a
     second ago, not a preference. */
  const [drawer, setDrawer] = React.useState<"nav" | "aside" | null>(null);
  const closeDrawer = React.useCallback(() => setDrawer(null), []);

  const vars = {
    "--craig-nav-w": navOpen && nav ? `${navW}px` : "0px",
    "--craig-nav-open-w": `${navW}px`,
    "--craig-aside-w": asideOpen && aside ? `${asideW}px` : "0px",
    "--craig-aside-open-w": `${asideW}px`,
  } as React.CSSProperties;

  return (
    <div className="min-h-screen bg-canvas" style={vars}>
      <header className="sticky top-0 z-40 border-b border-border bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-12 max-w-[1500px] border-x border-border">
          {/* Left cell — tracks the nav column's width, same rule. */}
          <div
            className={cn(
              "flex shrink-0 items-center gap-1 pl-4 pr-2 lg:border-r lg:border-dotted lg:border-border",
              navOpen && nav ? "craig-col-nav" : "lg:w-auto",
            )}
          >
            <CraigMark className="size-5" />
            <span className="truncate text-base font-semibold tracking-[-0.01em]">
              Craig.
            </span>
            {nav &&
              (isDesktop ? (
                <PanelToggle
                  open={navOpen}
                  onToggle={toggleNav}
                  side="left"
                  className="ml-auto"
                />
              ) : (
                <DrawerToggle
                  label="Open menu"
                  onClick={() => setDrawer("nav")}
                  className="ml-auto"
                />
              ))}
          </div>

          {/* Centre cell: everything belonging to the page. Title and actions
              left-aligned, notifications pushed to its right edge. The right
              cell stays system chrome only — theme and panel toggles — because
              putting page concerns and app concerns in one corner crowded it
              and mixed two unrelated kinds of control. */}
          <div className="flex min-w-0 flex-1 items-center gap-3 px-4">
            {title && (
              <span className="truncate text-base text-text-muted">
                {title}
              </span>
            )}
            {/* Hard right. The title anchors the left of the cell and the
                things you do to the page anchor its right, against the rule
                that separates them from the app's own controls. */}
            {actions && (
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                {actions}
              </div>
            )}
          </div>

          {/* Right cell — the app's own controls, never the page's. Tracks the
              details column's width, same rule. The panel's toggle sits hard
              left, against the rule it actually moves, mirroring the nav
              toggle in the brand cell; theme and notifications take the far
              corner.

              Theme lives here rather than in the centre because it belongs to
              the app, not to the workflow you happen to be looking at — and
              because with it out of the way the centre cell's actions can go
              hard right, which is where you look for them. Collapse the panel
              and it's three icons, which is a corner, not a toolbar. */}
          <div
            className={cn(
              "flex shrink-0 items-center gap-1 pl-2 pr-4 lg:border-l lg:border-dotted lg:border-border",
              asideOpen && aside ? "craig-col-aside" : "lg:w-auto",
            )}
          >
            {aside &&
              (isDesktop ? (
                <PanelToggle
                  open={asideOpen}
                  onToggle={toggleAside}
                  side="right"
                />
              ) : (
                <DrawerToggle
                  label="Open details"
                  onClick={() => setDrawer("aside")}
                />
              ))}
            <ThemeToggle className="ml-auto shrink-0" />

            {notifications && (
              <NotificationBell
                items={notifications}
                onSelect={onNotificationSelect}
                onMarkAllRead={onMarkAllRead}
                className="shrink-0"
              />
            )}
          </div>
        </div>
      </header>

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1500px] border-x border-border">
        {nav && isDesktop && (
          <Panel
            side="left"
            open={navOpen}
            width={navW}
            onResize={setNavW}
            footer={account ? <AccountMenu account={account} /> : undefined}
          >
            <div className="craig-panel-nav px-4 py-6">{nav}</div>
          </Panel>
        )}

        <main
          className={cn("min-w-0 flex-1 px-4 lg:px-8", fill ? "pb-0" : "pb-24")}
        >
          {children}
        </main>

        {aside && isDesktop && (
          <Panel
            side="right"
            open={asideOpen}
            width={asideW}
            onResize={setAsideW}
          >
            {/* Same py as the nav panel: the two columns read as one frame,
                and 8px of difference at the top reads as a mistake.

                min-h-full + flex-col so an aside that wants the whole column
                can have it. Content that doesn't ask still stacks at the top,
                but a chat can now put its composer against the bottom edge
                instead of trailing off after the last message. */}
            <div className="craig-panel-aside flex min-h-full flex-col px-4 py-6">
              {asideTitle && (
                <p className="shrink-0 pb-3 text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
                  {asideTitle}
                </p>
              )}
              {aside}
            </div>
          </Panel>
        )}
      </div>

      {/* Below lg the columns become drawers. Rendered here rather than
          alongside the column so the panel's content exists exactly once — two
          copies behind a `hidden` class would duplicate every landmark and
          every focusable control for a screen reader. */}
      {!isDesktop && (
        <Drawer
          side="left"
          open={drawer === "nav"}
          onClose={closeDrawer}
          title="Menu"
          footer={account ? <AccountMenu account={account} /> : undefined}
        >
          <div className="px-4 py-6">{nav}</div>
        </Drawer>
      )}

      {!isDesktop && (
        <Drawer
          side="right"
          open={drawer === "aside"}
          onClose={closeDrawer}
          title={asideTitle ?? "Details"}
        >
          <div className="p-4">{aside}</div>
        </Drawer>
      )}
    </div>
  );
}

/**
 * A panel's small-screen form.
 *
 * Slides in over the content with a backdrop, rather than pushing it — at this
 * width there isn't room to push anything, and a panel that squeezes the main
 * column to nothing is worse than one that covers it.
 *
 * Escape closes, the backdrop closes, and the page behind can't scroll while
 * it's open. Same obligations a dialog has, because at this size it is one.
 */
function Drawer({
  side,
  open,
  onClose,
  title,
  footer,
  children,
}: {
  side: "left" | "right";
  open: boolean;
  onClose: () => void;
  title?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const isLeft = side === "left";

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-accent-950/40 backdrop-blur-[2px] motion-safe:animate-[fade-in_150ms_ease-out]"
      />

      <aside
        aria-label={title}
        className={cn(
          "absolute inset-y-0 flex w-[min(20rem,85vw)] flex-col bg-canvas shadow-e4",
          isLeft
            ? "left-0 border-r border-border"
            : "right-0 border-l border-border",
          "motion-safe:animate-[dialog-in_180ms_cubic-bezier(0.32,0.72,0,1)]",
        )}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border pl-4 pr-2">
          <span className="flex-1 truncate text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
            {title}
          </span>
          <DialogClose onClose={onClose} />
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-border p-2">{footer}</div>
        )}
      </aside>
    </div>
  );
}

/** The small-screen affordance for a panel that has become a drawer. */
function DrawerToggle({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-hover hover:text-text",
        className,
      )}
    >
      <Menu className="size-4" />
    </button>
  );
}

function Panel({
  side,
  open,
  width,
  onResize,
  footer,
  children,
}: {
  side: "left" | "right";
  open: boolean;
  width: number;
  onResize: (n: number) => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const isLeft = side === "left";
  const [dragging, setDragging] = React.useState(false);

  return (
    <aside
      /* Width is an inline style, not a class. It's a live, user-dragged value,
         so there's nothing for a utility class to express — and an inline style
         is the one declaration a stray utility can't lose to. min-w-0 still
         matters: a flex item defaults to `min-width: auto`, which floors it at
         its content's min-content size and would stop it shrinking. */
      style={{ width: open ? width : 0 }}
      className={cn(
        "hidden min-w-0 shrink-0 border-border lg:block",
        // Only animate the collapse — animating during a drag makes the panel
        // lag the cursor.
        !dragging && "transition-[width] duration-200 ease-out-quart",
        open && (isLeft ? "border-r" : "border-l"),
      )}
    >
      <div className="sticky top-12 flex h-[calc(100vh-3rem)] flex-col overflow-x-hidden">
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>

        {footer && (
          <div
            className={cn(
              "shrink-0 border-t border-border p-2",
              isLeft ? "craig-panel-nav" : "craig-panel-aside",
            )}
          >
            {footer}
          </div>
        )}

        {open && (
          <ResizeHandle
            side={side}
            width={width}
            onResize={onResize}
            onDraggingChange={setDragging}
          />
        )}
      </div>
    </aside>
  );
}

/**
 * Sits on the panel's inner edge. The pointer is captured on the handle so the
 * drag survives the cursor outrunning it, and `col-resize` is forced onto the
 * body so the cursor doesn't flicker over text mid-drag.
 */
function ResizeHandle({
  side,
  width,
  onResize,
  onDraggingChange,
}: {
  side: "left" | "right";
  width: number;
  onResize: (n: number) => void;
  onDraggingChange: (dragging: boolean) => void;
}) {
  const [dragging, setDragging] = React.useState(false);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();

    // Capture keeps events flowing to the handle even if the cursor outruns
    // it, but it's an optimisation, not the mechanism — it throws if the
    // pointer isn't active, so a failure here must not abort the drag. The
    // listeners go on window, which works either way.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    const startX = e.clientX;
    const startW = width;
    setDragging(true);
    onDraggingChange(true);

    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMove(ev: PointerEvent) {
      // The left panel grows as the cursor moves right; the right panel is
      // mirrored, so its delta inverts.
      const delta = side === "left" ? ev.clientX - startX : startX - ev.clientX;
      onResize(startW + delta);
    }

    function onUp() {
      setDragging(false);
      onDraggingChange(false);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    onResize(width + dir * NUDGE * (side === "left" ? 1 : -1));
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${side} panel`}
      aria-valuenow={width}
      aria-valuemin={MIN_W}
      aria-valuemax={MAX_W}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onResize(DEFAULT_W)}
      title="Drag to resize · double-click to reset"
      className={cn(
        "group absolute inset-y-0 z-10 w-2 cursor-col-resize touch-none focus-visible:outline-none",
        side === "left" ? "-right-1" : "-left-1",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-accent transition-opacity duration-150",
          "group-hover:opacity-100 group-focus-visible:opacity-100",
          dragging ? "opacity-100" : "opacity-0",
        )}
      />
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
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-hover hover:text-text",
        className,
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

/**
 * Pinned to the bottom cell of the left panel, built like the brand cell at the
 * top: the identity is content, not a control, and only the chevron is a
 * button. Making the whole row a target would imply the name itself does
 * something.
 */
function AccountMenu({ account }: { account: AccountInfo }) {
  const router = useRouter();

  return (
    <div className="flex w-full items-center gap-2.5 px-1.5 py-1">
      <Avatar name={account.name} size="md" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-text">
          {account.name}
        </span>
        {account.role && (
          <span className="truncate text-2xs text-text-subtle">
            {account.role}
          </span>
        )}
      </div>

      <DropdownMenu
        label="Account menu"
        align="end"
        side="top"
        width="w-52"
        className="shrink-0"
        trigger={
          <span className="inline-flex size-7 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-hover hover:text-text">
            <ExpandLess className="size-4" />
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
          /* The sandbox is a builder's tool, not an admin's — it doesn't belong
             in the product nav, but it has to be reachable from every screen. */
          {
            id: "sandbox",
            label: "Sandbox",
            description: "Builder hub",
            icon: <Science />,
            separatorBefore: true,
            onSelect: () => router.push("/sandbox"),
          },
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
