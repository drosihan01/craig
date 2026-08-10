import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    /* Agent worktrees. `git worktree` puts a whole second checkout here, each
       with its own `node_modules`, and eslint walks all of it: nine of them
       turned `npm run lint` into 74,855 problems and about four gigabytes,
       none of it this repository's working tree. Worse than the noise is what
       the noise does — a lint run nobody can read is a lint run nobody runs,
       so a real error in `src/` arrives indistinguishable from 4,028 others
       in code that was already reviewed and merged.

       Ignored by path rather than cleaned up by hand, because the directory
       is recreated every time an agent is spawned. */
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
