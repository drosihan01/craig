import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/types";

/**
 * Where a DocuSign connection lives: the same `connections` table as Google's,
 * Slack's and Linear's, under its own provider string.
 *
 * Unverified: no DocuSign connection has ever been written through this
 * module. The row shape and the upsert compile against the live schema's
 * types; what a first real connection has to prove is that four providers
 * genuinely coexist for one account — the unique key is
 * `(account_id, provider)`, so they should, and "should" is the word this
 * header exists to flag.
 *
 * A separate module rather than more functions in `accounts.ts`, for the
 * reason `src/lib/slack/store.ts` argues at length: that file is the *account*
 * store and the Google connection grew up inside the account's own shape, so
 * growing an `Account.docusign` beside it would mean editing verified code and
 * every screen holding an `Account`, for a connection nothing renders from the
 * account record.
 *
 * ## The refresh token is sealed, same argument as the others
 *
 * AES-256-GCM under `DOCUSIGN_TOKEN_ENCRYPTION_KEY` — its own key, not
 * Slack's or Google's, although the pattern is copied line for line. One key,
 * one job: rotating one provider's key must not silently destroy another
 * provider's connections, and a variable named GOOGLE holding the key to
 * DocuSign tokens is a lie somebody debugging at midnight will believe. The
 * database only ever sees ciphertext.
 *
 * What is sealed is the **refresh token** and nothing else. The access token
 * that came with it is deliberately dropped: eight hours of life is almost no
 * use to a product whose actions happen days apart, and a second sealed secret
 * would double the surface for a credential the refresh token can re-mint on
 * demand.
 *
 * ## What goes in the generic columns
 *
 * `domain` holds the **DocuSign account's name**, from DocuSign's own userinfo
 * answer rather than anything typed. Same job the column does for every other
 * provider: the human-checkable name of the tenant this credential opens.
 *
 * `admin_email` holds **the address of the person who consented**, which
 * DocuSign genuinely returns (Slack's OAuth does not, which is why that store
 * leaves the column null). It earns its place here beyond decoration: every
 * envelope this connection would eventually send is sent *as that person*, so
 * "which of our people is legally the sender of our employment contracts" is a
 * question the connection record should be able to answer.
 *
 * ## What is deliberately not stored, and the consequence
 *
 * The DocuSign `account_id` and `base_uri`. There is no column for either, and
 * the two candidates for smuggling them in are both worse than doing without:
 * encoding a pair into `domain` trades a readable name for a parsing rule, and
 * a migration adding columns is a change to a shared schema while other work
 * is in flight against it.
 *
 * The consequence, stated rather than hidden: **whatever finally acts on this
 * connection must call `accountFor()` to rediscover both before its first API
 * call.** That is one extra request against limits of 25,000 an hour per user,
 * so the cost is negligible; the real risk is that the account chosen at
 * connect time and the account chosen at run time could differ, for a user who
 * belongs to several and whose default changes. The guard against that is the
 * stored name: a runner that compares the rediscovered `account_name` against
 * `domain` and refuses on a mismatch turns a silent wrong-account send into a
 * refusal. That comparison is the runner's job, and this is the note that says
 * so. When a column is finally added, `base_uri` should be cached with it —
 * DocuSign's own guidance is to read userinfo once at setup and store it.
 */

/**
 * The provider string, exported for the same reason `SLACK_PROVIDER` is:
 * `blocks.ts` names it in `ConnectionProvider`, and a second spelling anywhere
 * is a filter that silently matches nothing after a rename.
 */
export const DOCUSIGN_PROVIDER = "docusign";

type ConnectionRow = Tables<"connections">;

/** Emails are matched the way `accounts.ts` matches them, and must stay so —
    the AAD below bakes the folded address into the ciphertext. */
const normalise = (email: string) => email.trim().toLowerCase();

const db = () => supabaseAdmin();

/* --- Sealing the refresh token ---------------------------------------------- */

