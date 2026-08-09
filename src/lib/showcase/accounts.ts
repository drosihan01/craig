import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/* Type-only, and it has to stay that way. `@/lib/google/auth` reads the OAuth
   client secret at module scope-adjacent call sites and is `server-only`; a
   value import here would drag it into every module graph that touches the
   account store, for a shape that costs nothing at runtime. `import type` is
   erased entirely, so this is a promise about the shape and nothing more. */
import type { GoogleConnection } from "@/lib/google/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/types";
import { SUBSCRIPTION_STATUSES } from "./contract";
import type { Subscription, SubscriptionStatus } from "./contract";
import { safeCompany } from "./sign-up";

/**
 * The accounts, and where they actually live: Supabase.
 *
 * They used to be a JSON file behind a `globalThis` Map, which was the right
 * size for a demo and indefensible for a deployment — Vercel's filesystem is
 * read-only outside /tmp and discarded between invocations, so the file store
 * was the thing standing between this product and being deployable at all.
 *
 * The password moved out of here entirely. Supabase Auth (GoTrue) owns
 * credentials now: sign-up creates an auth user, sign-in verifies against it,
 * and this table holds everything about the account *except* how its owner
 * proves who they are. That deletes the PBKDF2 code, the timing-oracle
 * defence and the double-submit re-check — not because they were wrong, but
 * because they were this file doing GoTrue's job.
 *
 * Still keyed by lowercased email at this API's surface, because every caller
 * holds an email; the row also carries `owner_id`, the auth user it belongs
 * to. Creation refuses a duplicate rather than overwriting, exactly as
 * before — the unique constraints on `email` and on the auth user are what
 * enforce it now, which is stronger than the in-memory check ever was.
 */

/** The one provider this generalised table holds today. The next block adds a
    string here, not a table. */
const GOOGLE_PROVIDER = "google-workspace";

/**
 * What a screen may know about somebody's Google Workspace connection.
 *
 * Written out field by field rather than derived from the stored shape, and
 * that is the whole point of it existing. What a UI legitimately needs is
 * *whether* they are connected, *which* domain, and *when* — the three things
 * that let a page say "Connected to northgate.io on 4 August" instead of
 * asking somebody to trust a green tick. It does not need the refresh token,
 * and there is no version of this product where it does.
 *
 * So the token has no field here to travel in. A future edit that wanted to
 * leak it would have to add one on purpose, which is a line somebody reviews,
 * rather than change a `...spread` somewhere and leak it by accident.
 */
export interface GoogleConnectionView {
  /** From the id token's `hd` claim — Google's answer, not a typed guess. */
  domain: string | null;
  /** The Workspace admin who consented. Null if Google omitted it. */
  adminEmail: string | null;
  /** What Google actually granted, which is not always what we asked for. */
  scopes: string[];
  /** Unix seconds, when the consent completed. */
  connectedAt: number;
  /**
   * Set when a later call found the standing permission gone. A separate flag
   * rather than deleting the connection, because "you connected this and it
   * has stopped working" and "you never connected this" are different
   * sentences to the person reading the screen, and only one of them is
   * alarming.
   */
  needsReconnect: boolean;
}

/** What everything outside this file is allowed to see. No secrets in here. */
export interface Account {
  name: string;
  email: string;
  company: string;
  /** Unix seconds. */
  createdAt: number;
  /** Null until a Workspace admin has consented. Never carries the token. */
  google: GoogleConnectionView | null;
  /**
   * What Stripe last told us, or null because nobody has ever paid.
   *
   * The whole record rather than a view of it, unlike `google` — and the
   * difference is that there is nothing in a `Subscription` this file has to
   * keep. A customer id and a subscription id address objects in a Stripe
   * account that only our secret key can reach, so they are facts about the
   * account rather than credentials, and the routes that manage a plan need
   * them.
   *
   * Null rather than optional, so every reader has to face the case where
   * somebody has not paid. That case is the common one.
   */
  subscription: Subscription | null;
}

