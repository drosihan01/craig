import { NextResponse } from "next/server";
import {
  ADMIN_TICK_PRESETS,
  AUTOMATION_BY_PRESET,
  EXTRAS_FIELDS,
  JOIN_PATH,
  JOINER_FIELD_BY_PRESET,
  type Joiner,
} from "@/lib/craig/contract";
import { currentUser } from "@/lib/craig/current-user";
import { getAccount, logoForAccount } from "@/lib/craig/accounts";
import {
  AlreadyInvitedError,
  createJoiner,
  joinerByEmail,
  deleteJoiner,
  stepsFromBlocks,
} from "@/lib/craig/joiners";
import { createJoinerToken } from "@/lib/craig/joiner-session";
import { rateLimit } from "@/lib/craig/rate-limit";
import { readableDate } from "@/lib/workflow/library";
import { findTemplate, SENDER } from "@/lib/email";
import { renderEmail } from "@/lib/email/html";
import { fromHeader, sendEmail } from "@/lib/email/send";

/**
 * Giving somebody a seat, which is the first thing in this product that
 * actually reaches a stranger.
 *
 * Everything else that sends is addressed to the person who pressed the button.
 * This one is addressed to whoever they typed, so it is the first route here
 * with the shape of an open relay — and the mitigations are the whole design of
 * the file rather than a check at the top of it:
 *
 * 1. **The words are ours.** The caller picks no template and writes no prose.
 *    One template, chosen here by name, and the only things they supply are the
 *    values that make it about a particular person — a name, a role, a date. So
 *    the worst message a determined caller can compose is a genuine invitation
 *    to a company they don't work for, which is spam nobody would pay for.
 * 2. **One recipient.** One address, checked against a shape that admits no
 *    separator and no newline, so this cannot be turned into a list.
 * 3. **Every merged value is flattened to one line and cut short.** A newline in
 *    a name is how a merge field becomes a mail header, and eighty characters is
 *    more than a job title needs and less than a message.
 * 4. **Signed in, and limited.** The session is what stands between a stranger
 *    and somebody else's provider key; the limiter is what stands between a
 *    signed-in caller and the same key, because a cookie doesn't stop a loop.
 * 5. **Capped, per account and per deployment.** The limiter answers "how fast"
 *    and answers it well; it does not answer "how much", and a patient script
 *    inside the per-minute allowance still sends thousands a day. A signed
 *    cookie is also a weak subject to cap against while sign-up is open, since
 *    a fresh account is a fresh allowance — so the ceiling that actually holds
 *    is the deployment-wide one. See `PER_DEPLOYMENT_PER_DAY` below.
 * 6. **The company name is not a header the sender controls.** It reaches a
 *    Subject line and a From display name, and it was typed at sign-up by
 *    whoever signed up. A carriage return in it is header injection; a `"` or
 *    an `@` in it is a display name impersonating somebody's bank, sent from a
 *    domain we have verified and signed. It is sanitised on the way out of the
 *    account store and again where the header is built — see the note beside
 *    the company below, and `fromHeader` in `send.ts`.
 *
 * What remains after all six is a signed-in user mailing a small number of
 * addresses of their choosing a fixed, honest invitation. That is the product,
 * and it is also the residual risk — which is why the copy is fixed and the
 * volume is capped rather than the address being trusted.
 *
 * Since the new starter got a screen of their own, this route also mints the
 * credential that reaches it. That raises the stakes on all six points above:
 * the thing being posted to a stranger is no longer only prose, it is a signed
 * token that signs the holder in as them. So the link is built here from a
 * joiner this route created, never from anything the caller sent, and it goes in
 * exactly one place — the button — because every additional copy of a bearer
 * credential is another place it can be forwarded from.
 */

/** The trigger email. Not the caller's choice — see above. */
const TEMPLATE_ID = "seat-invite";

/** Spends nothing from OpenAI's budget, and mustn't pretend otherwise — see
    the note on `spend` in rate-limit.ts. An invite that drained the chat's daily
    cap would let this button switch Craig off for the day. */
const LIMIT_OPTIONS = { spend: false } as const;

/**
 * Who gets a silent copy of every invitation.
 *
 * So the person whose product this is can read what a stranger actually
 * received, rather than trusting a green tick. The default is in code rather
 * than only in `.env.example`, because a copy that silently stops arriving when
 * an environment is missing a variable is worse than no copy at all.
 *
 * Now that the invitation carries a working link it also carries a working
 * credential, so whoever reads this mailbox can open any new starter's
 * onboarding as them. That is tolerable for one address belonging to the person
 * who runs the deployment and would not be tolerable for a shared inbox or a
 * team alias, which is the reason it stays a single address.
 */
const BCC =
  process.env.SHOWCASE_INVITE_BCC?.trim() || "dzakyayrosihan@gmail.com";

/** Longer than any real name or job title, shorter than a message. */
const MAX_FIELD = 80;

/** RFC 5321's ceiling on an address. Anything longer is not a mistake. */
const MAX_ADDRESS = 254;

