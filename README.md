# craig

Onboarding workflow builder. An admin composes a workflow once; every new
starter in that role gets walked through it.

Two seats:

- **Admin** — build and publish onboarding workflows: ordered steps, owners,
  due dates relative to the start date.
- **New starter** — work through the assigned workflow, one stage at a time.

## Status

Front-end only, pre-MVP. What exists today is the design system at
[`/design-system`](http://localhost:3000/design-system) — the primitives both
seats will be built from.

## Running it

```bash
npm install
npm run dev     # http://localhost:3000
```

`/` redirects to `/design-system` until there's an app to land on.

```bash
npm run build   # production build
npm run lint
npx tsc --noEmit
```

## Layout

```
src/
  app/
    globals.css          token layer — palette → semantics → Tailwind theme
    design-system/       the browsable showcase (nav rail + specimens)
  components/ui/         the design system itself
  lib/cn.ts              clsx + tailwind-merge
public/fonts/            drop licensed PP Mori files here (see README)
```

## Design system

Next.js 16 (App Router) · React 19 · Tailwind v4 · TypeScript.

Tokens are layered in `src/app/globals.css`:

1. **Palette** — raw values, never referenced by components.
2. **Semantic** — role-based vars (`--c-accent`, `--c-surface`, …) that flip
   between light and dark.
3. **`@theme`** — maps semantics onto Tailwind utilities (`bg-surface`,
   `text-text-muted`, …).

Components only ever touch layer 3, so retuning the accent is a one-line change.

Notable choices:

- **Accent is charcoal brown**, and it inverts in dark mode. At 800 it's nearly
  black, so on a dark canvas it would disappear — dark mode promotes the light
  tan end of the ramp and flips the foreground, keeping the accent's role and
  warmth at both ends.
- **Base type is 14px**, not 16. App density.
- **Selection controls are native inputs** under the hood — keyboard, form
  submission and screen-reader behaviour come free; visuals are drawn by a
  sibling driven off `peer`.
- **`TASK_STATUS`** (`components/ui/badge.tsx`) is the single definition of the
  workflow state machine. Both seats read from it so they can't drift apart.
  It should move to a domain module once one exists.

## Fonts

PP Mori is licensed and deliberately not committed — `.gitignore` blocks font
binaries because this repo is public. See
[`public/fonts/README.md`](public/fonts/README.md). Without the files the app
falls back to `system-ui` and still renders correctly.