type AccountRow = Tables<"accounts">;
type ConnectionRow = Tables<"connections">;
type SubscriptionRow = Tables<"subscriptions">;

/** Emails are matched the way mail servers match them, and stored that way. */
const normalise = (email: string) => email.trim().toLowerCase();

const db = () => supabaseAdmin();

/* --- Sealing a refresh token ----------------------------------------------- */

/**
 * The key that the Google refresh token is encrypted with, from the
 * environment and nowhere else.
 *
 * `GOOGLE_TOKEN_ENCRYPTION_KEY`, 32 bytes, as 64 hex characters or as base64
 * that decodes to 32. Generate one with:
 *
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * The database never sees the plaintext: the token is sealed before the row is
 * written and opened only in this file. Supabase's own at-rest encryption is
 * not a substitute — anybody who can read the table (a leaked secret key, a
 * misconfigured policy, a backup) would hold a standing authorisation to
 * create accounts inside somebody else's company. Sealing app-side means the
 * table holds ciphertext that is useless without an environment variable that
 * never leaves this server.
 *
 * Not `NEXT_PUBLIC_`, not derived from anything, and deliberately not shared
 * with `SESSION_SECRET`. One key, one job.
 */
const KEY_VAR = "GOOGLE_TOKEN_ENCRYPTION_KEY";
const KEY_BYTES = 32;
/** 96 bits, which is the size GCM is specified around. */
const IV_BYTES = 12;

type KeyResult = { ok: true; key: Buffer } | { ok: false; message: string };

function encryptionKey(): KeyResult {
  const raw = process.env[KEY_VAR]?.trim() ?? "";

  if (!raw) {
    return {
      ok: false,
      message: `Google Workspace can't be connected on this deployment yet: ${KEY_VAR} isn't set, and it is what the connection is encrypted with. Rather than write one down in the clear, nothing is stored at all. Generate 32 bytes — node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" — put it in the environment, and restart the server so the value is re-read.`,
    };
  }

  /* Hex first because that is what the command above prints, then base64,
     because somebody will paste the output of `openssl rand -base64 32` and
     be entirely reasonable to expect it to work. Anything else fails the
     length check below rather than being silently truncated to a shorter,
     weaker key. */
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
 * What the ciphertext is bound to, beyond being ciphertext.
 *
 * GCM's additional authenticated data isn't encrypted; it is mixed into the
 * tag, so decryption fails unless the same value is supplied again. Passing
 * the account's email makes the sealed token *that account's* sealed token
 * rather than a portable blob — a row copied between accounts simply fails to
 * open. Unchanged from the file-store era (`v1`), deliberately: the binding is
 * to the same normalised email the account is looked up by, so nothing about
 * the move to a database changed what the string means.
 */
const aad = (accountEmail: string) =>
  Buffer.from(`craig.google.refresh-token.v1:${accountEmail}`, "utf8");

interface SealedToken {
  /** Hex. */
  ciphertext: string;
  /** Hex, 12 bytes. */
  iv: string;
  /** Hex, 16 bytes. GCM's authentication tag. */
  tag: string;
}

function seal(
  plaintext: string,
  key: Buffer,
  accountEmail: string,
): SealedToken {
  /* Fresh per seal, never derived from the account or a counter. An IV reused
     under one key is the failure that takes GCM from "authenticated
     encryption" to "the plaintexts XOR to each other". */
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
 * The token back, or `null` for every way it can fail to come back.
 *
 * A rotated key, a hand-edited row, a record moved between accounts and a
 * truncated write all land here, and none of them is distinguishable from the
 * others without saying something about the key — so all of them are `null`,
 * and the caller turns that into one honest sentence. Nothing is logged here:
 * the only interesting values in scope are the key and the plaintext.
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
       whole design exists to catch. It is a refusal, not a crash. */
    return null;
  }
}

/* --- Assembling the public shapes ------------------------------------------ */

/**
 * The connection, as a screen may see it. Field by field, and the sealed token
 * has no line here — a caller cannot ask for it, because no caller can express
 * the request.
 */
