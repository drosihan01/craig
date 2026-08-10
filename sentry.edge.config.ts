import * as Sentry from "@sentry/nextjs";

/**
 * The edge runtime, which is where `proxy.ts` runs.
 *
 * A separate file because the edge runtime is a separate bundle with its own
 * limits, not because the policy differs — it is the same policy, and the two
 * are kept identical on purpose. The proxy is the one place that sees every
 * request in the product, so an error here is the most likely thing to be
 * happening to everybody at once.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  environment: process.env.VERCEL_ENV ?? "development",
});