/**
 * `DOCUSIGN_TOKEN_ENCRYPTION_KEY`, 32 bytes, as 64 hex characters or base64
 * that decodes to 32 — the exact contract `GOOGLE_TOKEN_ENCRYPTION_KEY`
 * carries, documented in `.env.example`. Generate one with:
 *
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
const KEY_VAR = "DOCUSIGN_TOKEN_ENCRYPTION_KEY";
const KEY_BYTES = 32;
/** 96 bits, the size GCM is specified around. */
const IV_BYTES = 12;

type KeyResult = { ok: true; key: Buffer } | { ok: false; message: string };

function encryptionKey(): KeyResult {
  const raw = process.env[KEY_VAR]?.trim() ?? "";

  if (!raw) {
    return {
      ok: false,
      message: `DocuSign can't be connected on this deployment yet: ${KEY_VAR} isn't set, and it is what the connection is encrypted with. Rather than write one down in the clear, nothing is stored at all. Generate 32 bytes — node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" — put it in the environment, and restart the server so the value is re-read.`,
    };
  }

  /* Hex first because that is what the command above prints, then base64,
     because somebody will paste `openssl rand -base64 32` and be entirely
     reasonable to expect it to work. Anything else fails the length check
     rather than being silently truncated to a weaker key. */
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");

  if (key.length !== KEY_BYTES) {
    return {
      ok: false,
      message: `${KEY_VAR} has to be exactly 32 bytes — 64 hex characters, or base64 that decodes to 32 bytes. What's set decodes to ${key.length}, so it was rejected rather than padded into something weaker.`,
    };
  }

  return { ok: true, key };
}

/**
 * GCM's additional authenticated data: not encrypted, mixed into the tag, so a
 * row copied between accounts simply fails to open. The context string differs
 * from every other provider's on purpose — a sealed DocuSign token must not be
 * presentable as a sealed Slack one even if the keys are ever, wrongly, set to
 * the same value.
 */
const aad = (accountEmail: string) =>
  Buffer.from(`craig.docusign.refresh-token.v1:${accountEmail}`, "utf8");

interface SealedToken {
  /** Hex. */
  ciphertext: string;
  /** Hex, 12 bytes. */
  iv: string;
  /** Hex, 16 bytes. GCM's authentication tag. */
  tag: string;
}

function seal(plaintext: string, key: Buffer, accountEmail: string): SealedToken {
  /* Fresh per seal, never derived. An IV reused under one key is the failure
     that takes GCM from "authenticated encryption" to "the plaintexts XOR to
     each other". */
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(accountEmail));

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("hex"),
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  };
}

/**
 * The token back, or `null` for every way it can fail to come back — a rotated
 * key, an edited row, a record moved between accounts. None of them is
 * distinguishable without saying something about the key, so none of them is
 * distinguished, and nothing is logged here: the only interesting values in
 * scope are the key and the plaintext.
 */
function unseal(
  sealed: SealedToken,
  key: Buffer,
  accountEmail: string,
): string | null {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(sealed.iv, "hex"),
    );
    decipher.setAAD(aad(accountEmail));
    decipher.setAuthTag(Buffer.from(sealed.tag, "hex"));

    return Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, "hex")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    /* `final()` throws when the tag doesn't check out, which is the case this
       design exists to catch. A refusal, not a crash. */
    return null;
  }
}

/* --- Reading ---------------------------------------------------------------- */

/**
 * One account's DocuSign row, found through the account's email because every
 * caller holds an email. Both facts — the account exists, and it has a
 * DocuSign row — come back together so the two cannot be read at different
 * moments.
 */
async function fetchRow(email: string): Promise<{
  accountId: string;
  docusign: ConnectionRow | undefined;
} | null> {
  const { data, error } = await db()
    .from("accounts")
    .select("id, connections(*)")
    .eq("email", normalise(email))
    .maybeSingle();

  if (error) throw new Error(`Reading account failed: ${error.message}`);
  if (!data) return null;

  return {
    accountId: data.id,
    docusign: data.connections.find((c) => c.provider === DOCUSIGN_PROVIDER),
  };
}