function googleView(row: ConnectionRow | undefined): GoogleConnectionView | null {
  if (!row) return null;
  return {
    domain: row.domain,
    adminEmail: row.admin_email,
    scopes: [...row.scopes],
    connectedAt: Math.floor(new Date(row.connected_at).getTime() / 1000),
    needsReconnect: row.needs_reconnect,
  };
}

/** Every status the union names, as a set, so a string off the wire is
    checkable. */
const KNOWN_STATUS = new Set<string>(SUBSCRIPTION_STATUSES);

const isStatus = (value: unknown): value is SubscriptionStatus =>
  typeof value === "string" && KNOWN_STATUS.has(value);

/**
 * A subscription off the database, checked rather than trusted.
 *
 * The status is the field this exists for: an unrecognised one must not reach
 * `entitles` as a string that happens not to match. The CHECK constraint on
 * the column makes an unknown status nearly impossible to write, but "nearly"
 * is carried by a migration nobody has written yet — dropping the record and
 * falling back to the free floor stays the conservative direction, and
 * `seatLimit` never pushes below the seats already in use.
 */
function subscriptionView(row: SubscriptionRow | null): Subscription | null {
  if (!row || !isStatus(row.status)) return null;
  return {
    customerId: row.customer_id,
    subscriptionId: row.subscription_id,
    status: row.status,
    seats: Math.max(0, Math.floor(row.seats)),
    priceId: row.price_id,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    updatedAt: row.updated_at,
  };
}

/**
 * Strips and assembles. Everything that leaves this file goes through here.
 *
 * The company is sanitised on the way out as well as on the way in, exactly as
 * the file store did it: the invite route hands this value to a Subject line
 * and a From display name, and the single exit is the one place that covers
 * every reader at once. `safeCompany` is idempotent, so a clean value costs
 * two regex passes and nothing else.
 */
function toAccount(
  row: AccountRow,
  google: ConnectionRow | undefined,
  subscription: SubscriptionRow | null,
): Account {
  return {
    name: row.name,
    email: row.email,
    company: safeCompany(row.company),
    createdAt: Math.floor(new Date(row.created_at).getTime() / 1000),
    google: googleView(google),
    subscription: subscriptionView(subscription),
  };
}

/**
 * One row with both satellites, or null. The embed makes it a single query:
 * PostgREST joins connections (many) and subscriptions (one, by its PK) off
 * the account in the same round trip.
 */
async function fetchAccount(email: string): Promise<{
  row: AccountRow;
  google: ConnectionRow | undefined;
  subscription: SubscriptionRow | null;
} | null> {
  const { data, error } = await db()
    .from("accounts")
    .select("*, connections(*), subscriptions(*)")
    .eq("email", normalise(email))
    .maybeSingle();

  if (error) throw new Error(`Reading account failed: ${error.message}`);
  if (!data) return null;

  const { connections, subscriptions, ...row } = data;
  return {
    row,
    google: connections.find((c) => c.provider === GOOGLE_PROVIDER),
    subscription: subscriptions,
  };
}

/* --- Store ----------------------------------------------------------------- */

/**
 * Whether anybody has signed up at all.
 *
 * Not a check on a *particular* account — this is "is the showcase fresh", and
 * it exists because the proxy sends every anonymous request to sign-in, which
 * on an empty instance is a form that cannot possibly succeed.
 */
