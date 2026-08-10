import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { accountIdFor } from "./accounts";

/**
 * Getting a person out of Craig, completely, when they ask.
 *
 * ## Why this is not `delete from joiners`
 *
 * Postgres already cascades: removing a joiner takes their steps, their
 * contract signings and their threads with them. That is most of the job and
 * it happens for free, which is exactly what makes the rest of it easy to
 * miss.
 *
 * **A cascade cannot reach object storage.** A signed contract lives in the
 * `signed-contracts` bucket with only a `signed_storage_path` column pointing
 * at it, so deleting the row deletes the pointer and leaves the file — a PDF
 * carrying their name, their signature, the address on the contract and the
 * two IP addresses they signed from. It sits there permanently, unreferenced
 * and unfindable, which is the worst of both: still personal data, no longer
 * attached to the person it belongs to, and invisible to anybody auditing what
 * we hold. This has already happened once in this project by hand — thirteen
 * orphans from SQL row deletes — and that was the cheap version, because those
 * were mine.
 *
 * So the order is fixed and the whole module exists to enforce it: **read the
 * paths, remove the objects, then delete the rows.** Never the other way, and
 * never the rows alone.
 *
 * ## Storage first, rows second
 *
 * Doing it in that order means a failure halfway leaves rows pointing at files
 * that are already gone. That is the right way round to fail. The alternative
 * leaves files that nothing points at, and the difference matters when
 * somebody has asked to be deleted: a dangling reference is a bug you can see
 * and fix, an orphaned PDF of somebody's contract is a breach you cannot.
 *
 * ## What this deliberately does not do
 *
 * It does not touch the notebook. The notebook is company facts and never a
 * person — see `notebook.ts` — so there is nothing of theirs in it. If that
 * rule ever breaks, this is one of the places that quietly becomes wrong,
 * which is another reason the rule is worth keeping absolute.
 */

const SIGNED_BUCKET = "signed-contracts";

const db = () => supabaseAdmin();

/** What was removed, so a caller can tell somebody what happened. */
export interface Erasure {
  joiner: string;
  steps: number;
  signings: number;
  threads: number;
  /** Objects removed from storage. The count a cascade would have missed. */
  files: number;
}

/**
 * Remove a joiner and everything of theirs, in the order that leaves nothing.
 *
 * Scoped by account in the same statement as the id, so an id from another
 * account matches nothing rather than being checked separately and then
 * trusted — the pattern the rest of this codebase uses for the same reason.
 */
export async function eraseJoiner(
  accountEmail: string,
  joinerId: string,
): Promise<Erasure | null> {
  const accountId = await accountIdFor(accountEmail);
  if (!accountId) return null;

  const { data: joiner, error: joinerError } = await db()
    .from("joiners")
    .select("id, name")
    .eq("id", joinerId)
    .eq("account_id", accountId)
    .maybeSingle();

  if (joinerError)
    throw new Error(`Finding them failed: ${joinerError.message}`);
  if (!joiner) return null;

  /* Everything that will be cascaded away, counted and — where it points at a
     file — read, while the rows still exist to be read. After the delete this
     information is gone, which is the whole trap. */
  const [{ data: signings }, { data: steps }, { data: threads }] =
    await Promise.all([
      db()
        .from("contract_signings")
        .select("id, signed_storage_path")
        .eq("joiner_id", joinerId)
        .eq("account_id", accountId),
      db().from("joiner_steps").select("id").eq("joiner_id", joinerId),
      db().from("threads").select("id").eq("joiner_id", joinerId),
    ]);

  const paths = (signings ?? [])
    .map((row) => row.signed_storage_path)
    .filter((path): path is string => Boolean(path));

  /* Storage first. A row still pointing at a file that has gone is a bug
     somebody can see; a file nothing points at is a breach nobody can. */
  if (paths.length > 0) {
    const { error } = await db().storage.from(SIGNED_BUCKET).remove(paths);
    if (error)
      throw new Error(
        `Their signed contracts could not be removed, so nothing was deleted: ${error.message}`,
      );
  }

  const { error } = await db()
    .from("joiners")
    .delete()
    .eq("id", joinerId)
    .eq("account_id", accountId);

  if (error) throw new Error(`Deleting them failed: ${error.message}`);

  return {
    joiner: joiner.name,
    steps: steps?.length ?? 0,
    signings: signings?.length ?? 0,
    threads: threads?.length ?? 0,
    files: paths.length,
  };
}

/**
 * Signed contracts in storage that no row points at any more.
 *
 * The audit for the failure this module exists to prevent, because the failure
 * is silent by construction: an orphan looks like nothing at all until
 * somebody lists the bucket. Run it after any deletion that went a different
 * route, and before answering anybody who asks what is still held about them.
 *
 * Read-only on purpose. It reports; a person decides. Deleting files that
 * "look" unreferenced is a good way to destroy the evidence behind a contract
 * somebody may need to rely on, and the seal on those records exists precisely
 * because they are meant to be hard to alter.
 */
export async function orphanedContracts(): Promise<string[]> {
  const { data: objects, error } = await db()
    .storage.from(SIGNED_BUCKET)
    .list("", { limit: 1_000 });

  if (error) throw new Error(`Listing the bucket failed: ${error.message}`);

  const { data: rows } = await db()
    .from("contract_signings")
    .select("signed_storage_path");

  const referenced = new Set(
    (rows ?? [])
      .map((row) => row.signed_storage_path)
      .filter((path): path is string => Boolean(path)),
  );

  /* `list("")` returns the top level, and paths are stored with their prefix,
     so compare on the name as it would appear in the column. */
  return (objects ?? [])
    .map((object) => object.name)
    .filter((name) => !referenced.has(name));
}
