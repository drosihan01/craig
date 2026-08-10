import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/types";

/**
 * Where a Slack connection lives: the same `connections` table as Google's,
 * under its own provider string.
 *
 * Unverified: no Slack connection has ever been written through this module.
 * The row shape and the upsert compile against the live schema's types; what
 * a first real connection still has to prove is that a Slack row and a Google
 * row genuinely coexist for one account — the unique key is
 * `(account_id, provider)`, so they should, and "should" is the word this
 * header exists to flag.
 *
 * A separate module rather than more functions in `accounts.ts`, on purpose.
 * That file is the Google connection's home because it is the *account*
 * store, and the Google connection grew up inside the account's own shape
 * (`Account.google`). Growing an `Account.slack` beside it would mean editing
 * a verified module and every screen that holds an `Account` — for a
 * connection nothing renders from the account record. The one screen that
 * cares reads `/api/slack/connection`, which reads this. When a third
 * provider lands, the shape worth extracting lives here and in `accounts.ts`
 * side by side, which is exactly the comparison the extraction will need.
 *
 * ## The token is sealed, same argument as Google's
 *
 * AES-256-GCM under `SLACK_TOKEN_ENCRYPTION_KEY` — its own key, not
 * `GOOGLE_TOKEN_ENCRYPTION_KEY`, although the pattern is copied line for
 * line. One key, one job: rotating Google's key must not silently destroy
 * every Slack connection, and a variable named GOOGLE holding the key to
 * Slack tokens is a lie somebody debugging at midnight will believe. The
 * database only ever sees ciphertext; anyone holding a copy of the table
 * holds nothing without an environment variable that never leaves this
 * server.
 *
 * ## What goes in the generic columns
 *
 * The table's columns were named when Google was the only tenant, and two of
 * them bend rather than break for Slack:
 *
 * `domain` holds the **workspace's display name** (`team.name`), because the
 * column's job — proven by every screen that reads it — is "the human-checkable
 * name of the tenant this credential opens". Slack's stable id (`T…`) is
 * deliberately *not* stored: no call a normal-workspace runner makes needs it
 * (a bot token is already scoped to its workspace), and the day something
 * does, `auth.test` answers it from the token itself. Encoding both into one
 * column would trade a readable name for a parsing rule.
 *
 * `admin_email` stays **null**. Slack's OAuth response identifies the
 * installer by user id (`U…`), not by email, and a U-id written into a column
 * named `admin_email` will sooner or later be rendered where an email
 * belongs. Looking the email up would take a `users:read` call this module
 * has never made — when the panel needs "installed by", that call is the
 * honest way to get it.
 */

/**
 * The provider string, exported for the same reason `GOOGLE_PROVIDER` is:
 * `blocks.ts` names it in `ConnectionProvider`, and a second spelling
 * anywhere is a filter that silently matches nothing after a rename.
 */
export const SLACK_PROVIDER = "slack";

type ConnectionRow = Tables<"connections">;

/** Emails are matched the way `accounts.ts` matches them, and must stay so —
    the AAD below bakes the folded address into the ciphertext. */
const normalise = (email: string) => email.trim().toLowerCase();

const db = () => supabaseAdmin();

/* --- Sealing the bot token -------------------------------------------------- */

/**
 * `SLACK_TOKEN_ENCRYPTION_KEY`, 32 bytes, as 64 hex characters or base64
 * that decodes to 32 — the exact contract `GOOGLE_TOKEN_ENCRYPTION_KEY`
 * carries, documented in `.env.example`. Generate one with:
 *
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
const KEY_VAR = "SLACK_TOKEN_ENCRYPTION_KEY";
const KEY_BYTES = 32;
/** 96 bits, the size GCM is specified around. */
const IV_BYTES = 12;

type KeyResult = { ok: true; key: Buffer } | { ok: false; message: string };