export async function hasAnyAccount(): Promise<boolean> {
  const { count, error } = await db()
    .from("accounts")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`Counting accounts failed: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function getAccount(email: string): Promise<Account | null> {
  const found = await fetchAccount(email);
  return found ? toAccount(found.row, found.google, found.subscription) : null;
}

/**
 * Creates an account, or returns `null` because that email already has one.
 *
 * Two writes now — the auth user, then the account row — and the order
 * matters. The auth user goes first because it is the one with the uniqueness
 * guarantee sign-up leans on; if the row insert then fails, the user is
 * deleted again so a half-made account cannot squat on an email address. The
 * password goes to GoTrue and nowhere else: `email_confirm: true` because
 * confirmation mail is a Resend feature this deployment doesn't have yet, and
 * the sign-up gate (`signUpOpenTo`) is the actual admission control.
 *
 * `null` rather than a thrown error for a duplicate: somebody signing up twice
 * is an expected outcome of a public form, not a fault.
 */
export async function createAccount(input: {
  name: string;
  email: string;
  company: string;
  password: string;
}): Promise<Account | null> {
  const email = normalise(input.email);
  const client = db();

  const created = await client.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name.trim(), company: safeCompany(input.company) },
  });

  if (created.error) {
    /* GoTrue's "already registered" arrives as a 422 with a code rather than a
       distinct type. Anything else — Supabase down, a malformed key — is a
       real fault and deserves to be one. */
    const code = (created.error as { code?: string }).code ?? "";
    if (code === "email_exists" || created.error.status === 422) return null;
    throw new Error(`Creating the sign-in failed: ${created.error.message}`);
  }

  const { data: row, error } = await client
    .from("accounts")
    .insert({
      owner_id: created.data.user.id,
      email,
      name: input.name.trim(),
      /* Stored already sanitised, not merely trimmed — the cheapest way to make
         sure a hostile value has nowhere to be read from is never to write it
         down. */
      company: safeCompany(input.company),
    })
    .select()
    .single();

  if (error) {
    /* The row lost a race or hit a constraint. Either way the auth user must
       not survive it — an email with a password but no account would make
       sign-up report "taken" for an address sign-in then refuses. */
    await client.auth.admin.deleteUser(created.data.user.id).catch(() => {});
    if (error.code === "23505") return null;
    throw new Error(`Creating the account failed: ${error.message}`);
  }

  return toAccount(row, undefined, null);
}

/* --- The Google Workspace connection --------------------------------------- */

/**
 * Whether this deployment can store a connection at all.
 *
 * Returns the variable's *name*, never its value. The name is documentation
 * and appears in `.env.example`; the value is the only thing standing between
 * a copy of the database and somebody else's Workspace.
 */
export function googleStorageStatus(): {
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

export interface NewGoogleConnection {
  /** The standing permission. Sealed before it touches the database. */
  refreshToken: string;
  domain: string | null;
  adminEmail: string | null;
  scopes: string[];
}

export type SaveConnectionResult =
  | { ok: true; account: Account }
  | { ok: false; message: string };

/**
 * Stores a completed consent against an account, or refuses to store anything.
 *
 * Refusing is the important branch: with no key there are only two things this
 * function could do — write the refresh token in the clear, or decline — and
 * writing it in the clear is the worse failure by a wide margin, because it
 * looks like success.
 *
 * A second consent replaces the first outright rather than merging (an upsert
 * on the `(account_id, provider)` key). Google issues a refresh token only on
 * a fresh grant, so arriving here means somebody has just consented again, and
 * keeping any of the old record would mean describing a grant that no longer
 * exists. `needsReconnect` clearing itself here is the same argument: this is
 * the act that fixes it.
 */
export async function saveGoogleConnection(
  email: string,
  input: NewGoogleConnection,
): Promise<SaveConnectionResult> {
  const key = encryptionKey();
  if (!key.ok) return { ok: false, message: key.message };

  const found = await fetchAccount(email);
  if (!found) {
    return {
      ok: false,
      message:
        "That account no longer exists, so there was nothing to attach the connection to. Nothing was stored.",
    };
  }

  if (!input.refreshToken) {
    return {
      ok: false,
      message:
        "Google didn't return anything to store, so the connection was refused rather than saved half-made.",
    };
  }

  /* Sealed against the same normalised email the account is looked up by, so
     the ciphertext is only openable from this account. See `aad` above. */
  const sealed = seal(input.refreshToken, key.key, normalise(email));

  const { data: row, error } = await db()
    .from("connections")
    .upsert(
      {
        account_id: found.row.id,
        provider: GOOGLE_PROVIDER,
        token_ciphertext: sealed.ciphertext,
        token_iv: sealed.iv,
        token_tag: sealed.tag,
        domain: input.domain,
        admin_email: input.adminEmail,
        scopes: [...input.scopes],
        connected_at: new Date().toISOString(),
        needs_reconnect: false,
      },
      { onConflict: "account_id,provider" },
    )
    .select()
    .single();

  if (error) {
    return {
      ok: false,
      message: `The connection couldn't be stored: ${error.message}. Nothing was saved — connecting again is safe.`,
    };
  }

  return { ok: true, account: toAccount(found.row, row, found.subscription) };
}

