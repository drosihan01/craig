/**
 * What Craig can answer from, and what he can't.
 *
 * Lifted out of the Resources page when Craig started answering questions on
 * Home: he claims to know only what's here, and a claim like that has to read
 * from the same list the page shows or it's just a sentence.
 *
 * The missing entries carry as much weight as the present ones. They're why
 * two steps in the workflow can't be configured, and they're what stops him
 * inventing a policy when asked for one.
 */

export type ResourceState = "current" | "stale" | "missing";

export const STATE: Record<
  ResourceState,
  { label: string; tone: "success" | "warning" | "danger" }
> = {
  current: { label: "Current", tone: "success" },
  stale: { label: "Out of date", tone: "warning" },
  missing: { label: "Doesn't exist", tone: "danger" },
};

export interface Resource {
  name: string;
  meta: string;
  state: ResourceState;
  /** How many workflow steps depend on it. */
  usedBy?: number;
}

export const LIBRARY: { category: string; items: Resource[] }[] = [
  {
    category: "Onboarding",
    items: [
      {
        name: "Katalis Handbook",
        meta: "PDF · uploaded by Ada · last updated Feb 2026",
        state: "stale",
        usedBy: 1,
      },
      {
        name: "First-week checklist",
        meta: "Four bullets, inside the handbook — not its own doc",
        state: "stale",
      },
    ],
  },
  {
    category: "Legal and payroll",
    items: [
      {
        name: "Employment contract",
        meta: "Template · one per hire",
        state: "current",
        usedBy: 1,
      },
      {
        name: "Payroll and tax details",
        meta: "Form · collected per hire",
        state: "current",
        usedBy: 1,
      },
      {
        name: "Right to work — Germany",
        meta: "Nobody has said which check applies to a Berlin hire",
        state: "missing",
        usedBy: 1,
      },
    ],
  },
  {
    category: "Engineering",
    items: [
      {
        name: "What's live and what's fallback",
        meta: "Only in Jason's head",
        state: "missing",
        usedBy: 1,
      },
      {
        name: "Slack channel list",
        meta: "Which channels a new engineer actually needs",
        state: "missing",
        usedBy: 1,
      },
      {
        name: "Access and key ownership",
        meta: "Jason, entirely",
        state: "missing",
      },
    ],
  },
  {
    category: "Policies",
    items: [
      {
        name: "Security policy",
        meta: "None yet",
        state: "missing",
      },
    ],
  },
];

export const ALL_RESOURCES = LIBRARY.flatMap((g) => g.items);

export const MISSING_COUNT = ALL_RESOURCES.filter(
  (r) => r.state === "missing",
).length;

/** The best match for something she typed, or nothing. */
export function findResource(query: string) {
  const q = query.toLowerCase();
  return (
    ALL_RESOURCES.find((r) => q.includes(r.name.toLowerCase())) ??
    ALL_RESOURCES.find((r) =>
      r.name
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((w) => w.length > 4)
        .some((w) => q.includes(w)),
    ) ??
    null
  );
}
