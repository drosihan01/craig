"use client";

import * as React from "react";
import { Dialog } from "./dialog";
import { SearchInput } from "./filters";
import {
  ALL_PRESETS,
  BLOCK_LIBRARY,
  type BlockPreset,
} from "@/lib/workflow/library";
import { cn } from "@/lib/cn";

/**
 * Picking a block.
 *
 * A dropdown was fine at seven abstract kinds. With a real library — thirty-odd
 * named blocks across seven categories, each needing a sentence to tell "Slack"
 * from "Google Workspace" — a menu becomes a column you scroll blind. So it's a
 * dialog with a search box.
 *
 * Search is first and focused, because past the second workflow an admin knows
 * the name of the block they want and shouldn't have to find it in a grid.
 * The categories are for the first workflow, when they don't.
 */

export function BlockPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (preset: BlockPreset) => void;
}) {
  const [query, setQuery] = React.useState("");

  /* Cleared on the way out rather than on the way in, so reopening never
     inherits the last search and no effect has to watch `open`. */
  function close() {
    setQuery("");
    onClose();
  }

  const q = query.trim().toLowerCase();
  const matches = (p: BlockPreset) =>
    !q || `${p.label} ${p.description}`.toLowerCase().includes(q);

  const groups = BLOCK_LIBRARY.map((c) => ({
    ...c,
    presets: c.presets.filter(matches),
  })).filter((c) => c.presets.length > 0);

  function pick(preset: BlockPreset) {
    onPick(preset);
    close();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      size="xl"
      title="Add a step"
      description="Named blocks, not raw building blocks. Each one says how much it needs set up before it can run."
    >
      {/* Search stays put while the library scrolls under it — with fifteen
          blocks, a search box that scrolls away is a search box you can't use
          once you've started looking. */}
      <div className="shrink-0 border-b border-border px-6 py-3.5">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search blocks"
        />
      </div>

      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-6 py-6">
        {groups.length === 0 ? (
          <p className="py-10 text-center text-base text-text-subtle">
            Nothing matches “{query}”. {ALL_PRESETS.length} blocks in the
            library.
          </p>
        ) : (
          groups.map((c) => (
            <section key={c.id} className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <h3 className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
                  {c.label}
                </h3>
                {!q && (
                  <p className="text-xs text-text-subtle">{c.description}</p>
                )}
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                {c.presets.map((p) => (
                  <PresetCard key={p.id} preset={p} onPick={() => pick(p)} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </Dialog>
  );
}

function PresetCard({
  preset: p,
  onPick,
}: {
  preset: BlockPreset;
  onPick: () => void;
}) {
  const required = p.setup.filter((f) => f.required).length;
  const off = Boolean(p.unavailable);

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={off}
      /* Disabled rather than hidden. The library is the product's claim about
         what onboarding is made of, and a shorter list is a smaller claim —
         "not yet" is honest, quietly missing looks like an oversight. */
      className={cn(
        "group flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5 text-left",
        "transition-[border-color,box-shadow] duration-150 ease-out-quart",
        off
          ? "cursor-not-allowed opacity-50"
          : "hover:border-accent hover:shadow-e2",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          off
            ? "bg-surface-sunken text-text-subtle"
            : "bg-accent-subtle text-accent-subtle-fg",
        )}
      >
        <p.icon className="size-4.5" />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-base font-medium">{p.label}</span>
          {off ? (
            <span className="shrink-0 rounded-sm border border-dashed border-border-strong px-1 py-px text-2xs text-text-subtle">
              Soon
            </span>
          ) : (
            /* Says up front how much setup this one needs, so nobody adds it
               expecting it to be finished. */
            required > 0 && (
              <span className="shrink-0 rounded-sm bg-surface-sunken px-1 py-px text-2xs tabular-nums text-text-subtle">
                {required} to set up
              </span>
            )
          )}
        </span>
        <span className="text-xs leading-relaxed text-text-subtle">
          {p.unavailable ?? p.description}
        </span>
      </span>
    </button>
  );
}
