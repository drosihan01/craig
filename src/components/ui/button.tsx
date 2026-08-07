"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

const button = cva(
  [
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap",
    "rounded-md font-medium select-none",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out-quart",
    "active:scale-[0.98]",
    "disabled:pointer-events-none disabled:opacity-45",
    "[&_svg]:shrink-0 [&_svg]:size-4",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-fg shadow-e1 hover:bg-accent-hover active:bg-accent-active",
        secondary:
          "bg-surface text-text border border-border shadow-e1 hover:bg-surface-hover hover:border-border-strong",
        subtle:
          "bg-accent-subtle text-accent-subtle-fg hover:brightness-[0.97] dark:hover:brightness-125",
        ghost: "text-text-muted hover:bg-surface-hover hover:text-text",
        danger:
          "bg-danger text-white shadow-e1 hover:brightness-110 active:brightness-95",
        link: "text-accent underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        sm: "h-7 px-2.5 text-xs",
        md: "h-8 px-3 text-base",
        lg: "h-10 px-4 text-md",
        icon: "size-8 p-0",
        "icon-sm": "size-7 p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant, size, loading, disabled, children, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={cn(button({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" aria-hidden />}
        {children}
      </button>
    );
  },
);

export { button as buttonVariants };