/**
 * Identifiers — a workflow's, a block's, a preset's — are generated by us and
 * are never read by anybody, so they only need to be long enough not to
 * truncate a real one and short enough not to be a payload.
 */
const MAX_ID = 64;

/**
 * The most steps one invitation may carry.
 *
 * The blocks arrive in the request body because the workflow lives in the
 * browser, which means the array's length is a stranger's choice and the
 * snapshot it becomes is written to disk. Forty is several times the longest
 * onboarding anybody has built here and small enough that a hostile body can't
 * turn one invitation into a large write. Extra entries are dropped rather than
 * refused: a workflow that grew past this is still a workflow somebody should
 * be able to invite into, and the first forty steps are the ones that matter.
 */
const MAX_BLOCKS = 40;

const noStore = { "Cache-Control": "no-store" };

/* --- The sending ceiling --------------------------------------------------- */

/**
 * How much mail one account may send in a rolling day, and how much the whole
 * deployment may.
 *
 * The per-session limiter above stops a loop; it does not stop patience. Twelve
 * a minute sustained is seventeen thousand invitations a day from one cookie,
 * every one of them a real message from a verified domain that costs money to
 * send and reputation to have sent. So the limiter answers "how fast" and this
 * answers "how much", and they are different questions.
 *
 * The global number is the one that actually matters, and it exists because
 * sign-up is open. A per-account cap alone is a cap on nothing when accounts
 * are free: mint a hundred of them and you have a hundred allowances. The
 * deployment-wide ceiling is the number that holds no matter how many accounts
 * somebody creates, which makes it the one standing between this showcase and a
 * suspended Resend account.
 *
 * Both are generous for the thing this is. Somebody demonstrating the product
 * invites two or three people; a founder onboarding a real team might do twenty
 * in a week, not in a day.
 *
 * In memory and per process, which is a real limitation and belongs in writing
 * rather than in a surprise: a restart returns every allowance. That is
 * tolerable for a showcase on one machine and would not be for anything larger,
 * where this becomes the same Redis call `rate-limit.ts` describes.
 */
const PER_ACCOUNT_PER_DAY = 20;
const PER_DEPLOYMENT_PER_DAY = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * On `globalThis` for the reason spelled out at length in `accounts.ts`: Next
 * compiles route handlers into more than one module graph, and a module-level
 * `const` would give this route a fresh, empty ledger per graph — a cap that
 * silently multiplies is worse than no cap, because it reads as one in review.
 */
const LEDGER_KEY = "__craig_showcase_invite_ledger__";

interface SendLedger {
  /** Timestamps of sends, per account email, newest last. */
  byAccount: Map<string, number[]>;
  /** Timestamps of every send this process has made, newest last. */
  everyone: number[];
}

function ledger(): SendLedger {
  const scope = globalThis as typeof globalThis & {
    [LEDGER_KEY]?: Partial<SendLedger>;
  };
  const existing = scope[LEDGER_KEY];
  if (existing?.byAccount instanceof Map && Array.isArray(existing.everyone)) {
    return existing as SendLedger;
  }

  const created: SendLedger = { byAccount: new Map(), everyone: [] };
  scope[LEDGER_KEY] = created;
  return created;
}

/** Drops everything older than the window. Ordered, so it's a prefix. */
function trim(hits: number[], since: number) {
  let i = 0;
  while (i < hits.length && hits[i] < since) i += 1;
  if (i > 0) hits.splice(0, i);
}

/**
 * Whether there is room to send, and how long until there is.
 *
 * Deliberately split from `recordSend` below, which is the opposite of what
 * `rate-limit.ts` does and needs the reason stated. That file checks and records
 * together because a caller who forgets the second call is a caller who leaks.
 * Here there is one call site and a specific hazard the combined version
 * creates: a deployment with a bad Resend key would spend an account's entire
 * daily allowance on twenty failures, then refuse for a day, and the person
 * would have sent nothing at all. What this ceiling is protecting is mail that
 * actually went out, so it counts mail that actually went out.
 *
 * The loop that combined checking and recording would otherwise guard against is
 * already covered — the per-minute and per-hour limiter runs before this.
 */
function ceilingHit(email: string): { hit: boolean; retryAfter?: number } {
  const now = Date.now();
  const { byAccount, everyone } = ledger();

  trim(everyone, now - DAY_MS);
  if (everyone.length >= PER_DEPLOYMENT_PER_DAY) {
    return {
      hit: true,
      retryAfter: Math.ceil((everyone[0] + DAY_MS - now) / 1000),
    };
  }

  const mine = byAccount.get(email);
  if (mine) trim(mine, now - DAY_MS);
  if (mine && mine.length >= PER_ACCOUNT_PER_DAY) {
    return {
      hit: true,
      retryAfter: Math.ceil((mine[0] + DAY_MS - now) / 1000),
    };
  }

  return { hit: false };
}

