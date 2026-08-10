import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/types";

/**
 * Where a customer's Linear connection lives: the same `connections` table as
 * Google's, under its own provider string, sealed under its own key.
 *
 * Unverified: no Linear workspace has ever been connected, so no row with
 * this provider has ever been written or read back. The sealing itself is the
 * AES-GCM pattern from `accounts.ts`, proven there against live rows; what a
 * live Linear connection still has to prove is everything either side of it —
 * that the callback reaches `saveLinearConnection` with a real token, and
 * that a token unsealed months later still opens.
 *
 * This is a separate module rather than more of `accounts.ts`, and the line
 * is drawn on purpose. `accounts.ts` is the account store; its Google section
 * is woven into the account's public shape (`Account.google`) because every
 * screen that names an account wants to know about its Workspace. Linear has
 * no screen like that yet — one panel and one route ask about it, both
 * Linear's own — so the connection lives beside the code that uses it, and
 * `accounts.ts` stays one file instead of growing a section per provider.
 * The day a third provider lands, the seam to extract is the seal/unseal
 * pair, which is duplicated here knowingly rather than generalised before
 * two real cases exist.
 *
 * What is deliberately identical: sealed as `token_ciphertext`/`token_iv`/
 * `token_tag` on the `(account_id, provider)` unique key, bound to the
 * account's normalised email through GCM's additional authenticated data, and
 * with no function in the file that returns the plaintext to anything but the
 * routes that act on it. Nothing bearer-shaped in any table, ever.
 *
 * One column is borrowed rather than renamed: `domain` holds the workspace's
 * URL key — the `katalis` in linear.app/katalis — because the generalised
 * table has one slot for "which tenant is this" and a migration to rename it
 * per provider would buy a nicer word at the cost of a schema change this
 * slice doesn't need. The view names the field honestly.
 */

/**
 * The provider string for every Linear row, exported for the same reason
 * `GOOGLE_PROVIDER` is: a second copy in a filter somewhere else would
 * silently match nothing the day this one changed.
 */
export const LINEAR_PROVIDER = "linear";

/* --- Sealing the refresh token --------------------------------------------- */

/**
 * The key the Linear refresh token is sealed with — its own variable,
 * deliberately not `GOOGLE_TOKEN_ENCRYPTION_KEY`. "One key, one job" is the
 * standing rule in `accounts.ts`, and it earns its keep here the first time
 * one key has to be rotated: rotating Google's must not orphan every Linear
 * connection, and vice versa. Same shape — 32 bytes, as 64 hex characters or
 * base64 that decodes to 32:
 *
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * The database never sees the plaintext, and Supabase's at-rest encryption is
 * not a substitute — anybody who can read the table would otherwise hold a
 * standing authorisation to administer somebody else's Linear workspace.
 */
const KEY_VAR = "LINEAR_TOKEN_ENCRYPTION_KEY";
const KEY_BYTES = 32;
/** 96 bits, the size GCM is specified around. */
const IV_BYTES = 12;

type KeyResult = { ok: true; key: Buffer } | { ok: false; message: string };

function encryptionKey(): KeyResult {
  const raw = process.env[KEY_VAR]?.trim() ?? "";

  if (!raw) {
    return {
      ok: false,
      message: `Linear can't be connected on this deployment yet: ${KEY_VAR} isn't set, and it is what the connection is encrypted with. Rather than write one down in the clear, nothing is stored at all. Generate 32 bytes — node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" — put it in the environment, and restart the server so the value is re-read.`,
    };
  }

  /* Hex first because that is what the command above prints, then base64 for
     whoever pastes `openssl rand -base64 32`. Anything else fails the length
     check rather than being silently truncated into a weaker key. */
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
 * What the ciphertext is bound to, beyond being ciphertext. The account's
 * normalised email in the AAD makes the sealed token *that account's* sealed
 * token rather than a portable blob — a row copied between accounts simply
 * fails to open. Domain-separated from Google's binding by the provider name
 * in the prefix, so neither provider's ciphertext could ever be presented as
 * the other's even if the keys were one day carelessly set equal.
 */
const aad = (accountEmail: string) =>
  Buffer.from(`craig.linear.refresh-token.v1:${accountEmail}`, "utf8");

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
 * The token back, or `null` for every way it can fail to come back. A rotated
 * key, a hand-edited row and a record moved between accounts all land here
 * indistinguishably — so all of them are `null`, the caller turns that into
 * one honest sentence, and nothing is logged, because the only interesting
 * values in scope are the key and the plaintext.
 */
function unseal(sealed: SealedToken, key: Buffer, accountEmail: string): string | null {
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
       whole design exists to catch. A refusal, not a crash. */
    return null;
  }
}

/* --- Reading the account and its row --------------------------------------- */

type ConnectionRow = Tables<"connections">;

/** Emails are matched the way mail servers match them, exactly as
    `accounts.ts` stores them — a seam that normalised differently from the
    store behind it would look up nothing for somebody, eventually. */
const normalise = (email: string) => email.trim().toLowerCase();

const db = () => supabaseAdmin();

/**
 * The account's id and its Linear row, in one round trip. The embed is the
 * same PostgREST join `accounts.ts` uses; the filter to one provider happens
 * here because the table deliberately holds every provider's rows side by
 * side.
 */
async function fetchLinearRow(email: string): Promise<{
  accountId: string;
  row: ConnectionRow | undefined;
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
    row: data.connections.find((c) => c.provider === LINEAR_PROVIDER),
  };
}

/* --- What screens may know ------------------------------------------------- */

/**
 * What a screen may know about somebody's Linear connection. Written out
 * field by field for `GoogleConnectionView`'s reason: the token has no field
 * here to travel in, so a future edit that wanted to leak it would have to
 * add one on purpose rather than change a `...spread` and leak it by
 * accident.
 */
