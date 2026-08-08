import { requireUser } from "@/lib/showcase/current-user";
import { WelcomeScreen } from "./welcome-screen";

/**
 * A server component wrapping the screen, purely to hold the guard.
 *
 * The proxy already redirects anonymous requests, but it is deliberately
 * optimistic — it checks that the cookie's signature is valid and nothing
 * else. It cannot check that the account still exists without consulting a
 * store, and on a platform that deploys the proxy separately from the app it
 * would get its own empty module state and lock everybody out permanently.
 * A stale cookie is a much better failure than that.
 *
 * So the real check happens here, where the store is genuinely reachable.
 * `requireUser()` verifies the signature *and* that the session still refers
 * to a live account, which is what makes the sandbox reset take effect in a
 * browser that is still holding its old cookie.
 *
 * Every `/showcase/*` page needs this. The proxy is a matcher, not a wall —
 * Next's own docs say so, and a Server Function on an excluded path skips it
 * entirely.
 */
export default async function WelcomePage() {
  /* Handed down rather than fetched again on the client. The session is server
     data and a prop is how server data reaches a client component — the
     alternative is an endpoint that exists only so the greeting can learn a
     name the server already had in its hand. */
  const user = await requireUser();
  return <WelcomeScreen user={user} />;
}
