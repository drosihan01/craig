import "server-only";

import { safeReturnTo } from "./google-state";
import { constantTimeEqual, decode, encode, signingKey } from "./session";

/**
 * The `state` parameter for the Linear connect flow, and the cookie that
 * gives it meaning.
 *
 * Unverified: no Linear consent has ever gone round this loop. The mechanism
 * is `google-state.ts`'s, proven live against Google, and the attack it
 * prevents is written out in full over there — an attacker's authorisation
 * code walked into a victim's session, which for this provider would mean the
 * attacker's Linear workspace attached to the victim's account and every
 * invite this product later sends going into a workspace the attacker
 * administers.
 *
 * Same mechanism, not a shared implementation, and the difference is three
 * values that must never be shared. The **cookie name**, because the two
 * flows can be in flight in one browser at once and a shared cookie would
 * make finishing one consent invalidate the other. The **cookie path**,
 * narrowed to `/api/linear` so the value only travels on this flow's own
 * requests. And the **domain-separation context**, because both providers
 * sign with `SESSION_SECRET` — the prefix is what makes a signature minted
 * for one flow unpresentable to the other, which is the entire point of
 * domain separation and the reason the string here must never be edited to
 * match Google's.
 *
 * `safeReturnTo` is imported rather than re-implemented: it is a security
 * check, two copies of a security check drift, and the copy that drifted is
 * always the one the attacker finds. It lives in `google-state.ts` only
 * because Google got there first; nothing about the rule is Google's.
 */

/**
 * `SameSite=Lax` and exactly that, for Google's reason: the callback is a
 * top-level navigation arriving from linear.app, which is cross-site, and a
 * `Strict` cookie is simply not sent on it — every consent would fail
 * verification in the way that looks like an attack.
 */
export const LINEAR_STATE_COOKIE = "craig_linear_state";

export const LINEAR_STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/api/linear",
} as const;

/**
 * Ten minutes — long enough to read a consent screen properly, short enough
 * that a state left in a walked-away-from browser is not a credential lying
 * around. Authorisation codes die on about the same clock, so a longer life
 * would only be spent waiting for a code that is already dead.
 */
export const LINEAR_STATE_MAX_AGE = 600;

/** 32 bytes, so guessing one is not a strategy. */
const NONCE_BYTES = 32;

/** See the header: shared key, separated domains. Never Google's prefix. */
const CONTEXT = "linear-connect.v1.";

interface StatePayload {
  /** The value that travels to Linear. */
  n: string;
  /** Which account started the flow, lowercased. */
  e: string;
  /** Unix seconds. */
  x: number;
  /** Where to land afterwards. Inside the signed payload, never a bare query
      parameter, which is what stops it being an open redirect. */
  r?: string;
}

export interface MintedState {
  /** Goes to Linear as `state`. Random bytes, nothing else — everything in
      `state` ends up in Linear's logs and the next page's Referer. */
  state: string;
  /** Goes in the cookie. Signed, and carries the binding. */
  cookie: string;
}

/**
 * A fresh state for one account's connect attempt. Both halves returned
 * together because they are only meaningful as a pair — a caller that set
 * the cookie from one mint and sent the state from another would fail
 * verification every time, and nobody would suspect why for a while.
 */
export async function mintLinearState(
  email: string,
  returnTo?: string | null,
): Promise<MintedState> {
  const nonce = encode(crypto.getRandomValues(new Uint8Array(NONCE_BYTES)));

  const payload: StatePayload = {
    n: nonce,
    e: email.trim().toLowerCase(),
    x: Math.floor(Date.now() / 1000) + LINEAR_STATE_MAX_AGE,
    r: safeReturnTo(returnTo) ?? undefined,
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
  | { ok: true; email: string; returnTo: string | null }
  | {
      ok: false;
      /** Safe to show, and deliberately vague about which check failed —
          the distinction is an oracle for anybody probing the callback, and
          every one of these is fixed by pressing Connect again. */
      message: string;
    };

/**
 * Whether Linear's return belongs to this browser, this account, and this
 * flow. Ordering as in `google-state.ts`: the signature is checked before
 * anything is read out of the payload, so no branch runs on
 * attacker-controlled JSON, and the nonce comparison is constant-time
 * because it is a secret compared against something a caller supplies.
 *
 * The caller still has to compare the returned email against the session it
 * is acting for — this function never sees the session.
 */
export async function checkLinearState(
  state: string | null,
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
      "Linear's answer didn't match the request this browser made, so nothing was connected. Start the connection again from here rather than from a link somebody sent you.",
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
          "That connection attempt has expired — consent screens are only good for a few minutes. Nothing was stored. Press Connect again.",
      };
    }

    if (!constantTimeEqual(payload.n, state)) return refused;

    /* Re-validated coming out. The signature says we wrote it; it does not
       say we were right to. */
    return { ok: true, email: payload.e, returnTo: safeReturnTo(payload.r) };
  } catch {
    /* `atob` and `JSON.parse` both throw on input somebody else controls
       entirely, and a cookie is exactly that. */
    return refused;
  }
}
