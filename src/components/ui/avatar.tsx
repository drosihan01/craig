import * as React from "react";
import { cn } from "@/lib/cn";

/* Initials sit at roughly 40% of the diameter. The type scale doesn't go small
   enough for the two smallest — 11px inside a 20px circle leaves two letters
   almost touching the edge — so those are set in px. leading-none and the tight
   tracking stop a two-letter pair from bowing the circle out. */
const sizes = {
  xs: "size-5 text-[9px] tracking-tight",
  sm: "size-6 text-[10px] tracking-tight",
  md: "size-8 text-xs",
  lg: "size-10 text-md",
} as const;

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-accent-subtle font-semibold leading-none text-accent-subtle-fg",
        sizes[size],
        className,
      )}
      title={name}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 4,
  size = "sm",
}: {
  people: { name: string; src?: string }[];
  max?: number;
  size?: keyof typeof sizes;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;

  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((p) => (
        <Avatar
          key={p.name}
          {...p}
          size={size}
          className="ring-2 ring-surface"
        />
      ))}
      {rest > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-surface-sunken font-semibold leading-none text-text-muted ring-2 ring-surface",
            sizes[size],
          )}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}
