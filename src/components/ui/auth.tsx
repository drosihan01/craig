"use client";

import * as React from "react";
import { Visibility, VisibilityOff } from "./icons";
import { cn } from "@/lib/cn";

/**
 * Sign-in surfaces. Two methods for now — email + password, and Google.
 *
 * Deliberately dumb: these render and validate shape, nothing else. No token
 * handling, no session, no redirect. Auth belongs on the server; a component
 * that "signs you in" in the browser is a component that lies.
 */

/* --- Shell ----------------------------------------------------------------- */

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-2 text-center">
          <span className="text-xl font-semibold tracking-[-0.02em]">
            Craig.
          </span>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">{title}</h1>
          {subtitle && (
            <p className="text-base text-text-muted">{subtitle}</p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-e2">
          {children}
        </div>

        {footer && (
          <p className="pt-5 text-center text-sm text-text-muted">{footer}</p>
        )}
      </div>
    </main>
  );
}

/* --- Google ---------------------------------------------------------------- */

/**
 * The Google mark, inline. Google's branding guidelines require the official
 * four-colour "G" at full colour on a white or light surface — it must not be
 * recoloured to match a theme, so it keeps its own colours in dark mode and
 * sits on a light chip to stay legible.
 */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" className={className} aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function GoogleButton({
  onClick,
  loading,
  label = "Continue with Google",
  className,
}: {
  onClick?: () => void;
  loading?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(
        "flex h-9 w-full items-center justify-center gap-2.5 rounded-md border border-border bg-surface px-3 text-base font-medium text-text shadow-e1",
        "transition-[background-color,border-color] hover:border-border-strong hover:bg-surface-hover",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      <span className="flex size-4.5 items-center justify-center rounded-sm bg-white">
        <GoogleMark className="size-3.5" />
      </span>
      {label}
    </button>
  );
}

/* --- Divider --------------------------------------------------------------- */

export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-4" role="separator">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs text-text-subtle">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/* --- Password -------------------------------------------------------------- */

export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function PasswordInput({ className, ...props }, ref) {
  const [shown, setShown] = React.useState(false);

  return (
    <div className="relative">
      <input
        ref={ref}
        type={shown ? "text" : "password"}
        className={cn(
          "h-8 w-full rounded-md border border-border bg-surface pl-2.5 pr-9 text-base text-text shadow-e1",
          "placeholder:text-text-subtle transition-[border-color,box-shadow]",
          "hover:border-border-strong",
          "focus:border-accent-ring focus:outline-none focus:ring-[3px] focus:ring-accent-ring/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20",
          className,
        )}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="absolute right-1 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-text-subtle transition-colors hover:text-text"
      >
        {shown ? (
          <VisibilityOff className="size-4" />
        ) : (
          <Visibility className="size-4" />
        )}
      </button>
    </div>
  );
});
