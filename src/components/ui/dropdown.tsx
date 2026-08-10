"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ExpandMore } from "./icons";
import { cn } from "@/lib/cn";

/**
 * Menu anchored to a trigger, portalled to `<body>` and positioned against the
 * viewport.
 *
 * **`side` and `align` are preferences, not instructions.** This used to say
 * placement was declared rather than computed, on the reasoning that our
 * anchors were toolbars and row actions that never came near an edge. That
 * stopped being true the moment a `SelectMenu` appeared at the bottom of the
 * block settings panel: the "Wait for 2-step verification" field is the last
 * control in a long scrolling aside, so its trigger sits within ~45px of the
 * window bottom and a declared `side: "bottom"` put the whole menu underneath
 * the fold. Fixed elements do not scroll, so there was no gesture that could
 * bring the options back — they were simply gone, which is exactly how it was
 * reported ("the dropdown is pointing down and i cant see the options").
 *
 * So placement is measured now: the menu opens on the side it was asked for
 * when the options fit there, flips to the other side when they don't, and
 * takes a max-height and an internal scroll when neither side can hold it (a
 * short window, or a 30-item list). The horizontal edge is clamped the same
 * way. It never draws itself where it cannot be read.
 *
 * Hand-rolled rather than floating-ui, which the old comment suggested. The
 * whole of what we need is one flip and two clamps — about forty lines, all of
 * it visible here — against a dependency whose value is the *other* ninety per
 * cent (arrows, virtual anchors, shift/inline/hide middleware, nested
 * reference tracking). If we ever want that, the API above is unchanged and
 * the swap is still one file.
 *
 * Keyboard: Enter/Space/ArrowDown opens, Up/Down move, Home/End jump,
 * Enter/Space activate, Escape closes and returns focus to the trigger. Escape
 * is stopped so it doesn't also close a Dialog the menu sits inside.
 */

export interface DropdownItem {
  id: string;
  label: React.ReactNode;
  description?: string;
  icon?: React.ReactNode;
  tag?: string;
  disabled?: boolean;
  destructive?: boolean;
  /** Draws a divider above this item. */
  separatorBefore?: boolean;
  onSelect?: () => void;
}

/* Mount detection without setState-in-an-effect: the server snapshot is false
   and the client's is true, so the portal only renders after hydration. */
const neverChanges = () => () => {};
function useMounted() {
  return React.useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
}

export type DropdownAlign = "start" | "end";
export type DropdownSide = "top" | "bottom";

/** Between the trigger and the menu. */
const GAP = 6;
/** The smallest gap we will leave between the menu and the window edge. */
const EDGE = 8;
/**
 * The height we will insist on even when the viewport says there is less.
 *
 * Without a floor, a genuinely tiny window (or a trigger pinned against the
 * edge in both directions) resolves to a few pixels of menu, which is the same
 * unusable outcome by a different route. Two rows and a hint of a third is
 * enough to show that a list exists and can be scrolled; the alternative —
 * refusing to open — hides the control rather than the overflow.
 */
const MIN_HEIGHT = 96;

/**
 * Where the menu actually landed, as opposed to where it asked to go.
 *
 * Held in state rather than computed during render because it depends on the
 * menu's own measured size, which does not exist until React has put it in the
 * document. The first paint therefore uses the unflipped fallback below and a
 * layout effect corrects it — before the browser paints, so there is no frame
 * at the wrong position.
 */
interface Placement {
  side: DropdownSide;
  left: number;
  /** Exactly one of these two is set, matching `side`. */
  top?: number;
  bottom?: number;
  maxHeight: number;
  /** Only set when the menu is asked to match its trigger's width. */
  width?: number;
}

function samePlacement(a: Placement | null, b: Placement) {
  return (
    a !== null &&
    a.side === b.side &&
    a.left === b.left &&
    a.top === b.top &&
    a.bottom === b.bottom &&
    a.maxHeight === b.maxHeight &&
    a.width === b.width
  );
}

