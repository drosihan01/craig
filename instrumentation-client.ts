import * as Sentry from "@sentry/nextjs";

/**
 * Errors in somebody's browser — the half a server-side tracker cannot see.
 *
 * This is the surface that matters most for the people this product is
 * actually for. An admin whose screen throws can reload, swear, and try again;
 * a **new starter** filling in their bank details on their phone the night
 * before they start cannot, and will not report it. They will simply not
 * finish, and the first anybody knows is a Monday with no laptop.
 *
 * `sendDefaultPii: false` matters more here than on the server, and for a
 * reason worth naming: this SDK runs on the page where somebody is *typing*
 * their date of birth and their account number. Nothing about a stack trace
 * needs their input, and the difference between a tracker and a leak is
 * exactly this setting.
 *
 * No session replay for the same reason. Replay is the single most useful
 * debugging feature Sentry sells and it is a recording of a person filling in
 * a payroll form; if it is ever turned on it needs masking configured first
 * and a line in the privacy policy that does not exist yet.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
});

/* Next asks for this so it can report navigation timing; harmless with tracing
   off, and required for the router instrumentation not to warn. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
