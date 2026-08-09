import type { AccountInfo } from "@/components/ui";

/**
 * Who's signed into the showcase.
 *
 * One account, no user table — the showcase exists to demonstrate the product
 * with a real backend behind it, not to be a tenanted SaaS. The credentials
 * live in `.env.local`; this is the display half, and it's the only place a
 * name or company should be hardcoded.
 *
 * Deliberately a different company from the scripted demos. Katalis has
 * nothing written down and Calder has too much written down badly — both are
 * arguments about *documents*. Bellwether is neither: three people who live in
 * other people's tools, where onboarding means access to eleven SaaS accounts
 * nobody has ever listed, and the founder has never written any of it down
 * because there was never a second person to write it for.
 *
 * That matters for discovery, which is what the showcase actually tests. Craig
 * can't reconcile documents here because there aren't any. He has to ask.
 */

export const SHOWCASE_COMPANY = {
  name: "Bellwether",
  domain: "bellwether.studio",
  /** How Astrid describes it, not how a deck would. */
  pitch:
    "Outbound for B2B startups — we write the sequences, run the sending infrastructure, and hand back meetings rather than a dashboard.",
  headcount: 3,
} as const;

export const SHOWCASE_FOUNDER = {
  name: "Astrid Wang",
  email: `astrid@${SHOWCASE_COMPANY.domain}`,
  role: "Founder",
  title: "Founder",
} as const;

export const SHOWCASE_ACCOUNT: AccountInfo = SHOWCASE_FOUNDER;