export type GoogleConnectionResult =
  | {
      ok: true;
      connection: GoogleConnection;
      /**
       * Their Workspace domain, returned beside the connection because the
       * two are needed together and separating them invites the bug.
       * Never null on a stored connection: the callback refuses to store one
       * without it.
       */
      domain: string;
    }
  | {
      ok: false;
      /**
       * `not-connected` is the calm one — nobody has consented, which is where
       * every account starts. `unreadable` means a connection is on the record
       * and this process cannot open it, which is a different conversation
       * with a different person: the key changed, or the row was edited.
       */
      reason: "not-connected" | "unreadable";
      message: string;
    };

/**
 * The one way to get a usable connection out of this file.
 *
 * The only function here that ever produces a plaintext refresh token, and it
 * hands it straight to `GoogleConnection` with `accountId` set from the same
 * normalised email the row was looked up by — the token and the id it belongs
 * to are constructed together, in one expression, from one lookup.
 *
 * Never logs, and never returns the token in an error path.
 */
export async function googleConnectionFor(
  email: string,
): Promise<GoogleConnectionResult> {
  const id = normalise(email);
  const found = await fetchAccount(id);
  const stored = found?.google;

  if (!stored) {
    return {
      ok: false,
      reason: "not-connected",
      message:
        "This account hasn't connected Google Workspace yet, so nothing was attempted. A Workspace admin needs to connect it once; after that this runs on its own.",
    };
  }

  const key = encryptionKey();
  if (!key.ok) {
    return { ok: false, reason: "unreadable", message: key.message };
  }

  const refreshToken = unseal(
    { ciphertext: stored.token_ciphertext, iv: stored.token_iv, tag: stored.token_tag },
    key.key,
    id,
  );
  if (!refreshToken) {
    return {
      ok: false,
      reason: "unreadable",
      message: `The stored Google connection can't be opened on this server. That happens when ${KEY_VAR} has changed since it was saved, or when the row has been edited by hand. The connection itself is still valid at Google's end — check the key before disconnecting, because reconnecting means asking a Workspace admin to consent all over again.`,
    };
  }

  if (!stored.domain) {
    return {
      ok: false,
      reason: "unreadable",
      message:
        "The stored Google connection doesn't say which Workspace domain it belongs to, so there is no address it could create anybody at. Connect Google Workspace again — the domain comes back with the consent.",
    };
  }

  return {
    ok: true,
    connection: { accountId: id, refreshToken },
    domain: stored.domain,
  };
}

/**
 * Records that a live connection has stopped working. Flagged rather than
 * deleted, so the screen can say "this stopped working on the 4th" instead of
 * quietly reverting to a Connect button. Deliberately cheap and silent when
 * there is nothing to flag.
 */
export async function markGoogleNeedsReconnect(email: string): Promise<void> {
  const found = await fetchAccount(email);
  if (!found?.google || found.google.needs_reconnect) return;

  await db()
    .from("connections")
    .update({ needs_reconnect: true })
    .eq("id", found.google.id);
}

/**
 * Forgets the connection, which means deleting the token rather than hiding
 * it: what is left in the database after this is a table that never mentioned
 * Google. Returns whether there was anything to delete. What this does *not*
 * do is tell Google — the grant itself lives at myaccount.google.com.
 */
export async function disconnectGoogle(email: string): Promise<boolean> {
  const found = await fetchAccount(email);
  if (!found?.google) return false;

  const { error } = await db()
    .from("connections")
    .delete()
    .eq("id", found.google.id);
  if (error) throw new Error(`Disconnecting failed: ${error.message}`);
  return true;
}

