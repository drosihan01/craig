import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { JOIN_PATH, JOINER_HOME, SIGN_IN_PATH } from "@/lib/craig/contract";
import { SIGN_UP_PATH } from "@/lib/craig/sign-up";

/**
 * The guard on the signed-in app.
 *
 * Next 16 renamed `middleware.ts` to `proxy.ts` and the exported function with
 * it; `middleware.ts` still runs but is deprecated, so this is the new spelling
 * rather than the one most examples still show.
 *
 * This is the outer fence, not the only one. It verifies the Supabase session
 * cookie and nothing else — `getClaims` checks the JWT's signature against the
 * project's public key, which is local work after the first fetch, so this
 * stays cheap enough to run on every matched request including prefetches.
 * What it deliberately does not do is look the account up; a matcher change or
 * a Server Function on an excluded path would step straight past it, so
 * anything that renders or returns real data checks the session itself, via
 * `currentUser`.
 *
 * It is also where Supabase's token refresh lands. Server Components hold a
 * read-only cookie jar, so when a token rotates mid-render the new cookie has
 * nowhere to go — except here, where the response is writable. The client
 * below bridges request and response cookies for exactly that reason, and it
 * is why this guard must keep running even if every page grew its own check.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The way in is inside the tree it guards, so both doors are let through
  // explicitly — otherwise sign-in redirects to itself, forever.
  if (pathname === SIGN_IN_PATH || pathname === SIGN_UP_PATH) {
    return NextResponse.next();
  }

  /* The new starter's two paths, which this fence is the wrong shape for.
     It asks for a Supabase session, and they will never have one: they were
     given a signed link rather than an account, on purpose — see
     joiner-session.ts. Left in, every magic link in every invitation would
     land on the admin's sign-in form, asking a stranger for a password nobody
     ever gave them. Both pages read the joiner cookie themselves. */
  if (pathname === JOIN_PATH || pathname === JOINER_HOME) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          /* Written to the request first so anything downstream in this same
             pass reads the rotated token, then onto a fresh response so the
             browser gets it too. The re-creation is the documented shape:
             response cookies don't survive reassignment otherwise. */
          for (const { name, value } of toSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  if (data?.claims) return response;

  /* Where they were going, carried across the redirect. Path and query only:
     it is echoed back into a `router.push` after sign-in, and a full URL there
     would be an open redirect with the user's trust attached to it. */
  const url = request.nextUrl.clone();
  url.pathname = SIGN_IN_PATH;
  url.search = "";
  url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

/**
 * The app, and nothing else.
 *
 * It used to be `/showcase/:path*`, which was a tidy way of saying "the real
 * product" back when the real product lived behind a prefix. It doesn't any
 * more — the app is the site — so the matcher is now everything *except* the
 * three things that must not be guarded:
 *
 * `/api` keeps its own front door. Those routes check `currentUser` or a
 * signature themselves, and several of them — the Stripe webhook above all —
 * are called by machines that have no session to offer and would be redirected
 * into a sign-in page they cannot read.
 *
 * The rest is Next's own static output.
 *
 * `/archive` used to be excluded here too — the Ada-era demo, fixtures and all,
 * which nobody should have had to sign in to look at. It is not a route any
 * more: the demos moved to `src/archive/`, outside the router, so they are kept
 * in the repository and served to nobody. An exclusion for a path that cannot
 * be requested is a rule that only misleads whoever reads it next.
 *
 * Must be a literal — matchers are read statically at build time, so
 * `SIGN_IN_PATH` and friends can't be interpolated in here.
 */
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
