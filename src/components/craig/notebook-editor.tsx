"use client";

import * as React from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { cn } from "@/lib/cn";

/**
 * The notebook, edited the way a page is edited rather than the way a file is.
 *
 * This replaced a `<textarea>` of raw markdown, which stored the right thing
 * and asked the wrong thing of the reader: an admin writing down how leave
 * works should not be typing `##` and counting hyphens. Type `## ` and it
 * becomes a heading; the markup does its job and gets out of the way.
 *
 * ## Markdown stays the storage format
 *
 * The editor is a view, not the record. What is saved is still markdown,
 * because the most important reader of this document is **Craig**, and
 * markdown is what a language model reads best — headings become structure it
 * can navigate, and nothing is lost to a serialisation format designed for a
 * browser. Storing the editor's own JSON would mean converting on the way to
 * every prompt, and a conversion in that position is a thing that quietly
 * degrades the answers.
 *
 * So `tiptap-markdown` sits underneath: markdown in on load, markdown out on
 * change. The database column is unchanged and a document written in the old
 * textarea opens correctly here.
 *
 * ## Why a library rather than `contenteditable`
 *
 * Hand-rolled `contenteditable` is the classic way to end up with an editor
 * that is subtly wrong — selection that jumps on undo, paste that carries a
 * spreadsheet's HTML in with it, a caret that lands between two blocks with
 * nowhere to be. Those are not things a first version gets right, and each one
 * is discovered by somebody losing a paragraph. This is a solved problem and
 * the solution is a dependency.
 *
 * ## Nothing here formats to impress
 *
 * Headings, lists, bold, italic, quotes, code. No tables, no images, no
 * columns — the notebook is prose that Craig reads aloud to a new starter, and
 * a layout he cannot describe is a layout that does not survive the trip.
 */

/**
 * `tiptap-markdown` ships no type declarations, so its storage is invisible to
 * TypeScript. Contained in one place rather than cast at each call site: if the
 * package ever gains types, or renames this, exactly one line has to change and
 * the compiler will point at it.
 */
type MarkdownStorage = { markdown: { getMarkdown: () => string } };

const markdownOf = (editor: Editor): string =>
  (editor.storage as unknown as MarkdownStorage).markdown.getMarkdown();

export function NotebookEditor({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (markdown: string) => void;
  className?: string;
}) {
  /* The latest `onChange`, without rebuilding the editor to get it — an editor
     recreated on every keystroke loses the caret mid-sentence.
     
     Written in an effect rather than during render, because `react-hooks`
     refuses a ref write in the render pass and is right to: a render that
     mutates something outside itself is a render that cannot be discarded, and
     React discards renders. */
  const emit = React.useRef(onChange);
  React.useEffect(() => {
    emit.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        /* Off because the notebook has no use for them and each one is a way
           to produce a document Craig has to describe rather than read. */
        horizontalRule: false,
        codeBlock: false,
      }),
      Markdown.configure({
        /* What comes out on every change, and what the server stores. */
        html: false,
        /* `-` rather than `*`, because a human eventually edits this in a
           text box somewhere and hyphens are what people type. */
        bulletListMarker: "-",
        linkify: true,
        breaks: false,
      }),
    ],
    content: value,
    /* Next renders this on the server first; without it React complains that
       the editor's DOM does not match, and the fix is to admit it is a client
       thing rather than to silence the warning. */
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "notebook-prose focus:outline-none",
        "aria-label": "Notebook",
      },
    },
    onUpdate: ({ editor }) => {
      emit.current(markdownOf(editor));
    },
  });

  /**
   * Take an outside change without fighting the person typing.
   *
   * Only when the incoming markdown differs from what the editor already
   * holds — otherwise every keystroke would round-trip through here and reset
   * the caret to the top of the document. That guard is the whole reason this
   * effect is safe to have at all.
   */
  React.useEffect(() => {
    if (!editor) return;
    const current = markdownOf(editor);
    if (current === value) return;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  return (
    <div
      className={cn(
        "min-h-[24rem] rounded-md border border-border bg-surface px-4 py-3",
        "focus-within:border-border-strong",
        className,
      )}
      /* Clicking the padding should put the caret in the document, the way it
         does in every editor people already use. */
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) editor?.commands.focus("end");
      }}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
