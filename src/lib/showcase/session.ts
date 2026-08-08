import "server-only";

import type { Session } from "./contract";

/**
 * The session cookie: a signed, self-describing token. No store behind it.
 *
 * There is one account, so there is nothing to look a session id up *in* — a
 * server-side table would be a table with one row that has to be kept alive
 * between deploys for no benefit. The payload travels in the cookie and the
 * signature is what makes it trustworthy: the client can read it, and cannot
 * change a byte of it without invalidating the HMAC.
 *
 * Hand-rolled rather than `jose`, because what a JWT library buys you is
 * algorithm agility and key rotation, and this needs neither. What's left is an
 * HMAC over base64url JSON, which is short enough to read in one sitting — and
 * a dependency you can't read is a worse deal than forty lines you can.
 *
 * Web Crypto, not `node:crypto`. Proxy defaults to the Node runtime in Next 16,
 * so `node:crypto` would work today; `crypto.subtle` is in both runtimes, so
 * this keeps working if the guard ever moves to the edge. `subtle.verify` also
 * compares the digest in constant time, which is the part you don't want to be
 * responsible for writing yourself.
 */

/** Seven days. Also the cookie's Max-Age — the two must not disagree. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

/** What gets signed. `Session` plus the expiry, which callers never need. */
interface Payload extends Session {
  /** Unix seconds. */
  expiresAt: number;
}

/* --- Signing --------------------------------------------------------------- */

let keyPromise: Promise<CryptoKey> | null = null;

function signingKey(): Promise<CryptoKey> {
  if (keyPromise) return keyPromise;

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Failing loudly at first use beats signing with a fallback: a session
    // signed with a default secret is a session anyone can forge, and it looks
    // exactly like a working one.
    throw new Error("SESSION_SECRET is not set — sessions cannot be signed.");
  }

  keyPromise = crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return keyPromise;
}

/* --- base64url ------------------------------------------------------------- */

/* Plain base64 can't go in a cookie value without escaping, and escaping is a
   thing that gets done twice or not at all. base64url avoids the question. */

function encode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/* The explicit `<ArrayBuffer>` is not decoration: bare `Uint8Array` widens to
   `ArrayBufferLike`, which includes `SharedArrayBuffer`, which `crypto.subtle`
   refuses. */
function decode(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* --- Public ---------------------------------------------------------------- */

/**
 * A display name from an email, since there's no profile to read one from.
 * `sam@northgate.io` → `Sam`; `jane.doe@…` → `Jane Doe`. Only a fallback now
 * that sign-up asks for a real name — kept for a session whose account predates
 * one, and because a blank name renders worse than an approximate one.
 */
function nameFrom(email: string): string {
  const local = email.split("@")[0] ?? email;
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(" ") || email
  );
}

export async function createSession(
  email: string,
  /* The account's real name once there is an account to have one. `Session.name`
     is documented as derived from the email "when there's nothing better", and
     since sign-up asks for it directly there usually is. */
  name?: string,
): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: Payload = {
    email,
    name: name?.trim() || nameFrom(email),
    issuedAt,
    expiresAt: issuedAt + SESSION_MAX_AGE,
  };

  const body = encode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(),
    new TextEncoder().encode(body),
  );

  return `${body}.${encode(new Uint8Array(signature))}`;
}

/**
 * Verifies a token and returns what it claims, or `null`.
 *
 * Every failure — malformed, forged, expired — returns the same `null`. There
 * is nothing a caller can usefully do differently for each, and a token that
 * reports *why* it was rejected is a token that helps you tamper with it.
 */
export async function readSession(
  token: string | undefined,
): Promise<Session | null> {
  if (!token) return null;

  const [body, signature, ...rest] = token.split(".");
  if (!body || !signature || rest.length > 0) return null;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(),
      decode(signature),
      new TextEncoder().encode(body),
    );
    if (!valid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(decode(body)),
    ) as Payload;

    if (
      typeof payload.email !== "string" ||
      typeof payload.expiresAt !== "number"
    ) {
      return null;
    }
    if (payload.expiresAt <= Math.floor(Date.now() / 1000)) return null;

    return {
      email: payload.email,
      name: payload.name,
      issuedAt: payload.issuedAt,
    };
  } catch {
    // `atob` and `JSON.parse` both throw on input a user controls entirely.
    return null;
  }
}

/**
 * Compares two strings without leaking where they diverge.
 *
 * Overkill against a network attacker on one hardcoded password — but the
 * alternative is `===`, and the day this grows a second credential is not the
 * day anyone will remember to come back and fix it.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i] ^ (right[i] ?? 0);
  }
  return diff === 0;
}

/**
 * The cookie's attributes, in one place so sign-in and sign-out can't drift
 * apart — a clear that doesn't match the set leaves the cookie sitting there.
 *
 * `httpOnly` keeps it out of `document.cookie`, so an injected script can't
 * read it. `sameSite: "lax"` stops another site POSTing with it attached while
 * still allowing normal top-level navigation into the showcase. `secure` is off
 * in development only, because localhost is served over plain HTTP and a
 * `Secure` cookie there is a cookie the browser silently drops.
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;
