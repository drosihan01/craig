import "server-only";

import { SENDER, FALLBACK_FROM } from "./templates";

/**
 * The only thing in this repo that sends.
 *
 * One POST to Resend with `fetch`, rather than the SDK. The SDK is a client
 * class, a retry policy and a dependency tree wrapped around a single HTTP
 * call, and this project has almost no dependencies on purpose — the one it
 * would add here buys nothing it doesn't already have.
 *
 * Everything that can go wrong is turned into something a person can act on
 * before it leaves this file. That is most of the work: Resend's failures are
 * accurate and useless — "The mail.craig-ob.me domain is not verified" is true
 * and says nothing about which of the two obvious fixes you want. So each
 * failure gets a name the caller can branch on and a sentence naming the next
 * move, and the provider's own text never reaches the browser. It goes to the
 * server log instead, where the person who can act on it is already looking.
 *
 * The key is read here and nowhere else. `server-only` makes importing this
 * from a client component a build error rather than a leak somebody notices in
 * a bundle six weeks later.
 */

const ENDPOINT = "https://api.resend.com/emails";

/**
 * Long enough for a slow provider, short enough that a hung connection doesn't
 * hold a request handler open. Sending is not a thing anybody waits on twice.
 */
const TIMEOUT_MS = 10_000;

/**
 * The ways this fails, named for the fix rather than for the status code.
 *
 * A caller that wants to say something different about a missing key than
 * about an unverified domain — the sandbox does — branches on this. A caller
 * that just wants to tell somebody prints `message`.
 */
export type SendFailure =
  /** No key in the environment. Nothing was attempted. */
  | "not-configured"
  /** The key exists and Resend won't take it. */
  | "bad-key"
  /** The `from` domain has no DNS records yet. The likely one. */
  | "unverified-sender"
  /** Sandbox sender, and the recipient isn't the account's own address. */
  | "sandbox-recipient"
  /** Resend won't accept the address we asked it to deliver to. */
  | "invalid-recipient"
  /** Too fast, or the monthly allowance is gone. */
  | "rate-limited"
  /** Resend understood and refused, or fell over. */
  | "rejected"
  /** The request never got an answer. */
  | "unreachable";

export type SendResult =
  | { ok: true; id: string }
  | {
      ok: false;
      reason: SendFailure;
      /** Safe to show, and specific enough to act on. */
      message: string;
      /** Seconds, when the provider says how long to wait. */
      retryAfter?: number;
    };

export interface Outgoing {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** The display name. The address it pairs with comes from `SENDER`. */
  fromName: string;
  /**
   * This message carries a credential, so no copy of its body is kept.
   *
   * The development outbox below writes every message to disk so whoever is
   * building this can read what actually went out — which is the right trade
   * for an invitation and the wrong one for a temporary password. That
   * password is deliberately stored nowhere: it is generated, put in one
   * email, and dropped. Writing the email to `.data/` would put it back,
   * in the clear, in a directory nobody remembers is there.
   *
   * The envelope is still recorded, because "did it send, to whom, when" is
   * the question the outbox exists to answer and none of it is the secret.
   */
  sensitive?: boolean;
  /**
   * A silent copy, for when somebody needs to see what actually went out.
   *
   * Blind rather than `cc`, and one send rather than two. A `cc` would put a
   * stranger's address on a new starter's welcome email, which is a small
   * privacy leak and a large "who is this?"; a second send could succeed while
   * the first failed, leaving a copy of a message nobody received.
   */
  bcc?: string;
}

/* --- Header hygiene -------------------------------------------------------- */

/**
 * The last place a value can be made safe before it is a header.
 *
 * The From display name is the customer's company, typed at sign-up by whoever
 * signed up — and sign-up is open, so that is a stranger. It is concatenated
 * into a `from` header a few lines below, which makes this file the exact point
 * where an untrusted string stops being data and becomes protocol. There is a
 * rule for the same value in `showcase/sign-up.ts` and the store applies it too;
 * this is not that rule and does not trust it. Anything that ever calls
 * `sendEmail` gets header safety whether or not it remembered to ask, because
 * the caller that forgets is the one that sends the phishing mail.
 *
 * The stripped set and the reasoning behind it are documented once, on
 * `HEADER_UNSAFE` in `showcase/sign-up.ts`. In short: CR and LF are header
 * injection, the C1 range hides a line break JavaScript's `\s` does not match,
 * and the invisible formatting characters let a display name render as
 * something it isn't.
 */
const HEADER_UNSAFE =
  /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff]/g;

/**
 * Longer than any subject worth writing, and far short of RFC 5322's 998-octet
 * line limit. A subject nobody can read past the first eighty characters of is
 * not made better by being four thousand characters long, and a header that
 * long is a header some relay in the middle will fold, refuse, or truncate
 * somewhere of its own choosing.
 */
const MAX_SUBJECT = 200;

/** A display name is a company's name, not a sentence. */
const MAX_DISPLAY_NAME = 64;

