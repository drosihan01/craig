import { defineConfig } from "vitest/config";

/**
 * The first tests this project has had.
 *
 * Deliberately narrow. There is no value in chasing a coverage number here —
 * what these pin down is the small set of pure decisions whose breakage is
 * **silent**, which is the only kind that survives the way this codebase is
 * actually verified. Everything else is checked by opening it, and opening it
 * works: a broken screen is obvious the moment somebody looks.
 *
 * A cadence that quietly chases somebody twice, a conditional block that
 * quietly needs no connection, an allowlist that quietly drops a key — none of
 * those appear on a screen. They appear in somebody's inbox a fortnight later,
 * or not at all. Two of the three have already shipped once.
 *
 * `.mts` because this repo is CommonJS by default and the config is ESM;
 * `resolve.tsconfigPaths` rather than the `vite-tsconfig-paths` plugin, which
 * Vite now supersedes natively — one fewer dependency for the same `@/`.
 *
 * `node` rather than `jsdom`: nothing here touches a DOM, and a DOM
 * environment would be a dependency carried for tests that never use it.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
