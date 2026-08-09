import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * The auth client: Supabase as the user's session, bound to request cookies.
 *
 * This is the *identity* half of the split. Data access goes through
 * `supabaseAdmin()` and the secret key; this client exists so Supabase Auth can
 * mint, read and refresh the session cookies — `signInWithPassword` on the
 * sign-in route, `getClaims` in `currentUser`, `signOut` on the way out. It
 * uses the publishable key, which can touch nothing in the database (RLS is
 * deny-all), so the blast radius of this client is exactly: sessions.
 *
 * The browser never talks to Supabase directly. Sign-in and sign-up are POSTs
 * to our own routes, which call this on the server and set the cookies on the
 * response — the same shape the hand-rolled HMAC session had, with GoTrue
 * doing the signing and rotation instead of forty lines of `crypto.subtle`.
 */

const url = () => {
  const value = process.env.SUPABASE_URL?.trim();
  if (!value) {
    throw new Error(
      "SUPABASE_URL is not set — sign-in cannot reach Supabase Auth. It belongs in .env.local.",
    );
  }
  return value;
};

const publishableKey = () => {
  const value = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!value) {
    throw new Error(
      "SUPABASE_PUBLISHABLE_KEY is not set — sign-in cannot reach Supabase Auth. It is the sb_publishable_… key from the Supabase dashboard and belongs in .env.local.",
    );
  }
  return value;
};

/**
 * A per-request client. Never cached: it closes over this request's cookies,
 * and a cached one would read one visitor's session on behalf of another.
 */
export async function supabaseServer() {
  const store = await cookies();

  return createServerClient<Database>(url(), publishableKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            store.set(name, value, options);
          }
        } catch {
          /* Server Components hold a read-only cookie jar, and @supabase/ssr
             calls setAll whenever a token happens to refresh mid-read. The
             refresh isn't lost: the proxy runs the same client on every
             matched request with a writable response, so the rotated cookie
             lands there. Swallowing here is the documented pattern, not a
             shrug. */
        }
      },
    },
  });
}
