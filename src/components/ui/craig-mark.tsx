import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * The Craig mark.
 *
 * Stroked, not filled, and drawn in `currentColor` rather than the original
 * hardcoded charcoal — so it inherits from whatever it sits in and survives the
 * dark-mode flip without a second asset.
 *
 * ONE stroke weight at every size. An earlier version scaled it per size to
 * keep small renders legible, which worked but redrew the mark heavier as it
 * shrank — so it read as a slightly different logo depending on where it
 * appeared. Consistency wins: 9 was picked by rendering the mark from 16px to
 * 80px at several weights — heavy enough to hold at 20px, light enough to keep
 * the drawing's character at 80px.
 *
 * The trade is a floor, not a weight change: below ~20px the drawing has more
 * detail than there are pixels to carry it, whatever the stroke. Use the
 * wordmark alone under that.
 */

/** The mark's stroke weight, in its own 256-unit space. Don't vary it. */
export const MARK_STROKE = 9;
/** Below this the detail collapses regardless of weight — use the wordmark. */
export const MARK_MIN_SIZE = 20;

export function CraigMark({
  className,
  strokeWidth = MARK_STROKE,
  title,
  ...props
}: React.SVGProps<SVGSVGElement> & { strokeWidth?: number; title?: string }) {
  return (
    <svg
      viewBox="0 0 256 256"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      className={cn("shrink-0", className)}
      {...props}
    >
      {title && <title>{title}</title>}

      {/* hair */}
      <path d="M 68 80 C 50 65 44 40 48 38 C 65 52 85 55 120 38 C 165 20 200 48 198 92" />
      {/* jaw */}
      <path d="M 72 120 C 62 170 65 215 115 215 C 160 215 178.029 177.883 179.816 153.242" />
      {/* ear */}
      <path d="M 183 120 C 205 120 205 152 180 152" />
      {/* brows */}
      <path d="M 75 92 C 82 85 90 85 95 93" />
      <path d="M 125 87 C 142 84 152 92 158 106" />
      {/* nose */}
      <path d="M 101.192 125.294 L 85.951 150.294 L 121.974 156.294" />
      {/* mouth */}
      <path d="M 100 184 C 115 184 130 175 145 158" />

      {/* eyes — filled, so they stay solid as the stroke weight changes */}
      <ellipse
        cx="86"
        cy="120"
        rx="3.5"
        ry="8"
        fill="currentColor"
        stroke="none"
        transform="matrix(0.996195, -0.087156, 0.087156, 0.996195, -4.131134, 4.952379)"
      />
      <ellipse
        cx="140"
        cy="118"
        rx="3.5"
        ry="8"
        fill="currentColor"
        stroke="none"
        transform="rotate(5 140 118)"
      />
    </svg>
  );
}

/** Mark plus wordmark, the lockup used in the header and on auth screens. */
export function CraigLockup({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      <CraigMark className={cn("size-5", markClassName)} />
      <span className="font-semibold tracking-[-0.01em]">Craig.</span>
    </span>
  );
}
