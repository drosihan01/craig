# craig

Craig is an onboarding agent. An admin describes their company to him in
conversation; he finds the parts nobody wrote down, drafts a workflow out of it,
and then runs the half of it that can be automated. A new starter gets a link,
a checklist, and Craig himself to ask.

**Live at [craig-alpha.vercel.app](https://craig-alpha.vercel.app).**

Two seats, and they are genuinely two products:

- **Admin** — signs up, talks to Craig, publishes workflows, invites people,
  connects Google Workspace, uploads documents, pays for seats.
- **New starter** — arrives on a magic link with no account and no password,
  works through their checklist, reads what the company shared, and asks Craig
  questions about their own onboarding.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run build        # production build
npm run lint
npx next typegen && npx tsc --noEmit
```

`next typegen` matters: `PageProps` and `LayoutProps` are **generated** globals
that live in `.next/types`. Delete `.next` and `tsc` reports nine errors that
look like a broken branch and are a missing cache. Typegen regenerates them in
about a second, which is also the fast way to typecheck — a full build takes
minutes and catches the same type errors.

Environment variables are documented in [`.env.example`](.env.example). Without
Supabase and OpenAI keys the app builds and starts but cannot sign anybody in or
answer anything.

## Routes

**Admin** (all behind a session, guarded per page — the proxy is a matcher, not
a wall): `/` home · `/people` · `/people/[id]` · `/workflows` ·
`/workflows/[id]` the builder · `/resources` documents · `/settings` ·
`/welcome` first run · `/sign-in` · `/sign-up`

**New starter** (magic link, no account): `/join` accepts the link and sets a
cookie · `/me` their checklist, Craig, and anything shared with them

**API**: `/api/chat`, `/api/joiner/chat`, `/api/documents/*`,
`/api/joiner/documents/[id]`, `/api/google/*`, `/api/joiner/link`,
`/api/showcase/*`

`/api/showcase/*` is deliberately not renamed with the rest: Stripe holds
`/api/showcase/billing/webhook` in its dashboard, so renaming it is a
coordinated change with an external system rather than a tidy-up.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind v4 · TypeScript · Supabase
(Postgres, Storage, Auth) · OpenAI Agents SDK · Stripe · Resend · Google
Workspace Admin SDK.

**No SDKs for integrations.** Google, Stripe and Resend are all `fetch` +
`URLSearchParams` + `crypto.subtle`. Supabase is the one argued exception, on
auth cookie and refresh safety.

## Layout

```
src/
  app/
    (app)/               the product — a route group, so it can keep its own
                         layout without colliding with the root one
    api/                 route handlers; each is its own front door
  components/
    ui/                  the design system
      icons.tsx          generated — do not hand-edit
    craig/               product components
  lib/
    craig/               the domain: agents, prompts, stores, contract
    google/ stripe/ email/ supabase/   integrations, no SDKs
    workflow/library.ts  the block library the builder offers
  archive/               design-system/ (documents components/ui) and
                         email/ (the mailmaker). Outside the router, so
                         neither is served — kept as reference. Everything
                         else that was here is in drosihan01/craig-archive
  proxy.ts               Next 16 middleware
docs/building-a-block.md the brief for adding an integration block
```

## How it fits together

**Two agents, not one with a flag.** `lib/craig/craig-agent.ts` is the admin's
Craig and carries ten tools that write to workflows and record what he learns.
`lib/craig/joiner-agent.ts` is the new starter's Craig and carries **one**, a
document search. That is the access boundary: the tools are what reach the
employer's data, and a flag that gates them is one refactor away from not
gating them. A joiner's context is assembled by an allowlist from their own
record, so a column added to that record later never travels by accident.

**Blocks are rows, not branches.** `lib/craig/blocks.ts` says what each
integration block needs — which connection, what it produces, what to tell
somebody when it is not set up. The workflow editor asks it rather than naming
providers, so adding a block does not mean teaching the editor about it. See
[`docs/building-a-block.md`](docs/building-a-block.md).

**Documents default to private.** Sharing one with new starters is a separate,
deliberate act on `/resources`. The rule lives in one column and one SQL
function, and the joiner-facing code takes a *person* rather than a document id,
so there is no argument a caller could pass that widens it.

**RLS is deny-all on purpose.** Every table has row-level security on and zero
policies; all access is the Next server holding the secret key. Policies become
necessary the day a browser talks to Supabase directly, and today none does.

**State the server can't verify is not trusted.** Sessions and joiner links are
HMAC-signed and re-checked against the store on every read — a signed cookie
outlives the thing it names, so a valid signature proves the server issued it
and nothing about whether that person still has a seat.

## Design system

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
- **One variable font.** Google Sans Flex, self-hosted, covering 100–1000 from a
  single 51KB file. Stick to three weights (200/400/600) anyway — the constraint
  is what keeps the UI legible.
- **Icons are vendored, not installed.** Material Symbols (Rounded) inlined as
  SVG by `scripts/gen-icons.py`, so there's no runtime dependency and no
  thousand-file package. Add one by editing the `ICONS` map and re-running it.
- **The workflow builder is one vertical column, not a canvas.** A free canvas
  would let an admin draw a shape that doesn't correspond to any execution
  order; a single column can only express what the engine can actually run. The
  trigger is structural — exactly one, always first, not movable or deletable.
- **Panels never carry `overflow: hidden`.** That makes an element a scroll
  container, which then becomes the scrollport for any `sticky` child — the
  child offsets by its `top` immediately and never sticks, because that
  container doesn't scroll. In `AppShell` the `<aside>` owns width (and so the
  collapse animation) and an inner sticky wrapper owns clipping.
- **Selection controls are native inputs** under the hood — keyboard, form
  submission and screen-reader behaviour come free; visuals are drawn by a
  sibling driven off `peer`.
- **Toasts and notifications are different jobs.** A toast confirms what just
  happened and disappears; a notification persists because it's something the
  user still has to act on. Anything *owed* to someone belongs in the feed,
  never in a toast.
- **No date library.** Onboarding only needs "pick a day", so `Calendar` uses
  `Date` + `Intl`. All maths is local-time: a UTC-based `Date` lands on the
  wrong day for anyone east of Greenwich, which is most of this product's users.
  Use `toISODate`, never `toISOString`. Dates are formatted on the server for
  the same reason — an ISO instant formatted during render is formatted twice,
  in two timezones, and either side of midnight those are different days.
- **The model picker is a data boundary, not a preference.** Where a route is
  fixed to one model there must be no picker: a control the server ignores is
  the one control that must never ship. `PromptBar` defaults it *on*, so
  surfaces that don't want it have to say so.
- **Auth components render and validate shape, nothing else.** Auth belongs on
  the server; a component that "signs you in" in the browser is a component that
  lies.

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
