"use client";

import * as React from "react";
import { Add, Remove, CenterFocusStrong } from "./icons";
import { cn } from "@/lib/cn";

/**
 * Pannable, zoomable surface for the workflow builder.
 *
 * The dot grid is painted on the *viewport*, not on the transformed content —
 * a scaled background-image stays crisp, whereas scaling a DOM layer of dots
 * would blur them and cost a layer the size of the whole canvas. So the grid
 * tracks pan/zoom by moving its background-position and size instead.
 *
 * Panning starts only on the background itself. If it started on any
 * pointerdown, dragging across a card would move the canvas instead of
 * interacting with the card.
 */

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 1.4;
/** How far past its own edges the content can be dragged before it stops. */
const OVERSCROLL = 96;
const ZOOM_STEP = 0.1;
/** Dot spacing. Wide, so the grid reads as texture rather than as a ruler. */
const GRID = 56;

const clampZoom = (z: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));

export function WorkflowCanvas({
  children,
  onBackgroundClick,
  className,
}: {
  children: React.ReactNode;
  /**
   * Fired by a click on empty canvas — not on a block, and not at the end of a
   * pan. Deselecting by clicking away is the gesture every canvas tool has, and
   * without it the only way back to the workflow's own settings is to guess.
   */
  onBackgroundClick?: () => void;
  className?: string;
}) {
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [panning, setPanning] = React.useState(false);
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const pannedRef = React.useRef(false);

  /**
   * Keeps the workflow findable. Without this the surface is infinite and it's
   * possible to drag the content entirely off-screen with no way back except
   * the reset button — which you have to know exists.
   *
   * The content can travel until its far edge reaches the opposite viewport
   * edge, plus a little overscroll so it doesn't feel like it hits a wall.
   */
  const clampPan = React.useCallback(
    (p: { x: number; y: number }, z: number) => {
      const vp = viewportRef.current;
      const ct = contentRef.current;
      if (!vp || !ct) return p;

      const axis = (v: number, viewport: number, content: number) => {
        const span = Math.max(0, content * z - viewport);
        return Math.min(OVERSCROLL, Math.max(-span - OVERSCROLL, v));
      };

      return {
        x: axis(p.x, vp.clientWidth, ct.offsetWidth),
        y: axis(p.y, vp.clientHeight, ct.offsetHeight),
      };
    },
    [],
  );

  const reset = React.useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  /**
   * Zoom about a point, so the content under the cursor stays under it.
   * Without this, zooming always pulls toward the origin and the thing you
   * were looking at slides away.
   */
  const zoomAt = React.useCallback(
    (delta: number, clientX?: number, clientY?: number) => {
      const el = viewportRef.current;
      setZoom((prev) => {
        // Derived from `prev`, not from the `zoom` in scope — otherwise two
        // rapid clicks batch into one step, both reading the same stale value.
        const z = clampZoom(prev + delta);
        if (!el || clientX === undefined || clientY === undefined) return z;

        const rect = el.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        setPan((p) =>
          clampPan(
            {
              x: px - ((px - p.x) / prev) * z,
              y: py - ((py - p.y) / prev) * z,
            },
            z,
          ),
        );
        return z;
      });
    },
    [clampPan],
  );

  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    // Non-passive so ctrl/⌘+wheel can be prevented — otherwise the browser
    // zooms the whole page instead of the canvas.
    function onWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomAt(-e.deltaY * 0.01, e.clientX, e.clientY);
      } else {
        e.preventDefault();
        setPan((p) => clampPan({ x: p.x - e.deltaX, y: p.y - e.deltaY }, zoom));
      }
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, clampPan, zoom]);

  function onPointerDown(e: React.PointerEvent) {
    // Only the background pans — never a card or a control.
    if (e.target !== e.currentTarget) return;
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const origin = { ...pan };
    setPanning(true);

    function onMove(ev: PointerEvent) {
      // A pan is not a click. Three pixels of slop so a shaky press still
      // counts as one.
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 3) {
        pannedRef.current = true;
      }
      setPan(
        clampPan(
          {
            x: origin.x + (ev.clientX - startX),
            y: origin.y + (ev.clientY - startY),
          },
          zoom,
        ),
      );
    }
    function onUp() {
      setPanning(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  return (
    <div
      ref={viewportRef}
      onPointerDown={onPointerDown}
      onClick={(e) => {
        if (pannedRef.current) {
          pannedRef.current = false;
          return;
        }
        if (!onBackgroundClick) return;
        // Anything inside a block is that block's business.
        if ((e.target as HTMLElement).closest("[data-block-card]")) return;
        onBackgroundClick();
      }}
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-canvas",
        panning ? "cursor-grabbing" : "cursor-grab",
        className,
      )}
      style={{
        // border-strong rather than border: at 56px apart the dots are sparse
        // enough that the lighter value reads as a smudge on a laptop screen.
        backgroundImage:
          "radial-gradient(circle, var(--color-border-strong) 1.25px, transparent 1.25px)",
        // Fixed spacing — deliberately not multiplied by zoom.
        backgroundSize: `${GRID}px ${GRID}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
    >
      <div
        ref={contentRef}
        className="origin-top-left"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          // Panning has no transition; the buttons do, so a click eases.
          transition: panning ? "none" : "transform 150ms cubic-bezier(0.25,1,0.5,1)",
          width: `${100 / zoom}%`,
        }}
      >
        {children}
      </div>

      <CanvasControls zoom={zoom} onZoomBy={(d) => zoomAt(d)} onReset={reset} />
    </div>
  );
}

/** Floating, bottom-right, over the canvas. */
function CanvasControls({
  zoom,
  onZoomBy,
  onReset,
}: {
  zoom: number;
  onZoomBy: (delta: number) => void;
  onReset: () => void;
}) {
  return (
    <div
      // Stop pointerdown reaching the canvas, or using the controls would pan.
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute bottom-4 right-4 flex items-center gap-0.5 rounded-lg border border-border bg-surface-raised p-1 shadow-e3"
    >
      <ControlButton
        label="Zoom out"
        onClick={() => onZoomBy(-ZOOM_STEP)}
        disabled={zoom <= MIN_ZOOM}
      >
        <Remove className="size-4" />
      </ControlButton>

      <button
        type="button"
        onClick={onReset}
        title="Reset view"
        className="min-w-12 rounded-md px-1.5 py-1 text-xs font-medium tabular-nums text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
      >
        {Math.round(zoom * 100)}%
      </button>

      <ControlButton
        label="Zoom in"
        onClick={() => onZoomBy(ZOOM_STEP)}
        disabled={zoom >= MAX_ZOOM}
      >
        <Add className="size-4" />
      </ControlButton>

      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />

      <ControlButton label="Reset view" onClick={onReset}>
        <CenterFocusStrong className="size-4" />
      </ControlButton>
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex size-7 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-hover hover:text-text disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Floating panel anchored to a canvas corner — toolbars, legends, filters. */
export function CanvasPanel({
  side = "top-left",
  children,
  className,
}: {
  side?: "top-left" | "top-right" | "bottom-left";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "absolute z-10 rounded-lg border border-border bg-surface-raised p-1 shadow-e3",
        side === "top-left" && "left-4 top-4",
        side === "top-right" && "right-4 top-4",
        side === "bottom-left" && "bottom-4 left-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
