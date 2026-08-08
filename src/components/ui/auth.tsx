"use client";

import * as React from "react";
import { CraigLockup, CraigMark } from "./craig-mark";
import { ThemeToggle } from "./theme-toggle";
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
          <CraigMark className="size-11 text-accent" />
          <span className="text-xl font-semibold tracking-[-0.02em]">
            Craig.
          </span>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">{title}</h1>
          {subtitle && <p className="text-base text-text-muted">{subtitle}</p>}
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

/**
 * The two-panel auth layout.
 *
 * Was copy-pasted across sign-in, sign-up and the demo's own signup, and had
 * already drifted three ways — one column sized at 46%, another at 32rem, and
 * the form left-aligned on a phone where there is nothing to align to.
 *
 * Three decisions worth keeping:
 *
 * The form column is sized to the form, not to a fraction of the window. A
 * four-field form stranded in the middle of a 700px column reads as an
 * afterthought; sized to its content it reads as the thing you came for.
 *
 * The right panel carries the same dot grid as the workflow canvas. It is the
 * product's own texture, and using it here means the first screen already
 * looks like the thing you are signing in to rather than like a login page
 * bolted on the front.
 *
 * Below `lg` the right panel goes entirely — it would be something to scroll
 * past — and the form centres, because with the second column gone there is
 * nothing left for it to align against.
 */
export function AuthSplit({
  aside,
  children,
}: {
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[32rem_1fr]">
      <div className="flex flex-col justify-between px-6 py-8 sm:px-10 lg:px-14">
        <div className="flex items-center justify-between gap-3">
          <CraigLockup />
          <ThemeToggle />
        </div>

        {/* mx-auto centres it once the panel is the whole window; lg:mx-0
            hands it back to the column's own padding on a wide screen. */}
        <div className="mx-auto w-full max-w-md py-12 lg:mx-0">{children}</div>

        <span aria-hidden />
      </div>

      {aside !== null && (
        <div
          className="hidden items-center justify-center border-l border-border bg-canvas px-14 lg:flex"
          style={{
            /* Same values as WorkflowCanvas: border-strong rather than border,
               because at 56px apart the lighter value reads as a smudge. */
            backgroundImage:
              "radial-gradient(circle, var(--color-border-strong) 1.25px, transparent 1.25px)",
            backgroundSize: "56px 56px",
          }}
        >
          {aside ?? <AuthMarketing />}
        </div>
      )}
    </main>
  );
}

/**
 * Marketing lines for the auth panel.
 *
 * A bank rather than one line, because this is the only screen in the product
 * that gets to make a claim rather than show a state, and one claim seen every
 * time stops being read after the second visit.
 *
 * They rotate. Each says something Craig actually does — every line here maps
 * to a real behaviour somewhere in the product, which is the only rule: a
 * marketing line the product can't back is a promise the first screen makes
 * and the second breaks.
 */
export const MARKETING_LINES: { headline: string; sub: string }[] = [
  {
    headline: "Onboard at the speed of Craig.",
    sub: "He starts the moment somebody has a seat, not the moment you remember.",
  },
  {
    headline: "The boring half of starting somewhere new, handled.",
    sub: "Contracts, accounts, access, the checks with two-week lead times.",
  },
  {
    headline: "Nobody's first day should depend on somebody's memory.",
    sub: "Craig writes down the parts that only ever lived in your head.",
  },
  {
    headline: "Your handbook is out of date.",
    sub: "He'll read it anyway, and tell you which bits stopped being true.",
  },
  {
    headline: "He chases people so you don't have to.",
    sub: "Including the ones who owe you a decision.",
  },
  {
    headline: "Ask once.",
    sub: "He remembers it for every hire after this one.",
  },
  {
    headline: "Day one, without the Slack thread.",
    sub: "Everything they need, in the order they need it.",
  },
  {
    headline: "The bit nobody owns, owned.",
    sub: "Onboarding is somebody's job at a hundred people. Before that, it's Craig's.",
  },
];

/**
 * Which line this page load gets.
 *
 * No timer. Copy that changes while you're reading it is worse than copy you
 * see twice, and the panel isn't a carousel — it's the one claim the product
 * makes. A refresh picks a new one, which is the only moment anybody is
 * looking at this screen fresh anyway.
 *
 * `useSyncExternalStore` rather than an effect, because the server has no way
 * to know which line the client will land on: it renders the first one and the
 * client swaps once on hydration. Calling `Math.random()` during render would
 * be a mismatch on every single load.
 */
let clientPick: number | null = null;

const subscribeToNothing = () => () => {};

function pickOnce() {
  if (clientPick === null) {
    clientPick = Math.floor(Math.random() * MARKETING_LINES.length);
  }
  return clientPick;
}

export function AuthMarketing() {
  const index = React.useSyncExternalStore(
    subscribeToNothing,
    pickOnce,
    () => 0,
  );
  const line = MARKETING_LINES[index];

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h2 className="text-4xl font-semibold leading-[1.1] tracking-[-0.03em]">
        {line.headline}
      </h2>
      <p className="text-xl leading-relaxed text-text-muted">{line.sub}</p>
    </div>
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
    <svg
      viewBox="0 0 18 18"
      className={className}
      aria-hidden
      focusable="false"
    >
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
  disabled,
  label = "Continue with Google",
  className,
}: {
  onClick?: () => void;
  loading?: boolean;
  /** For "this route exists but isn't wired up here". Say why next to it — a
      control that's off for no visible reason reads as a bug. */
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
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

/* --- Returning user -------------------------------------------------------- */

/**
 * "Continue as …" for someone who has signed in on this device before.
 *
 * This is a *hint*, not a session — it says who was here last, nothing more.
 * The identity shown comes from a client-side record and must never be trusted
 * as proof of anything; clicking it starts a real sign-in for that account.
 * Show it only when the previous session is genuinely resumable, and always
 * leave a way to use a different account.
 */
export interface LastAccount {
  name: string;
  email: string;
  /** Where they came in from last time, if that's known. */
  method?: "google" | "password";
}

export function ContinueAs({
  account,
  onContinue,
  onUseAnother,
  loading,
  className,
}: {
  account: LastAccount;
  onContinue?: () => void;
  onUseAnother?: () => void;
  loading?: boolean;
  className?: string;
}) {
  const initials = account.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <button
        type="button"
        onClick={onContinue}
        disabled={loading}
        className={cn(
          "group flex w-full items-center gap-3 rounded-lg border border-border bg-surface p-2.5 text-left shadow-e1",
          "transition-[border-color,box-shadow] hover:border-accent hover:shadow-e2",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-sm font-semibold text-accent-subtle-fg">
          {initials}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-base font-medium text-text">
            Continue as {account.name.split(" ")[0]}
          </span>
          <span className="truncate text-sm text-text-subtle">
            {account.email}
          </span>
        </span>
        {account.method === "google" && (
          <span className="flex size-4.5 shrink-0 items-center justify-center rounded-sm bg-white">
            <GoogleMark className="size-3.5" />
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={onUseAnother}
        className="self-center text-sm text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline"
      >
        Use a different account
      </button>
    </div>
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
