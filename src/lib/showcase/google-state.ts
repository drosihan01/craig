import "server-only";

import { constantTimeEqual, decode, encode, signingKey } from "./session";

/**
 * The `state` parameter for the Google connect flow, and the cookie that gives
 * it meaning.
 *
 * `state` is the only thing standing between this product and somebody else's
 * Google Workspace being attached to an account they don't own. The attack it
 * prevents is short: an attacker starts a consent flow themselves, stops at
 * the redirect, and keeps the authorisation code. They then get a signed-in
 * admin to load our callback URL with that code on it — a link in an email, an
 * image tag, anything that makes a GET. Without a `state` check the callback
 * cheerfully exchanges the code and stores *the attacker's* refresh token
 * against *the victim's* account. Every seat the product later creates goes
 * into the attacker's tenant, and every new starter's temporary password
 * arrives in a Workspace the attacker administers.
 *
 * So the check is not "was there a state" but "is this the state we minted, in
 * this browser, for this account, in the last few minutes". Four questions,
 * four answers below.
 *
 * The mechanism is a signed cookie plus a random value in the URL, which is
 * the classic pairing and needs no server-side store — worth stating why,
 * since the obvious alternative is a Map of pending states. A Map would be one
 * more thing that empties on restart and, on more than one process, a state
 * minted by one that the other refuses. A cookie is held by the only party who
 * has to remember it, which is the browser doing the flow.
 *
 * Which half goes where is deliberate and the wrong way round from the obvious
 * arrangement. The **nonce alone** travels to Google, because everything in
 * `state` ends up in Google's URL bar, Google's logs, and the `Referer` of
 * whatever the browser loads next; random bytes disclose nothing. The
 * **binding** — which account, and until when — travels in the cookie, which
 * is `httpOnly` and never leaves this origin. Signing the cookie as well is a
 * belt-and-braces move against cookie injection from a sibling subdomain,
 * where a page on another host under the same registrable domain can set a
 * cookie our origin will read; the signature makes a value we did not mint
 * useless.
 */

/**
 * `SameSite=Lax`, and it has to be exactly that.
 *
 * `Strict` is the instinctive choice for a security cookie and it would break
 * this flow outright: the callback is a top-level navigation arriving from
 * accounts.google.com, which is cross-site, and a `Strict` cookie is not sent
 * on it. The cookie would be missing on every single return, so every consent
 * would fail verification — and it would fail in the way that looks like an
 * attack rather than a misconfiguration, which is a bad afternoon. `Lax` sends
 * it on exactly this shape of request and on nothing else.
 *
 * The path is narrowed to the routes that use it, so it is not attached to
 * every request the app makes for the ten minutes it exists. `secure` follows
 * the session cookie's rule: off in development only, because localhost is
 * plain HTTP and a `Secure` cookie there is a cookie the browser silently
 * drops.
 */
export const GOOGLE_STATE_COOKIE = "craig_google_state";

export const GOOGLE_STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/api/google",
} as const;

/**
 * Ten minutes.
 *
 * Long enough for somebody to read a consent screen properly, pick the right
 * account out of four, and type a password they had to go and look up. Short
 * enough that a state left behind in a browser somebody walked away from is
 * not a credential lying around. Google's own authorisation codes expire in
 * about the same window, so a longer life here would only ever be spent
 * waiting for a code that is already dead.
 */
export const STATE_MAX_AGE = 600;

/** 32 bytes, so guessing one is not a strategy. */
const NONCE_BYTES = 32;

/**
 * Domain separation, and not decoration.
 *
 * This signs with the same key as the session cookie, because a second secret
 * is a second thing to generate, document and get wrong on a deploy — for a
 * value that lives ten minutes. The cost of sharing a key is that a signature
 * produced for one purpose could be presented as a signature for the other, so
 * every message is prefixed with what it is before it is signed. A session
 * token can therefore never be replayed as a connect state, and vice versa,
 * even though one key verifies both.
 */
const CONTEXT = "google-connect.v1.";

interface StatePayload {
  /** The value that travels to Google. */
  n: string;
  /** Which account started the flow, lowercased. */
  e: string;
  /** Unix seconds. */
  x: number;
}