/**
 * What a screen may know. Field by field, exactly as `SlackConnectionView` is,
 * and for the same reason: the sealed token has no field here to travel in, so
 * leaking it would take an edit somebody reviews rather than a spread somebody
 * doesn't.
 */
export interface DocusignConnectionView {
  /** The DocuSign account's name, from DocuSign's own answer at consent time. */
  accountName: string | null;
  /** Who consented, and therefore who envelopes would be sent as. */
  adminEmail: string | null;
  /** What DocuSign actually granted, which is not always what we asked for. */
  scopes: string[];
  /** Unix seconds, when the consent completed. */
  connectedAt: number;
  /**
   * A grant that has since stopped working. Nothing sets this yet — the code
   * that could discover a dead grant is the refresh, and the refresh belongs
   * to a runner that does not exist. Carried so the screen's vocabulary is
   * complete before the thing that will set it, and so this file states what
   * it cannot detect rather than letting a reader assume otherwise.
   */
  needsReconnect: boolean;
}

/** The view, or `null` because this account has never connected DocuSign. */
export async function docusignViewFor(
  email: string,
): Promise<DocusignConnectionView | null> {
  const found = await fetchRow(email);
  const row = found?.docusign;
  if (!row) return null;

  return {
    accountName: row.domain,
    adminEmail: row.admin_email,
    scopes: [...row.scopes],
    connectedAt: Math.floor(new Date(row.connected_at).getTime() / 1000),
    needsReconnect: row.needs_reconnect,
  };
}

/* --- Storing ---------------------------------------------------------------- */

/**
 * Whether this deployment can store a connection at all. The variable's
 * *name*, never its value — the name is documentation, the value is the only
 * thing standing between a copy of the database and the ability to send
 * employment contracts from somebody else's company.
 */
export function docusignStorageStatus(): {
  ready: boolean;
  variable: string;
  /** Empty when ready. Safe to show; says what to do. */
  message: string;
} {
  const key = encryptionKey();
  return key.ok
    ? { ready: true, variable: KEY_VAR, message: "" }
    : { ready: false, variable: KEY_VAR, message: key.message };
}

export interface NewDocusignConnection {
  /** The standing permission. Sealed before it touches the database. */
  refreshToken: string;
  /** The DocuSign account's name, from userinfo — never typed. */
  accountName: string;
  /** Who consented. Null only if DocuSign omitted it. */
  adminEmail: string | null;
  scopes: string[];
}

export type SaveDocusignResult = { ok: true } | { ok: false; message: string };

/**
 * Stores a completed consent against an account, or refuses to store anything
 * — with no key the only alternatives are writing the refresh token in the
 * clear or declining, and the clear write is the worse failure because it
 * looks like success.
 *
 * A second consent replaces the first outright — the upsert on
 * `(account_id, provider)` — because DocuSign mints a fresh token pair on
 * every grant, and keeping any of the old record would mean describing a grant
 * that no longer exists. `needs_reconnect` clears itself here for the same
 * reason: consenting again is the act that fixes it.
 */