/** Called only after Resend has accepted the message. */
function recordSend(email: string) {
  const now = Date.now();
  const { byAccount, everyone } = ledger();

  everyone.push(now);
  const mine = byAccount.get(email) ?? [];
  mine.push(now);
  byAccount.set(email, mine);

  /* Accounts that stopped sending shouldn't sit in the map forever. Swept on
     write rather than on a timer, so there is no interval to leak — the same
     reasoning as the sweep in `rate-limit.ts`. */
  if (byAccount.size > 64) {
    for (const [key, hits] of byAccount) {
      if (hits.length === 0 || hits[hits.length - 1] < now - DAY_MS) {
        byAccount.delete(key);
      }
    }
  }
}

/**
 * One sentence for both ceilings, on purpose.
 *
 * Telling somebody whether they hit their own limit or the deployment's would
 * tell them how many other people are sending and how much room is left, which
 * is a number worth knowing only to somebody deciding whether it is worth
 * carrying on.
 */
const CEILING_REACHED =
  "That's as many invitations as can go out today. Try again tomorrow.";

/**
 * A caller-supplied value, as one harmless line.
 *
 * Control characters first, whitespace second. A newline is caught by either,
 * but the unprintable ones either side of it — NUL, and the C0 range generally
 * — are only caught by the first, and those are the characters that survive a
 * naive trim and end up in a header.
 */
function oneLine(value: unknown, max = MAX_FIELD): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * One address, or nothing.
 *
 * Deliberately two tests rather than one long expression. The shape check is
 * the usual "something, an @, something with a dot" — permissive, because
 * addresses are stranger than people think and refusing a real one is a bug the
 * person can't work around. The forbidden set is the part that matters: comma
 * and semicolon are how one field becomes several recipients, angle brackets
 * and quotes are how it becomes a display name wrapping somebody else's
 * address, and whitespace covers every newline that turns a value into a
 * header. An apostrophe is allowed through, because o'brien@ is a person.
 */
function oneAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const address = value.trim();

  if (address.length === 0 || address.length > MAX_ADDRESS) return null;
  if (/[\s,;<>"\\\u0000-\u001f\u007f]/.test(address)) return null;
  if (!/^[^@]+@[^@]+\.[^@]{2,}$/.test(address)) return null;

  return address;
}

/**
 * The workflow's blocks, as much of each one as a person's onboarding needs.
 *
 * They have to come up on the request. The workflow itself lives in the
 * browser's store — there is no server-side copy to read one out of — so the
 * only way this route can know what the new starter will be asked for is to be
 * told, and being told by a client means being told by whoever is holding the
 * client. Hence the same treatment every other field gets, one layer down.
 *
 * Malformed entries are skipped rather than refused. The array is a snapshot of
 * a canvas somebody has been dragging things around on, and one block that
 * arrives without a title should cost that block rather than the invitation —
 * the person is still starting on Monday. What it must not do is arrive
 * *silently* empty, which is why the caller checks the result rather than this.
 *
 * Two things are load-bearing beyond the trimming:
 *
 * Ids are de-duplicated, because a step is answered by id. Two steps sharing one
 * would make the second unreachable forever — `completeStep` finds the first and
 * stops — and it would look like a screen that ignores you rather than like bad
 * data.
 *
 * A preset survives if it names a step somebody can actually complete — one the
 * new starter answers (`JOINER_FIELD_BY_PRESET`), one the admin ticks off
 * (`ADMIN_TICK_PRESETS`), or one Craig runs himself (`AUTOMATION_BY_PRESET`).
 * All three, and it has to be all three: keeping only the first meant every
 * admin step arrived with its preset stripped, so `stepsFromBlocks` gave it no
 * `actor`, and work the company had to do showed up on the new starter's screen
 * as "nobody's waiting on you" and never appeared as a tick on the admin's. The
 * step existed and neither side owned it. The automated ones fail the same way
 * and worse: a Google Workspace block whose preset was dropped here becomes a
 * step that nothing will ever run, and the symptom is not an error — it is an
 * account that silently never gets created.
 *
 * This list is the one place three separate facts about presets have to be kept
 * in step, and the coupling is worth naming: adding a preset to any of those
 * three collections without adding it here produces a block that looks correct
 * on the canvas, invites correctly, and then does nothing.
 *
 * `Object.hasOwn` on the map rather than `in`, because it is a plain object
 * literal: a preset of `constructor` or `toString` would look up to something
 * inherited from `Object.prototype` and put a function where a `JoinerField`
 * belongs — a step claiming a form nobody can render. The set needs no such
 * care, which is half the reason it is a `Set`.
 *
 * Presets that are neither are dropped to `undefined` rather than the block
 * being dropped: those steps are real work that simply isn't anybody's here,
 * `stepsFromBlocks` keeps them for exactly that reason, and it never reads a
 * preset for anything else.
 */
function blocksFrom(value: unknown) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const blocks: {
    id: string;
    title: string;
    kind: string;
    preset?: string;
    due?: number;
    config?: Record<string, string>;
    extras?: string[];
  }[] = [];

  for (const entry of value.slice(0, MAX_BLOCKS)) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;

    const id = oneLine(raw.id, MAX_ID);
    const title = oneLine(raw.title);
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);

    const preset = oneLine(raw.preset, MAX_ID);

    /* A whole number of days, within a year either side. It ends up in
       arithmetic on a date, so a string, a fraction or an Infinity would
       produce an `Invalid Date` on somebody's checklist rather than an error
       anyone would see — and a deadline eight thousand years out is not a
       deadline, it is a number that got through. */
    const rawDue = raw.due;
    const due =
      typeof rawDue === "number" &&
      Number.isInteger(rawDue) &&
      rawDue >= -365 &&
      rawDue <= 365
        ? rawDue
        : undefined;

    /* An allowlist of one, not the block's whole config.
       
       Everything else a block holds is either the admin's own notes or a value
       only the editor renders, and none of it is read by a run — copying it all
       onto the joiner would put settings nobody consults into a record about a
       person. `require-mfa` is here because it changes what "done" means, which
       is the only kind of setting a step needs to carry. */
    const rawConfig =
      raw.config && typeof raw.config === "object"
        ? (raw.config as Record<string, unknown>)
        : undefined;
    const requireMfa = oneLine(rawConfig?.["require-mfa"], MAX_ID);

    blocks.push({
      id,
      title,
      due,
      /* Two allowlists over the same incoming config, kept apart because they
         answer different questions: `config` carries the keys that change what
         "done" means for a step Craig runs, `extras` carries the ids that
         change which fields a person is shown. Neither trusts the block's
         config wholesale. */
      config: requireMfa ? { "require-mfa": requireMfa } : undefined,
      extras: extrasFrom(raw.config),
      kind: oneLine(raw.kind, MAX_ID),
      preset:
        Object.hasOwn(JOINER_FIELD_BY_PRESET, preset) ||
        ADMIN_TICK_PRESETS.has(preset) ||
        Object.hasOwn(AUTOMATION_BY_PRESET, preset)
          ? preset
          : undefined,
    });
  }

  return blocks;
}

