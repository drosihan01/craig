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
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
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
