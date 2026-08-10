import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Everything an account holds, as one file it can take away.
 *
 * The other half of `erase.ts`. Deletion and access are the same obligation
 * from two directions, and a product that can only do the destructive one is a
 * product where "what do you actually have about me?" has no answer.
 *
 * ## Two things are deliberately left out
 *
 * **Sealed answers stay sealed.** Tax file numbers, bank details and the rest
 * are encrypted at rest, and every individual reveal goes through
 * `noteReveal` because the TFN Rule expects an employer to be able to say
 * which of their staff opened one and when. A download button that decrypted
 * them in bulk would be the largest unaudited reveal in the product, wearing
 * the clothes of a privacy feature — one click, every TFN on the account, in
 * plaintext, in a file on somebody's laptop, with nothing in the log.
 *
 * So the export *discloses* them instead: which steps hold sealed answers, of
 * what kind, and when they were given. That is a complete and honest answer to
 * "what do you hold about me" — it just isn't the plaintext. Reading an actual
 * value stays where it already is: one at a time, through the existing screen,
 * audited. If that turns out to be the wrong trade for a real access request,
 * the change is to add an explicitly-asked-for, per-row, audited variant —
 * not to loosen this one.
 *
 * **OAuth tokens never appear.** A connection is reported as connected and
 * nothing more. The token is a live credential to somebody else's Google
 * account, and it has no business in a file that exists to be emailed around.
 *
 * ## Why JSON and not a zip of CSVs
 *
 * The data is nested — a joiner has steps, a thread has messages — and the
 * flattening a spreadsheet needs is where the meaning gets lost. One JSON
 * document keeps the shape, and the shape is part of the answer.
 */

const db = () => supabaseAdmin();

export interface AccountExport {
  exportedAt: string;
  account: Record<string, unknown>;
  /** What is held but not included, and why. Part of the answer, not a footnote. */
  withheld: { what: string; why: string }[];
  workflows: unknown[];
  joiners: unknown[];
  documents: unknown[];
  contractSignings: unknown[];
  threads: unknown[];
  notebook: unknown;
  notebookNotes: unknown[];
  connections: unknown[];
  subscription: unknown;
}

/**
 * Build the export for one account.
 *
 * Every read is scoped by `account_id` in the statement rather than filtered
 * afterwards, which is the same rule the rest of this codebase follows: a
 * query that fetches widely and narrows in TypeScript is one refactor away
 * from being an export of somebody else's company.
 */
export async function exportAccount(
  email: string,
): Promise<AccountExport | null> {
  const address = email.trim().toLowerCase();
  const client = db();

  const { data: account, error } = await client
    .from("accounts")
    .select("id, email, name, company, created_at, logo_path")
    .eq("email", address)
    .maybeSingle();

  if (error) throw new Error(`Reading the account failed: ${error.message}`);
  if (!account) return null;

  const [
    { data: workflows },
    { data: joiners },
    { data: documents },
    { data: signings },
    { data: threads },
    { data: notebook },
    { data: notes },
    { data: connections },
    { data: subscription },
  ] = await Promise.all([
    client.from("workflows").select("*").eq("account_id", account.id),
    client.from("joiners").select("*").eq("account_id", account.id),
    client
      .from("documents")
      /* Not `extracted_text` or `search`: both are derived from the file itself,
         and the file is the thing they already have. */
      .select("id, name, content_type, size_bytes, uploaded_at, visibility")
      .eq("account_id", account.id),
    client.from("contract_signings").select("*").eq("account_id", account.id),
    client.from("threads").select("*").eq("account_id", account.id),
    client
      .from("notebooks")
      .select("content, updated_at, updated_by")
      .eq("account_id", account.id)
      .maybeSingle(),
    client
      .from("notebook_notes")
      .select("text, kind, created_at, settled_at")
      .eq("account_id", account.id),
    client
      .from("connections")
      .select("provider, domain, admin_email, connected_at, needs_reconnect")
      .eq("account_id", account.id),
    client
      .from("subscriptions")
      .select("status, seats, current_period_end, cancel_at_period_end")
      .eq("account_id", account.id)
      .maybeSingle(),
  ]);

  const joinerIds = (joiners ?? []).map((row) => row.id as string);

  /* Steps and messages hang off their parents, so they are fetched by the
     parent ids just gathered rather than by account — `joiner_steps` has no
     `account_id` of its own, and inventing one for this would be a schema
     change in service of a report. */
  const [{ data: steps }, { data: messages }] = await Promise.all([
    joinerIds.length > 0
      ? client.from("joiner_steps").select("*").in("joiner_id", joinerIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    (threads ?? []).length > 0
      ? client
          .from("messages")
          .select("*")
          .in(
            "thread_id",
            (threads ?? []).map((row) => row.id as string),
          )
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  let sealedCount = 0;

  /* The ciphertext columns are dropped and replaced by the fact of their
     existence. Shipping the ciphertext would be worse than either option:
     useless to the person reading it, and a copy of the encrypted material
     outside the database for anybody who later gets the key. */
  const stepsFor = (joinerId: string) =>
    (steps ?? [])
      .filter((step) => step.joiner_id === joinerId)
      .map((step) => {
        const { value_ciphertext: ciphertext, ...rest } = step as Record<
          string,
          unknown
        >;

        /* Dropped by name rather than destructured into unused bindings: the
           three columns are one secret in three parts, and a reader has to be
           able to see that all three are gone. */
        delete rest.value_iv;
        delete rest.value_tag;

        if (!ciphertext) return rest;
        sealedCount += 1;
        return {
          ...rest,
          sealedAnswer: {
            kind: step.field,
            givenAt: step.completed_at,
            note: "Held encrypted. Not included here — read it one at a time on the person's page, where each reveal is logged.",
          },
        };
      });

  /* Built before `withheld`, and that ordering is the whole of a bug this
     already had: `sealedCount` is raised inside `stepsFor`, so building the
     disclosure first counted zero every time and the export quietly stopped
     mentioning the sealed answers it was holding back. The one claim this
     module exists to make was the one it dropped. */
  const people = (joiners ?? []).map((joiner) => ({
    ...joiner,
    steps: stepsFor(joiner.id as string),
  }));

  const withheld: AccountExport["withheld"] = [];

  if (sealedCount > 0) {
    withheld.push({
      what: `${sealedCount} sealed ${sealedCount === 1 ? "answer" : "answers"} (tax file numbers, bank and identity details)`,
      why: "These are encrypted at rest and every reveal is recorded against whoever opened it. A bulk decrypt into a downloadable file would be the one reveal nobody is accountable for. Each is readable individually on the person's page.",
    });
  }

  if ((connections ?? []).length > 0) {
    withheld.push({
      what: "Access tokens for connected services",
      why: "A token is a live credential to the connected account itself, not a record about anybody. It is never exported.",
    });
  }

  return {
    exportedAt: new Date().toISOString(),
    account,
    withheld,
    workflows: workflows ?? [],
    joiners: people,
    documents: documents ?? [],
    contractSignings: signings ?? [],
    threads: (threads ?? []).map((thread) => ({
      ...thread,
      messages: (messages ?? []).filter(
        (message) => message.thread_id === thread.id,
      ),
    })),
    notebook: notebook ?? null,
    notebookNotes: notes ?? [],
    connections: connections ?? [],
    subscription: subscription ?? null,
  };
}
