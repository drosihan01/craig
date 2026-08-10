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

/* --- The whole account ----------------------------------------------------- */

const DOCUMENTS_BUCKET = "documents";
const LOGO_BUCKET = "logos";

/**
 * What happened, or why nothing did.
 *
 * A refusal is a result rather than an exception because there is exactly one
 * reason to refuse and the caller has to show it to somebody — an error would
 * make the ordinary case look like a fault.
 */
export type AccountErasure =
  | {
      ok: true;
      email: string;
      joiners: number;
      documents: number;
      workflows: number;
      threads: number;
      files: number;
      /** True when the sign-in was removed too. */
      signInRemoved: boolean;
      /** Google was connected; the grant itself still needs revoking by them. */
      googleStillGranted: boolean;
    }
  | { ok: false; reason: string; subscriptionId?: string };

/**
 * Erase an account and everything under it.
 *
 * The cascade does the relational half — joiners, their steps and sealed
 * answers, workflows, threads, messages, documents, connections, the notebook.
 * This function exists for the three things it cannot do.
 *
 * **Storage, in three buckets.** Signed contracts, uploaded documents and the
 * company logo are all files with a column pointing at them, and a cascade
 * reaches none of them. Same order as `eraseJoiner` and for the same reason:
 * objects first, rows second.
 *
 * **The sign-in.** GoTrue holds the other half of an account. Deleting the row
 * and leaving the auth user makes that email address permanently taken by a
 * user whose account does not exist — they cannot sign in and cannot sign up
 * again. `clearAccounts` learned this the same way.
 *
 * **Billing, which is why this can refuse.** A live subscription is a
 * standing instruction at Stripe, and deleting rows here does not touch it:
 * the charges keep arriving, now with nothing on our side connecting them to
 * anything. Cancelling it from here would be this function reaching into an
 * external system and taking somebody's money decision for them, so it does
 * neither — it stops and says what has to happen first. That is the honest
 * order anyway: cancel, then erase.
 */
export async function eraseAccount(email: string): Promise<AccountErasure> {
  const address = email.trim().toLowerCase();
  const client = db();

  const { data: account, error: accountError } = await client
    .from("accounts")
    .select("id, owner_id, logo_path")
    .eq("email", address)
    .maybeSingle();

  if (accountError)
    throw new Error(`Finding the account failed: ${accountError.message}`);
  if (!account) return { ok: false, reason: "There's no account on that address." };

  /* Billing first, before anything is touched. A refusal after the files have
     gone is not a refusal. */
  const { data: subscription } = await client
    .from("subscriptions")
    .select("subscription_id, status")
    .eq("account_id", account.id)
    .maybeSingle();

  const live =
    subscription &&
    subscription.status !== "canceled" &&
    subscription.status !== "incomplete_expired";

  if (live) {
    return {
      ok: false,
      reason:
        "There's still a live subscription on this account. Cancel it at Stripe first — deleting the account here would not stop the billing, it would only remove the record of what the billing was for.",
      subscriptionId: subscription.subscription_id ?? undefined,
    };
  }

  /* Every path, read while the rows that hold them still exist. */
  const [{ data: signings }, { data: documents }, { data: joiners }, { data: workflows }, { data: threads }, { data: google }] =
    await Promise.all([
      client
        .from("contract_signings")
        .select("signed_storage_path")
        .eq("account_id", account.id),
      client.from("documents").select("storage_path").eq("account_id", account.id),
      client.from("joiners").select("id").eq("account_id", account.id),
      client.from("workflows").select("id").eq("account_id", account.id),
      client.from("threads").select("id").eq("account_id", account.id),
      client.from("connections").select("id").eq("account_id", account.id),
    ]);

  const signedPaths = (signings ?? [])
    .map((row) => row.signed_storage_path)
    .filter((path): path is string => Boolean(path));
  const documentPaths = (documents ?? [])
    .map((row) => row.storage_path)
    .filter((path): path is string => Boolean(path));
  const logoPaths = account.logo_path ? [account.logo_path] : [];

  /* Each bucket separately — `remove` is per-bucket, and a single list of
     paths across three of them is a silent no-op for two of them. */
  const removals: Array<[string, string[]]> = [
    [SIGNED_BUCKET, signedPaths],
    [DOCUMENTS_BUCKET, documentPaths],
    [LOGO_BUCKET, logoPaths],
  ];

  for (const [bucket, paths] of removals) {
    if (paths.length === 0) continue;
    const { error } = await client.storage.from(bucket).remove(paths);
    if (error)
      throw new Error(
        `Files in "${bucket}" could not be removed, so nothing was deleted: ${error.message}`,
      );
  }

  const { error: deleteError } = await client
    .from("accounts")
    .delete()
    .eq("id", account.id);

  if (deleteError)
    throw new Error(`Deleting the account failed: ${deleteError.message}`);

  /* The sign-in last: if it fails, the account is gone and the orphan is an
     auth user with no data, which is recoverable by hand. Failing the other
     way round would leave the data with no way to reach it. */
  let signInRemoved = false;
  if (account.owner_id) {
    const { error } = await client.auth.admin.deleteUser(account.owner_id);
    if (error) {
      console.error(
        `[erase] account ${address} is gone but its sign-in ${account.owner_id} remains:`,
        error.message,
      );
    } else {
      signInRemoved = true;
    }
  }

  return {
    ok: true,
    email: address,
    joiners: joiners?.length ?? 0,
    documents: documents?.length ?? 0,
    workflows: workflows?.length ?? 0,
    threads: threads?.length ?? 0,
    files: signedPaths.length + documentPaths.length + logoPaths.length,
    signInRemoved,
    /* Forgetting the token is not revoking the grant — that lives at
       myaccount.google.com and only they can do it. Reported so somebody can
       be told rather than left assuming we handled it. */
    googleStillGranted: (google?.length ?? 0) > 0,
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