export async function saveDocusignConnection(
  email: string,
  input: NewDocusignConnection,
): Promise<SaveDocusignResult> {
  const key = encryptionKey();
  if (!key.ok) return { ok: false, message: key.message };

  if (!input.refreshToken) {
    return {
      ok: false,
      message:
        "DocuSign didn't return anything worth keeping, so the connection was refused rather than saved half-made.",
    };
  }

  const found = await fetchRow(email);
  if (!found) {
    return {
      ok: false,
      message:
        "That account no longer exists, so there was nothing to attach the connection to. Nothing was stored.",
    };
  }

  /* Sealed against the same normalised email the account is looked up by, so
     the ciphertext is only openable from this account. See `aad` above. */
  const sealed = seal(input.refreshToken, key.key, normalise(email));

  const { error } = await db()
    .from("connections")
    .upsert(
      {
        account_id: found.accountId,
        provider: DOCUSIGN_PROVIDER,
        token_ciphertext: sealed.ciphertext,
        token_iv: sealed.iv,
        token_tag: sealed.tag,
        domain: input.accountName || null,
        admin_email: input.adminEmail,
        scopes: [...input.scopes],
        connected_at: new Date().toISOString(),
        needs_reconnect: false,
      },
      { onConflict: "account_id,provider" },
    );

  if (error) {
    return {
      ok: false,
      message: `The connection couldn't be stored: ${error.message}. Nothing was saved — connecting again is safe.`,
    };
  }

  return { ok: true };
}

/* --- Using and undoing ------------------------------------------------------ */

export type DocusignTokenResult =
  | { ok: true; refreshToken: string }
  | {
      ok: false;
      /**
       * `not-connected` is the calm one — where every account starts.
       * `unreadable` means a connection is on the record and this process
       * cannot open it: the key changed, or the row was edited. Different
       * conversations with different people, kept apart for the same reason
       * `accounts.ts` keeps them apart.
       */
      reason: "not-connected" | "unreadable";
      message: string;
    };

/**
 * The one way a plaintext refresh token leaves this file.
 *
 * It has no caller today, and that is a straight consequence of DocuSign
 * having no revocation endpoint: the Slack and Linear versions of this
 * function exist so their disconnect route can revoke before deleting, and
 * there is nothing here for a disconnect to revoke *with*. Its caller is
 * whatever runner eventually sends a contract, which will hand the token to
 * `refreshAccessToken` and write the rotated one back. Kept because a sealed
 * credential with no documented way out is a credential the next reader has to
 * reverse-engineer. Never logs, and never returns the token on an error path.
 */
export async function docusignRefreshTokenFor(
  email: string,
): Promise<DocusignTokenResult> {
  const id = normalise(email);
  const found = await fetchRow(id);
  const stored = found?.docusign;

  if (!stored) {
    return {
      ok: false,
      reason: "not-connected",
      message:
        "This account hasn't connected DocuSign yet, so nothing was attempted. A DocuSign administrator needs to connect it once.",
    };
  }

  const key = encryptionKey();
  if (!key.ok) {
    return { ok: false, reason: "unreadable", message: key.message };
  }

  const refreshToken = unseal(
    {
      ciphertext: stored.token_ciphertext,
      iv: stored.token_iv,
      tag: stored.token_tag,
    },
    key.key,
    id,
  );
  if (!refreshToken) {
    return {
      ok: false,
      reason: "unreadable",
      message: `The stored DocuSign connection can't be opened on this server. That happens when ${KEY_VAR} has changed since it was saved, or when the row has been edited by hand. The consent itself is still live at DocuSign's end — check the key before disconnecting, because reconnecting means asking a DocuSign administrator to consent all over again.`,
    };
  }

  return { ok: true, refreshToken };
}

/**
 * Forgets the connection — deletes the row, so what is left is a table that
 * never mentioned DocuSign for this account. Returns whether there was
 * anything to delete.
 *
 * Unlike the Slack and Google versions, no revocation precedes this, because
 * DocuSign provides nothing to call: see `revocationNotice` in `auth.ts`. That
 * makes this function the *entire* disconnect rather than half of it, and it
 * is the reason the route pairs it with a sentence telling the customer where
 * to finish the job themselves.
 */
export async function disconnectDocusign(email: string): Promise<boolean> {
  const found = await fetchRow(email);
  if (!found?.docusign) return false;

  const { error } = await db()
    .from("connections")
    .delete()
    .eq("id", found.docusign.id);
  if (error) throw new Error(`Disconnecting failed: ${error.message}`);
  return true;
}
