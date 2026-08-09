import "server-only";

/**
 * The signing utilities behind Craig's own tokens.
 *
 * The admin's session no longer lives here — Supabase Auth owns it, cookies
 * and rotation and all (see `lib/supabase/server.ts` and `current-user.ts`).
 * What stays is everything that was never really about the admin: the HMAC
 * key, the base64url pair, and the constant-time comparison. Two token
 * families still rest on them — the new starter's magic link
 * (`joiner-session.ts`) and the Google OAuth state cookie (`google-state.ts`) —
 * and both are deliberately *not* Supabase sessions: a joiner has no account
 * on purpose, and an OAuth state nonce is a ten-minute fact about one
 * redirect, not an identity.
 *
 * Hand-rolled rather than `jose`, still: what a JWT library buys is algorithm
 * agility and key rotation, and these tokens need neither. An HMAC over
 * base64url JSON is short enough to read in one sitting — and a dependency
 * you can't read is a worse deal than forty lines you can.
 *
 * Web Crypto, not `node:crypto`. Proxy defaults to the Node runtime in Next
 * 16, so `node:crypto` would work today; `crypto.subtle` is in both runtimes,
 * so this keeps working if a guard ever moves to the edge. `subtle.verify`
 * also compares the digest in constant time, which is the part you don't want
 * to be responsible for writing yourself.
 */

let keyPromise: Promise<CryptoKey> | null = null;

export function signingKey(): Promise<CryptoKey> {
  if (keyPromise) return keyPromise;

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Failing loudly at first use beats signing with a fallback: a token
    // signed with a default secret is a token anyone can forge, and it looks
    // exactly like a working one.
    throw new Error("SESSION_SECRET is not set — tokens cannot be signed.");
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

export function encode(bytes: Uint8Array): string {
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
export function decode(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Compares two strings without leaking where they diverge.
 *
 * The password comparison this was written for moved to Supabase Auth, but
 * `google-state.ts` still compares a nonce with it — and the day this repo
 * grows another credential is not the day anyone will remember to come back
 * and add it.
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