/**
 * The ticks on a block that change what the *new starter* is asked.
 *
 * Two multiselects qualify today — the emergency contact on the personal
 * details block, and the super fund and tax file number on the payroll one —
 * and this reads them without knowing what any of the ids mean. It takes ids
 * from the named fields, drops anything that isn't a short string, and caps the
 * list; the meaning is decided in `stepsFromBlocks`, which is also where the
 * field each id belongs to is decided.
 *
 * **Read from both names and merged, rather than switched on the preset.** The
 * sanitiser has no business knowing which block it is looking at: a block only
 * ever holds one of these two config keys, and `stepsFromBlocks` refuses an id
 * against the wrong field anyway — so a request that put an emergency-contact
 * tick in the payroll list would arrive here, survive, and then be dropped by
 * the one check that can actually tell it is wrong. One rule, in one place.
 *
 * The rest of `config` deliberately does not travel. A block's setup is the
 * admin's own working — which template, who countersigns, which channels — and
 * it belongs to the workflow rather than to the snapshot of somebody's
 * onboarding. Copying all of it "in case" would put values nobody has thought
 * about into a row that a stranger's screen renders.
 */
function extrasFrom(value: unknown): string[] | undefined {
  if (!value || typeof value !== "object") return undefined;

  const config = value as Record<string, unknown>;
  const ids: string[] = [];

  for (const key of EXTRAS_FIELDS) {
    const raw = config[key];
    if (!Array.isArray(raw)) continue;

    for (const entry of raw.slice(0, 8)) {
      const id = oneLine(entry, MAX_ID);
      if (id && !ids.includes(id)) ids.push(id);
    }
  }

  return ids.length > 0 ? ids : undefined;
}

/**
 * Where the link in the email should point.
 *
 * Derived from the request, so the same code works on localhost, on a preview
 * deployment and in production without anybody remembering to set a variable —
 * and a link that points at the wrong host is a link that cannot be recovered
 * from, because it has already been sent.
 *
 * The override exists because the request's own host is, in the general case,
 * attacker-controlled: a `Host` header is just a header, and behind a proxy that
 * forwards one without checking it, this route would happily mail a stranger a
 * valid onboarding token pointed at somebody else's server. Next resolves
 * `request.url` from the forwarded host when it trusts the proxy in front of it,
 * which covers the deployments this actually runs on; `SHOWCASE_ORIGIN` is the
 * answer for one it doesn't, and setting it removes the header from the decision
 * entirely.
 */
function originOf(request: Request): string {
  const configured = process.env.SHOWCASE_ORIGIN?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  return new URL(request.url).origin;
}

const refuse = (error: string, status: number) =>
  NextResponse.json({ ok: false, error }, { status, headers: noStore });

/* --- Taking the seat back when the invitation never leaves ------------------ */

