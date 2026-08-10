import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { findTemplate, SENDER } from "@/lib/email";
import { renderEmail } from "@/lib/email/html";
import { sendEmail } from "@/lib/email/send";
import { JOIN_PATH, type Joiner, type JoinerStep } from "./contract";
import { createJoinerToken } from "./joiner-session";
import { listJoinersForSweep } from "./joiners";
import { decideNudge, NUDGE_CEILING } from "./nudges";
import { readableDate } from "@/lib/workflow/library";

/**
 * The daily round of chasing, and the daily round of giving up.
 *
 * Split from `nudges.ts` on purpose: that file decides *whether* and this one
 * *does*. The decision is the part with the product judgement in it and the
 * part worth reading on its own, and keeping it free of Supabase, tokens and
 * Resend is what lets it stay that way.
 *
 * Runs once a day from `/api/cron/nudge`. Once, because Vercel's Hobby plan
 * allows a cron no more often than that — and because a chase whose whole
 * design is "every few days" gains nothing from a finer clock. The cadence
 * lives in the decision, not in the schedule.
 */

const CHASE_TEMPLATE = "chase";
const HANDOVER_TEMPLATE = "handover";

export interface SweepReport {
  /** Joiners considered. */
  seen: number;
  chased: number;
  handedOver: number;
  /** Considered and deliberately left alone — the number that should dominate. */
  quiet: number;
  failed: number;
}

/**
 * The outstanding list, as a sentence somebody will read in an inbox.
 *
 * One line per thing, because a count on its own ("you have 3 items") is a
 * number somebody has to open an app to understand, and the whole point of the
 * chase is that it can be understood without opening anything. The titles are
 * the admin's own words from the workflow, which is what makes this specific
 * rather than generic.
 */
function listOf(steps: JoinerStep[]): string {
  if (steps.length === 1) return `There's one thing left: ${steps[0].title}.`;
  const lines = steps.map((s) => `• ${s.title}`).join("\n");
  return `There are ${steps.length} things left:\n\n${lines}`;
}

/**
 * Everything the template vocabulary knows, filled for a nudge.
 *
 * Every token, including the ones neither template reads. The invite route
 * explains the hazard at length and it is the same one: `render` fills
 * anything absent from the *preview's* fixtures, so a token left out does not
 * arrive blank — it arrives carrying a name from the demo company, in a real
 * person's inbox, on the day somebody adds a merge field rather than the day
 * anybody touches this file.
 */
function vocabulary(
  joiner: Joiner,
  steps: JoinerStep[],
  link: string,
  recipientFirstName: string,
) {
  return {
    first_name: recipientFirstName,
    full_name: joiner.name,
    company: joiner.company,
    role: joiner.role,
    start_date: readableDate(joiner.startDate) ?? joiner.startDate,
    sender: "",
    workflow: joiner.workflowName,
    /* The outstanding list travels as `step`. It is the token both templates
       already reserve for "the thing this email is about", and this email is
       about all of them at once. */
    step: listOf(steps),
    owner: "",
    link,
  };
}

const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * Chase one person about their own outstanding list.
 *
 * The link is minted fresh rather than stored, exactly as the invitation's is
 * and for the same reason: there is nowhere on this side that a bearer token
 * could be kept that would not also be somewhere it could leak from. A new one
 * costs an HMAC.
 */
async function chase(
  joiner: Joiner,
  steps: JoinerStep[],
  origin: string,
): Promise<boolean> {
  const template = findTemplate(CHASE_TEMPLATE);
  if (!template) {
    console.error(`[nudge] no template "${CHASE_TEMPLATE}"`);
    return false;
  }

  const token = await createJoinerToken(joiner.id);
  const link = `${origin}${JOIN_PATH}?token=${encodeURIComponent(token)}`;

  const { subject, html, text } = renderEmail(
    template,
    vocabulary(joiner, steps, link, firstNameOf(joiner.name)),
  );

  const sent = await sendEmail({
    to: joiner.email,
    subject,
    html,
    text,
    fromName: SENDER.name(joiner.company),
  });

  return sent.ok;
}

/**
 * Tell the admin that the chasing has stopped, and why.
 *
 * Deliberately *not* sent to the joiner as well. They have had three emails
 * already; a fourth telling them their manager has been informed is a threat
 * dressed as a status update, aimed at somebody who has worked here for under
 * a week.
 */
async function handOver(
  joiner: Joiner,
  steps: JoinerStep[],
  origin: string,
): Promise<boolean> {
  const template = findTemplate(HANDOVER_TEMPLATE);
  if (!template) {
    console.error(`[nudge] no template "${HANDOVER_TEMPLATE}"`);
    return false;
  }

  const { subject, html, text } = renderEmail(
    template,
    /* The admin's own page for this person, not a joiner token. Sending the
       new starter's credential to somebody else would let the admin walk in as
       them — the one link in this file that must never be the same link. */
    vocabulary(
      joiner,
      steps,
      `${origin}/people/${joiner.id}`,
      firstNameOf(joiner.accountEmail.split("@")[0]),
    ),
  );

  const sent = await sendEmail({
    to: joiner.accountEmail,
    subject,
    html,
    text,
    fromName: SENDER.name(joiner.company),
  });

  return sent.ok;
}

/**
 * One pass over everybody, for every account.
 *
 * Never throws. One tenant whose mail bounces must not stop the sweep reaching
 * the next, and a sweep that gave up on the first failure would be a sweep
 * that stops working the moment anybody's address goes bad — the same argument
 * the Google watch sweep makes, and the same shape of answer.
 *
 * **State is written only after the send succeeds.** The order matters and the
 * direction of the failure is chosen: a send that worked but whose write
 * failed produces a second email tomorrow, which is mildly annoying; a write
 * that happened before a failed send produces silence forever, which is the
 * bug this whole feature exists to fix. Annoying beats silent.
 */
export async function sweepNudges(origin: string): Promise<SweepReport> {
  const report: SweepReport = {
    seen: 0,
    chased: 0,
    handedOver: 0,
    quiet: 0,
    failed: 0,
  };

  let candidates: Joiner[];
  try {
    candidates = await listJoinersForSweep();
  } catch (cause) {
    console.error("[nudge] couldn't read the joiner list:", cause);
    return report;
  }

  const now = new Date();
  const db = supabaseAdmin();

  for (const joiner of candidates) {
    report.seen += 1;

    const decision = decideNudge(joiner, now);
    if (decision.action === "nothing") {
      report.quiet += 1;
      continue;
    }

    try {
      if (decision.action === "chase") {
        const ok = await chase(joiner, decision.steps, origin);
        if (!ok) {
          report.failed += 1;
          continue;
        }

        const { error } = await db
          .from("joiners")
          .update({
            nudged_at: now.toISOString(),
            nudge_count: decision.attempt,
          })
          .eq("id", joiner.id);
        if (error) throw error;

        report.chased += 1;
        continue;
      }

      const ok = await handOver(joiner, decision.steps, origin);
      if (!ok) {
        report.failed += 1;
        continue;
      }

      const { error } = await db
        .from("joiners")
        .update({ handed_over_at: now.toISOString() })
        .eq("id", joiner.id);
      if (error) throw error;

      report.handedOver += 1;
    } catch (cause) {
      /* Counted, logged, and the sweep carries on. The id is enough to find
         the row; the address is not logged, because a log line is a place
         somebody else's email address should not end up. */
      console.error(`[nudge] ${joiner.id} failed:`, cause);
      report.failed += 1;
    }
  }

  return report;
}

export { NUDGE_CEILING };
