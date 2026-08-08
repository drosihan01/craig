import "server-only";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

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

/** What everything outside this file is allowed to see. No secrets in here. */
export interface Account {
  name: string;
  email: string;
  company: string;
  /** Unix seconds. */
  createdAt: number;
}

interface StoredAccount extends Account {
  /** Hex. Per-account, so two people choosing the same password don't collide. */
  salt: string;
  /** Hex. PBKDF2-SHA256 over the password with the salt above. */
  hash: string;
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
        .map((a) => [a.email, a]),
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
 */
const publicView = ({ name, email, company, createdAt }: StoredAccount) =>
  ({
    name,
    email,
    company: safeCompany(company),
    createdAt,
  }) satisfies Account;

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

/**
 * Back to nothing. What the sandbox's reset button is for.
 *
 * Every account, not merely the newest — the showcase's argument is that it
 * starts empty and only ever contains what actually happened, and a reset that
 * left one behind would make that a claim rather than a demonstration. Sessions
 * die with them: `currentUser` refuses a session whose account has gone.
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
