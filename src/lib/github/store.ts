import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/types";

/**
 * Where a GitHub connection lives: the same `connections` table as Google's,
 * Slack's and Linear's, under its own provider string.
 *
 * Unverified: no GitHub connection has ever been written through this module.
 * The row shape and the upsert compile against the live schema's types; what a
 * first real connection still has to prove is that a fourth provider row
 * coexists with the other three for one account — the unique key is
 * `(account_id, provider)`, so it should, and "should" is the word this header
 * exists to flag.
 *
 * A separate module rather than more functions in `accounts.ts`, for the
 * reason `src/lib/slack/store.ts` argues in full: that file is the *account*
 * store and the Google connection grew up inside the account's own shape, and
 * growing an `Account.github` beside it would mean editing verified code and
 * every screen holding an `Account`, for a connection nothing renders from the
 * account record.
 *
 * ## The sealed value is a pair, and this is the first provider where it is
 *
 * Slack seals one string because Slack's credential *is* one string. Linear
 * seals one because its access token is derivable from the refresh token
 * alone. GitHub is neither: a GitHub App's user access token dies in eight
 * hours, its refresh token lasts six months, **using the refresh token
 * destroys both halves at once**, and the disconnect path needs the access
 * half while a future runner needs the refresh half. They are minted together,
 * rotated together, and die together — one credential wearing two strings.
 *
 * So the plaintext sealed into `token_ciphertext` is a small versioned JSON
 * envelope rather than a bare token. The alternatives were both worse: two
 * columns means a migration for a shape that is still unproven, and sealing
 * only the refresh token would leave the disconnect route with nothing to
 * revoke with until a refresh has been spent. The `v` field is there because
 * an envelope with no version is an envelope that can never change; reading
 * an unknown version is a refusal, not a guess.
 *
 * ## The token is sealed, same argument as everywhere else
 *
 * AES-256-GCM under `GITHUB_TOKEN_ENCRYPTION_KEY` — its own key, not Google's
 * or Slack's or Linear's, although the pattern is copied line for line. One
 * key, one job: rotating one provider's key must not silently destroy another
 * provider's connections, and a variable named GOOGLE holding the key to
 * GitHub tokens is a lie somebody debugging at midnight will believe.
 *
 * ## What goes in the generic columns
 *
 * The columns were named when Google was the only tenant, and three of them
 * bend rather than break for GitHub:
 *
 * `domain` holds the **organisation's login** — `katalis` from
 * github.com/katalis — because the column's job, proven by every screen that
 * reads it, is "the human-checkable name of the tenant this credential opens".
 *
 * `scopes` holds the **installation's permissions**, flattened to
 * `members:write`-shaped strings. GitHub Apps have no scopes at all; what they
 * have instead is exactly what this column is for — the list of what the grant
 * may do, which is the thing a screen shows somebody who is deciding whether
 * to trust it, and the thing a future check compares against what was asked
 * for. Recording an empty array because "GitHub has no scopes" would throw
 * away the only honest answer to the question the column asks.
 *
 * `admin_email` stays **null**. GitHub identifies the person who authorised us
 * by login, not by email, and a login written into a column named
 * `admin_email` will sooner or later be rendered where an email belongs.
 * Reading their address would need the App's "Email addresses" account
 * permission, which is deliberately not requested — an onboarding tool asking
 * to read a person's email addresses on a consent screen buys a scarier screen
 * for a field nothing displays.
 *
 * What is deliberately **not stored at all** is the installation id. It looks
 * like an obvious thing to keep and it is a trap: uninstalling and reinstalling
 * an App mints a new one, so a stored id goes stale with no error anywhere and
 * the runner that used it would be pointing at an installation that no longer
 * exists. `GET /user/installations` answers it fresh in one call, which is a
 * call the runner is making anyway.
 */

/**
 * The provider string, exported for the same reason `SLACK_PROVIDER` is:
 * `blocks.ts` names it in `ConnectionProvider`, and a second spelling anywhere
 * is a filter that silently matches nothing after a rename.
 */
export const GITHUB_PROVIDER = "github";

type ConnectionRow = Tables<"connections">;

/** Emails are matched the way `accounts.ts` matches them, and must stay so —
    the AAD below bakes the folded address into the ciphertext. */
const normalise = (email: string) => email.trim().toLowerCase();

const db = () => supabaseAdmin();

/* --- Sealing the credential ------------------------------------------------- */

/**
 * `GITHUB_TOKEN_ENCRYPTION_KEY`, 32 bytes, as 64 hex characters or base64 that
 * decodes to 32 — the exact contract `GOOGLE_TOKEN_ENCRYPTION_KEY` carries,
 * documented in `.env.example`. Generate one with:
 *
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
const KEY_VAR = "GITHUB_TOKEN_ENCRYPTION_KEY";
const KEY_BYTES = 32;
/** 96 bits, the size GCM is specified around. */
const IV_BYTES = 12;

type KeyResult = { ok: true; key: Buffer } | { ok: false; message: string };

