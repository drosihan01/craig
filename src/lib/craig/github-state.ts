import "server-only";

import { constantTimeEqual, decode, encode, signingKey } from "./session";

/**
 * The `state` parameter for the GitHub connect flow, and the cookie that gives
 * it meaning.
 *
 * Unverified: no GitHub consent has ever completed through this, so the pair
 * below has never been compared against a real return from github.com. The
 * mechanism is `google-state.ts` with the names changed, and that file holds
 * the full argument — the attack (a signed-in admin walked into finishing an
 * attacker's consent, attaching the attacker's organisation to their account),
 * why a signed cookie beats a server-side store, and why the nonce alone
 * travels to the provider while the binding stays in the cookie. All of it
 * transfers: GitHub's `state` round-trips through github.com's URL bar and
 * logs exactly as Google's does through accounts.google.com's.
 *
 * The fourth copy of this file, which is one more than the block swarm note
 * planned for. The instruction there was to cut the shared shape once a second
 * flow had *met reality*, and none of them has — Google's is the only verified
 * one, and rewriting it into a parameterised helper to serve three unproven
 * callers would put churn into proven code for the benefit of unproven code.
 * What has changed with the fourth is that the differences are now visible
 * rather than guessed at, and there are exactly three of them: the cookie name,
 * the path scope, and the signing context. That is a small enough surface to
 * extract confidently, and it should be extracted the moment one of these
 * flows has completed against a live provider.
 *
 * What is deliberately different here, not just renamed:
 *
 * - Its own cookie, scoped to `/api/github`, so a Google connect and a GitHub
 *   connect in flight at once cannot overwrite each other's half.
 * - Its own signing context. Every flow signs with `SESSION_SECRET`, so the
 *   context prefix is the only thing stopping one provider's state being
 *   replayed as another's; "github-connect.v1." makes them mutually
 *   unreadable.
 */

/**
 * `SameSite=Lax`, exactly as Google's, and it has to be: the callback is a
 * top-level navigation arriving from github.com, which is cross-site, and a
 * `Strict` cookie is simply not sent on it — every consent would fail in the
 * way that looks like an attack. The path keeps it off every other request for
 * the ten minutes it exists.
 */
export const GITHUB_STATE_COOKIE = "craig_github_state";

export const GITHUB_STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/api/github",
} as const;

/**
 * Ten minutes — long enough to read GitHub's consent screen, and long enough
 * to switch to an organisation-owner account when the chooser
 * (`prompt=select_account`) turns out to be necessary, which is the slowest
 * realistic path through this flow. Short enough that a state left in a
 * walked-away browser is not a credential lying around. GitHub's authorisation
 * codes expire on the same order of time, so a longer life would be spent
 * waiting for a code that is already dead.
 */
export const STATE_MAX_AGE = 600;

/** 32 bytes, so guessing one is not a strategy. */
const NONCE_BYTES = 32;

/** Domain separation under the shared `SESSION_SECRET` — see the header. */
const CONTEXT = "github-connect.v1.";

interface StatePayload {
  /** The value that travels to GitHub. */
  n: string;
  /** Which account started the flow, lowercased. */
  e: string;
  /** Unix seconds. */
  x: number;
  /** Where to land afterwards, when it isn't the default. Inside the signed
      payload rather than on the query string — the difference between a return
      path and an open redirect. Validated on the way in and out. */
  r?: string;
}

/**
 * A path this server will send somebody back to. Same refusals as the Google
 * one, restated rather than imported because the function is four lines and an
 * import from `google-state.ts` would read as this flow depending on that one:
 * one leading slash, no protocol-relative `//`, no backslashes some browsers
 * read as slashes, nothing over 200 characters.
 */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.includes("\\")) return null;
  return value.length > 200 ? null : value;
}

export interface MintedState {
  /** Goes to GitHub as `state`. Random bytes, nothing else. */
  state: string;
  /** Goes in the cookie. Signed, and carries the binding. */
  cookie: string;
}

/**
 * A fresh state for one account's connect attempt. Both halves returned
 * together because they are only meaningful as a pair — a caller that set the
 * cookie from one mint and sent the state from another would fail every
 * verification, and nobody would suspect why for a while.
 *
 * Throws only if `SESSION_SECRET` is missing, which already stops anybody
 * signing in; a caller holding a session has proved the key is there.
 */
export async function mintGitHubState(
  email: string,
  /** Where the callback should land. Validated here, not trusted. */
  returnTo?: string | null,
): Promise<MintedState> {
  const nonce = encode(crypto.getRandomValues(new Uint8Array(NONCE_BYTES)));

  const payload: StatePayload = {
    n: nonce,
    e: email.trim().toLowerCase(),
    x: Math.floor(Date.now() / 1000) + STATE_MAX_AGE,
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
      /** Safe to show, and deliberately vague about which check failed — a
          message that told an attacker which probe got furthest would be a free
          oracle, and every one of these is fixed the same way. */
      message: string;
    };

/**
 * Whether GitHub's return belongs to this browser, this account, and this
 * flow. Signature before payload, constant-time nonce comparison, and the
 * caller still has to compare the returned email against its session — the
 * same three rules as the Google check, argued in full over there.
 */
export async function checkGitHubState(
  /** GitHub's `state` query parameter, as it arrived. */
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
      "GitHub's answer didn't match the request this browser made, so nothing was connected. Start the connection again from here rather than from a link somebody sent you.",
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
          "That connection attempt has expired — GitHub's consent screens are only good for a few minutes. Nothing was stored. Press Connect again.",
      };
    }

    if (!constantTimeEqual(payload.n, state)) return refused;

    /* Re-validated coming out. The signature says we wrote it; it does not say
       we were right to. */
    return { ok: true, email: payload.e, returnTo: safeReturnTo(payload.r) };
  } catch {
    /* `atob` and `JSON.parse` both throw on input somebody else controls
       entirely, and a cookie is exactly that. */
    return refused;
  }
}
