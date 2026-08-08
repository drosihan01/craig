import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

/* Type-only, and it has to stay that way. `@/lib/google/auth` reads the OAuth
   client secret at module scope-adjacent call sites and is `server-only`; a
   value import here would drag it into every module graph that touches the
   account store, for a shape that costs nothing at runtime. `import type` is
   erased entirely, so this is a promise about the shape and nothing more. */
import type { GoogleConnection } from "@/lib/google/auth";
import { SUBSCRIPTION_STATUSES } from "./contract";
import type { Subscription, SubscriptionStatus } from "./contract";
import { constantTimeEqual } from "./session";
import { safeCompany } from "./sign-up";

/**
 * The accounts, and where they actually live.
 *
 * They used to be two environment variables, which meant the account existed
 * before anybody made it and could never be unmade. Then it was one account,
 * created by signing up but still standing in for a particular person. It's
 * neither now: whoever arrives types their own name, their own email and their
 * own company, and that becomes their account. The showcase stopped being a
 * story about somebody and became a product you can use.
 *
 * In memory, like every other store in this repo, because there is still no
 * database and inventing one here would be the tail wagging the dog. The
 * consequence is real and belongs on screen rather than in a comment: a server
 * restart takes every account with it. The sign-up page says so.
 *
 * Keyed by lowercased email, and `createAccount` refuses a key it already
 * holds rather than overwriting. "Sign up again" must not be a way to take an
 * account off whoever holds it, and a store whose create is quietly an upsert
 * is a store that will one day let somebody do exactly that.
 */

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
   * them. If a secret ever does land on this record, it gets a view of its own
   * and this field stops being a passthrough.
   *
   * Null rather than optional, so every reader has to face the case where
   * somebody has not paid. That case is the common one.
   */
  subscription: Subscription | null;
}

/**
 * The refresh token as it sits on disk: AES-256-GCM, never plaintext.
 *
 * All three parts are needed to get it back and none of them is a secret on
 * its own. The IV is fresh per seal and is meant to be stored beside the
 * ciphertext — reusing one under the same key is what breaks GCM, so it is
 * generated rather than derived. The tag is what makes this authenticated
 * encryption rather than merely encryption: without checking it, somebody who
 * could write to `.data/showcase-accounts.json` could flip bits in the
 * ciphertext and we would decrypt whatever fell out and send it to Google.
 */
interface SealedToken {
  /** Hex. */
  ciphertext: string;
  /** Hex, 12 bytes. */
  iv: string;
  /** Hex, 16 bytes. GCM's authentication tag. */
  tag: string;
}

/** The stored half of a connection. Only this file ever holds one. */
interface StoredGoogleConnection {
  token: SealedToken;
  domain: string | null;
  adminEmail: string | null;
  scopes: string[];
  connectedAt: number;
  /** Absent on records written before the flag existed, hence optional. */
  needsReconnect?: boolean;
}

/**
 * `Omit<Account, "google">` rather than `extends Account`, and the one field
 * they differ on is the one that matters: the record on disk holds a sealed
 * token, the record that leaves this file holds a description of a connection.
 * Writing it this way makes the compiler refuse a stored connection anywhere
 * an `Account` is expected, so the sealed token cannot be handed out by
 * somebody widening a return type.
 *
 * `subscription` is omitted for a duller reason and it is not a secret one:
 * absent and null are the same fact here, and the file has records written
 * before subscriptions existed. Optional on disk, null in memory, so nothing
 * has to migrate and nothing has to remember to write a null.
 */
interface StoredAccount extends Omit<Account, "google" | "subscription"> {
  /** Hex. Per-account, so two people choosing the same password don't collide. */
  salt: string;
  /** Hex. PBKDF2-SHA256 over the password with the salt above. */
  hash: string;
  /** Absent until somebody connects. Never leaves this file as it stands. */
  google?: StoredGoogleConnection;
  /** Absent until somebody pays, and on records written before they could. */
  subscription?: Subscription;
}

/**
 * OWASP's floor for PBKDF2-SHA256. Slow on purpose: the whole value of a
 * password hash is that checking one costs the attacker as much as it costs us,
 * and at a handful of sign-ins we can afford far more than they can.
 */
