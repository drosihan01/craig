import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * POST, not GET. A link prefetcher, an image tag or a link in someone's email
 * can issue a GET; letting one of those sign a user out is a small denial of
 * service that looks like a bug in the app.
 *
 * `scope: "local"` — this browser only. The old cookie-clear had exactly that
 * reach, and "sign out" on one machine must not be a way to sign somebody out
 * of every machine they're reading the showcase on.
 */
export async function POST() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.json({ ok: true });
}
