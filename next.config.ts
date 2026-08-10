import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /**
   * Parsers that must not be bundled into the server build.
   *
   * Both are pure JavaScript and dependency-free, so this is not the usual
   * native-binary reason. It is that `unpdf` loads PDF.js through its own
   * resolution, and bundling it produced a build that **parsed nothing and
   * said nothing**: `extractText` returned a document with no text rather than
   * throwing, so every PDF uploaded cleanly, stored correctly, and indexed
   * zero words. The same call against the same file in plain Node returned the
   * text immediately, which is what pinned it on bundling rather than on the
   * library.
   *
   * That failure shape is the argument for this being here rather than a
   * comment somewhere: it is silent on both sides. Nothing errors, nothing
   * warns, and the only symptom is Craig eventually saying he cannot find
   * anything in a handbook that is sitting right there.
   */
  serverExternalPackages: ["unpdf", "@zip.js/zip.js"],
};

/**
 * Wrapped so that a stack trace from production is readable.
 *
 * Without source maps uploaded at build time, every Sentry issue from a
 * deployed build points at minified frames — `a.b is not a function` at
 * column 4,812 of a bundle — which is an alert that tells you something broke
 * and nothing about what. That is the difference between error tracking and
 * an error counter.
 *
 * `silent` unless CI, because the upload chatters through every local build.
 *
 * **No `org`/`project` and no auth token here.** Both are needed only to
 * *upload* maps, they belong to whoever owns the Sentry account, and hardcoding
 * a slug in a public repo is how a fork starts posting somebody else's build
 * artefacts. Set `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN` in the
 * deployment environment and the upload turns itself on; leave them unset —
 * which is every local build and every fork — and the wrapper is a no-op that
 * still produces a working app.
 */
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
});
