"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * The notebook, edited as the markdown it actually is.
 *
 * This replaced a TipTap rich-text editor, which was the right idea for a page
 * somebody writes a paragraph in and the wrong one for this. The reason is
 * what the editor did on the way *out*.
 *
 * ## Why the rich editor had to go
 *
 * Markdown is the storage format, because the most important reader of this
 * document is Craig and markdown is what a model reads best — headings become
 * structure it can navigate. TipTap does not store markdown; it parses it into
 * a document model and **re-serialises the whole thing on every keystroke**.
 *
 * On a short note nobody notices. On a real handbook — six thousand words,
 * sixty headings — it means correcting one typo rewrites all of it: heading
 * styles normalised, list markers swapped, long lines rewrapped, characters
 * escaped that did not need escaping. The diff is the entire document, and
 * whatever survived that round trip is what Craig reads from then on. An
 * editor that silently rewrites the file it opened is a bad trade for the
 * convenience of not typing `##`.
 *
 * A textarea has none of that. What is loaded is what is saved, byte for byte,
 * unless a person changed it. For a document whose whole job is to be the one
 * thing Craig can be trusted to quote from, that property is worth more than
 * live formatting.
 *
 * It is also honest about what this is. The notebook is a file, the person
 * editing it is the one admin on the account, and markdown is a format people
 * already write in every chat window they use.
 */
export function NotebookEditor({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (markdown: string) => void;
  className?: string;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  /**
   * Tab indents rather than leaving the field.
   *
   * Markdown uses indentation for nested lists, and a document full of them is
   * one this is used to write. Losing focus mid-list is the kind of small
   * wrongness that makes somebody edit the file somewhere else instead.
   *
   * Shift-Tab is left alone so the field can still be escaped by keyboard.
   */
  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Tab" || event.shiftKey) return;
    event.preventDefault();

    const field = event.currentTarget;
    const { selectionStart: start, selectionEnd: end } = field;
    const next = `${value.slice(0, start)}  ${value.slice(end)}`;
    onChange(next);

    /* After React has written the new value, or the caret jumps to the end. */
    requestAnimationFrame(() => {
      field.selectionStart = field.selectionEnd = start + 2;
    });
  }

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      spellCheck
      aria-label="Notebook"
      className={cn(
        "min-h-[36rem] w-full rounded-md border border-border bg-surface px-4 py-3",
        /* Monospace, because the alignment is information: a person scanning
           for `##` is reading structure, and a proportional face hides it. */
        "font-mono text-sm leading-relaxed",
        "focus:border-border-strong focus:outline-none",
        /* Off, because a textarea that grows on drag inside a column layout
           is a way to end up with a field wider than the page. */
        "resize-y",
        className,
      )}
    />
  );
}
