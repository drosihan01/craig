import * as React from "react";
import Link from "next/link";
import { ArrowBack } from "./icons";
import { cn } from "@/lib/cn";

/**
 * Return path out of a page that isn't reachable from the nav. Sits above the
 * page title in the content column rather than in the header — the header
 * belongs to the app, this belongs to the page you're on.
 *
 * Uses next/link so it's a client transition rather than a document load. That
 * ties this one component to Next; everything else in the system is
 * framework-agnostic, and if that ever matters, take an `as` prop.
 */
export function BackLink({
  href,
  onNavigate,
  children,
  className,
}: {
  href: string;
  /**
   * A chance to stop the navigation before it happens, for a page with a
   * question to ask on the way out.
   *
   * Still a link, and that is the point of using Next's `onNavigate` rather
   * than an `onClick` that calls `preventDefault` on everything it sees. This
   * one only fires for a same-origin client transition, so a cmd-click that
   * opens Workflows in a *new* tab doesn't trip it — the page you're on isn't
   * going anywhere, and popping "are you sure you want to leave" over a
   * departure that was never happening is a worse bug than the one this exists
   * to prevent. The href stays real for the same reason: middle-click, "open
   * in new tab" and the status bar all keep working, and the ask is confined to
   * the one gesture that actually loses the page.
   *
   * Typed off `Link` rather than spelled out, so the handler's shape can't
   * drift from the one Next is going to call.
   */
  onNavigate?: React.ComponentProps<typeof Link>["onNavigate"];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      onNavigate={onNavigate}
      className={cn(
        "group inline-flex w-fit items-center gap-1.5 rounded-sm text-sm text-text-muted transition-colors hover:text-text",
        className,
      )}
    >
      <ArrowBack className="size-4 transition-transform duration-150 ease-out-quart group-hover:-translate-x-0.5" />
      {children}
    </Link>
  );
}