/**
 * One header value, flattened and capped.
 *
 * Sliced by code point rather than by `String.slice`, which counts UTF-16 units
 * and cuts a surrogate pair in half at the boundary — producing a lone
 * surrogate that JSON carries to Resend as an escape it is under no obligation
 * to accept.
 */
function headerLine(value: string, max: number): string {
  const flat = value.replace(HEADER_UNSAFE, " ").replace(/\s+/g, " ").trim();

  return Array.from(flat).slice(0, max).join("").trim();
}

/**
 * The From display name, and the quoting that makes it one.
 *
 * `"` and `\` go first, because the header is built as a quoted string and a
 * value that can close its own quotes can write the rest of the header. `<`,
 * `>` and `@` go with them: those are what let a display name of
 * `Acme <security@yourbank.com>` read, in every client that shows the name and
 * hides the address, as mail from that bank — and it would be leaving our
 * verified domain with our DKIM signature on it, which is the whole reason this
 * is worth a function rather than a `trim()`.
 *
 * Quoting rather than stripping punctuation is deliberate. An unquoted display
 * name containing a comma splits the header into two addresses; quoting means
 * "Acme, Inc." survives intact and correct, which is the difference between a
 * sanitiser and a thing that mangles real customers' names.
 */
export function fromHeader(displayName: string, address: string): string {
  const name = headerLine(
    displayName.replace(/["<>@\\]/g, " "),
    MAX_DISPLAY_NAME,
  );

  /* A bare address when nothing survives. A `from` of `"" <craig@…>` is a
     header with an empty display name, which some clients render as a blank
     sender — worse than no display name at all. */
  return name ? `"${name}" <${address}>` : address;
}

/** Resend's error envelope. Every field optional, because a 502 from something
    in front of Resend won't have any of them. */
interface ProviderError {
  name?: string;
  message?: string;
}

const fail = (
  reason: SendFailure,
  message: string,
  retryAfter?: number,
): SendResult => ({ ok: false, reason, message, retryAfter });

/**
 * Which failure this is, and what to do about it.
 *
 * Mostly status, because a status is a contract and a message is prose Resend
 * can reword in a release. The two message probes earn their keep by splitting
 * a status whose halves want opposite fixes, and both were read off real
 * responses rather than guessed:
 *
 * - 403 `"The mail.craig-ob.me domain is not verified"` — add DNS records.
 * - 422 `"Invalid \`to\` field. Please use our testing email address"` — the
 *   sandbox sender refusing a stranger. Nothing about the address is wrong;
 *   the fix is a different inbox or a verified domain, and telling somebody to
 *   check their address formatting would send them looking at the one thing
 *   that isn't the problem.
 *
 * Note the second is a 422, not the 403 the shape of the first suggests. The
 * probe therefore runs before any status branch: Resend has expressed this same
 * refusal both ways, and a wrong status assumption here is what turns a
 * one-line fix into an afternoon.
 */
function classify(
  status: number,
  error: ProviderError,
  retryAfter?: number,
): SendResult {
  const text = `${error.name ?? ""} ${error.message ?? ""}`.toLowerCase();

  if (status === 401 || text.includes("api_key")) {
    return fail(
      "bad-key",
      "Resend rejected the API key. Check RESEND_API_KEY in .env.local — a revoked key and a key copied a character short look the same from here — then restart the dev server so it's re-read.",
    );
  }

  if (text.includes("testing email") || text.includes("own email")) {
    return fail(
      "sandbox-recipient",
      `${SENDER.address} is Resend's shared sandbox sender, and it only delivers to the address that owns the Resend account. Point NEXT_PUBLIC_CRAIG_TEST_INBOX at that address, or verify a domain and send anywhere.`,
    );
  }

  if (status === 403) {
    return fail(
      "unverified-sender",
      `Resend won't send from ${SENDER.address} — that domain has no verified DNS records. Add them at resend.com/domains, or set NEXT_PUBLIC_CRAIG_MAIL_FROM=${FALLBACK_FROM} to send from the sandbox address until they're in.`,
    );
  }

  if (status === 429) {
    return fail(
      "rate-limited",
      retryAfter
        ? `Resend is rate limiting this key. Try again in ${retryAfter}s.`
        : "Resend is rate limiting this key — either too many sends in a moment, or the plan's allowance is spent for the month.",
      retryAfter,
    );
  }

  if (status === 422 || status === 400) {
    if (text.includes("`to`") || text.includes("recipient")) {
      return fail(
        "invalid-recipient",
        "Resend won't accept that recipient address. Check NEXT_PUBLIC_CRAIG_TEST_INBOX is a complete, well-formed address.",
      );
    }

    return fail(
      "rejected",
      "Resend refused the message as malformed. The full reason is in the server log.",
    );
  }

  if (status >= 500) {
    return fail(
      "rejected",
      "Resend is having a problem at their end. Nothing to fix here; try again shortly.",
    );
  }

  return fail(
    "rejected",
    `Resend refused the message (${status}). The full reason is in the server log.`,
  );
}

/**
 * Sends one email. Never throws — every outcome is a `SendResult`, because a
 * caller that has to remember a try/catch around a network call is a caller
 * that will one day forget.
 */
/**
 * Every message, written to disk as it goes out. Development only.
 *
 * Because there is no inbox anyone here can read. The provider's test
 * addresses accept mail and simulate an outcome, but nothing can open them,
 * and its retrieve-a-message API is refused by a send-only key — so the only
 * way to check what an email actually said was to send it to somebody's real
 * address and ask them.
 *
 * That is a slow loop and a rude one, and it gets worse the moment an email
 * carries something you need *out* of it: the new starter's invitation
 * contains a sign-in link, and testing that flow meant a person copying a URL
 * out of their own inbox by hand.
 *
 * So this is the outbox. It is not a mock and it does not replace sending —
 * the real send still happens and its result is still what the caller sees.
 * It only keeps a copy, which makes the message readable by whoever is working
 * on it, and doubles as a preview of what the template renders to.
 *
 * Never in production: the files would accumulate unbounded on a real
 * deployment, and the copies would be full of other people's personal details
 * sitting in a directory nobody remembered was there.
 */
async function keepCopy(message: Outgoing, id: string | null) {
  if (process.env.NODE_ENV === "production") return;

  try {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");

    const dir = join(process.cwd(), ".data", "outbox");
    await mkdir(dir, { recursive: true });

    /* Sortable, and unique without a counter. The recipient is in the name so
       a directory listing answers "did it go to the right person" without
       opening anything. */
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const who = message.to.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const base = join(dir, `${stamp}-${who}`);

    await writeFile(`${base}.html`, message.html, "utf8");
    await writeFile(
      `${base}.json`,
      JSON.stringify(
        /* The headers as sent, not as asked for. This copy is how somebody
           checks what actually left the building, so recording the caller's raw
           `fromName` here would make the outbox agree with the request and
           disagree with the inbox — and the sanitiser it exists to let you
           verify would be the one thing it couldn't show you. */
        {
          id,
          to: message.to,
          bcc: message.bcc,
          from: fromHeader(message.fromName, SENDER.address),
          subject: headerLine(message.subject, MAX_SUBJECT),
          text: message.text,
          sentAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch {
    /* Swallowed on purpose. Keeping a copy is a convenience for whoever is
       building this; failing the send because the copy couldn't be written
       would let a development aid break the thing it exists to observe. */
  }
}

export async function sendEmail(message: Outgoing): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    return fail(
      "not-configured",
      "No RESEND_API_KEY in .env.local, so nothing was attempted. Add a key from resend.com/api-keys and restart the dev server.",
    );
  }

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        /* Display name and address as one header. The name is the customer's
           and the address is ours — see SENDER for why they differ, and
           `fromHeader` for why the customer's half is never interpolated raw. */
        from: fromHeader(message.fromName, SENDER.address),
        to: [message.to],
        /* Left out entirely when there isn't one, rather than sent as an empty
           array — a field Resend has to interpret is a field it can refuse. */
        ...(message.bcc ? { bcc: [message.bcc] } : {}),
        reply_to: SENDER.replyTo,
        /* Flattened here as well as at the caller, because the subject is the
           other header the company name reaches: the invitation's is literally
           "Welcome to {{company}} — …", so a newline in a company name would be
           a second header of the sender's choosing on a message signed by our
           domain. Callers merge the value; this is the only place that knows it
           is about to become protocol. */
        subject: headerLine(message.subject, MAX_SUBJECT),
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    /* No response at all: DNS, offline, or the timeout above. Logged without
       the request, because the request carries the key in a header. */
    console.error("[api/email] resend unreachable:", cause);
    return fail(
      "unreachable",
      "Couldn't reach Resend — no network, or the request timed out. Nothing was sent, and nothing was charged.",
    );
  }

  /* Read as text and parse by hand: an error from a proxy in front of Resend is
     HTML, and `response.json()` on it throws a parse error that reads like a
     bug in this file. */
  const raw = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const error = (payload ?? {}) as ProviderError;
    const header = response.headers.get("retry-after");
    const retryAfter = header ? Number(header) : undefined;

    /* The one place the provider's own words are kept, and it's a place no
       browser can read. Without this, "the full reason is in the server log"
       would be a lie. */
    console.error(
      `[api/email] resend ${response.status}:`,
      error.message ?? raw.slice(0, 200),
    );

    return classify(
      response.status,
      error,
      Number.isFinite(retryAfter) ? retryAfter : undefined,
    );
  }

  const id = (payload as { id?: unknown }).id;
  if (typeof id !== "string" || !id) {
    /* A 200 with no id means the contract changed under us. Reporting success
       here would be worse than reporting this failure: the mail may well have
       gone, and the caller would have nothing to look it up by. */
    console.error(
      "[api/email] resend accepted without an id:",
      raw.slice(0, 200),
    );
    return fail(
      "rejected",
      "Resend accepted the message but didn't return an id. It may have sent — check the Resend dashboard rather than sending again.",
    );
  }

  /* After the send, not instead of it, and awaited so a caller that checks the
     outbox straight afterwards finds it there. */
  await keepCopy(message, id);

  return { ok: true, id };
}
