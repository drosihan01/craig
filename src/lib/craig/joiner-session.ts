import "server-only";
import { JOINER_COOKIE } from "./contract";
import { decode, encode, signingKey } from "./session";

/**
 * The new starter's way in: a link in their email, and no password.
 *
 * They have no account and shouldn't need one. Onboarding is the first thing
 * that ever happens to them at this company — asking them to choose a password
 * before they can tell you their middle name puts a signup in front of the
 * thing they were actually invited to do, and it would be a second set of
 * credentials for something they use for a fortnight.
 *
 * So the link is the credential. It is signed with the same key as the admin's
 * session, and carries the same guarantee: the server can tell whether it
 * issued this, and nothing else about it can be trusted.
 *
 * Deliberately long-lived and reusable, unlike a sign-in magic link. This is
 * how they get back to a half-finished checklist next Tuesday, from whichever
 * device they read their mail on — a one-shot token would strand them the
 * second time they clicked it, and there is nothing behind it but their own
 * onboarding.
 */

/** Long enough to cover a notice period and the first weeks after it. */
export const JOINER_MAX_AGE = 60 * 60 * 24 * 90;

interface JoinerPayload {
  /** The joiner's id in the server store. */
  jid: string;
  /** Unix seconds. */
  expiresAt: number;
}

export async function createJoinerToken(joinerId: string): Promise<string> {
  const payload: JoinerPayload = {
    jid: joinerId,
    expiresAt: Math.floor(Date.now() / 1000) + JOINER_MAX_AGE,
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
 * Verify a token and return the joiner id it claims, or `null`.
 *
 * Every failure returns the same `null` — forged, malformed, expired. A token
 * that reports why it was rejected is a token that helps somebody tamper with
 * it, and there is nothing a caller could usefully do differently for each.
 */
export async function readJoinerToken(
  token: string | undefined,
): Promise<string | null> {
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
    ) as JoinerPayload;

    if (typeof payload.jid !== "string") return null;
    if (payload.expiresAt <= Math.floor(Date.now() / 1000)) return null;

    return payload.jid;
  } catch {
    return null;
  }
}

export const JOINER_COOKIE_OPTIONS = {
  name: JOINER_COOKIE,
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;
