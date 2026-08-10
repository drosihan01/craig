"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ExpandLess,
  LeftPanelClose,
  LeftPanelOpen,
  Logout,
  Menu,
  Person,
  RightPanelClose,
  RightPanelOpen,
  Settings,
} from "./icons";
import { Avatar } from "./avatar";
import { CraigMark } from "./craig-mark";
import { NotificationBell, type AppNotification } from "./notifications";
import { DropdownMenu } from "./dropdown";
import { DialogClose } from "./dialog";
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

/**
 * The collapsed nav's width, when a screen has given it a rail.
 *
 * Wide enough for a 36px target with 8px either side. Not resizable and not
 * persisted: it's the width of an icon, so there is nothing to prefer.
 */
const RAIL_W = 52;
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

function usePersistedWidth(key: string, fallback = DEFAULT_W) {
  const width = React.useSyncExternalStore(
    subscribe,
    () => {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : clamp(Number(raw) || fallback);
      } catch {
        return fallback;
      }
    },
    () => fallback,
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
  navRail,
  aside,
  asideTitle,
  asideFlushTop,
  asidePanel,
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
  /**
   * The nav, collapsed to icons.
   *
   * Given it, the panel shuts to a strip instead of to nothing, and the header
   * cell above shrinks to match — the two share a vertical rule and would part
   * company if either moved alone. Omit it and collapsing behaves as it always
   * has, which is why this is a prop and not a change to every screen at once:
   * counts, prose and steppers don't survive being squeezed to 52px, so a
   * screen has to say what its rail is.
   */
  navRail?: React.ReactNode;
  /** Eyebrow above the aside. Omit when the panel's own content already says
      what it is — a heading that repeats the thing under it is just a line of
      shouting. The drawer still gets a name, since a sheet with no title is
      unlabelled to a screen reader. */
  asideTitle?: string;
  /**
   * Drop the aside's top padding, keeping the bottom.
   *
   * For a panel whose content is a transcript. The bottom padding is holding a
   * composer off the edge of the window and is wanted; the top is holding the
   * oldest visible line off a rule it is about to scroll under anyway, which
   * just reads as the column starting late.
   *
   * Per-state rather than per-page, since the editor's aside is a conversation
   * until you select a block and a panel of settings after that — and settings
   * want their margin.
   */
  asideFlushTop?: boolean;
  /**
   * A starting width for the right panel, and its own place to remember one.
   *
   * Both together, because either alone is broken. A wider default under the
   * shared key lasts until somebody drags the panel on any other screen, and
   * then the screen that needed the width silently loses it. A separate key
   * with the shared default starts every builder at 224px again.
   *
   * The builder is the one screen where the panel is a conversation rather
   * than a column of facts, and 224px is narrow enough that a placeholder
   * wraps to two lines in it.
   */
  asidePanel?: { key: string; width: number };
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
  const [asideW, setAsideW] = usePersistedWidth(
    asidePanel ? `craig-aside-w-${asidePanel.key}` : "craig-aside-w",
    asidePanel?.width,
  );

  const isDesktop = useIsDesktop();
  /* Not persisted, unlike the column state. A drawer is a thing you opened a
     second ago, not a preference. */
  const [drawer, setDrawer] = React.useState<"nav" | "aside" | null>(null);
  const closeDrawer = React.useCallback(() => setDrawer(null), []);

  /* Collapsed, but still showing something. Everything that has to line up
     with the nav column reads this rather than testing `navOpen` itself, so
     the header cell, the column and the panel footer can't disagree. */
  /**
   * Showing the strip rather than the full column. Desktop only.
   *
   * A narrow screen gets no rail: 52px of permanent chrome is a bigger share
   * of a phone than of a laptop, and the drawer already shows the whole nav
   * for the same press. So the narrow layout is the page, plus one control to
   * open the nav over it.
   */
  const railed = Boolean(nav && navRail && !navOpen && isDesktop);

  const vars = {
    "--craig-nav-w":
      navOpen && nav ? `${navW}px` : railed ? `${RAIL_W}px` : "0px",
    /* Panel contents normally track the *open* width so they don't reflow
       mid-animation. A rail is different content at a different width, so
       while it's showing this is the width it actually gets — otherwise the
       account footer would lay itself out at 224px inside a 52px strip. */
    "--craig-nav-open-w": railed ? `${RAIL_W}px` : `${navW}px`,
    "--craig-aside-w": asideOpen && aside ? `${asideW}px` : "0px",
    "--craig-aside-open-w": `${asideW}px`,
  } as React.CSSProperties;

  return (
    <div className="min-h-screen bg-canvas" style={vars}>
      <header className="sticky top-0 z-40 border-b border-border bg-canvas/85 backdrop-blur-md">
        {/* Full width, no centring. This carried `mx-auto max-w-[1500px]`,
            which on a wide monitor left a band of empty canvas down each side
            and floated the whole product in the middle of the screen — the nav
            drifted away from the left edge, and the notification bell away
            from the top-right corner, which is the one place people throw the
            pointer without looking.

            `border-x` goes with it: an outer rule was drawing the seam between
            the app and that empty band, and with the band gone it would be a
            line painted along the edge of the window. The columns keep their
            own dividers, which are the seams that mean something. */}
        <div className="flex h-12">
          {/* Left cell — tracks the nav column's width, same rule. */}
          <div
            className={cn(
              /* The rule is drawn at every width now. It used to be `lg:` only,
                 which left the toggle on a narrow screen floating against the
                 page with nothing marking it off from the title beside it. */
              "flex shrink-0 items-center border-r border-dotted border-border",
              /* Centred and unpadded whenever the cell is just the toggle —
                 in the rail, and on any screen too narrow for a column. The
                 wordmark is gone in both, so the control takes the cell rather
                 than sitting at the end of one. */
              railed || !isDesktop ? "justify-center px-2" : "gap-1 pl-4 pr-2",
              /* Only ever as wide as the column it's tracking. Below `lg`
                 there is no column, so the cell is as wide as its contents —
                 without this it took the persisted 224px on a phone. */
              (navOpen || railed) && nav && isDesktop
                ? "craig-col-nav"
                : "lg:w-auto",
            )}
          >
            {/* The mark goes with the wordmark, and both go whenever the cell
                is narrow — in the rail, and below `lg`. A brand cell holding
                an icon and a toggle in that space reads as two controls, one
                of which does nothing when you press it, and on a phone the
                room is better spent on the page's own title. */}
            {!railed && isDesktop && (
              <>
                <CraigMark className="size-5" />
                <span className="truncate text-base font-semibold tracking-[-0.01em]">
                  Craig.
                </span>
              </>
            )}
            {/* One control, whatever the width. On desktop it widens the
                column; on a narrow screen there is nothing to widen into, so
                the same control opens the nav as a drawer over the page.

                No hamburger. It sat exactly where the expand toggle sits and
                did a different thing, so the same corner of the same header
                meant two things depending on how wide the window was. */}
            {nav && (
              <PanelToggle
                open={isDesktop ? navOpen : false}
                onToggle={isDesktop ? toggleNav : () => setDrawer("nav")}
                side="left"
                className={railed ? undefined : "ml-auto"}
              />
            )}
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
              toggle in the brand cell; notifications take the far corner.

              The theme switch used to live here and has moved to Settings. It
              is a preference set roughly once, and it was holding the most
              valuable corner of every screen in the product — while the bell,
              which is about work waiting for you, appeared on two screens and
              read hardcoded demo rows on both. The corner now holds the thing
              you would come back to it for. Sign-in and sign-up keep their own
              switch: somebody who cannot get in cannot reach Settings. */}
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
            {notifications && (
              <NotificationBell
                items={notifications}
                onSelect={onNotificationSelect}
                onMarkAllRead={onMarkAllRead}
                className="ml-auto shrink-0"
              />
            )}
          </div>
        </div>
      </header>

      {/* `fill` is a *fixed* height, not a floor.
       *
       * These were both `min-h` until a long conversation proved the
       * difference. A screen that pins its own composer sizes itself with
       * `h-full`, and a percentage height resolves against whatever the parent
       * actually is — so under `min-h` the row grew past the viewport as the
       * transcript did, `h-full` grew with it, and the composer stayed glued to
       * the bottom of the *content* while the whole page scrolled. It looked
       * pinned right up until there was enough conversation to scroll, which is
       * why it survived a short test.
       *
       * The floor is still right for every other screen: they scroll as pages
       * and should reach the bottom of the window when there is little on them. */}
      <div
        className={cn(
          /* Matches the header above it exactly — same removal, same reason.
             These two must agree at every width or the vertical rule running
             from the header into the page steps sideways at the join. */
          "relative flex",
          fill ? "h-[calc(100vh-3rem)]" : "min-h-[calc(100vh-3rem)]",
        )}
      >
        {nav && isDesktop && (
          <Panel
            side="left"
            open={navOpen}
            width={navW}
            onResize={setNavW}
            rail={navRail}
            footer={
              account ? (
                <AccountMenu account={account} compact={railed} />
              ) : undefined
            }
          >
            <div className="craig-panel-nav px-4 py-6">{nav}</div>
          </Panel>
        )}

        {/* Under `fill`, main is itself a column that cannot outgrow its share.
            `min-h-0` is the half that is easy to leave off and impossible to
            spot: without it a flex child's floor is its content, so a long
            transcript pushes the column taller than the row and takes the
            composer past the bottom of the window rather than scrolling. */}
        <main
          className={cn(
            "min-w-0 flex-1 px-4 lg:px-8",
            fill ? "flex min-h-0 flex-col pb-0" : "pb-24",
          )}
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

                `h-full`, not `min-h-full`. The intent was always that an aside
                wanting the whole column could have it — but a minimum is a
                floor, and it only held while the content was shorter than the
                column. Past that the container grew, so a chat's `flex-1`
                transcript resolved against unbounded space, never scrolled
                itself, and scrolled the whole column instead: the header slid
                out of view, the top of the transcript went under it, and the
                composer trailed off after the last message — the exact failure
                this was meant to prevent.

                A ceiling fixes both shapes, and the scroll lives here so it
                only has to be decided once. A chat sizes to the column exactly
                and never scrolls this box; a panel of settings taller than the
                column scrolls it. */}
            <div
              className={cn(
                "craig-panel-aside scrollbar-thin flex h-full flex-col overflow-y-auto px-4 pb-6",
                asideFlushTop ? "pt-0" : "pt-6",
              )}
            >
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
          /* "Craig", not "Menu". Below `lg` this drawer is the whole left
             column, so it is the only place the product's name appears at all
             — the brand cell it normally lives in is one of the things that
             collapsed. Labelling it "Menu" named the furniture instead of the
             thing, on the one width where nothing else was saying it. */
          title="Craig"
          heading={
            <span className="flex flex-1 items-center gap-2 truncate">
              <CraigMark className="size-5" />
              <span className="truncate text-base font-semibold tracking-[-0.01em]">
                Craig.
              </span>
            </span>
          }
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
  heading,
  footer,
  children,
}: {
  side: "left" | "right";
  open: boolean;
  onClose: () => void;
  /**
   * The drawer's accessible name, and its heading unless `heading` overrides
   * the drawn version. A string rather than a node because it is what
   * `aria-label` gets, and a screen reader cannot read an icon.
   */
  title?: string;
  /**
   * What the header actually draws, when a word is not enough.
   *
   * Separate from `title` rather than widening it, because the two have
   * different jobs: one names the panel for somebody who cannot see it, the
   * other is what somebody looking at it reads. Collapsing them would mean
   * either the mark has no accessible name or the heading cannot hold a mark.
   */
  heading?: React.ReactNode;
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
          {heading ?? (
            <span className="flex-1 truncate text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
              {title}
            </span>
          )}
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
  rail,
  footer,
  children,
}: {
  side: "left" | "right";
  open: boolean;
  width: number;
  onResize: (n: number) => void;
  /** Shown instead of `children` while collapsed. Omit to collapse to nothing. */
  rail?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const isLeft = side === "left";
  const [dragging, setDragging] = React.useState(false);
  const railed = Boolean(rail && !open);

  return (
    <aside
      /* Width is an inline style, not a class. It's a live, user-dragged value,
         so there's nothing for a utility class to express — and an inline style
         is the one declaration a stray utility can't lose to. min-w-0 still
         matters: a flex item defaults to `min-width: auto`, which floors it at
         its content's min-content size and would stop it shrinking. */
      style={{ width: open ? width : railed ? RAIL_W : 0 }}
      className={cn(
        "hidden min-w-0 shrink-0 border-border lg:block",
        // Only animate the collapse — animating during a drag makes the panel
        // lag the cursor.
        !dragging && "transition-[width] duration-200 ease-out-quart",
        /* The rule stays while the rail does. A strip of icons with no edge
           on it reads as floating in the page rather than as a column. */
        (open || railed) && (isLeft ? "border-r" : "border-l"),
      )}
    >
      <div className="sticky top-12 flex h-[calc(100vh-3rem)] flex-col overflow-x-hidden">
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          {railed ? rail : children}
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

        {/* Not while it's a rail: its width is the width of an icon, so there
            is nothing to prefer and nothing to drag. */}
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
/**
 * One definition of the account menu, for both widths.
 *
 * The rail and the full row are the same menu on two different triggers, and
 * two copies of this list is two places to add the next item to — one of which
 * somebody will miss, leaving Sign out reachable at one panel width and not
 * the other.
 */
function accountItems(
  account: AccountInfo,
  router: ReturnType<typeof useRouter>,
  /**
   * Where the menu was opened from, so Settings knows what it is a detour
   * out of.
   *
   * Settings has no parent in the nav — it is reached from this menu, from
   * every screen — so the only honest answer to "what does its back arrow point
   * at" is whichever area you were standing in when you opened it. That is
   * knowable exactly here and nowhere else, so it travels in the URL rather
   * than being guessed at the far end.
   */
  from: string,
) {
  return [
    {
      id: "profile",
      label: account.name,
      description: account.email,
      icon: <Person />,
    },
    /* Somewhere at last. This row has been decorative since the shell was
       written, and the one thing that has since needed a permanent address —
       the Google Workspace connection — is exactly the kind of thing it was
       always going to hold. Wired here rather than passed in per screen so
       there is one destination: a `settingsHref` prop would be five call sites
       to keep in step, and the screen that forgot it would be the screen where
       Settings quietly stops working again.

       The sandbox used to get a row here too. It has gone, and has since gone
       further: it was a builder's tool that moved under the archive when the
       product took over the root, and the archive is no longer served at all.
       A dead link in the account menu of a product somebody is being asked to
       trust with their Google Workspace is worse than no link. */
    {
      id: "settings",
      label: "Settings",
      icon: <Settings />,
      onSelect: () =>
        router.push(`/settings?from=${encodeURIComponent(from)}`),
    },
    {
      id: "signout",
      label: "Sign out",
      icon: <Logout />,
      destructive: true,
      separatorBefore: true,
      /* This row has been decorative since the shell was written — a Sign out
         that looked exactly like a working one and did nothing at all, which is
         the worst way for this particular control to fail: somebody presses it,
         sees the menu close, and walks away from a browser that is still signed
         in.

         Awaited before navigating, or the browser can tear the request down
         mid-flight and leave the session cookie exactly where it was.

         `replace` rather than `push`, so the back button doesn't offer to
         return to the screen they just left — it would render, briefly, from a
         cache that still believes in them. `refresh` alongside it for the same
         reason, since the router holds server-rendered payloads that were built
         for somebody who is no longer here.

         The in-memory store needs no explicit clearing: the layout renders
         `AccountScope` with a null email once the session is gone, and
         `claimAccount(null)` resets it. */
      onSelect: async () => {
        try {
          await fetch("/api/auth/sign-out", { method: "POST" });
        } catch {
          /* Offline, or the route is unreachable. Going to sign-in anyway is
             the honest move: the cookie may well still be valid, and the page
             they land on will say so rather than pretending. */
        }
        router.replace("/sign-in");
        router.refresh();
      },
    },
  ];
}

function AccountMenu({
  account,
  compact,
}: {
  account: AccountInfo;
  /** Rail width: the avatar only, and it becomes the menu's own trigger. */
  compact?: boolean;
}) {
  const router = useRouter();
  /* The area Settings will offer to send them back to. */
  const pathname = usePathname();

  /* At 52px there is no room for a name beside a chevron, and dropping the
     name while keeping the chevron would leave the strip ending in a control
     that looks like it belongs to nothing. So the avatar *is* the trigger —
     which is what it already looks like, and what people press anyway. */
  if (compact) {
    return (
      <div className="flex w-full justify-center">
        <DropdownMenu
          label="Account menu"
          align="start"
          side="top"
          width="w-52"
          /* A span, not a button — `DropdownMenu` wraps whatever it's given in
             its own button, and nesting one inside it is invalid HTML that
             React refuses to hydrate. The full-width trigger below is a span
             for the same reason. */
          trigger={
            <span
              title={account.name}
              className="flex size-9 items-center justify-center rounded-lg transition-colors hover:bg-surface-hover"
            >
              <Avatar name={account.name} size="md" />
            </span>
          }
          items={accountItems(account, router, pathname)}
        />
      </div>
    );
  }

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
        items={accountItems(account, router, pathname)}
      />
    </div>
  );
}