const ITERATIONS = 210_000;
const KEY_BITS = 256;
const SALT_BYTES = 16;

/**
 * The accounts hang off `globalThis`, not off a module-level `const`.
 *
 * Next bundles route handlers and server components into separate module
 * graphs, so the same import gives them different instances of this file. A
 * plain module-level Map meant `/api/auth/sign-up` created an account that
 * `/showcase/sign-in` could not see — sign-up worked, and every page still
 * believed the showcase was empty. Verified, not theorised: the route returned
 * 409 for a duplicate while the page redirected as though nothing existed.
 *
 * One process, one object, whatever the bundler does. It also survives the dev
 * server re-evaluating this module on hot reload, which otherwise signs
 * everybody out every time somebody saves a file.
 */
const STORE_KEY = "__craig_showcase_accounts__";

/**
 * Where the accounts live between runs.
 *
 * The `globalThis` slot below survives a hot reload but not a restart, so
 * until now every `next dev` signed everybody out and the account somebody
 * made five minutes ago was gone. That's fine for a demo you drive once and
 * indefensible for one somebody is actually using.
 *
 * A JSON file, not a database. There are at most a handful of accounts, the
 * whole record is already serialisable, and a dependency would be a bigger
 * decision than the problem deserves. What's stored is exactly what was in
 * memory — the password is a PBKDF2 hash and its salt, never the password —
 * so the file is no more sensitive than the process was, and it is ignored by
 * git so it can't be committed by accident.
 *
 * That claim used to be free and now has to be earned. Since this record can
 * carry a Google refresh token, a plaintext file would be a standing
 * authorisation to create accounts inside somebody else's company, sitting in
 * a working directory, surviving every restart, and readable by anything that
 * can read a file. So the token is sealed before it is written and the key
 * lives in the environment — see `GOOGLE_TOKEN_ENCRYPTION_KEY` below. The
 * sentence above stays true because of that, not in spite of it.
 */
const FILE = join(process.cwd(), ".data", "showcase-accounts.json");

/** Everything but the Map, which JSON can't carry. */
type Persisted = StoredAccount[];

function load(): Map<string, StoredAccount> {
  try {
    const raw = readFileSync(FILE, "utf8");
    const parsed = JSON.parse(raw) as Persisted;
    /* Shape-checked for the same reason the global slot is: this file outlives
       any one version of the record, and a half-written or older-shaped entry
       should cost one account rather than every page that reads the store. */
    if (!Array.isArray(parsed)) return new Map();
    return new Map(
      parsed
        .filter(
          (a): a is StoredAccount =>
            typeof a?.email === "string" && typeof a?.hash === "string",
        )
        /* The connection is re-checked field by field rather than trusted,
           and a record that fails drops the connection while keeping the
           account. The alternative — trusting whatever is in the file — means
           a half-written or hand-edited entry reaches `createDecipheriv` as
           `undefined`, which throws somewhere with no context, on a page that
           was only trying to say whether somebody is connected. Losing the
           connection costs one click to redo; losing the account costs
           everything they signed up with. */
        /* The subscription gets the same treatment for the same reason, with
           one extra consequence worth naming: a record that fails this check
           reads as no subscription, which drops the account to the free floor.
           That is survivable in the only way that matters, because `seatLimit`
           never returns fewer seats than are already taken — so a mangled row
           costs somebody an upgrade prompt they can argue with, and costs
           nobody who is half-way through onboarding their place. */
        .map((a) => [
          a.email,
          {
            ...a,
            google: readStoredGoogle(a.google),
            subscription: readStoredSubscription(a.subscription),
          },
        ]),
    );
  } catch {
    /* Missing is the normal first run, and unreadable is a file somebody
       edited by hand. Neither is worth failing a request over — starting empty
       is what would have happened anyway. */
    return new Map();
  }
}

function save(accounts: Map<string, StoredAccount>) {
  try {
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify([...accounts.values()], null, 2));
  } catch {
    /* Deliberately swallowed. A read-only disk should not turn signing up into
       a 500 — the account still exists in memory and works for this run, which
       is exactly the behaviour that existed before this file did. */
  }
}

interface AccountStore {
  /** Keyed by lowercased, trimmed email. */
  accounts: Map<string, StoredAccount>;
}