export interface LinearConnectionView {
  /** The workspace's URL key — the `katalis` in linear.app/katalis. */
  urlKey: string | null;
  /** The admin who consented. Null if Linear omitted it. */
  adminEmail: string | null;
  /** What Linear actually granted, which is not always what we asked for. */
  scopes: string[];
  /** Unix seconds, when the consent completed. */
  connectedAt: number;
  /**
   * Carried for shape-compatibility with the screens and honesty about the
   * store: the column exists and is read, and nothing sets it yet, because
   * the code that would discover a dead grant — the refresh — belongs to the
   * runner. Until then this is always false, and saying so here beats a
   * reader assuming the store detects what it cannot.
   */
  needsReconnect: boolean;
}

function view(row: ConnectionRow | undefined): LinearConnectionView | null {
  if (!row) return null;
  return {
    urlKey: row.domain,
    adminEmail: row.admin_email,
    scopes: [...row.scopes],
    connectedAt: Math.floor(new Date(row.connected_at).getTime() / 1000),
    needsReconnect: row.needs_reconnect,
  };
}

/**
 * Whether this deployment can store a connection at all. Returns the
 * variable's *name*, never its value — the name is documentation, the value
 * is the only thing standing between a copy of the database and somebody
 * else's workspace.
 */
export function linearStorageStatus(): {
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

/** The connection as the panel and the route may see it, or null. */
export async function linearConnectionViewFor(
  email: string,
): Promise<LinearConnectionView | null> {
  const found = await fetchLinearRow(email);
  return view(found?.row);
}

/* --- Writing and deleting -------------------------------------------------- */

export interface NewLinearConnection {
  /** The standing permission. Sealed before it touches the database. */
  refreshToken: string;
  /** The workspace's URL key, from Linear's own answer — never typed. */
  urlKey: string;
  adminEmail: string | null;
  scopes: string[];
}

export type SaveLinearResult = { ok: true } | { ok: false; message: string };

/**
 * Stores a completed consent against an account, or refuses to store
 * anything. Refusing is the important branch: with no key the only options
 * are writing the refresh token in the clear or declining, and writing it in
 * the clear is the worse failure by a wide margin, because it looks like
 * success.
 *
 * A second consent replaces the first outright — an upsert on the
 * `(account_id, provider)` key. Linear mints a fresh token pair on every code
 * grant and rotation retires the old pair's refresh token, so keeping any of
 * the old record would mean describing a grant that no longer exists.
 */
export async function saveLinearConnection(
  email: string,
  input: NewLinearConnection,
): Promise<SaveLinearResult> {
  const key = encryptionKey();
  if (!key.ok) return { ok: false, message: key.message };

  if (!input.refreshToken) {
    return {
      ok: false,
      message:
        "Linear didn't return anything to store, so the connection was refused rather than saved half-made.",
    };
  }

  const found = await fetchLinearRow(email);
  if (!found) {
    return {
      ok: false,
      message:
        "That account no longer exists, so there was nothing to attach the connection to. Nothing was stored.",
    };
  }

  const sealed = seal(input.refreshToken, key.key, normalise(email));

  const { error } = await db()
    .from("connections")
    .upsert(
      {
        account_id: found.accountId,
        provider: LINEAR_PROVIDER,
        token_ciphertext: sealed.ciphertext,
        token_iv: sealed.iv,
        token_tag: sealed.tag,
        /* The generalised table's tenant slot; holds the URL key. See the
           header for why the column keeps Google's name. */
        domain: input.urlKey,
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

export type LinearTokenResult =
  | { ok: true; refreshToken: string }
  | {
      ok: false;
      /**
       * `not-connected` is the calm one — where every account starts.
       * `unreadable` means a connection is on the record and this process
       * cannot open it: the key changed, or the row was edited. Different
       * conversations with different people, exactly as in `accounts.ts`.
       */
      reason: "not-connected" | "unreadable";
      message: string;
    };

/**
 * The sealed token back out, for the one caller with a legitimate use: the
 * disconnect route, which must revoke at Linear *before* the row it would
 * revoke with is deleted. The runner will be the second caller, and when it
 * exists it must also be the writer — every refresh rotates the token, and a
 * reader that never writes back holds a dead credential within a day.
 *
 * Never logs, and never returns the token in an error path.
 */
export async function linearRefreshTokenFor(
  email: string,
): Promise<LinearTokenResult> {
  const id = normalise(email);
  const found = await fetchLinearRow(id);
  const stored = found?.row;

  if (!stored) {
    return {
      ok: false,
      reason: "not-connected",
      message:
        "This account hasn't connected Linear yet, so nothing was attempted.",
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
      message: `The stored Linear connection can't be opened on this server. That happens when ${KEY_VAR} has changed since it was saved, or when the row has been edited by hand. The grant itself may still be live at Linear's end — check the key before disconnecting, because reconnecting means asking a workspace admin to consent all over again.`,
    };
  }

  return { ok: true, refreshToken };
}

/**
 * Forgets the connection, which means deleting the token rather than hiding
 * it. Returns whether there was anything to delete. What this deliberately
 * does *not* do is tell Linear — that is `revokeToken`'s job, and the caller
 * must do it first, while a credential still exists to do it with.
 */
export async function disconnectLinear(email: string): Promise<boolean> {
  const found = await fetchLinearRow(email);
  if (!found?.row) return false;

  const { error } = await db()
    .from("connections")
    .delete()
    .eq("id", found.row.id);
  if (error) throw new Error(`Disconnecting failed: ${error.message}`);
  return true;
}
