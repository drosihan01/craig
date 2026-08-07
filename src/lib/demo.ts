import type { AccountInfo } from "@/components/ui";

/**
 * Demo seed data — one company, one story, across every screen.
 *
 * Katalis is deliberately a three-person startup with no written process. A
 * larger, more organised company barely needs Craig; the value only shows when
 * the onboarding a new hire needs exists solely in someone's head and a Notion
 * doc written at 11pm. Every screen should read as that company.
 *
 * This is fixture data, not domain code. When real persistence lands, delete
 * it rather than growing it.
 */

export const COMPANY = {
  name: "Katalis",
  domain: "katalis.ai",
  /** How Ada describes it, not how a deck would. */
  pitch:
    "AI infra — model routing, fallback, and cost/latency monitoring for teams running multiple providers in prod.",
} as const;

export const PEOPLE = {
  ada: {
    name: "Ada Yıldız",
    email: "ada@katalis.ai",
    role: "Founder",
  },
  jason: {
    name: "Jason Cho",
    email: "jason@katalis.ai",
    role: "Cofounder",
  },
  matty: {
    name: "Matty",
    email: "matty@katalis.ai",
    role: "Contractor",
  },
} as const;

/**
 * The hire the demo is about.
 *
 * Deliberately someone from a *larger* company. Nils has always had onboarding
 * happen to him — a checklist, a buddy, a wiki that was true. At Katalis none
 * of that exists, and the trait that makes him good at his job is exactly what
 * makes that dangerous: he won't ask the same question twice. He'll burn half a
 * day working it out rather than interrupt Jason, and eventually he'll guess.
 *
 * The timezone is the other half of it. Jason owns every credential and sits
 * nine hours behind, so "just ask Jason" is a two-hour window a day.
 */
export const NEW_HIRE = {
  name: "Nils Hoffman",
  email: "nils@katalis.ai",
  role: "Engineer",
  startsIn: "2 weeks",
  location: "Berlin — 9h ahead of Jason",
  background: "4 years at a ~400-person payments company",
  note: "First time somewhere this small. Won't ask twice.",
} as const;

/** The signed-in admin on every screen. */
export const ACCOUNT: AccountInfo = PEOPLE.ada;
