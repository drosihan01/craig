import * as Sentry from "@sentry/nextjs";

/**
 * Server-side error reporting.
 *
 * **No DSN means no Sentry, and that is the safe default rather than an
 * oversight.** The SDK treats an empty DSN as "disabled" and does nothing, so
 * a fork, a preview built before the secret existed, or a contributor running
 * this locally all behave exactly as they did before — no crash, no noise, no
 * errors quietly posted to somebody else's project.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  /* Off unless somebody turns it on. Craig's traffic is a handful of requests
     an hour; performance data is not the problem this was bought to solve, and
     a free quota spent on traces is a quota not available for the errors that
     actually matter. */
  tracesSampleRate: 0,

  /* Errors carry request context, and this product's requests carry other
     people's lives — a date of birth in a form body, a bank account, a tax
     file number. Sentry's default already omits request bodies, and this makes
     that a decision rather than a default somebody could flip: a stack trace
     is enough to fix a bug, and nothing here is worth putting somebody's
     payroll details on a third party's server to obtain. */
  sendDefaultPii: false,

  environment: process.env.VERCEL_ENV ?? "development",
});
