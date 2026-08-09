@AGENTS.md

# Start here

**Read the `craig-open-items` note in your memory directory before doing
anything else.** It is the handover: what is deployed, what is waiting on Dzaky,
what to build next and in what order, and the traps that have already cost a day
between them. The memory index lists it first.

The index alone is not enough. Those are one-line summaries; the notes behind
them hold the actual reasoning, and the ones that repeatedly matter are
`craig-integration-block-tips` (before touching any provider integration) and
`craig-agent-db-incident` (before anything destructive in Supabase).

# Two things about this repository that mislead people

**`src/lib/craig/` and `src/components/craig/` are the live product.** They were
called `showcase/` until PR #19, because the app once lived at `/showcase`. Any
comment, note or memory still saying `showcase` means one of these.

**`src/archive/` is dead.** The Ada-era demos, the design system, the old
sandbox. It is kept in git because a lot of the design was worked out there, it
is outside the router so it is compiled by nothing and served to nobody, and it
should never be edited or used as a reference for how the product works now.

`/api/showcase/*` is the one name still lying, deliberately: Stripe holds
`/api/showcase/billing/webhook` in its own dashboard, so renaming it is a
coordinated change with an external system rather than a tidy-up.
