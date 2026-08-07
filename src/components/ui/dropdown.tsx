"use client";

import * as React from "react";
import { Check, ExpandMore } from "./icons";
import { cn } from "@/lib/cn";

/**
 * Menu anchored to a trigger. Not collision-aware — placement is declared, not
 * computed. That's fine for the anchors we have (toolbars, row actions, the
 * composer); if we start anchoring near a viewport edge, swap the positioning
 * for floating-ui and keep this API.
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

export type DropdownAlign = "start" | "end";
export type DropdownSide = "top" | "bottom";

export function DropdownMenu({
  trigger,
  items,
  selectedId,
  onSelect,
  label,
  align = "start",
  side = "bottom",
  width = "w-56",
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
  const triggerRef = React.useRef<HTMLButtonElement>(null);
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
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, close]);

  React.useEffect(() => {
    if (open && activeIndex >= 0) itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

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

      {open && (
        <div
          id={menuId}
          role={selectedId !== undefined ? "listbox" : "menu"}
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={cn(
            "absolute z-30 overflow-hidden rounded-lg border border-border bg-surface-raised p-1 shadow-e3",
            "motion-safe:animate-[dialog-in_140ms_cubic-bezier(0.32,0.72,0,1)]",
            side === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5",
            align === "start" ? "left-0" : "right-0",
            width,
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
        </div>
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
      width="w-full"
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
