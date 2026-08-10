/**
 * Every internal link in the product, checked against the routes that exist.
 *
 * Written after `/builder` — a nav row pointing at a route that had been
 * renamed months earlier, sitting in a live screen's left column, found by a
 * person reading the file rather than by anything that would have caught it.
 * Nothing in a typecheck or a build fails when an `href` names a page that is
 * not there: a string is a string, `next build` compiles the routes that exist
 * and never asks what points at them, and the only thing that notices is
 * somebody clicking it.
 *
 * That is the whole gap this closes. It is a linter for one specific lie —
 * "there is a page over here" — and it runs in about a second.
 *
 *   node scripts/check-links.mjs
 *
 * ## How it decides what exists
 *
 * The route list comes from the filesystem rather than from a build, so this
 * works without one: every `page.tsx` under `src/app` becomes its path, route
 * groups `(app)` collapse away because Next does not put them in URLs, and
 * `[id]` becomes a wildcard segment. `route.ts` files count too — a link can
 * legitimately point at a handler, and `/api/joiner/documents/[id]` is exactly
 * that.
 *
 * ## What it deliberately does not flag
 *
 * External URLs, `mailto:`, anchors, and template literals with a `${}` in
 * them. The last is the interesting exclusion: `/workflows/${id}` cannot be
 * resolved without running the code, and guessing would produce false alarms
 * on the one pattern this codebase uses most. The static prefix is checked
 * instead, so `/wrkflows/${id}` is still caught.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const APP = join(ROOT, "src", "app");
const SRC = join(ROOT, "src");

/* --- What exists ----------------------------------------------------------- */

function routes(dir, segments = []) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) {
      if (entry === "page.tsx" || entry === "page.ts" || entry === "route.ts") {
        found.push("/" + segments.join("/"));
      }
      continue;
    }
    /* `(group)` is a route group — organisational only, never in the URL.
       `_private` is excluded from routing entirely. */
    if (entry.startsWith("(") && entry.endsWith(")")) {
      found.push(...routes(full, segments));
    } else if (entry.startsWith("_") || entry.startsWith(".")) {
      continue;
    } else {
      found.push(...routes(full, [...segments, entry]));
    }
  }
  return found;
}

const existing = new Set(routes(APP).map((r) => (r === "/" ? "/" : r)));

/** A link matches a route if every segment lines up, `[param]` taking any. */
function resolves(path) {
  if (existing.has(path)) return true;
  const parts = path.split("/").filter(Boolean);
  return [...existing].some((route) => {
    const routeParts = route.split("/").filter(Boolean);
    const catchAll = routeParts.some((p) => p.startsWith("[..."));
    if (!catchAll && routeParts.length !== parts.length) return false;
    return routeParts.every((p, i) => p.startsWith("[") || p === parts[i]);
  });
}

/**
 * The static half of a template literal, which is all we can see.
 *
 * `` `/api/joiner/documents/${id}` `` arrives here as
 * `/api/joiner/documents`, and the route is `/api/joiner/documents/[id]` — so
 * an exact match will never happen and demanding one would flag the single
 * pattern this codebase uses most. What is checkable is that the prefix leads
 * somewhere: every segment must line up against the start of a real route.
 * `/wrkflows` still fails, which is the typo class this is for.
 */
function isPrefixOfRoute(path) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return false;
  return [...existing].some((route) => {
    const routeParts = route.split("/").filter(Boolean);
    if (routeParts.length <= parts.length) return false;
    return parts.every((p, i) => routeParts[i].startsWith("[") || routeParts[i] === p);
  });
}

/**
 * Files served straight out of `public/`.
 *
 * `/fonts/GoogleSansFlex-latin.woff2` is a real, working URL and not a route
 * at all. Reading the directory rather than pattern-matching on extensions,
 * because the question is genuinely "is this file there".
 */
function publicFiles(dir, prefix = "") {
  const found = new Set();
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      for (const f of publicFiles(full, `${prefix}/${entry}`)) found.add(f);
    } else {
      found.add(`${prefix}/${entry}`);
    }
  }
  return found;
}

const assets = publicFiles(join(ROOT, "public"));

/* --- What points at it ----------------------------------------------------- */

function files(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...files(full));
    else if (/\.(ts|tsx)$/.test(entry)) found.push(full);
  }
  return found;
}

/* `href="/x"`, `href={"/x"}`, `href={`/x/${id}`}`, and the `router.push("/x")`
   family — a redirect is a link the reader never gets to hover over first. */
const PATTERNS = [
  /href=["'](\/[^"'{}]*)["']/g,
  /href=\{["'](\/[^"'`]*)["']\}/g,
  /href=\{`(\/[^`$]*)/g,
  /(?:router\.(?:push|replace)|redirect)\(\s*["'](\/[^"']*)["']/g,
  /(?:router\.(?:push|replace)|redirect)\(\s*`(\/[^`$]*)/g,
];

const problems = [];

for (const file of files(SRC)) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");

  for (const pattern of PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      let path = match[1];
      if (!path.startsWith("/") || path.startsWith("//")) continue;

      /* Query and hash are not part of the route. A trailing slash left by a
         template literal's prefix is not either. */
      path = path.split(/[?#]/)[0].replace(/\/$/, "") || "/";
      if (resolves(path)) continue;
      if (assets.has(path)) continue;

      /* A template literal contributes only its static prefix, so it is held
         to the weaker test — see `isPrefixOfRoute`. */
      const fromTemplate = match[0].includes("`");
      if (fromTemplate && isPrefixOfRoute(path)) continue;

      const line = lines.findIndex((l) => l.includes(match[0])) + 1;
      problems.push({
        file: relative(ROOT, file),
        line: line || 0,
        path,
      });
    }
  }
}

/* --- Say it ---------------------------------------------------------------- */

if (problems.length === 0) {
  console.log(`✓ every internal link resolves (${existing.size} routes)`);
  process.exit(0);
}

console.error(`✗ ${problems.length} link(s) point at routes that don't exist:\n`);
for (const p of problems) {
  console.error(`  ${p.file}:${p.line}  →  ${p.path}`);
}
console.error("");
process.exit(1);
