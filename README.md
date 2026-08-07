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
    design-system/       the browsable showcase, running on AppShell
    sign-in/             auth screen
  components/ui/         the design system itself
    icons.tsx            generated — do not hand-edit
  lib/cn.ts              clsx + tailwind-merge
public/fonts/            Google Sans Flex, self-hosted (see README)
scripts/gen-icons.py     vendors Material Symbols into components/ui/icons.tsx
```

Routes: `/design-system` (the showcase), `/sign-in`. `/` redirects to the
showcase until there's an app to land on.

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
- **One variable font.** Google Sans Flex, self-hosted, covering 100–1000 from
  a single 51KB file. Stick to three weights (200/400/600) anyway — the
  constraint is what keeps the UI legible.
- **Icons are vendored, not installed.** ~16 Material Symbols (Rounded) inlined
  as SVG by `scripts/gen-icons.py`, so there's no runtime dependency and no
  thousand-file package. Add one by editing the `ICONS` map and re-running it.
- **`WorkflowProgress`** renders each stage as a card rather than a row, with a
  metrics line and an action footer. The connector is dashed inside a card and
  solid across the gap between cards, so the thread reads as continuous without
  cutting through content.
- **Selection controls are native inputs** under the hood — keyboard, form
  submission and screen-reader behaviour come free; visuals are drawn by a
  sibling driven off `peer`.
- **`TASK_STATUS`** (`components/ui/badge.tsx`) is the single definition of the
  workflow state machine. Both seats read from it so they can't drift apart.
  It should move to a domain module once one exists.
- **`AppShell` is the product frame, and the design system runs on it** rather
  than a bespoke layout — if the frame breaks, it breaks here first. Both
  panels collapse and persist; the left toggle sits in the brand cell, on the
  edge it moves. One vertical rule runs from the top of the header to the
  bottom of the page, so the brand cell and the nav column must stay the same
  width.
- **The chat model choice is a data boundary, not a preference.** Craigson
  Lambda 2.0 is in-house and the default and is the only model that sees
  company data; Claude and GPT are hosted, so anything sent to them leaves the
  tenancy. The composer states which regime you're in. **This has to be
  enforced in the API layer — the label is not the control.**
- **No date library.** Onboarding only needs "pick a day", so `Calendar` uses
  `Date` + `Intl`. All maths is local-time: a UTC-based `Date` lands on the
  wrong day for anyone east of Greenwich, which is most of this product's
  users. Use `toISODate`, never `toISOString`.
- **Panels never carry `overflow: hidden`.** That makes an element a scroll
  container, which then becomes the scrollport for any `sticky` child — the
  child offsets by its `top` immediately and never sticks, because that
  container doesn't scroll. In `AppShell` the `<aside>` owns width (and so the
  collapse animation) and an inner sticky wrapper owns clipping.
- **Auth components render and validate shape, nothing else.** Auth belongs on
  the server; a component that "signs you in" in the browser is a component
  that lies. `/sign-in` has no backend behind it yet.

## Fonts and icons

**Google Sans Flex** is self-hosted in [`public/fonts/`](public/fonts/) and
committed — it's flagged open source in the Google Fonts catalogue. `.gitignore`
still blocks font binaries by default and allow-lists only this family, so a
licensed face can't land in this public repo by accident.

**Material Symbols (Rounded)** are vendored into `src/components/ui/icons.tsx`
by `scripts/gen-icons.py`. To add an icon, add it to the `ICONS` map and run:

```bash
python3 scripts/gen-icons.py
```

Facebook's [astryx](https://github.com/facebook/astryx) was evaluated first —
it ships an `Icon` component and registry, but its own icons are explicitly
minimal fallbacks, and its docs point you at a real icon library. Hence
Material.
