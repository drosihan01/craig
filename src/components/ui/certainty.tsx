import { Badge } from "./badge";

/* --- Certainty -------------------------------------------------------------- */

/**
 * How Craig knows a step is done.
 *
 * The difference between a checklist and an agent is whether "done" means
 * somebody said so or somebody checked. He created the Google account and can
 * see it, so that one is verified; Saoirse says she ran the lab induction and
 * there is nothing for him to look at, so that one is somebody's word and no
 * amount of green will make it more. Showing which is which is more honest
 * than a column of identical ticks, and at a company whose training records
 * get read by an auditor it's the whole value of the record.
 *
 * Product vocabulary, so it lives here rather than in a demo's fixture — the
 * admin's view and the new starter's read the same three words for the same
 * three states, and can't drift.
 */

export const CERTAINTY = {
  /** Craig checked the service himself and can see it. */
  verified: {
    label: "Verified",
    note: "I checked this one myself",
    tone: "success",
  },
  /** A person said so. Craig has no way to look. */
  confirmed: {
    label: "Confirmed",
    note: "Somebody told me — I can't check it",
    tone: "neutral",
  },
  /** Nobody has said anything either way. */
  assumed: {
    label: "Not checked",
    note: "Nobody has said either way",
    tone: "warning",
  },
} as const;

export type Certainty = keyof typeof CERTAINTY;

export function CertaintyPill({
  certainty,
  size,
  className,
}: {
  certainty: Certainty;
  size?: "sm" | "md";
  className?: string;
}) {
  const c = CERTAINTY[certainty];
  return (
    <Badge tone={c.tone} size={size} className={className}>
      {c.label}
    </Badge>
  );
}
