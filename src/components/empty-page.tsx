"use client";

import * as React from "react";
import { Button, CraigMark } from "@/components/ui";

/**
 * The template for a page that exists but has nothing in it yet.
 *
 * Craig says it plainly rather than the page rendering an empty frame with a
 * heading and nothing underneath. A screen that looks broken and a screen
 * that's genuinely empty should not look the same.
 *
 * He offers to help but doesn't pretend he can do the thing — the action is
 * the honest next step for that page, or nothing.
 */
export function EmptyPage({
  say,
  detail,
  action,
}: {
  /** In Craig's voice, first person. */
  say: string;
  detail?: string;
  action?: { label: string; onClick?: () => void };
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md flex-col items-center justify-center gap-4 py-16 text-center">
      <CraigMark className="size-12 text-accent" />

      <p className="text-md leading-relaxed text-text">{say}</p>

      {detail && (
        <p className="text-base leading-relaxed text-text-muted">{detail}</p>
      )}

      {action && (
        <Button size="sm" variant="secondary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