function store(): AccountStore {
  const scope = globalThis as typeof globalThis & {
    [STORE_KEY]?: Partial<AccountStore>;
  };
  const existing = scope[STORE_KEY];

  /* Shape-checked, not merely presence-checked. The slot outlives any one
     version of this file: during development the two module instances can be
     compiled from different revisions for a moment, and when this store went
     from a single account to a Map the older instance left an object of the
     older shape behind for the newer one to read. That cost an afternoon's
     confusion as a `.size of undefined` on an unrelated page, so the store
     rebuilds anything it doesn't recognise rather than trusting the key. */
  if (existing?.accounts instanceof Map) return existing as AccountStore;

  /* Read from disk once per process, here rather than at module scope: this
     runs on first use, so a build that only imports the module never touches
     the filesystem. */
  const created: AccountStore = { accounts: load() };
  scope[STORE_KEY] = created;
  return created;
}

/* --- Hashing --------------------------------------------------------------- */

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function derive(password: string, saltHex: string): Promise<string> {
  const salt = Uint8Array.from(saltHex.match(/../g) ?? [], (pair) =>
    Number.parseInt(pair, 16),
  );

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    key,
    KEY_BITS,
  );

  return toHex(new Uint8Array(bits));
}

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
 * Not `NEXT_PUBLIC_`, not derived from anything, and deliberately not shared
 * with `SESSION_SECRET`. Those two protect different things over different
 * lifetimes: rotating the session secret is a routine act that signs everyone
 * out for a minute, and if it also happened to be the encryption key it would
 * silently destroy every Google connection in the store at the same time — a
 * failure that would not surface until the next unattended workflow run, at
 * three in the morning, as a customer's new starter not getting an account.
 * One key, one job.
 *
 * Read on every call rather than cached, for the same reason `oauthClient()`
 * is: adding the variable and restarting should be the whole of the setup
 * loop. It is one string read and a 32-byte decode.
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
     weaker key — `Buffer.from` drops characters it doesn't recognise instead
     of complaining, which is exactly the kind of quiet degradation that would
     leave somebody encrypting under 11 bytes of entropy. */
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
 * rather than a portable blob. Without it, anybody who could edit
 * `.data/showcase-accounts.json` — or any future bug that copied a record
 * while migrating one — could move the sealed token from one row to another
 * and it would decrypt perfectly, and the next unattended workflow run would
 * create a new starter inside the wrong company's Google Workspace. With it,
 * a moved blob simply fails to open.
 *
 * Versioned because the string is part of the ciphertext's meaning: changing
 * it invalidates every token sealed under the old one, so it must change
 * deliberately and visibly rather than as a tidy-up.
 */
const aad = (accountEmail: string) =>
  Buffer.from(`craig.google.refresh-token.v1:${accountEmail}`, "utf8");

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
 * A rotated key, a hand-edited file, a record moved between accounts and a
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

/**
 * A connection off the disk, checked rather than trusted.
 *
 * The three hex fields are all that decide whether `unseal` can be called
 * without throwing, so they are the three that are actually verified; the
 * descriptive fields are normalised to something renderable instead, because
 * a missing domain should show as "Google didn't say" rather than take the
 * connection down with it.
 */
function readStoredGoogle(value: unknown): StoredGoogleConnection | undefined {
  if (!value || typeof value !== "object") return undefined;
  const stored = value as Partial<StoredGoogleConnection>;
  const token = stored.token;

  if (
    !token ||
    typeof token.ciphertext !== "string" ||
    typeof token.iv !== "string" ||
    typeof token.tag !== "string"
  ) {
    return undefined;
  }

  return {
    token: { ciphertext: token.ciphertext, iv: token.iv, tag: token.tag },
    domain: typeof stored.domain === "string" ? stored.domain : null,
    adminEmail:
      typeof stored.adminEmail === "string" ? stored.adminEmail : null,
    scopes: Array.isArray(stored.scopes)
      ? stored.scopes.filter((s): s is string => typeof s === "string")
      : [],
    connectedAt:
      typeof stored.connectedAt === "number" &&
      Number.isFinite(stored.connectedAt)
        ? stored.connectedAt
        : 0,
    needsReconnect: stored.needsReconnect === true,
  };
}