function encryptionKey(): KeyResult {
  const raw = process.env[KEY_VAR]?.trim() ?? "";

  if (!raw) {
    return {
      ok: false,
      message: `Slack can't be connected on this deployment yet: ${KEY_VAR} isn't set, and it is what the connection is encrypted with. Rather than write one down in the clear, nothing is stored at all. Generate 32 bytes — node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" — put it in the environment, and restart the server so the value is re-read.`,
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
 * GCM's additional authenticated data: not encrypted, mixed into the tag, so
 * a row copied between accounts simply fails to open. The context string
 * differs from Google's (`craig.google.refresh-token.v1`) on purpose — a
 * sealed Slack token must not be presentable as a sealed Google token even
 * if the two keys are ever, wrongly, set to the same value.
 */
const aad = (accountEmail: string) =>
  Buffer.from(`craig.slack.bot-token.v1:${accountEmail}`, "utf8");

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
 * The token back, or `null` for every way it can fail to come back — a
 * rotated key, an edited row, a record moved between accounts. None of them
 * is distinguishable without saying something about the key, so none of them
 * is distinguished, and nothing is logged here: the only interesting values
 * in scope are the key and the plaintext.
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
 * One account's Slack row, found through the account's email because every
 * caller holds an email. Both facts — the account exists, and it has a Slack
 * row — come back together so the two cannot be read at different moments.
 */
async function fetchRow(email: string): Promise<{
  accountId: string;
  slack: ConnectionRow | undefined;
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
    slack: data.connections.find((c) => c.provider === SLACK_PROVIDER),
  };
}

/**
 * What a screen may know. Field by field, exactly as `GoogleConnectionView`
 * is, and for the same reason: the sealed token has no field here to travel
 * in, so leaking it would take an edit somebody reviews rather than a spread
 * somebody doesn't.
 */
export interface SlackConnectionView {
  /** The workspace's display name, from Slack's own answer at install time. */
  teamName: string | null;
  /** What Slack actually granted, which is not always what we asked for. */
  scopes: string[];
  /** Unix seconds, when the install completed. */
  connectedAt: number;
  /** A grant that has since stopped working. Nothing sets this yet — it
      exists so the screen's vocabulary is complete before the runner that
      will set it. */
  needsReconnect: boolean;
}

/** The view, or `null` because this account has never connected Slack. */
export async function slackViewFor(
  email: string,
): Promise<SlackConnectionView | null> {
  const found = await fetchRow(email);
  const row = found?.slack;
  if (!row) return null;

  return {
    teamName: row.domain,
    scopes: [...row.scopes],
    connectedAt: Math.floor(new Date(row.connected_at).getTime() / 1000),
    needsReconnect: row.needs_reconnect,
  };
}

/* --- Storing ---------------------------------------------------------------- */

/**
 * Whether this deployment can store a connection at all. The variable's
 * *name*, never its value — the name is documentation, the value is the only
 * thing standing between a copy of the database and somebody's company chat.
 */
export function slackStorageStatus(): {
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

export interface NewSlackConnection {
  /** The standing permission. Sealed before it touches the database. */
  botToken: string;
  /** The workspace's display name, from the install response. */
  teamName: string;
  scopes: string[];
}

export type SaveSlackResult = { ok: true } | { ok: false; message: string };

/**
 * Stores a completed install against an account, or refuses to store
 * anything — with no key the only alternatives are writing the token in the
 * clear or declining, and the clear write is the worse failure because it
 * looks like success.
 *
 * A second install replaces the first outright — the upsert on
 * `(account_id, provider)` — because Slack hands back the workspace's
 * current bot token on every install, and keeping any of the old record
 * would mean describing a grant that no longer exists. `needs_reconnect`
 * clears itself here for the same reason: reinstalling is the act that
 * fixes it.
 */
export async function saveSlackConnection(
  email: string,
  input: NewSlackConnection,
): Promise<SaveSlackResult> {
  const key = encryptionKey();
  if (!key.ok) return { ok: false, message: key.message };

  if (!input.botToken) {
    return {
      ok: false,
      message:
        "Slack didn't return anything to store, so the connection was refused rather than saved half-made.",
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

  /* Sealed against the same normalised email the account is looked up by,
     so the ciphertext is only openable from this account. See `aad` above. */
  const sealed = seal(input.botToken, key.key, normalise(email));

  const { error } = await db()
    .from("connections")
    .upsert(
      {
        account_id: found.accountId,
        provider: SLACK_PROVIDER,
        token_ciphertext: sealed.ciphertext,
        token_iv: sealed.iv,
        token_tag: sealed.tag,
        domain: input.teamName,
        admin_email: null,
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

export type SlackTokenResult =
  | { ok: true; botToken: string }
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
 * The one way a plaintext bot token leaves this file. Today's only caller is
 * the disconnect route, which needs the token to revoke it at Slack before
 * the row is deleted; tomorrow's is whatever runner finally acts on a Slack
 * step. Never logs, and never returns the token on an error path.
 */
export async function slackConnectionFor(
  email: string,
): Promise<SlackTokenResult> {
  const id = normalise(email);
  const found = await fetchRow(id);
  const stored = found?.slack;

  if (!stored) {
    return {
      ok: false,
      reason: "not-connected",
      message:
        "This account hasn't connected Slack yet, so nothing was attempted. A workspace admin needs to connect it once; after that this runs on its own.",
    };
  }

  const key = encryptionKey();
  if (!key.ok) {
    return { ok: false, reason: "unreadable", message: key.message };
  }

  const botToken = unseal(
    {
      ciphertext: stored.token_ciphertext,
      iv: stored.token_iv,
      tag: stored.token_tag,
    },
    key.key,
    id,
  );
  if (!botToken) {
    return {
      ok: false,
      reason: "unreadable",
      message: `The stored Slack connection can't be opened on this server. That happens when ${KEY_VAR} has changed since it was saved, or when the row has been edited by hand. The install itself is still live at Slack's end — check the key before disconnecting, because reconnecting means asking a workspace admin to install all over again.`,
    };
  }

  return { ok: true, botToken };
}

/**
 * Forgets the connection — deletes the row, so what is left is a table that
 * never mentioned Slack for this account. Returns whether there was anything
 * to delete. What this deliberately does *not* do is talk to Slack: the
 * route calls `revokeToken` first, while the credential to authenticate that
 * revocation still exists, and then calls this. Folding the network call in
 * here would make "Slack is down" and "the row wouldn't delete" the same
 * failure, and only one of them should stop a customer revoking us.
 */
export async function disconnectSlack(email: string): Promise<boolean> {
  const found = await fetchRow(email);
  if (!found?.slack) return false;

  const { error } = await db()
    .from("connections")
    .delete()
    .eq("id", found.slack.id);
  if (error) throw new Error(`Disconnecting failed: ${error.message}`);
  return true;
}