/* --- The subscription ------------------------------------------------------ */

/**
 * Records what Stripe last said about this account's plan.
 *
 * The whole record replaces the whole record, never a merge — an upsert on the
 * table's primary key. There is exactly one authority on what a subscription
 * looks like, and this is not it.
 *
 * `null` for an account that no longer exists: this is called from a webhook
 * and from the return leg of checkout, and "the account was deleted while
 * somebody was paying" is a real outcome with nothing useful to say about it.
 */
export async function saveSubscription(
  email: string,
  subscription: Subscription,
): Promise<Account | null> {
  const found = await fetchAccount(email);
  if (!found) return null;

  const { data: row, error } = await db()
    .from("subscriptions")
    .upsert({
      account_id: found.row.id,
      customer_id: subscription.customerId,
      subscription_id: subscription.subscriptionId,
      status: subscription.status,
      seats: subscription.seats,
      price_id: subscription.priceId,
      current_period_end: subscription.currentPeriodEnd,
      cancel_at_period_end: subscription.cancelAtPeriodEnd,
      updated_at: subscription.updatedAt,
    })
    .select()
    .single();

  if (error) throw new Error(`Saving the subscription failed: ${error.message}`);
  return toAccount(found.row, found.google, row);
}

/**
 * The plan on this account, or null because there has never been one.
 *
 * Null covers both "no account" and "no subscription", and folding them is
 * right here: every caller is asking what this account may do, and an account
 * that doesn't exist may do exactly what an account that has never paid may
 * do. Note what this does *not* do: ask Stripe. It reads what we were last
 * told, because it gates a page that must not stop working when a payments
 * provider has a bad afternoon.
 */
export async function subscriptionFor(
  email: string,
): Promise<Subscription | null> {
  const found = await fetchAccount(email);
  return subscriptionView(found?.subscription ?? null);
}

/**
 * Forgets the plan on this account — for the webhook that hears a subscription
 * has been deleted outright. Not the same act as a cancellation: a cancelled
 * subscription is a record with `status: "canceled"`. Returns whether there
 * was anything to forget.
 */
export async function clearSubscription(email: string): Promise<boolean> {
  const found = await fetchAccount(email);
  if (!found?.subscription) return false;

  const { error } = await db()
    .from("subscriptions")
    .delete()
    .eq("account_id", found.row.id);
  if (error) throw new Error(`Clearing the subscription failed: ${error.message}`);
  return true;
}

/**
 * Back to nothing. What the sandbox's reset button is for.
 *
 * Every account, and now every *auth user* too — GoTrue holds the other half
 * of an account, and a reset that emptied this table while the sign-ins
 * survived would make every email address permanently "taken" by a user whose
 * account no longer exists. Connections and subscriptions go by cascade, which
 * keeps the old promise: a reset that left refresh tokens behind would leave
 * the most dangerous thing here as the only survivor.
 *
 * Subscriptions being forgotten is not the same as cancelled — Stripe keeps
 * billing whoever was being billed. Anybody wiring this button to a real
 * payment account has to reckon with that; the honest fix is a cancellation at
 * Stripe, not a deletion here.
 */
export async function clearAccounts(): Promise<void> {
  const client = db();

  /* The rows go first, cascading to connections, subscriptions and joiners.
     A filter PostgREST accepts as "every row": delete needs a WHERE clause,
     and matching every UUID is the spelling. */
  const { error } = await client
    .from("accounts")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw new Error(`Clearing accounts failed: ${error.message}`);

  /* Then the auth users, page by page. The showcase holds a handful, so one
     page is the loop's normal life; the loop exists so a reset can't silently
     leave user 51 behind. */
  for (;;) {
    const { data, error: listError } = await client.auth.admin.listUsers({
      page: 1,
      perPage: 50,
    });
    if (listError || data.users.length === 0) break;
    await Promise.all(
      data.users.map((user) =>
        client.auth.admin.deleteUser(user.id).catch(() => {}),
      ),
    );
    if (data.users.length < 50) break;
  }
}