/**
 * Undo the row, and say honestly whether it went.
 *
 * The compensating half of the create-then-send order below. It is the only
 * thing standing between a failed send and a person sitting in People holding a
 * seat, a workflow snapshot and a magic link that nobody ever received — so
 * what matters most about it is that it cannot itself throw. A cleanup that
 * fails the request it is cleaning up after would replace a leaked row with a
 * leaked row *and* an unhandled 500, which is strictly worse.
 *
 * `false` covers both ways of not knowing: a store that refused, and a delete
 * that matched nothing. The second is a contradiction — this id came back from
 * an insert seconds ago — and the pessimistic reading is the right one, because
 * the only cost of claiming a seat might be left behind is that somebody looks
 * at People and finds it already tidy.
 *
 * One attempt, deliberately. The failure this is guarding against is almost
 * never independent: the reason the send didn't land is usually that this
 * process can't reach anything right now, and Supabase is the other thing it
 * can't reach. A retry fifty milliseconds later fails with it, and the request
 * is already up to ten seconds old with somebody watching a spinner. What makes
 * this recoverable is not a second attempt — it is the log line here and the
 * sentence in the response, which together turn an invisible leak into a row
 * somebody has been told to remove.
 */
/**
 * Undo a seat this request created, when the email it exists for never went.
 *
 * Only ever a seat *this request* created. A resend that fails must leave the
 * row alone: it was already there, somebody may already be halfway through
 * their onboarding behind it, and deleting it because a second email bounced
 * would destroy exactly what the resend path was built to protect. Hence the
 * flag rather than a bare id — the two call sites below run on both paths, and
 * the difference between them is not visible from a joiner id.
 */
async function withdrawSeat(
  joinerId: string,
  { created }: { created: boolean },
): Promise<boolean> {
  if (!created) return false;
  return withdrawCreatedSeat(joinerId);
}

async function withdrawCreatedSeat(joinerId: string): Promise<boolean> {
  try {
    const removed = await deleteJoiner(joinerId);
    if (!removed) {
      console.error(
        `[showcase/invite] seat ${joinerId} was created and then not found to remove`,
      );
    }
    return removed;
  } catch (cause) {
    /* The id is the whole point of this line. Without it the leak is a fact
       with no address; with it, whoever reads the log can remove exactly one
       row. */
    console.error(
      `[showcase/invite] left a seat behind for joiner ${joinerId}:`,
      cause,
    );
    return false;
  }
}

/**
 * What the admin is told about the state of their own account.
 *
 * Appended to whatever went wrong rather than replacing it, because the two
 * halves answer different questions: the provider's sentence says why no email
 * went out, and this says whether the server is now as they left it. A failure
 * message that only answered the first would leave the second to be discovered
 * by scrolling People, which is exactly how the leak this route used to have
 * stayed invisible.
 *
 * The unhappy sentence names the person and names the fix, because it is the
 * only notice anybody will ever get: nothing else in the product knows this
 * row is wrong, and a row that looks like every other seat is not something
 * anybody would think to delete a week later.
 */
function aftermath(
  removed: boolean,
  name: string,
  { resent }: { resent: boolean },
): string {
  /* A failed resend changed nothing, and saying so is the whole reassurance
     the admin needs: the seat they were trying to protect is still there,
     still holding whatever the new starter has already filled in, and the only
     thing that didn't happen is a second email. Telling them to delete
     anything here would talk them straight into the loss this path exists to
     prevent. */
  if (resent) {
    return `${name}'s seat and everything they've already filled in are untouched — try sending again once that's sorted.`;
  }
  return removed
    ? "No seat was taken and nothing was left behind, so you can invite them again once that's sorted."
    : `${name}'s seat was created before the email failed and couldn't be taken back — use Send again from People rather than inviting them a second time, or they'll hold a seat against an invitation nobody received.`;
}

