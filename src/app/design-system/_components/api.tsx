import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Props reference. Deliberately hand-written rather than generated from the
 * types: the useful half of a prop's documentation is *when* to reach for it,
 * and a type extractor can't tell you that.
 */

export interface PropDoc {
  name: string;
  type: string;
  default?: string;
  required?: boolean;
  description: React.ReactNode;
}

export function Api({
  component,
  props,
  note,
}: {
  component: string;
  props: PropDoc[];
  note?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h3 className="font-mono text-sm font-medium text-text">{component}</h3>
        {note && <p className="text-xs text-text-subtle">{note}</p>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[42rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              {["Prop", "Type", "Default", ""].map((h, i) => (
                <th
                  key={h || i}
                  scope="col"
                  className={cn(
                    "px-3 py-2 text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle",
                    i === 3 && "w-1/2",
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {props.map((p) => (
              <tr key={p.name} className="align-top">
                <td className="whitespace-nowrap px-3 py-2">
                  <code className="font-mono text-xs font-medium text-text">
                    {p.name}
                  </code>
                  {p.required && (
                    <span
                      className="ml-1 text-danger"
                      title="Required"
                      aria-label="required"
                    >
                      *
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <code className="font-mono text-xs leading-relaxed text-accent">
                    {p.type}
                  </code>
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <code className="font-mono text-xs text-text-subtle">
                    {p.default ?? "—"}
                  </code>
                </td>
                <td className="px-3 py-2 text-sm leading-relaxed text-text-muted">
                  {p.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Import line for a component, so the docs are copy-pasteable. */
export function Usage({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-surface-sunken px-3 py-2.5">
      <code className="font-mono text-xs leading-relaxed text-text-muted">
        {children}
      </code>
    </pre>
  );
}
