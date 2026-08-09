import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/types";

/**
 * Workflows, server-side at last.
 *
 * They were the last thing living only in the browser, and the bill for that
 * arrived the first time somebody signed in from a second machine: the account
 * was in Postgres, the workflows were in the other browser's `localStorage`,
 * and Craig — finding nothing — concluded they had never built anything and
 * started onboarding them from scratch. Same person, same account, different
 * laptop.
 *
 * What has *not* changed is where a workflow is authored. The browser still
 * owns the editing session: it mints the id, applies every block edit locally,
 * and renders from its own copy. This file is the durable copy that arrives a
 * moment later. That ordering is deliberate and it is the same argument the old
 * `localStorage` comment made — a network round trip in front of Craig
 * recording a fact mid-sentence is the one latency this product cannot afford.
 *
 * Deliberately not typed against `ShowcaseWorkflow`. That interface lives in
 * `store.ts`, which is `"use client"`, and importing a client module into a
 * server one to borrow a shape is how a `localStorage` reference eventually
 * ends up in a route handler. The two are structurally identical and the
 * contract between them is this file's return type.
 */

type WorkflowRow = Tables<"workflows">;

/** What leaves this file. Field-for-field what the client store holds. */
export interface StoredWorkflow {
  id: string;
  name: string;
  blocks: unknown[];
  draftedBy?: string;
  createdAt: string;
  published?: boolean;
  revealedAt?: string;
}

const db = () => supabaseAdmin();
const normalise = (email: string) => email.trim().toLowerCase();

function toWorkflow(row: WorkflowRow): StoredWorkflow {
  return {
    id: row.id,
    name: row.name,
    blocks: Array.isArray(row.blocks) ? (row.blocks as unknown[]) : [],
    draftedBy: row.drafted_by ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
    published: row.published,
    revealedAt: row.revealed_at
      ? new Date(row.revealed_at).toISOString()
      : undefined,
  };
}

/** The account's row id, or null because there isn't one. */
async function accountIdFor(email: string): Promise<string | null> {
  const { data, error } = await db()
    .from("accounts")
    .select("id")
    .eq("email", normalise(email))
    .maybeSingle();
  if (error) throw new Error(`Looking up the account failed: ${error.message}`);
  return data?.id ?? null;
}

export async function listWorkflows(
  accountEmail: string,
): Promise<StoredWorkflow[]> {
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) return [];

  const { data, error } = await db()
    .from("workflows")
    .select()
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Listing workflows failed: ${error.message}`);
  return data.map(toWorkflow);
}

/**
 * Write a batch, replacing each row whole.
 *
 * Whole-document rather than a patch, because the browser is the author: it
 * holds the workflow it just edited and there is nothing this file could
 * usefully merge into that. A partial write would mean two writers with
 * different ideas of what a workflow currently is, which is the situation the
 * joiner store needs a compare-and-swap to survive — and a workflow, unlike a
 * joiner's steps, has exactly one writer at a time.
 *
 * Silent about workflows belonging to nobody: an account that has been deleted
 * mid-session takes its workflows with it by cascade, and a sync that threw
 * here would turn "your account was reset in another tab" into a crash on the
 * screen you were typing in.
 */
export async function saveWorkflows(
  accountEmail: string,
  workflows: StoredWorkflow[],
): Promise<void> {
  if (workflows.length === 0) return;
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) return;

  const { error } = await db()
    .from("workflows")
    .upsert(
      workflows.map((w) => ({
        id: w.id,
        account_id: accountId,
        name: w.name,
        blocks: w.blocks as unknown as Json,
        published: w.published ?? false,
        drafted_by: w.draftedBy ?? null,
        revealed_at: w.revealedAt ?? null,
        /* The browser's timestamp, not the database's. A workflow is created
           the moment Craig drafts it, which is before this row exists — and
           letting the column default to `now()` on every upsert would restamp
           it on each edit, so the list would reorder itself as you typed. The
           client holds the true value and resends it, which makes writing it
           here idempotent. */
        created_at: w.createdAt,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "id" },
    );
  if (error) throw new Error(`Saving workflows failed: ${error.message}`);
}

/**
 * Forget workflows this account has deleted.
 *
 * Scoped to the account as well as the id, so a caller holding somebody else's
 * workflow id deletes nothing rather than deleting theirs. The id is a UUID
 * minted in a browser, which makes guessing one impractical rather than
 * impossible — and "impractical" is not the standard a delete should be held
 * to.
 */
export async function removeWorkflows(
  accountEmail: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) return;

  const { error } = await db()
    .from("workflows")
    .delete()
    .eq("account_id", accountId)
    .in("id", ids);
  if (error) throw new Error(`Removing workflows failed: ${error.message}`);
}
