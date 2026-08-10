import * as Sentry from "@sentry/nextjs";

/**
 * Where the server tells somebody that something broke.
 *
 * Before this, 143 `console.error` calls wrote to a place with no reader. On a
 * laptop that is fine — the terminal is right there. In production it meant an
 * onboarding that failed at 2am was invisible until a customer mentioned it.
 *
 * A Postgres table was built for this first and then deleted the same day. It
 * would have worked, and it had a flaw the argument for it glossed over: it
 * was somewhere for errors to *land*, with nothing that *tells* anybody. A
 * table nobody opens at 2am has precisely the problem it was meant to fix.
 * Sentry alerts, groups, and — the part no server-side table can reach — sees
 * errors in the *browser*, which is where a new starter is doing something
 * they cannot retry.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * Every unhandled server error, without touching a single route.
 *
 * The reason this is one line rather than a reporting call in 143 places:
 * Next hands the framework's own error boundary straight to Sentry, so a route
 * that throws, a server component that throws during render, and a proxy that
 * throws are all captured with their route path and request context already
 * attached. Instrumenting by hand would have covered the failures somebody
 * remembered, which are never the ones that wake you up.
 */
export const onRequestError = Sentry.captureRequestError;
