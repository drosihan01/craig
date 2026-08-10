import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { accountIdFor } from "./accounts";
import type { Joiner } from "./contract";

/**
 * What Craig knows about a company, as one document he can read back.
 *
 * ## Why this is a text column and not a schema
 *
 * It replaces `facts: { key, value }[]` and `gaps: { what, whyItMatters }`,
 * which were not wrong so much as **tunnelled**: they forced every piece of
 * company knowledge through a shape it mostly does not have. "How we run
 * standups" is a paragraph. "Who to ask about the build" is a sentence with a
 * caveat. Squeezed into a key and a value, the half that mattered is the half
 * that gets dropped, and what reads back is a form somebody half-filled.
 *
 * So: markdown, open, and structure added later only if the lack of it turns
 * out to hurt. Deciding the shape of a company's knowledge before seeing any
 * is how these things end up unused.
 *
 * ## The rule that keeps it free of permissions
 *
 * **Company facts only. Never a person.** A new starter's Craig answers out of
 * this same document, so everything in it has to be safe for a new starter to
 * be told. What somebody earns, who is on probation, whose contract is late —
 * those live in `joiners` and `joiner_steps`, behind a boundary that is already
 * built and already verified against production.
 *
 * That line is what lets one document serve two audiences with no visibility
 * column, no per-section sharing and no page states. It is also the only rule
 * here that the database cannot enforce for itself, which is why Craig never
 * writes to `content` directly — see `notebook_notes`.
 *
 * ## Why Craig proposes rather than writes
 *
 * A notebook that fills quietly with what an AI inferred is precisely how
 * somebody learns not to trust the answers, and the cost of being wrong is a
 * new starter told the wrong thing about parental leave. So he adds to a list
 * of suggestions and a person decides. One gate, doing two jobs: it keeps
 * guesses out, and it keeps out anything a member should not read.
 */

/** Long enough for a real handbook, short enough to hand Craig whole. */
const MAX_CONTENT = 200_000;

/** One suggestion is a sentence or two. Past this it is an essay, not a note. */
const MAX_NOTE = 2_000;

export interface Notebook {
  content: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

export type NoteKind = "gap" | "fact" | "unanswered";

export interface NotebookNote {
  id: string;
  text: string;
  kind: NoteKind;
  createdAt: string;
}

const db = () => supabaseAdmin();

/**
 * The notebook for an account, creating nothing.
 *
 * An account that has never had one reads as empty rather than as missing —
 * there is no meaningful difference to any caller, and a row written on first
 * *read* is a write on a page load.
 */
export async function notebookFor(accountEmail: string): Promise<Notebook> {
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) return { content: "", updatedAt: null, updatedBy: null };

  const { data, error } = await db()
    .from("notebooks")
    .select("content, updated_at, updated_by")
    .eq("account_id", accountId)
    .maybeSingle();

  if (error) throw new Error(`Reading the notebook failed: ${error.message}`);

  return {
    content: data?.content ?? "",
    updatedAt: data?.updated_at ?? null,
    updatedBy: data?.updated_by ?? null,
  };
}

/**
 * The same document, for a new starter's Craig.
 *
 * Takes the `Joiner` rather than an account id, for the reason every joiner
 * read in this codebase does: the account comes off their own record — the one
 * the signed cookie resolved to — so there is no argument a caller could pass
 * that would widen it. `documents.ts` makes the same argument at more length.
 *
 * There is no `visibility` filter and there must never be one, because the
 * rule is upstream: nothing personal is in here in the first place.
 */
export async function notebookForJoiner(joiner: Joiner): Promise<string> {
  const { content } = await notebookFor(joiner.accountEmail);
  return content;
}

/** Save the whole document. The admin's edit is authoritative — no merge. */
export async function saveNotebook(
  accountEmail: string,
  content: string,
): Promise<Notebook> {
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) throw new Error("No account to save a notebook against.");

  const trimmed = content.slice(0, MAX_CONTENT);

  const { data, error } = await db()
    .from("notebooks")
    .upsert(
      {
        account_id: accountId,
        content: trimmed,
        updated_at: new Date().toISOString(),
        updated_by: accountEmail,
      },
      { onConflict: "account_id" },
    )
    .select("content, updated_at, updated_by")
    .single();

  if (error) throw new Error(`Saving the notebook failed: ${error.message}`);

  return {
    content: data.content,
    updatedAt: data.updated_at,
    updatedBy: data.updated_by,
  };
}

/**
 * Something Craig wants to add, waiting for somebody to agree.
 *
 * Never throws, and that is deliberate: every caller is a tool call in the
 * middle of a conversation, and a failed note must not fail the reply. Craig
 * losing a suggestion is a small loss; Craig erroring mid-sentence because a
 * write failed is the conversation.
 */
export async function suggestNote(
  accountEmail: string,
  text: string,
  kind: NoteKind,
): Promise<void> {
  const trimmed = text.trim().slice(0, MAX_NOTE);
  if (!trimmed) return;

  try {
    const accountId = await accountIdFor(accountEmail);
    if (!accountId) return;

    /* Deduplicated on the way in rather than on the way out. Craig re-notices
       the same gap every time somebody mentions it, and a list with the same
       sentence six times is a list nobody reads to the bottom of. */
    const { data: existing } = await db()
      .from("notebook_notes")
      .select("id")
      .eq("account_id", accountId)
      .eq("text", trimmed)
      .is("settled_at", null)
      .maybeSingle();

    if (existing) return;

    await db()
      .from("notebook_notes")
      .insert({ account_id: accountId, text: trimmed, kind });
  } catch (cause) {
    console.error("[notebook] couldn't record a suggestion:", cause);
  }
}

/** What Craig has suggested and nobody has dealt with yet. */
export async function pendingNotes(
  accountEmail: string,
): Promise<NotebookNote[]> {
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) return [];

  const { data, error } = await db()
    .from("notebook_notes")
    .select("id, text, kind, created_at")
    .eq("account_id", accountId)
    .is("settled_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Reading the suggestions failed: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    text: row.text,
    kind: row.kind as NoteKind,
    createdAt: row.created_at,
  }));
}

/**
 * Mark a suggestion dealt with, whether it was used or not.
 *
 * One function for accept and dismiss, because from this table's point of view
 * they are the same event: somebody looked at it and it no longer needs an
 * answer. Whether the words ended up in the document is a fact about the
 * document, and asking this table to track it would be two records of one
 * decision that can disagree.
 *
 * Scoped by account in the same statement, so a note id from somewhere else
 * settles nothing.
 */
export async function settleNote(
  accountEmail: string,
  noteId: string,
): Promise<boolean> {
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) return false;

  const { data, error } = await db()
    .from("notebook_notes")
    .update({ settled_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("account_id", accountId)
    .is("settled_at", null)
    .select("id");

  if (error) throw new Error(`Settling the note failed: ${error.message}`);
  return (data ?? []).length > 0;
}
