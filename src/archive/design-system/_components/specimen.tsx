import * as React from "react";
import { cn } from "@/lib/cn";

export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-b border-border py-10 last:border-b-0">
      <header className="mb-6 flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-[-0.02em]">{title}</h2>
        {description && (
          <p className="max-w-2xl text-md text-text-muted">{description}</p>
        )}
      </header>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}

/** A labelled frame around one specimen. */
export function Demo({
  title,
  note,
  children,
  className,
}: {
  title?: string;
  note?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {(title || note) && (
        <div className="flex items-baseline gap-2">
          {title && (
            <h3 className="text-sm font-medium text-text">{title}</h3>
          )}
          {note && <p className="text-xs text-text-subtle">{note}</p>}
        </div>
      )}
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-5",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function Swatch({
  name,
  varName,
  className,
  dark,
}: {
  name: string;
  varName: string;
  className: string;
  dark?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div
        className={cn(
          "h-12 rounded-md border border-border/60",
          className,
        )}
      />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-xs font-medium text-text">{name}</span>
        <span className="truncate font-mono text-2xs text-text-subtle">
          {varName}
        </span>
      </div>
      {dark && <span className="sr-only">inverts in dark mode</span>}
    </div>
  );
}