export function DropdownMenu({
  trigger,
  items,
  selectedId,
  onSelect,
  label,
  align = "start",
  side = "bottom",
  width = "w-56",
  matchTrigger = false,
  className,
  triggerClassName,
  triggerProps,
  menuClassName,
}: {
  /** Rendered inside the trigger button. */
  trigger: React.ReactNode;
  items: DropdownItem[];
  /** When set, the menu behaves as a listbox and ticks the current value. */
  selectedId?: string;
  onSelect?: (id: string) => void;
  label: string;
  align?: DropdownAlign;
  side?: DropdownSide;
  width?: string;
  /**
   * Make the menu exactly as wide as its trigger, the way a form select does.
   *
   * A separate prop rather than `width="w-full"`, which is what `SelectMenu`
   * used to pass and which was silently wrong: the menu is portalled to
   * `<body>` and positioned `fixed`, so a percentage width resolves against
   * the initial containing block — the *window* — not against the field the
   * menu belongs to. A 288px field opened a 1280px menu that started at the
   * field's left edge and ran 977px past the right of the screen. It read as
   * "the dropdown is broken" rather than as a width bug, because the part
   * anybody could see was the part that was cut off.
   *
   * A measured number can be clamped against the viewport; a percentage
   * cannot, which is the other reason this is not a class.
   */
  matchTrigger?: boolean;
  className?: string;
  /** Applied to the trigger button — pass `w-full` to make it fill its cell. */
  triggerClassName?: string;
  /** Spread onto the trigger button, so Field can wire id and aria-* to it. */
  triggerProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
  menuClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const mounted = useMounted();
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const [placement, setPlacement] = React.useState<Placement | null>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = React.useId();

  const close = React.useCallback((focusTrigger = true) => {
    setOpen(false);
    setActiveIndex(-1);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      /* The menu is portalled out, so it is no longer a descendant of the
         trigger — both have to count as "inside" or the first click on a menu
         item closes the menu instead of choosing anything. */
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }

    /* Anchored to the trigger's viewport position, so it has to be recomputed
       when anything moves underneath it. */
    function place() {
      const el = triggerRef.current;
      if (el) setRect(el.getBoundingClientRect());
    }
    place();

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      /* Dropped on close so a reopen never paints last time's answer. The
         trigger of a row menu moves whenever the list behind it does, and a
         stale flip would show for the frame before the effect below re-runs. */
      setRect(null);
      setPlacement(null);
    };
  }, [open, close]);

  /**
   * Turn the trigger's rectangle and the menu's own size into a position that
   * fits on the screen.
   *
   * A layout effect rather than an ordinary one: this runs after React has put
   * the menu in the document but before the browser paints, so the fallback
   * position in `style` below is never actually seen. As an ordinary effect it
   * would be a visible jump on every open near an edge.
   */
  React.useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || !rect || !menu) return;

    /* `scrollHeight` and not `offsetHeight`, which is the trap here: once a
       previous pass has applied a max-height the box measures as the clamped
       size, so re-measuring the box would ratchet the menu smaller every time
       the page scrolled underneath it. `scrollHeight` is the content, which
       does not move; the borders are the only part of the box it leaves out. */
    const borders = menu.offsetHeight - menu.clientHeight;
    const natural = menu.scrollHeight + borders;

    /* `documentElement.clientWidth`, not `window.innerWidth`: the latter counts
       the classic scrollbar, and a menu clamped to it would sit under one. */
    const viewportW = document.documentElement.clientWidth;
    const viewportH = document.documentElement.clientHeight;

    const room = {
      bottom: viewportH - rect.bottom - GAP - EDGE,
      top: rect.top - GAP - EDGE,
    };
    const other: DropdownSide = side === "bottom" ? "top" : "bottom";

    /* Flip only when it actually helps. The declared side wins if the options
       fit there, and it also wins when neither side fits — a menu that has to
       be scrolled either way should stay where its caller put it rather than
       jump across the trigger to be equally scrolled somewhere unexpected. */
    const chosen =
      natural <= room[side] || room[side] >= room[other] ? side : other;
    const maxHeight = Math.max(room[chosen], MIN_HEIGHT);

    /* Resolved to a `left` for both alignments, because clamping one edge is
       one expression and clamping two is a special case per alignment. */
    const menuW = matchTrigger ? rect.width : menu.offsetWidth;
    const wanted = align === "start" ? rect.left : rect.right - menuW;
    const left = Math.min(
      Math.max(wanted, EDGE),
      Math.max(EDGE, viewportW - menuW - EDGE),
    );

    const next: Placement = {
      side: chosen,
      left,
      top: chosen === "bottom" ? rect.bottom + GAP : undefined,
      bottom: chosen === "top" ? viewportH - rect.top + GAP : undefined,
      maxHeight,
      width: matchTrigger ? rect.width : undefined,
    };
    /* Scroll hands us a fresh DOMRect on every frame whether or not the
       trigger moved, and an unconditional set would re-render the menu for
       each one. */
    setPlacement((prev) => (samePlacement(prev, next) ? prev : next));
  }, [open, rect, side, align, matchTrigger, items.length]);

  /**
   * Move real focus onto the active item.
   *
   * `rendered` is in the dependencies and has to be, which is a bug found on
   * the way past rather than one anybody reported. The portal below does not
   * render until `rect` exists, and `rect` is set by an effect — so on the
   * render that opens the menu there are no item elements yet and
   * `itemRefs.current` is a row of nulls. Without this dependency the effect
   * ran exactly once, against nothing, and never again: ArrowDown opened the
   * menu and left focus on the trigger, so every subsequent arrow key went
   * back to the trigger's own handler and the menu's keyboard navigation was
   * unreachable. The options were there and could not be got to — the same
   * complaint as the placement bug above, arriving by a different route.
   *
   * A boolean rather than `rect` itself: the rectangle is replaced on every
   * scroll frame while the menu is open, and depending on it would drag focus
   * back to the active item each time the page moved underneath.
   */
  const rendered = rect !== null;
  React.useEffect(() => {
    if (open && rendered && activeIndex >= 0) {
      itemRefs.current[activeIndex]?.focus();
    }
  }, [open, rendered, activeIndex]);

  function move(delta: number) {
    setActiveIndex((prev) => {
      const next = prev + delta;
      if (next < 0) return items.length - 1;
      if (next >= items.length) return 0;
      // Skip disabled entries in whichever direction we're travelling.
      let i = next;
      while (items[i]?.disabled) {
        i += delta > 0 ? 1 : -1;
        if (i < 0) i = items.length - 1;
        if (i >= items.length) i = 0;
      }
      return i;
    });
  }

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex(items.findIndex((i) => !i.disabled));
    }
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(items.findIndex((i) => !i.disabled));
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(items.map((i) => !i.disabled).lastIndexOf(true));
    } else if (e.key === "Tab") {
      close(false);
    }
  }

  function activate(item: DropdownItem) {
    if (item.disabled) return;
    item.onSelect?.();
    onSelect?.(item.id);
    close();
  }

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setActiveIndex(-1);
        }}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup={selectedId !== undefined ? "listbox" : "menu"}
        aria-expanded={open}
        aria-label={label}
        aria-controls={open ? menuId : undefined}
        {...triggerProps}
        className={cn("inline-flex items-center", triggerClassName)}
      >
        {trigger}
      </button>

      {open &&
        mounted &&
        rect &&
        createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role={selectedId !== undefined ? "listbox" : "menu"}
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          /* Fixed and portalled to <body>. Absolute positioning meant any
             ancestor with `overflow: hidden` — a bordered List, a scrolling
             side panel, a card — clipped the menu to its own box. Portalling
             takes it out of every one of those at once, which no amount of
             z-index can do.

             Portalling is not enough on its own, though, and believing it was
             is what left this broken: escaping the clip only means the menu is
             free to be drawn anywhere, including past the bottom of the
             window. `placement` is the part that says where. Until the layout
             effect above has measured, the fallback is the old declared
             position — never painted, but it keeps this readable as plain
             positioning rather than as a two-phase dance. */
          style={{
            top: placement ? placement.top : rect.bottom + GAP,
            bottom: placement?.bottom,
            left: placement ? placement.left : rect.left,
            maxHeight: placement?.maxHeight,
            width: placement?.width,
          }}
          className={cn(
            /* `overflow-y-auto`, where this was `overflow-hidden`. The two
               agree in the ordinary case — both clip the item hovers to the
               rounded corners — and disagree in the one that matters: with a
               max-height in play, `hidden` means the options past the fold are
               unreachable, which is the bug this whole change is about, moved
               from the window's edge to the menu's own. */
            "fixed z-50 overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface-raised p-1 shadow-e3",
            "motion-safe:animate-[dialog-in_140ms_cubic-bezier(0.32,0.72,0,1)]",
            /* A measured width and a width class would fight, and the class
               would be the one that is wrong near an edge. */
            !matchTrigger && width,
            menuClassName,
          )}
        >
          {items.map((item, i) => {
            const selected = selectedId !== undefined && item.id === selectedId;
            return (
              <React.Fragment key={item.id}>
                {item.separatorBefore && (
                  <div className="-mx-1 my-1 h-px bg-border" role="separator" />
                )}
                <button
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  type="button"
                  role={selectedId !== undefined ? "option" : "menuitem"}
                  aria-selected={
                    selectedId !== undefined ? selected : undefined
                  }
                  disabled={item.disabled}
                  tabIndex={-1}
                  onClick={() => activate(item)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      activate(item);
                    }
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left outline-none transition-colors",
                    "hover:bg-surface-hover focus-visible:bg-surface-hover",
                    item.disabled && "pointer-events-none opacity-45",
                    item.destructive
                      ? "text-danger hover:bg-danger-subtle"
                      : "text-text",
                  )}
                >
                  {item.icon && (
                    <span className="mt-px shrink-0 [&_svg]:size-4">
                      {item.icon}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-base font-medium">
                        {item.label}
                      </span>
                      {item.tag && (
                        <span className="shrink-0 rounded-sm bg-surface-sunken px-1 py-px text-2xs text-text-subtle">
                          {item.tag}
                        </span>
                      )}
                    </span>
                    {item.description && (
                      <span className="text-xs leading-snug text-text-subtle">
                        {item.description}
                      </span>
                    )}
                  </span>
                  {selectedId !== undefined && (
                    <Check
                      className={cn(
                        "mt-0.5 size-4 shrink-0 text-accent",
                        !selected && "invisible",
                      )}
                    />
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  SelectMenu                                                                */
/* -------------------------------------------------------------------------- */

/**
 * DropdownMenu wearing a form control's clothes. Use this in forms rather than
 * the native `Select` when options need descriptions, icons or grouping — the
 * native one is still the right call for long, plain lists, where the OS picker
 * beats anything we can draw (especially on mobile).
 */
export function SelectMenu({
  value,
  onChange,
  options,
  label,
  placeholder = "Select…",
  id,
  className,
  "aria-describedby": describedBy,
  invalid,
}: {
  value?: string;
  onChange: (id: string) => void;
  options: DropdownItem[];
  label: string;
  placeholder?: string;
  id?: string;
  className?: string;
  "aria-describedby"?: string;
  invalid?: boolean;
}) {
  const current = options.find((o) => o.id === value);

  return (
    <DropdownMenu
      label={label}
      selectedId={value ?? ""}
      onSelect={onChange}
      items={options}
      className={cn("w-full", className)}
      triggerClassName="w-full"
      /* Not `width="w-full"`, which is what this said and which resolved
         against the window rather than the field — see `matchTrigger`. */
      matchTrigger
      triggerProps={{ id, "aria-describedby": describedBy }}
      trigger={
        <span
          data-invalid={invalid || undefined}
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-base shadow-e1",
            "transition-[border-color,box-shadow] hover:border-border-strong",
            "data-[invalid]:border-danger",
            current ? "text-text" : "text-text-subtle",
          )}
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {current ? current.label : placeholder}
          </span>
          <ExpandMore className="size-4 shrink-0 text-text-subtle" />
        </span>
      }
    />
  );
}