function encryptionKey(): KeyResult {
  const raw = process.env[KEY_VAR]?.trim() ?? "";

  if (!raw) {
    return {
      ok: false,
      message: `GitHub can't be connected on this deployment yet: ${KEY_VAR} isn't set, and it is what the connection is encrypted with. Rather than write one down in the clear, nothing is stored at all. Generate 32 bytes — node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" — put it in the environment, and restart the server so the value is re-read.`,
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
 * from every other provider's on purpose — a sealed GitHub credential must not
 * be presentable as a sealed Slack one even if two keys are ever, wrongly, set
 * to the same value.
 */
const aad = (accountEmail: string) =>
  Buffer.from(`craig.github.user-credential.v1:${accountEmail}`, "utf8");

interface SealedToken {
  /** Hex. */
  ciphertext: string;
  /** Hex, 12 bytes. */
  iv: string;
  /** Hex, 16 bytes. GCM's authentication tag. */
  tag: string;
}

/**
 * The envelope that goes inside the ciphertext. Single-letter keys because
 * this is written and read in exactly two places and the field names are
 * repeated in every row of the table — the long version buys nothing and costs
 * bytes forever.
 */
interface Envelope {
  /** Version. Anything but 1 is refused rather than guessed at. */
  v: 1;
  /** The user access token. Eight hours, or forever if the App disabled
      expiry — which is why it is kept rather than discarded as short-lived. */
  u: string;
  /** The refresh token, or null when the App issues non-expiring tokens. */
  r: string | null;
  /** Unix seconds the refresh token dies, or null when there isn't one. */
  x: number | null;
}

function seal(
  envelope: Envelope,
  key: Buffer,
  accountEmail: string,
): SealedToken {
  /* Fresh per seal, never derived. An IV reused under one key is the failure
     that takes GCM from "authenticated encryption" to "the plaintexts XOR to
     each other". */
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(accountEmail));

  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(envelope), "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("hex"),
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  };
}

/**
 * The envelope back, or `null` for every way it can fail to come back — a
 * rotated key, an edited row, a record moved between accounts, a version this
 * build does not know. None of them is distinguishable without saying
 * something about the key, so none of them is distinguished, and nothing is
 * logged here: the only interesting values in scope are the key and the
 * plaintext.
 */
function unseal(
  sealed: SealedToken,
  key: Buffer,
  accountEmail: string,
): Envelope | null {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(sealed.iv, "hex"),
    );
    decipher.setAAD(aad(accountEmail));
    decipher.setAuthTag(Buffer.from(sealed.tag, "hex"));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, "hex")),
      decipher.final(),
    ]).toString("utf8");

    const parsed = JSON.parse(plaintext) as Partial<Envelope>;
    if (parsed.v !== 1 || typeof parsed.u !== "string") return null;

    return {
      v: 1,
      u: parsed.u,
      r: typeof parsed.r === "string" ? parsed.r : null,
      x: typeof parsed.x === "number" ? parsed.x : null,
    };
  } catch {
    /* `final()` throws when the tag doesn't check out, which is the case this
       design exists to catch, and `JSON.parse` throws on anything that got
       past it wearing the wrong shape. A refusal, not a crash. */
    return null;
  }
}

/* --- Reading ---------------------------------------------------------------- */

/**
 * One account's GitHub row, found through the account's email because every
 * caller holds an email. Both facts — the account exists, and it has a GitHub
 * row — come back together so the two cannot be read at different moments.
 */
async function fetchRow(email: string): Promise<{
  accountId: string;
  github: ConnectionRow | undefined;
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
    github: data.connections.find((c) => c.provider === GITHUB_PROVIDER),
  };
}

/**
 * What a screen may know. Field by field, exactly as `SlackConnectionView` is,
 * and for the same reason: the sealed credential has no field here to travel
 * in, so leaking it would take an edit somebody reviews rather than a spread
 * somebody doesn't.
 */
export interface GitHubConnectionView {
  /** The organisation's login — `katalis` from github.com/katalis. */
  orgLogin: string | null;
  /** The installation's permissions, as `members:write`-shaped strings. */
  permissions: string[];
  /** Unix seconds, when the connection completed. */
  connectedAt: number;
  /** A grant that has since stopped working. Nothing sets this yet — it exists
      so the screen's vocabulary is complete before the runner that will set
      it. */
  needsReconnect: boolean;
}

/** The view, or `null` because this account has never connected GitHub. */
export async function githubViewFor(
  email: string,
): Promise<GitHubConnectionView | null> {
  const found = await fetchRow(email);
  const row = found?.github;
  if (!row) return null;

  return {
    orgLogin: row.domain,
    permissions: [...row.scopes],
    connectedAt: Math.floor(new Date(row.connected_at).getTime() / 1000),
    needsReconnect: row.needs_reconnect,
  };
}

/* --- Storing ---------------------------------------------------------------- */

