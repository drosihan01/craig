import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * The server's own connection to Supabase — the secret key, never a user's.
 *
 * Every store in `lib/showcase` goes through this client, which is a deliberate
 * architectural decision rather than a shortcut: the tables have RLS enabled
 * with **no policies**, so the publishable key can read nothing at all. The
 * only way to the data is through this server, exactly as it was when the
 * stores were JSON files behind `server-only` imports. Row-level policies can
 * be added the day a browser talks to Supabase directly; today none does.
 *
 * The secret key bypasses RLS by design — which is why this module is
 * `server-only` and why the key is read from the environment at first use,
 * loudly, rather than defaulted. A missing key should fail the first request
 * with a sentence about what to set, not sign requests as nobody.
 */

const url = () => {
  const value = process.env.SUPABASE_URL?.trim();
  if (!value) {
    throw new Error(
      "SUPABASE_URL is not set — the server cannot reach the database. It is the project URL, e.g. https://yoajqnuyeglasriygtdc.supabase.co, and belongs in .env.local.",
    );
  }
  return value;
};

const secretKey = () => {
  const value = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!value) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not set — the server cannot read or write the database. Copy the secret key (sb_secret_…) from the Supabase dashboard → Project Settings → API keys into .env.local. It is the server's credential and must never be NEXT_PUBLIC_.",
    );
  }
  return value;
};

/**
 * One client per process, on `globalThis` for the same reason the old stores
 * were: Next bundles route handlers and server components into separate module
 * graphs, and a per-graph client means a per-graph connection pool. The client
 * is stateless (no session persistence, no token refresh — the secret key does
 * not expire), so sharing it is safe.
 */
const CLIENT_KEY = "__craig_supabase_admin__";

export function supabaseAdmin(): SupabaseClient<Database> {
  const scope = globalThis as typeof globalThis & {
    [CLIENT_KEY]?: SupabaseClient<Database>;
  };
  if (scope[CLIENT_KEY]) return scope[CLIENT_KEY];

  const client = createClient<Database>(url(), secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  scope[CLIENT_KEY] = client;
  return client;
}
