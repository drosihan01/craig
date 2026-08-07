import type { AccountInfo } from "@/components/ui";

/**
 * Demo v3 — Calder Diagnostics.
 *
 * A deliberate inversion of Katalis. Ada's problem was that nothing was
 * written down, so Craig's job was excavation: get it out of her head before
 * the hire arrives. Theo's problem is the opposite and it's the more common
 * one. He has written everything down. Twice. In documents that disagree with
 * each other, none of which describe what actually happens.
 *
 * That changes what Craig is for. He isn't filling in blanks here — he's
 * reconciling three documents against each other and against the truth, and
 * the useful thing he does is notice which one is lying.
 *
 * It also raises the stakes honestly. Katalis could onboard badly and lose a
 * week. Calder is a medical device company under ISO 13485: if the training
 * record isn't signed, the auditor's finding is against the company, and
 * "we did it, we just didn't write it down" is not a defence. Onboarding is
 * a compliance artefact here, not an HR nicety.
 *
 * Fixture data. Delete it when there's real persistence.
 */

export const V3_COMPANY = {
  name: "Calder Diagnostics",
  domain: "calderdx.com",
  location: "Melbourne",
  /** How Theo describes it — and he does describe it properly. */
  pitch:
    "Point-of-care blood diagnostics. A benchtop analyser and single-use cartridges, sold to GP clinics so a patient gets a result in the same appointment rather than a second one.",
  /** The thing that makes onboarding a regulated artefact rather than a nicety. */
  regime: "ISO 13485",
  headcount: 9,
} as const;

/**
 * The founder.
 *
 * Nine years at a large device manufacturer before this, which is where the
 * documentation habit comes from and also where it stops being useful — he
 * has a quality system built for four hundred people running at nine, and he
 * knows it, and he's slightly embarrassed about it.
 *
 * Voice: full sentences, proper capitalisation, numbers in them. He answers
 * the question you asked and then answers the one you didn't. When he's
 * uncertain he says so precisely — "I think" rather than "idk". He is not
 * cold; he's careful, and he apologises for the length of things.
 *
 * The exact opposite of Ada, on purpose. If Craig sounds the same talking to
 * both of them, one of the two conversations is written wrong.
 */
export const V3_FOUNDER = {
  name: "Theo Marchetti",
  email: "theo@calderdx.com",
  role: "Founder",
  title: "Founder & CEO",
  /** Stated rather than inferred. */
  pronouns: "he/him",
  background: "Nine years in regulatory affairs at a large device manufacturer",
  note: "Has a quality system built for 400 people, running at nine.",
} as const;

export const V3_ACCOUNT: AccountInfo = V3_FOUNDER;

/**
 * The rest of Calder, as far as onboarding is concerned.
 *
 * Small enough that named individuals matter: there is exactly one person who
 * can grant lab access and she is part-time, which is the constraint the whole
 * workflow bends around.
 */
export const V3_PEOPLE = {
  theo: V3_FOUNDER,
  saoirse: {
    name: "Saoirse Kelly",
    email: "saoirse@calderdx.com",
    role: "Lab Lead",
    /** Three days a week, and the only trained lab inductor. */
    note: "Mon/Tue/Thu — the only person who can run a lab induction",
  },
  raf: {
    name: "Raf Oyelaran",
    email: "raf@calderdx.com",
    role: "Engineering Lead",
    note: "Owns the analyser firmware and every repo",
  },
} as const;

/**
 * The first hire being put through Craig.
 *
 * A Quality Systems Associate, which is the joke and the point: the person
 * whose job is to make sure records exist is the first person whose own
 * onboarding record has to be right. If Craig gets her training record wrong,
 * the first thing she does on the job is find it.
 *
 * On-site in Melbourne, so her onboarding has physical steps a software hire
 * never has — a police check, immunisation status, a lab induction that can
 * only happen on a day Saoirse is in.
 */
export const V3_STARTER = {
  id: "priya",
  name: "Priya Raghunathan",
  email: "priya@calderdx.com",
  personalEmail: "p.raghunathan@fastmail.com",
  role: "Quality Systems Associate",
  startsIn: "10 days",
  startDate: "Monday 24 August",
  location: "Melbourne — on-site, lab access required",
  background: "Four years in QA at a contract manufacturer",
  note: "Her job is making sure records exist. Hers had better.",
} as const;

/** Mentioned, not onboarded — he's the reason Theo wants this repeatable. */
export const V3_NEXT_STARTER = {
  name: "Aaron Whitlock",
  role: "Field Applications Specialist",
  startsIn: "6 weeks",
} as const;