/**
 * Whether this deployment can store a connection at all. The variable's
 * *name*, never its value — the name is documentation, the value is the only
 * thing standing between a copy of the database and somebody's source code.
 */
export function githubStorageStatus(): {
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

export interface NewGitHubConnection {
  /** The user access token. Sealed before it touches the database. */
  userToken: string;
  /** Its other half, or null on an App with expiry switched off. */
  refreshToken: string | null;
  /** Unix seconds the refresh token dies, or null when there isn't one. */
  refreshExpiresAt: number | null;
  /** The organisation's login, from `GET /user/installations`. */
  orgLogin: string;
  /** The installation's permissions, already flattened. */
  permissions: string[];
}

export type SaveGitHubResult = { ok: true } | { ok: false; message: string };

/**
 * Stores a completed connection against an account, or refuses to store
 * anything — with no key the only alternatives are writing a standing
 * credential to somebody's source code in the clear or declining, and the
 * clear write is the worse failure because it looks like success.
 *
 * A second connection replaces the first outright — the upsert on
 * `(account_id, provider)` — because authorising again mints a fresh pair and
 * retires the old one, so keeping any of the previous record would mean
 * describing a grant that no longer exists. `needs_reconnect` clears itself
 * here for the same reason: authorising again is the act that fixes it.
 */
export async function saveGitHubConnection(
  email: string,
  input: NewGitHubConnection,
): Promise<SaveGitHubResult> {
  const key = encryptionKey();
  if (!key.ok) return { ok: false, message: key.message };

  if (!input.userToken) {
    return {
      ok: false,
      message:
        "GitHub didn't return anything to store, so the connection was refused rather than saved half-made.",
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
  const sealed = seal(
    {
      v: 1,
      u: input.userToken,
      r: input.refreshToken,
      x: input.refreshExpiresAt,
    },
    key.key,
    normalise(email),
  );

  const { error } = await db()
    .from("connections")
    .upsert(
      {
        account_id: found.accountId,
        provider: GITHUB_PROVIDER,
        token_ciphertext: sealed.ciphertext,
        token_iv: sealed.iv,
        token_tag: sealed.tag,
        domain: input.orgLogin,
        admin_email: null,
        scopes: [...input.permissions],
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

export type GitHubCredentialResult =
  | {
      ok: true;
      userToken: string;
      refreshToken: string | null;
      /** Unix seconds, or null. A refresh token past this is already dead at
          GitHub's end, so a caller can say so without spending a request. */
      refreshExpiresAt: number | null;
    }
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
 * The one way a plaintext GitHub credential leaves this file. Today's only
 * caller is the disconnect route, which needs it to revoke the authorisation
 * at GitHub before the row is deleted; tomorrow's is whatever runner finally
 * acts on a GitHub step. Never logs, and never returns anything on an error
 * path.
 *
 * Both halves come back together and always will: they are one credential, and
 * a caller given only the access token would refresh from a copy it does not
 * hold — which, because a refresh destroys the pair it came from, is how a
 * connection gets locked out of itself.
 */
export async function githubCredentialFor(
  email: string,
): Promise<GitHubCredentialResult> {
  const id = normalise(email);
  const found = await fetchRow(id);
  const stored = found?.github;

  if (!stored) {
    return {
      ok: false,
      reason: "not-connected",
      message:
        "This account hasn't connected GitHub yet, so nothing was attempted. An organisation owner needs to connect it once; after that this runs on its own.",
    };
  }

  const key = encryptionKey();
  if (!key.ok) {
    return { ok: false, reason: "unreadable", message: key.message };
  }

  const envelope = unseal(
    {
      ciphertext: stored.token_ciphertext,
      iv: stored.token_iv,
      tag: stored.token_tag,
    },
    key.key,
    id,
  );
  if (!envelope) {
    return {
      ok: false,
      reason: "unreadable",
      message: `The stored GitHub connection can't be opened on this server. That happens when ${KEY_VAR} has changed since it was saved, or when the row has been edited by hand. The authorisation itself is still live at GitHub's end — check the key before disconnecting, because reconnecting means asking an organisation owner to authorise all over again.`,
    };
  }

  return {
    ok: true,
    userToken: envelope.u,
    refreshToken: envelope.r,
    refreshExpiresAt: envelope.x,
  };
}

/**
 * Forgets the connection — deletes the row, so what is left is a table that
 * never mentioned GitHub for this account. Returns whether there was anything
 * to delete. What this deliberately does *not* do is talk to GitHub: the route
 * calls `revokeAuthorization` first, while the credential to authenticate that
 * revocation still exists, and then calls this. Folding the network call in
 * here would make "GitHub is down" and "the row wouldn't delete" the same
 * failure, and only one of them should stop a customer revoking us.
 */
export async function disconnectGitHub(email: string): Promise<boolean> {
  const found = await fetchRow(email);
  if (!found?.github) return false;

  const { error } = await db()
    .from("connections")
    .delete()
    .eq("id", found.github.id);
  if (error) throw new Error(`Disconnecting failed: ${error.message}`);
  return true;
}