export async function POST(request: Request) {
  const session = await currentUser();
  if (!session) return refuse("Not signed in.", 401);

  const limit = await rateLimit(`showcase-invite:${session.email}`, LIMIT_OPTIONS);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: limit.message ?? "Too many invitations at once." },
      {
        status: 429,
        headers: limit.retryAfter
          ? { ...noStore, "Retry-After": String(limit.retryAfter) }
          : noStore,
      },
    );
  }

  /* Checked before the body is even read. Nothing below this line is free —
     it writes a joiner to disk, mints a bearer token and calls a paid API — and
     an account that has spent its allowance should not be able to make this
     route do any of that. */
  const ceiling = ceilingHit(session.email);
  if (ceiling.hit) {
    return NextResponse.json(
      { ok: false, error: CEILING_REACHED },
      {
        status: 429,
        headers: ceiling.retryAfter
          ? { ...noStore, "Retry-After": String(ceiling.retryAfter) }
          : noStore,
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse("Expected JSON.", 400);
  }

  const input = (body ?? {}) as Record<string, unknown>;

  const name = oneLine(input.name);

  const to = oneAddress(input.email);
  if (!to) return refuse("That doesn't look like an email address.", 400);

  /* An explicit press, not an inference. `true` only, so a stray string or a
     truthy number cannot turn a first invitation into a resend against
     somebody else's seat.

     Read before the validation below because it changes what this request is
     required to carry. A resend is "send this person's link again" and the
     only thing it needs to name is the person: their start date, their role
     and their steps are already on the row, and demanding the admin re-supply
     them would mean the Send again button could only work from a screen that
     happened to have the whole workflow loaded. */
  const resendRequested = input.resend === true;

  /* A resend takes the name off the row instead, for the same reason it takes
     the start date off the row: the person already exists, and the record is
     what their own screen shows them. */
  if (!name && !resendRequested) return refuse("Enter their name.", 400);

  /* Both spellings of the same day are kept. The email wants "Monday 24
     August", and the record kept for the new starter wants the `YYYY-MM-DD` it
     came as — a stored date that has already been through a formatter is a date
     nothing downstream can compare, sort or re-render in anybody else's
     locale. */
  const startISO = oneLine(input.startDate, 10);
  const startDate = readableDate(startISO);
  if (!startDate && !resendRequested) {
    return refuse("Pick the day they start.", 400);
  }

  const role = oneLine(input.role);
  const workflowId = oneLine(input.workflowId, MAX_ID);
  const workflowName = oneLine(input.workflowName) || "Onboarding";

  /* What this person will actually be asked for, frozen now. `stepsFromBlocks`
     drops the trigger and keeps everything else, so an empty result means the
     workflow had nothing in it but its trigger — or that the blocks never
     arrived at all.

     Refused rather than allowed through, and the refusal is the point. Sending
     somebody a warm email promising "a few things we need from you" and landing
     them on an empty checklist is the failure this would otherwise produce
     silently, on the day somebody changes how the client posts this rather than
     on the day anybody edits this file. */
  const steps = stepsFromBlocks(blocksFrom(input.blocks));
  if (steps.length === 0 && !resendRequested) {
    return refuse(
      "There's nothing in that workflow for them to do yet. Add a step, then invite them.",
      400,
    );
  }

  /* The company is read from the account, never from the request. It is the
     name the invitation is signed with, and a value the caller could set would
     let this route send a convincing welcome to a company they have nothing to
     do with — the one merge field where being wrong is a lie rather than a
     typo.

     Reading it from the account makes it *the signed-in user's* choice rather
     than *this request's*, which is a smaller hole but not a closed one: they
     typed it at sign-up, and sign-up is open. It is safe to put in a Subject
     line and a From display name because it is sanitised twice on the way here
     — by the store on the way out (`publicView` in accounts.ts, which is what
     cleans records written before there was a rule) and by `send.ts` at the
     moment it becomes a header. Neither of those is here, and that is
     deliberate: a third copy of the rule in this file is a third thing to keep
     in step. */
  const account = await getAccount(session.email);
  if (!account) return refuse("Not signed in.", 401);
  if (!account.company) {
    return refuse(
      "Your account has no company name on it, and the invitation goes out under it.",
      400,
    );
  }

  const template = findTemplate(TEMPLATE_ID);
  if (!template) {
    return refuse("The invitation template is missing.", 500);
  }

  /**
   * The person exists before the email does, and everything from here to the
   * send is inside a guard that takes them back out again.
   *
   * The order is forced: the link is derived from their id, so there is nothing
   * to put in the message until the record is written. What is *not* forced is
   * what happens when the message then doesn't go, and this route used to get
   * that wrong in a way that was invisible for a good reason. The argument that
   * stood here said a leftover joiner was the cheaper failure because "the
   * client only writes the person into People on success" — and while the store
   * was a JSON file that died with the process, that was true. It is Supabase
   * now, People is rendered from `listJoiners` on the server, and the row is
   * therefore a person: in the list, holding one of five seats, carrying a magic
   * link that reached nobody, and unfixable by anyone who doesn't already know
   * they are looking at rubbish. Inviting them again makes a second one.
   *
   * So: create, send, and delete the row if the send fails. The two rejected
   * alternatives are worth writing down because both are defensible and neither
   * survives being costed.
   *
   * *Send first, then create.* Buildable — mint the UUID here instead of letting
   * Postgres do it, sign the token against it, send, then insert with that id.
   * It fails worse. A single store failure after a successful send puts a real
   * invitation in a stranger's inbox pointing at a joiner that does not exist,
   * and it leaves this route with nothing true to say: the send succeeded, so
   * "it didn't send" is a lie, and "it sent" promises a link that 404s. The
   * order below needs *two* independent failures to reach a comparably bad
   * state, and it always has something honest to report.
   *
   * *A status column — write the row `pending`, flip it to `invited` on
   * success.* This is the right answer for a system that wants an audit trail of
   * attempts, and it is the wrong one here. It is a schema change plus a new
   * rule that every existing reader of the table has to learn — the seat count
   * on the home page, People, the workflow editor's seat list, `outstanding.ts`,
   * the paywall — and the first reader that forgets to filter reproduces
   * precisely this bug wearing a new column. A row that exists or doesn't needs
   * no reader to be taught anything.
   *
   * The guard starts *here* rather than around `sendEmail`, and that is not
   * tidiness. `createJoinerToken` throws outright when `SESSION_SECRET` is
   * missing, and a throw between the insert and the send leaves exactly the same
   * orphan through a different door — one that would never have shown up in a
   * fix aimed only at a failed send. The window that has to be closed is "the
   * row exists and the invitation hasn't left", not "sendEmail returned false".
   *
   * What this trade costs, stated plainly rather than buried: the delete can
   * revoke an invitation that actually arrived. `unreachable` reports "nothing
   * was sent", which is optimistic for a ten-second timeout, and a 200 with no
   * id may well have delivered. In those cases a real person ends up holding a
   * dead link. That is still the better half, twice over — the link fails
   * *closed*, which is the only acceptable direction for a bearer credential we
   * have lost track of, and the admin has already been told to invite again,
   * which produces a working one. The leftover row fails open and is fixed by
   * nobody, because nobody knows it is there.
   */
  /* One seat per person, and a duplicate is an offer rather than an error.
     
     Inviting somebody who already has a seat is a normal thing for an admin to
     try — they forgot, or the person said the email never arrived — and until
     now it made a *second* joiner: a second magic link, a second checklist, and
     every answer the person had already given stranded on the row nobody was
     looking at. The database refuses that now, and this turns the refusal into
     the thing the admin actually wanted, which is another email.
     
     `resend` on the response is what tells the client to offer it. The status
     is 409 rather than 400 — this is a conflict with something that already
     exists, not a malformed request, and the difference matters to anybody
     reading logs later. */
  /* Declared before the branch so both paths land on the same send. A resend
     is the same envelope with a fresh token, and duplicating the token-minting
     and template-rendering below would be two copies of the one thing that
     must never drift — the link somebody actually receives. */
  let joiner: Joiner;

  /* Asked for by name, so a resend cannot happen by accident. An admin who
     retypes somebody already on the list gets the 409 and an offer; only a
     deliberate press comes back with `resend`, which is what stops "invite"
     quietly meaning "invite or re-invite, whichever applies". */
  if (resendRequested) {
    const existing = await joinerByEmail(account.email, to);
    if (!existing) {
      return Response.json(
        { error: "There is no invitation to resend for that address." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    /* Their row, their steps and everything they have already answered are
       left exactly as they are. That is the entire point: the only way to
       send again used to be deleting the seat, which threw away their
       answers — so an admin whose new starter never got the email had to
       choose between chasing them and keeping their work. A fresh token
       against the same row is a new envelope for the same onboarding. */
    joiner = existing;
  } else {
    try {
      joiner = await createJoiner({
        email: to,
        name,
        role,
        startDate: startISO,
        /* Whose list they appear on. From the session, never the request —
           this is the field that decides which account can read their
           progress. */
        accountEmail: account.email,
        company: account.company,
        workflowId,
        workflowName,
        steps,
      });
    } catch (failure) {
      if (failure instanceof AlreadyInvitedError) {
        return Response.json(
          {
            error: `${to} already has a seat on this onboarding.`,
            resend: true,
          },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }
      throw failure;
    }
  }

  /* Who the email is actually about. On a first invitation this is what the
     admin just typed; on a resend it is what the record already says, because
     the record is what the new starter's own screen will show them. An admin
     retyping the address to send again may well type "Sam" where the seat says
     "Samantha", and an email that greets them differently from the app they
     are about to log into is a small lie this route has no reason to tell. */
  const person = resendRequested
    ? {
        name: joiner.name,
        role: joiner.role,
        startISO: joiner.startDate,
        startDate: readableDate(joiner.startDate) ?? "",
        workflowId: joiner.workflowId,
        workflowName: joiner.workflowName,
      }
    : { name, role, startISO, startDate: startDate ?? "", workflowId, workflowName };

  /* Built rather than sent, so that the one `catch` below covers minting the
     credential and rendering the copy as well as the send itself — see the
     window described above. `null` is the only thing that leaves this block on
     a failure, because there is nothing partial worth carrying forward. */
  let message: {
    subject: string;
    html: string;
    text: string;
    fromName: string;
  } | null = null;

  try {
    /* The credential, and the only one they will ever have. Built after the
       record so it can name it, and never derived from anything in the request —
       an address, a name and a start date are all things somebody else could
       know, and a link guessable from them would be a link anybody who knows a
       new starter's details could walk in through. */
    const token = await createJoinerToken(joiner.id);
    const link = `${originOf(request)}${JOIN_PATH}?token=${encodeURIComponent(token)}`;

    /* Every token in the vocabulary, not merely the ones this template reads
       today. `render` fills anything absent from the *preview's* fixtures — so a
       token left out here doesn't arrive blank, it arrives as a stranger's name
       in somebody's real welcome email, and it does that the day the copy gains a
       merge field rather than the day anyone changes this file.

       Which is why the two with nothing real behind them at invite time are
       supplied empty. An invitation with a visible gap in it is a bug somebody
       reports; an invitation naming a person from a demo company reads as
       correct.

       `step` and `owner` are those two: an invitation is about the whole
       onboarding rather than about any one step of it, and nobody owns it but the
       person receiving it. The invitation copy is written not to use either, and
       supplying them empty is what makes that a choice rather than a dependency —
       a template that starts using one gets a blank, which is visible, instead of
       Jason's name, which isn't. */
    const values = {
      first_name: person.name.split(" ")[0],
      full_name: person.name,
      company: account.company,
      role: person.role,
      start_date: person.startDate,
      sender: session.name,
      workflow: person.workflowName,
      step: "",
      owner: "",
      link,
    };

    /* The company's own mark on the one email that reaches somebody who has
       never heard of this product. Inside the existing `try`, and
       `logoForAccount` returns null on any failure rather than throwing, so a
       logo that cannot be read costs the invitation nothing — it goes out
       looking exactly as it did before this feature existed. */
    const rendered = renderEmail(
      template,
      values,
      await logoForAccount(account.email),
    );
    message = { ...rendered, fromName: SENDER.name(account.company) };
  } catch (cause) {
    /* Server-side and nobody's fault but this deployment's — a missing
       `SESSION_SECRET` is the realistic one. The reason goes to the log rather
       than the browser for the same reason Resend's words do: it names an
       environment variable. */
    console.error("[showcase/invite] couldn't build the invitation:", cause);
  }

  if (!message) {
    const removed = await withdrawSeat(joiner.id, { created: !resendRequested });
    return NextResponse.json(
      {
        ok: false,
        seatRemoved: removed,
        error: `The invitation couldn't be prepared, so nothing was sent. ${aftermath(removed, person.name, { resent: resendRequested })}`,
      },
      { status: 500, headers: noStore },
    );
  }

  const result = await sendEmail({ to, bcc: BCC, ...message });

  /* Counted here, against the ceiling checked at the top — after Resend has
     accepted it, because this is a cap on mail that went out rather than on
     attempts to send it. See the note on `ceilingHit`. */
  if (result.ok) recordSend(session.email);

  if (!result.ok) {
    /* The seat goes back before the failure is reported, so that by the time
       anybody reads the sentence it is already true. Unconditional on the
       reason: `sendEmail`'s taxonomy is about what to *fix*, not about whether
       a message was delivered, and there is no value of `reason` that means
       "keep the row". */
    const removed = await withdrawSeat(joiner.id, { created: !resendRequested });

    /* Configuration this deployment got wrong is a 500 — the caller did nothing
       unusual and can't fix it by asking differently. A provider that refused
       or vanished is a 502. Neither ever carries Resend's own words. */
    const status =
      result.reason === "rate-limited"
        ? 429
        : result.reason === "unreachable" || result.reason === "rejected"
          ? 502
          : 500;

    return NextResponse.json(
      {
        ok: false,
        reason: result.reason,
        /* Two sentences, because there are two things they need: why no email
           went out, and whether anything is left on their account because of
           it. `seatRemoved` says the same thing in a form a client can branch
           on without reading prose. */
        error: `${result.message} ${aftermath(removed, person.name, { resent: resendRequested })}`,
        seatRemoved: removed,
      },
      {
        status,
        headers: result.retryAfter
          ? { ...noStore, "Retry-After": String(result.retryAfter) }
          : noStore,
      },
    );
  }

  /* Enough for the caller to say what happened without guessing at it, and the
     id is the part that makes "it sent" checkable against the Resend dashboard
     rather than a claim this route makes about itself. The bcc is echoed for
     the same reason: it goes to whoever runs this deployment, and it is the one
     recipient the response is the only evidence of.

     `joinerId` is separate from `id` and deliberately not named `id` itself.
     They are two identifiers for two different things — one message and one
     person — and the client already reads `id` as the message's. Overloading it
     would silently repoint every existing reader at the wrong entity, which is
     the class of change that type-checks, runs, and is wrong.

     The token is not here and must not be. The client's job is to remember
     which person it just created so it can ask after their progress; it has no
     use for the credential, and a bearer token that has been through a browser
     is a bearer token in a devtools network tab and a support screenshot. */
  return NextResponse.json(
    {
      ok: true,
      id: result.id,
      joinerId: joiner.id,
      to,
      bcc: BCC,
      /* Built by the same function the transport uses, rather than assembled
         again here. Two ways of writing the same header is how a response comes
         to describe a message that wasn't sent — and this one is shown to the
         admin as evidence of what a stranger received. */
      from: fromHeader(message.fromName, SENDER.address),
      subject: message.subject,
      resent: resendRequested,
      person: {
        name: person.name,
        role: person.role,
        startDate: person.startISO,
      },
      workflow: { id: person.workflowId, name: person.workflowName },
    },
    { headers: noStore },
  );
}
