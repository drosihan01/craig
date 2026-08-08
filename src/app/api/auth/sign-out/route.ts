import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/showcase/contract";
import { SESSION_COOKIE_OPTIONS } from "@/lib/showcase/session";

/**
 * POST, not GET. A link prefetcher, an image tag or a link in someone's email
 * can issue a GET; letting one of those sign a user out is a small denial of
 * service that looks like a bug in the app.
 */
export async function POST() {
  const response = NextResponse.json({ ok: true });

  /* Overwritten with an expired empty value rather than deleted, and with the
     same attributes it was set with. A clear whose path or domain differs from
     the original leaves the real cookie in place and reports success. */
  response.cookies.set(SESSION_COOKIE, "", {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: 0,
  });
  return response;
}
