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

  /**
   * The noise that would otherwise eat the month's allowance.
   *
   * A free plan is 5,000 events a month, which sounds enormous against Craig's
   * traffic and is not, because **quota is spent per event rather than per
   * bug**. One component in a render loop, or one fetch retried on a flaky
   * train connection, can post thousands of identical events in a minute and
   * leave nothing for the failure that actually mattered on the Tuesday.
   * Grouping tidies the inbox afterwards; it does not give the quota back.
   *
   * Everything listed here is a thing browsers report that no one can act on:
   *
   * - **`ResizeObserver loop`** is emitted by Chrome when a resize handler
   *   settles on the next frame. It is benign, extremely common, and famous
   *   for being the top "issue" in freshly-configured Sentry projects.
   * - **Aborted and failed fetches** are somebody closing a tab mid-request or
   *   losing signal. There is no bug behind them, and this product is used on
   *   phones by people filling in forms in the evening.
   * - **Extension noise.** A stack frame from `chrome-extension://` is a bug
   *   in somebody's password manager, not in Craig, and it is unfixable from
   *   here.
   *
   * Deliberately short. Every pattern added is a class of real bug that can
   * now hide behind it, so this is a list to be suspicious of rather than one
   * to grow whenever an issue is annoying.
   */
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    /^AbortError/,
    "Failed to fetch",
    "NetworkError when attempting to fetch resource",
    "Load failed",
  ],

  denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-extension:\/\//],
});

/* Next asks for this so it can report navigation timing; harmless with tracing
   off, and required for the router instrumentation not to warn. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