/** Every status the union names, as a set, so a string off disk is checkable. */
const KNOWN_STATUS = new Set<string>(SUBSCRIPTION_STATUSES);

const isStatus = (value: unknown): value is SubscriptionStatus =>
  typeof value === "string" && KNOWN_STATUS.has(value);

/**
 * A subscription off the disk, checked rather than trusted.
 *
 * The status is the field this exists for. Everything downstream branches on
 * it, and an unrecognised one — a status Stripe added after this was written,
 * or a hand-edited file — must not reach `entitles` as a string that happens
 * not to match, because the record around it would then be quietly granting the
 * seat count of a plan nobody can describe. Dropping the whole record is the
 * conservative direction: the account falls back to the free floor, which
 * `seatLimit` will not push below the number of seats already in use.
 *
 * The two ids are required for a duller reason: a subscription that cannot
 * name its customer is one the billing routes can do nothing with, and an
 * empty `cus_` handed to Stripe is a 400 raised somewhere far from here. The
 * rest is normalised rather than required, because a missing period end costs
 * a sentence on a screen and a missing seat count falls back to the floor —
 * neither is worth taking a live plan away over.
 */
function readStoredSubscription(value: unknown): Subscription | undefined {
  if (!value || typeof value !== "object") return undefined;
  const stored = value as Partial<Subscription>;

  if (
    typeof stored.customerId !== "string" ||
    !stored.customerId ||
    typeof stored.subscriptionId !== "string" ||
    !stored.subscriptionId ||
    !isStatus(stored.status)
  ) {
    return undefined;
  }

  return {
    customerId: stored.customerId,
    subscriptionId: stored.subscriptionId,
    status: stored.status,
    /* Floored at zero rather than at `FREE_SEATS`, because this is reporting
       what the record says and not deciding anything. The floor that protects
       the customer belongs in `seatLimit`, where it is argued and where both
       screens read it — a second, quieter floor here would be a place for the
       two to disagree. */
    seats:
      typeof stored.seats === "number" && Number.isFinite(stored.seats)
        ? Math.max(0, Math.floor(stored.seats))
        : 0,
    priceId: typeof stored.priceId === "string" ? stored.priceId : "",
    currentPeriodEnd:
      typeof stored.currentPeriodEnd === "number" &&
      Number.isFinite(stored.currentPeriodEnd)
        ? stored.currentPeriodEnd
        : 0,
    cancelAtPeriodEnd: stored.cancelAtPeriodEnd === true,
    updatedAt: typeof stored.updatedAt === "string" ? stored.updatedAt : "",
  };
}

/** Emails are matched the way mail servers match them, and stored that way. */
const normalise = (email: string) => email.trim().toLowerCase();

/**
 * Strips the secrets. Everything that leaves this file goes through here.
 *
 * Which is why the company name is sanitised here rather than only on the way
 * in. This store predates the rule: it is a JSON file on disk holding whatever
 * the earliest sign-ups typed, back when the field was passed through with a
 * `trim()` and nothing else. The invite route reads the company straight out of
 * here and hands it to a Subject line and a From display name, so a record
 * written last month containing a carriage return would be a header injection
 * that no amount of validation on the sign-up form could reach.
 *
 * Sanitising at the single exit covers every reader at once — the invite route,
 * the session, and whatever reads it next — and it costs two regex passes on a
 * record that is already in memory. `safeCompany` is idempotent, so doing it
 * here as well as in `createAccount` changes nothing for a clean value.
 *
 * It is also the one place that decides what a Google connection looks like
 * from outside. The parameter list is a destructure of named fields and the
 * return is an object literal of named fields, in both directions — never
 * `{ ...account }` with the secrets deleted afterwards. Those two spellings
 * behave identically today and fail in opposite directions tomorrow: add a
 * field to `StoredAccount` and a spread publishes it by default, while this
 * one leaves it behind by default. Since the field most likely to be added
 * next to that record is another credential, the default has to be "stays in
 * this file".
 */
const publicView = ({
  name,
  email,
  company,
  createdAt,
  google,
  subscription,
}: StoredAccount) =>
  ({
    name,
    email,
    company: safeCompany(company),
    createdAt,
    google: googleView(google),
    subscription: subscriptionView(subscription),
  }) satisfies Account;