export interface MintedState {
  /** Goes to Google as `state`. Random bytes, nothing else. */
  state: string;
  /** Goes in the cookie. Signed, and carries the binding. */
  cookie: string;
}

/**
 * A fresh state for one account's connect attempt.
 *
 * Both halves are returned together because they are only meaningful as a
 * pair, and returning them as one object is what stops a caller setting the
 * cookie from one mint and sending the state from another — which would be an
 * unfailing verification failure, and one nobody would suspect for a while.
 *
 * Throws only if `SESSION_SECRET` is missing, which is the same condition that
 * already stops anybody signing in; a caller that has a session at all has
 * proved the key is there.
 */
export async function mintGoogleState(email: string): Promise<MintedState> {
  const nonce = encode(crypto.getRandomValues(new Uint8Array(NONCE_BYTES)));

  const payload: StatePayload = {
    n: nonce,
    e: email.trim().toLowerCase(),
    x: Math.floor(Date.now() / 1000) + STATE_MAX_AGE,
  };

  const body = encode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(),
    new TextEncoder().encode(CONTEXT + body),
  );

  return {
    state: nonce,
    cookie: `${body}.${encode(new Uint8Array(signature))}`,
  };
}

export type StateCheck =
  | { ok: true; email: string }
  | {
      ok: false;
      /**
       * Safe to show, and deliberately vague about which check failed.
       *
       * A message that distinguished "the signature was wrong" from "the nonce
       * didn't match" would be a free oracle for anybody probing the callback,
       * and there is nothing a person could do differently with the
       * distinction: every one of these is fixed by pressing Connect again.
       * The one exception is the case that isn't an attack at all — no cookie —
       * which is far more likely to be somebody who took twenty minutes over
       * the consent screen, and is worth its own sentence.
       */
      message: string;
    };

/**
 * Whether Google's return belongs to this browser, this account, and this
 * flow.
 *
 * The signature is checked before anything is read out of the payload, which
 * is the ordering that matters: parsing first and verifying afterwards means
 * every branch in between is running on attacker-controlled JSON. `subtle.verify`
 * also compares the digest in constant time, which is the part not worth
 * writing by hand.
 *
 * The nonce comparison is constant-time for the same reason `verifyCredentials`
 * is: it is a secret being compared against something a caller supplies, and
 * `===` leaks where two strings diverge to anybody who can measure it. The
 * amount leaked here is small and the fix is a function this repo already has.
 *
 * The caller still has to compare the returned email against the session it is
 * actually acting for. This function cannot — it never sees the session — and
 * a function that quietly skipped a check the caller assumed it did would be
 * worse than one that obviously doesn't.
 */
export async function checkGoogleState(
  /** Google's `state` query parameter, as it arrived. */
  state: string | null,
  /** The cookie value, if the browser still has it. */
  cookie: string | undefined,
): Promise<StateCheck> {
  if (!cookie) {
    return {
      ok: false,
      message:
        "This connection couldn't be matched to the one that started in this browser. Connections have to be finished within about ten minutes, and in the same browser they were started in. Nothing was stored — start again and it will work.",
    };
  }

  const refused: StateCheck = {
    ok: false,
    message:
      "Google's answer didn't match the request this browser made, so nothing was connected. Start the connection again from here rather than from a link somebody sent you.",
  };

  if (!state) return refused;

  const [body, signature, ...rest] = cookie.split(".");
  if (!body || !signature || rest.length > 0) return refused;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(),
      decode(signature),
      new TextEncoder().encode(CONTEXT + body),
    );
    if (!valid) return refused;

    const payload = JSON.parse(
      new TextDecoder().decode(decode(body)),
    ) as StatePayload;

    if (typeof payload.n !== "string" || typeof payload.e !== "string") {
      return refused;
    }
    if (typeof payload.x !== "number" || payload.x <= Date.now() / 1000) {
      return {
        ok: false,
        message:
          "That connection attempt has expired — Google's consent screens are only good for a few minutes. Nothing was stored. Press Connect again.",
      };
    }

    if (!constantTimeEqual(payload.n, state)) return refused;

    return { ok: true, email: payload.e };
  } catch {
    /* `atob` and `JSON.parse` both throw on input somebody else controls
       entirely, and a cookie is exactly that. */
    return refused;
  }
}
