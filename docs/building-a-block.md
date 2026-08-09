# Building an integration block

The brief for anyone — human or agent — adding a block to Craig. Written after
the Google Workspace block was taken end to end against a live tenant, and after
the editor was made block-agnostic (PRs #29–#30). Follow it in order; every rule
here was paid for.

## What a block is

A block is a preset in `src/lib/workflow/library.ts` that an admin drops into a
workflow. Most presets are complete as labels — an admin ticks them off, or a
joiner answers a field. An **integration block** is one that acts on an outside
service, and it has up to four parts:

1. **A row in `src/lib/craig/blocks.ts`** — the preset id, which `connections`
   provider it needs, what automation it produces (usually `null` until a
   runner exists), and the `blockedReason` sentence the publish gate shows.
2. **A connection module** in `src/lib/<service>/` — OAuth/token flow against
   the provider, storing sealed credentials in the `connections` table.
3. **A settings panel** registered in
   `src/components/craig/block-settings.tsx`, keyed by the preset id.
4. **A runner** in `automation.ts` — only when the block does work on a
   joiner's step. Most first versions stop before this.

The editor knows none of your block's names. If you find yourself editing
`workflow-editor.tsx`, you are doing it wrong.

## The rules

- **No SDKs.** `fetch` + `URLSearchParams` + `crypto.subtle`, matching Google,
  Resend and Stripe. (Supabase is the one argued exception; do not add more.)
- **`Unverified:` header** at the top of every module that has not met a real
  tenant, saying what has not been proven. Delete the line only when a real
  call has succeeded. An integration that typechecks, lints and builds is
  still unverified — Google's failed three times in a row on first live
  contact, in three unrelated ways.
- **Sealed credentials.** Copy the AES-GCM pattern in `accounts.ts`
  (`token_ciphertext`/`token_iv`/`token_tag`, unique on
  `(account_id, provider)`). Nothing bearer-shaped in any table, ever.
- **Never read a webhook body as truth.** A delivery means "something changed";
  re-read state through code that already knows the rules.
- **Never pin a per-build URL.** Redirect URIs use the stable alias
  `https://craig-alpha.vercel.app`.
- **Docs lie about limits.** Wherever a provider doc says "opaque",
  "arbitrary" or "your choice", assume an unstated charset or length rule.
  Note it as a risk in the header; only a live call settles it.
- **Failure vocabulary in the customer's words.** Library sentences go to the
  log; customer sentences go to the screen. `result.ts` and `settle()` in the
  Google block are the pattern.
- **Revoke at the provider before deleting local credentials** — after the row
  is gone there is nothing left to authenticate the revocation with.
- **Comments explain why, at length.** Read two existing modules before
  writing; if your file's comment density is far below theirs, it will read as
  imported code.

## What "done" means without a tenant

Honestly: scaffolding. The deliverable for a block whose service nobody has
connected is (1) the registry row, (2) a connection module whose OAuth URL
construction and token exchange compile and follow the provider's documented
flow, (3) a settings panel that shows connected/not-connected, and (4) an
`Unverified:` header saying exactly what a live tenant still has to prove.
Do not claim more than that anywhere — not in comments, not in commit
messages, not in PR bodies.

## Provider notes

Anything already learned about a specific provider lives beside its module.
Before starting a block, check whether `src/lib/<service>/` already exists.