/**
 * The connection, as a screen may see it.
 *
 * Field by field, and the sealed token has no line here — which is what makes
 * "the refresh token cannot leave this file" a property of the code rather
 * than a promise in a comment. Note there is nothing to opt out of and no
 * flag: a caller cannot ask for the token, because no caller can express the
 * request.
 */
function googleView(
  stored: StoredGoogleConnection | undefined,
): GoogleConnectionView | null {
  if (!stored) return null;
  return {
    domain: stored.domain,
    adminEmail: stored.adminEmail,
    scopes: [...stored.scopes],
    connectedAt: stored.connectedAt,
    needsReconnect: stored.needsReconnect === true,
  };
}

/**
 * The subscription, as anything outside this file sees it.
 *
 * Field by field rather than `{ ...stored }`, and there is nothing being
 * withheld here — the copy is the point. What leaves this file is handed to
 * pages and, through them, to props on a client component, and a shared
 * reference would let a caller edit the store's own record by assigning to a
 * field of something it was merely shown. Copying makes the record leaving here
 * a statement of what was true, which is the same thing `googleView` does for
 * the same reason.
 *
 * Absent becomes null, once, here. Every reader outside sees one shape.
 */
function subscriptionView(
  stored: Subscription | undefined,
): Subscription | null {
  if (!stored) return null;
  return {
    customerId: stored.customerId,
    subscriptionId: stored.subscriptionId,
    status: stored.status,
    seats: stored.seats,
    priceId: stored.priceId,
    currentPeriodEnd: stored.currentPeriodEnd,
    cancelAtPeriodEnd: stored.cancelAtPeriodEnd,
    updatedAt: stored.updatedAt,
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
export function hasAnyAccount(): boolean {
  return store().accounts.size > 0;
}

export function getAccount(email: string): Account | null {
  const found = store().accounts.get(normalise(email));
  return found ? publicView(found) : null;
}

/**
 * Creates an account, or returns `null` because that email already has one.
 *
 * `null` rather than a thrown error: somebody signing up twice is an expected
 * outcome of a public form, not a fault, and the caller has to handle it either
 * way.
 */
export async function createAccount(input: {
  name: string;
  email: string;
  company: string;
  password: string;
}): Promise<Account | null> {
  const { accounts } = store();
  const email = normalise(input.email);
  if (accounts.has(email)) return null;

  const salt = toHex(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
  const hash = await derive(input.password, salt);

  /* Re-checked after the await. Deriving takes a couple of hundred
     milliseconds, which is plenty of room for a second request for the same
     email to have arrived and won — and the loser silently overwriting the
     winner is the one outcome this store exists to prevent. */
  if (accounts.has(email)) return null;

  /* The company is stored already sanitised, not merely trimmed. `publicView`
     would clean it on the way out anyway, so this is about what sits on disk:
     a record containing a carriage return or a bidirectional override is a
     record that will eventually be read by something that isn't `publicView` —
     a debug script, a future export, whoever opens the JSON file — and the
     cheapest way to make sure the hostile value has nowhere to be read from is
     never to write it down. */
  const account: StoredAccount = {
    name: input.name.trim(),
    email,
    company: safeCompany(input.company),
    createdAt: Math.floor(Date.now() / 1000),
    salt,
    hash,
  };
  accounts.set(email, account);
  save(accounts);

  return publicView(account);
}

/**
 * The credential check. `null` for an unknown email, a wrong password, and an
 * empty showcase alike — the caller must not be able to tell those apart, and
 * the cheapest way to guarantee that is to not know.
 *
 * The dummy derive matters: returning early when the email isn't found would
 * make that case resolve in microseconds while a real check takes a couple of
 * hundred milliseconds. That difference is measurable over a network and turns
 * this endpoint into an oracle for which emails have accounts.
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<Account | null> {
  const candidate = store().accounts.get(normalise(email));
  const salt = candidate?.salt ?? "00".repeat(SALT_BYTES);
  const hash = await derive(password, salt);

  if (!candidate) return null;
  if (!constantTimeEqual(hash, candidate.hash)) return null;

  return publicView(candidate);
}

/* --- The Google Workspace connection --------------------------------------- */

/**
 * Whether this deployment can store a connection at all.
 *
 * The counterpart to `googleSetupStatus()` in `lib/google/config.ts`, and the
 * two answer different halves of the same question: that one says whether we
 * can *ask* a customer for permission, this one says whether we could keep
 * what they gave us. Both have to be true before a Connect button is anything
 * but a trap — a deployment with an OAuth client and no encryption key sends
 * somebody all the way to Google's consent screen, has them read a page about
 * granting us the ability to manage their users, and then refuses at the last
 * step. Far better to say so on the screen before anybody leaves the site.
 *
 * Returns the variable's *name*, never its value. The name is documentation
 * and appears in `.env.example`; the value is the only thing standing between
 * a copy of this file and somebody else's Workspace.
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
  /** The standing permission. Sealed before it touches the disk. */
  refreshToken: string;
  domain: string | null;
  adminEmail: string | null;
  scopes: string[];
}

export type SaveConnectionResult =
  { ok: true; account: Account } | { ok: false; message: string };

/**
 * Stores a completed consent against an account, or refuses to store anything.
 *
 * Refusing is the important branch and it is why this returns a result rather
 * than writing what it can. With no key there are only two things this
 * function could do: write the refresh token in the clear, or decline. Writing
 * it in the clear is the worse failure by a wide margin, and it is the one
 * that looks like success — a connection that appears in the UI, works, and
 * quietly leaves a standing authorisation over somebody else's company in a
 * plain JSON file for as long as the deployment lives. Declining costs the
 * person one confusing minute and a variable.
 *
 * A second consent replaces the first outright rather than merging. Google
 * issues a refresh token only on a fresh grant, so arriving here means
 * somebody has just consented again — usually because the old permission was
 * revoked — and keeping any of the old record would mean the domain, the
 * admin's address or the reconnect flag describing a grant that no longer
 * exists. `needsReconnect` clearing itself here is the same argument: this is
 * the act that fixes it.
 *
 * Nothing is logged. Not the token, obviously, but also not the domain or the
 * admin's address — the caller knows both and is better placed to decide what
 * to say about them.
 */
export function saveGoogleConnection(
  email: string,
  input: NewGoogleConnection,
): SaveConnectionResult {
  const key = encryptionKey();
  if (!key.ok) return { ok: false, message: key.message };

  const { accounts } = store();
  const id = normalise(email);
  const account = accounts.get(id);

  if (!account) {
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

  /* Sealed against `id`, the same normalised email this record is keyed by, so
     the ciphertext is only openable from this row. See `aad` above. */
  account.google = {
    token: seal(input.refreshToken, key.key, id),
    domain: input.domain,
    adminEmail: input.adminEmail,
    scopes: [...input.scopes],
    connectedAt: Math.floor(Date.now() / 1000),
    needsReconnect: false,
  };

  save(accounts);
  return { ok: true, account: publicView(account) };
}

export type GoogleConnectionResult =
  | {
      ok: true;
      connection: GoogleConnection;
      /**
       * Their Workspace domain, returned beside the connection because the
       * two are needed together and separating them invites the bug.
       *
       * `createUser` needs a primary email on a domain the customer's tenant
       * actually owns, so a caller holding a connection and no domain has
       * nothing it can build an address from — and the tempting substitutes
       * are all wrong: the account's own email domain is where they signed up,
       * and a domain typed into a workflow field is a domain somebody can
       * typo. This one is Google's answer, from the id token, recorded at
       * consent. Never null on a stored connection: the callback refuses to
       * store one without it.
       */
      domain: string;
    }
  | {
      ok: false;
      /**
       * `not-connected` is the calm one — nobody has consented, which is where
       * every account starts. `unreadable` means a connection is on the record
       * and this process cannot open it, which is a different conversation
       * with a different person: the key changed, or the file was edited.
       */
      reason: "not-connected" | "unreadable";
      message: string;
    };

/**
 * The one way to get a usable connection out of this file.
 *
 * The only function here that ever produces a plaintext refresh token, and it
 * hands it straight to `GoogleConnection` — the shape `lib/google` takes —
 * with `accountId` set from the same normalised email the record is keyed by.
 * That pairing is what makes "read for one account while acting for another"
 * hard to do by accident: the token and the id it belongs to are constructed
 * together, in one expression, from one lookup. A caller cannot end up holding
 * one account's token beside another's id without assembling the object
 * themselves.
 *
 * `unreadable` is deliberately not folded into `not-connected`. They look the
 * same from the calling code and are opposites to the person reading the
 * screen: one is "press Connect", the other is "the connection is still there,
 * this server just can't open it — check the key before anybody reconnects and
 * loses their grant for nothing".
 *
 * Never logs, and never returns the token in an error path.
 */
export function googleConnectionFor(email: string): GoogleConnectionResult {
  const id = normalise(email);
  const stored = store().accounts.get(id)?.google;

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

  const refreshToken = unseal(stored.token, key.key, id);
  if (!refreshToken) {
    return {
      ok: false,
      reason: "unreadable",
      /* Both causes are named and neither is claimed, because this cannot
         tell them apart: a rotated key, an edited file and a record moved
         between accounts all fail the same authentication tag. Asserting "the
         key is wrong" when the file was edited would send somebody off to
         rotate a key that was fine. */
      message: `The stored Google connection can't be opened on this server. That happens when ${KEY_VAR} has changed since it was saved, or when the account file has been edited by hand. The connection itself is still valid at Google's end — check the key before disconnecting, because reconnecting means asking a Workspace admin to consent all over again.`,
    };
  }

  /* A stored connection always has a domain — the callback refuses one that
     doesn't, because a connection with no domain can do nothing this product
     wants. A record written before that check, or edited by hand, would be the
     exception, and it is reported as unreadable rather than handed on: a
     connection that can't name a domain is one that would fail at
     `users.insert` with a `400` blaming the request. */
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
 * Records that a live connection has stopped working.
 *
 * For whatever calls Google and gets `needs-reconnect` back: the account still
 * has a refresh token, it is simply no longer honoured, and the person who
 * needs to know is a Workspace admin rather than whoever happened to trigger
 * the run. Flagged rather than deleted, so the screen can say "this stopped
 * working on the 4th" instead of quietly reverting to a Connect button and
 * leaving somebody to wonder whether they ever pressed it.
 *
 * Deliberately cheap and silent when there is nothing to flag, so a caller can
 * call it on any failure path without checking first.
 */
export function markGoogleNeedsReconnect(email: string): void {
  const { accounts } = store();
  const account = accounts.get(normalise(email));
  if (!account?.google || account.google.needsReconnect) return;

  account.google.needsReconnect = true;
  save(accounts);
}

/**
 * Forgets the connection, which means deleting the token rather than hiding it.
 *
 * The record is removed from the account and the file is rewritten without it,
 * so what is left on disk after this is a file that never mentioned Google.
 * A "disconnected" flag next to a retained token would be the version of this
 * that reads the same on screen and is a lie — the standing authorisation over
 * somebody's company would still be sitting there, one bug away from being
 * used, and the person who pressed the button would have been told otherwise.
 *
 * Returns whether there was anything to delete, which is what lets a caller
 * distinguish "disconnected" from "already was", without either being an
 * error. Note what this does *not* do: tell Google. The grant itself lives at
 * myaccount.google.com and only its owner can revoke it there — so what this
 * honestly promises is that this deployment no longer holds the credential,
 * which is the half we control.
 */
export function disconnectGoogle(email: string): boolean {
  const { accounts } = store();
  const account = accounts.get(normalise(email));
  if (!account?.google) return false;

  delete account.google;
  save(accounts);
  return true;
}

/* --- The subscription ------------------------------------------------------ */

/**
 * Records what Stripe last said about this account's plan.
 *
 * The whole record replaces the whole record, never a merge. Stripe sends the
 * subscription as it now stands, and merging would mean a field nobody
 * mentioned this time keeping a value from last time — which is how an account
 * ends up `active` with a cancelled subscription's seat count, or with the
 * period end of a plan that has since been changed. There is exactly one
 * authority on what a subscription looks like, and this is not it.
 *
 * `null` for an account that no longer exists, rather than a thrown error or a
 * result type. This is called from a webhook and from the return leg of
 * checkout, and "the account was deleted while somebody was paying" is a real
 * outcome with nothing useful to say about it — there is one way to fail and no
 * message the caller doesn't already have. The `Account` comes back on success
 * because the caller usually wants to know what the plan now is, and reading it
 * again would be a second lookup for a fact this function is holding.
 *
 * Nothing is logged. The ids are not secrets, but they are still somebody's
 * billing relationship, and the routes that call this already log what they
 * need with the context to make sense of it.
 */
export function saveSubscription(
  email: string,
  subscription: Subscription,
): Account | null {
  const { accounts } = store();
  const account = accounts.get(normalise(email));
  if (!account) return null;

  /* Copied in, for the mirror of the reason `subscriptionView` copies out: the
     caller built this object and may still be holding it, and a store whose
     record is somebody else's mutable object is a store that changes without
     anybody writing to it. */
  account.subscription = {
    customerId: subscription.customerId,
    subscriptionId: subscription.subscriptionId,
    status: subscription.status,
    seats: subscription.seats,
    priceId: subscription.priceId,
    currentPeriodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    updatedAt: subscription.updatedAt,
  };

  save(accounts);
  return publicView(account);
}

/**
 * The plan on this account, or null because there has never been one.
 *
 * Null covers both "no account" and "no subscription", and folding them is
 * right here in a way it usually isn't: every caller is asking what this
 * account may do, and an account that doesn't exist may do exactly what an
 * account that has never paid may do. `getAccount` already distinguishes them
 * for anything that needs to.
 *
 * Note what this does *not* do: ask Stripe. It is a synchronous read of what we
 * were last told, and it has to be — it is called on the way to rendering a
 * page that gates an invitation, and a payments provider having a bad afternoon
 * must not become an onboarding tool that stops working.
 */
export function subscriptionFor(email: string): Subscription | null {
  const account = store().accounts.get(normalise(email));
  return subscriptionView(account?.subscription);
}

/**
 * Forgets the plan on this account.
 *
 * For the webhook that hears a subscription has been deleted outright, and for
 * anything else that has established there is nothing left to remember. Note
 * that this is not the same act as a cancellation: a cancelled subscription is
 * a record with `status: "canceled"`, which still knows the customer id and can
 * still be shown to somebody asking what happened. This is for when the object
 * itself is gone.
 *
 * Returns whether there was anything to forget, which is what lets a caller
 * tell "cleared" from "already was" without either being an error — the same
 * shape `disconnectGoogle` returns, for the same reason.
 *
 * What it does not do is take seats away from people who have them. Nothing in
 * this file can: the limit is computed in `seatLimit`, which never returns
 * fewer seats than are already in use, so the worst this can do is stop the
 * next invitation.
 */
export function clearSubscription(email: string): boolean {
  const { accounts } = store();
  const account = accounts.get(normalise(email));
  if (!account?.subscription) return false;

  delete account.subscription;
  save(accounts);
  return true;
}

/**
 * Back to nothing. What the sandbox's reset button is for.
 *
 * Every account, not merely the newest — the showcase's argument is that it
 * starts empty and only ever contains what actually happened, and a reset that
 * left one behind would make that a claim rather than a demonstration. Sessions
 * die with them: `currentUser` refuses a session whose account has gone.
 *
 * Google connections go with the accounts they belong to, since they are a
 * field on the record and the file is deleted whole. That is the right
 * behaviour and worth saying out loud: a reset that emptied the account store
 * but left refresh tokens on disk would leave the most dangerous thing here
 * as the only survivor.
 *
 * Subscriptions go the same way, and that one is worth saying out loud for the
 * opposite reason: this forgets a plan, it does not cancel one. Stripe keeps
 * billing whoever was being billed, because Stripe is the record and this is
 * only what we were told. Anybody wiring this button to a real payment account
 * has to reckon with that; the honest fix is a cancellation at Stripe, not a
 * deletion here.
 */
export function clearAccounts(): void {
  store().accounts.clear();
  /* The file goes with them. Clearing memory alone would put every account
     back the next time the server started, which is the opposite of what the
     button says — and the way somebody discovers that is by resetting, walking
     away, and finding the showcase full again. */
  try {
    rmSync(FILE, { force: true });
  } catch {}
}
