import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SIGN_IN_PATH } from "@/lib/showcase/contract";
import { readSession } from "@/lib/showcase/session";
import { SIGN_UP_PATH } from "@/lib/showcase/sign-up";

/**
 * The guard on `/showcase/*`.
 *
 * Next 16 renamed `middleware.ts` to `proxy.ts` and the exported function with
 * it; `middleware.ts` still runs but is deprecated, so this is the new spelling
 * rather than the one most examples still show.
 *
 * This is the outer fence, not the only one. It reads the cookie and nothing
 * else — no lookups, because it runs on every matched request including
 * prefetches — and a matcher change or a Server Function on an excluded path
 * would step straight past it. Anything that renders or returns real data
 * checks the session itself, via `currentUser`.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The way in is inside the tree it guards, so both doors are let through
  // explicitly — otherwise sign-in redirects to itself, forever.
  if (pathname === SIGN_IN_PATH || pathname === SIGN_UP_PATH) {
    return NextResponse.next();
  }

  const session = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  /* Where they were going, carried across the redirect. Path and query only:
     it is echoed back into a `router.push` after sign-in, and a full URL there
     would be an open redirect with the user's trust attached to it. */
  const url = request.nextUrl.clone();
  url.pathname = SIGN_IN_PATH;
  url.search = "";
  url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

/* Must be a literal — matchers are read statically at build time, so
   `SIGN_IN_PATH` and friends can't be interpolated in here. */
export const config = {
  matcher: "/showcase/:path*",
};
