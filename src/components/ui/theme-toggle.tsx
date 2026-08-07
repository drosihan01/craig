"use client";

import * as React from "react";
import {
  DarkMode,
  LightMode,
} from "./icons";
import { cn } from "@/lib/cn";

/** Inlined in <head> so the theme is applied before first paint. */
export const themeScript = `(function(){try{var t=localStorage.getItem("craig-theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

/* The theme lives on <html>, not in React — so it's read as an external store
   rather than mirrored into state. The server snapshot is `false` to match the
   pre-hydration markup; the inline script above has already set the real class
   by then, and the first client snapshot picks it up. */
const themeListeners = new Set<() => void>();

function subscribeTheme(cb: () => void) {
  themeListeners.add(cb);
  return () => {
    themeListeners.delete(cb);
  };
}

export function ThemeToggle({ className }: { className?: string }) {
  const dark = React.useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("craig-theme", next ? "dark" : "light");
    } catch {}
    themeListeners.forEach((l) => l());
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-hover hover:text-text",
        className,
      )}
    >
      {dark ? <DarkMode className="size-4" /> : <LightMode className="size-4" />}
    </button>
  );
}
