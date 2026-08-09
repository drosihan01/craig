import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { SIGN_IN_PATH, type Session } from "./contract";
import { getAccount } from "./accounts";

/**
 * Who's signed in, for server components.
 *
 * Two checks, not one, exactly as before the move to Supabase Auth. The JWT
 * proves nobody forged the cookie — `getClaims` verifies the signature
 * locally against the project's public key, no network round trip after the
 * first — but a signed token outlives the thing it refers to: reset the
 * showcase and every browser still holds a perfectly valid token for an
 * account that no longer exists. So a session is only accepted while its
 * account is still there, which is what makes reset actually reset rather
 * than merely forget.
 *
 * The name and company come from the account row rather than the token.
 * The token's metadata is a copy taken at sign-up; the row is the record.
 * Reading the row costs nothing extra — the account check needs it anyway.
 *
 * `cache` memoises it for the length of one render, so a layout, a page and
 * three components can each ask independently without repeating the work.
 *
 * The proxy already turns anonymous requests away at the edge of `/showcase`.
 * This exists anyway because that guard is a matcher — one refactor away from
 * not covering a route — and because it only ever sees the cookie. This is
 * the check that knows whether the account behind it is real.
 */
export const currentUser = cache(async (): Promise<Session | null> => {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const email = typeof claims?.email === "string" ? claims.email : null;
  if (!email) return null;

  const account = await getAccount(email);
  if (!account) return null;

  return {
    email: account.email,
    name: account.name,
    company: account.company || undefined,
    /* Unix seconds, from the token — when this session began, which the
       account row doesn't know. */
    issuedAt:
      typeof claims?.iat === "number"
        ? claims.iat
        : Math.floor(Date.now() / 1000),
  };
});

/** The same, for pages that have nothing to show a signed-out visitor. */
export async function requireUser(): Promise<Session> {
  const session = await currentUser();
  if (!session) redirect(SIGN_IN_PATH);
  return session;
}
