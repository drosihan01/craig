"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Cancel, CheckCircle, Close, Info, Warning } from "./icons";
import { cn } from "@/lib/cn";

/**
 * Transient feedback for something the user just did. Not for anything they
 * need to act on later — that's a notification, which persists. If a toast
 * carries information the user would be annoyed to lose, it's the wrong
 * component.
 *
 * Auto-dismiss pauses while the pointer is over the stack or focus is inside
 * it, so a toast can't vanish mid-read or mid-click of its own action.
 */

export type ToastTone = "neutral" | "success" | "warning" | "danger";

export interface ToastOptions {
  title: React.ReactNode;
  description?: React.ReactNode;
  tone?: ToastTone;
  /** ms. Pass 0 to require an explicit dismiss. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastRecord extends ToastOptions {
  id: string;
}

const TONE_ICON = {
  neutral: Info,
  success: CheckCircle,
  warning: Warning,
  danger: Cancel,
} as const;

const TONE_STYLE: Record<ToastTone, string> = {
  neutral: "text-text-subtle",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

let counter = 0;

export function ToastProvider({
  children,
  max = 4,
}: {
  children: React.ReactNode;
  /** Oldest are dropped past this, so the stack can't cover the screen. */
  max?: number;
}) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (options: ToastOptions) => {
      const id = `toast-${counter++}`;
      setToasts((prev) => [...prev, { ...options, id }].slice(-max));
      return id;
    },
    [max],
  );

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: ToastRecord[];
  onDismiss: (id: string) => void;
}) {
  const [paused, setPaused] = React.useState(false);
  const mounted = useMounted();

  if (!mounted) return null;

  return createPortal(
    <div
      // Not aria-live on the container itself — each toast announces its own
      // politeness, since an error should interrupt and a confirmation shouldn't.
      role="region"
      aria-label="Notifications"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((t) => (
        <ToastCard
          key={t.id}
          toast={t}
          paused={paused}
          onDismiss={() => onDismiss(t.id)}
        />
      ))}
    </div>,
    document.body,
  );
}

function ToastCard({
  toast,
  paused,
  onDismiss,
}: {
  toast: ToastRecord;
  paused: boolean;
  onDismiss: () => void;
}) {
  const tone = toast.tone ?? "neutral";
  const Icon = TONE_ICON[tone];
  const duration = toast.duration ?? 5000;

  // Track remaining time so pausing doesn't restart the countdown. startedAt is
  // seeded in the effect rather than here — reading the clock during render is
  // impure, and the render-time value would be thrown away regardless.
  const remaining = React.useRef(duration);
  const startedAt = React.useRef(0);

  React.useEffect(() => {
    if (duration === 0 || paused) return;
    startedAt.current = Date.now();
    const id = window.setTimeout(onDismiss, remaining.current);
    return () => {
      window.clearTimeout(id);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [duration, paused, onDismiss]);

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      aria-live={tone === "danger" ? "assertive" : "polite"}
      className={cn(
        "pointer-events-auto flex items-start gap-2.5 rounded-lg border border-border bg-surface-raised p-3 shadow-e4",
        "motion-safe:animate-[toast-in_200ms_cubic-bezier(0.32,0.72,0,1)]",
      )}
    >
      <Icon className={cn("mt-px size-4 shrink-0", TONE_STYLE[tone])} />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-base font-medium text-text">{toast.title}</p>
        {toast.description && (
          <p className="text-sm leading-relaxed text-text-muted">
            {toast.description}
          </p>
        )}
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              onDismiss();
            }}
            className="mt-1.5 w-fit text-sm font-semibold text-accent underline-offset-4 hover:underline"
          >
            {toast.action.label}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-m-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-hover hover:text-text"
      >
        <Close className="size-3.5" />
      </button>
    </div>
  );
}

/* Mount detection without setState-in-effect. */
const neverChanges = () => () => {};
function useMounted() {
  return React.useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
}
