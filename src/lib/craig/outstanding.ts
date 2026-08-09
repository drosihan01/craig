import "server-only";
import { AUTOMATION_BY_PRESET, type Joiner } from "./contract";
import { getAccount } from "./accounts";
import { isRunInterrupted, progressOf, runStateOf } from "./joiners";
import { outOfSeats, type SeatEntitlement } from "./seats";
import type { StoredWorkflow } from "./workflows";

/**
 * What actually needs somebody, derived from the account rather than invented.
 *
 * There is a version of this in the archive — `craig-activity.ts` — and it is
 * six hardcoded sentences about a new starter who does not exist. It was right
 * for a demo and it is worth being explicit that none of it is reused here: a
 * home screen whose to-do list is a fixture is a screen that lies confidently,
 * which is worse than one that says there is nothing to do.
 *
 * Every item below is a real fact with a real reader. The test each one has to
 * pass is whether somebody could act on it in the next minute — "you have three
 * workflows" is a number, "Priya has been waiting four days for you to tick
 * something" is a job.
 *
 * Ordered by whose week it blocks. A new starter stuck on their first morning
 * comes before an admin's tidying, and a thing that is silently broken comes
 * before either, because nobody is going to discover it any other way.
 */

export type OutstandingTone = "urgent" | "waiting" | "tidy";

export interface OutstandingItem {
  id: string;
  /** Written as Craig would say it, to the person who can fix it. */
  ask: string;
  /** The specific, checkable detail underneath. */
  detail: string;
  tone: OutstandingTone;
  /** Where the fix is, when there is a single place. */
  href?: string;
  cta?: string;
}

interface Context {
  workflows: StoredWorkflow[];
  joiners: Joiner[];
  entitlement: SeatEntitlement;
}

/** Whether any workflow actually depends on Google, so we only nag about a
    connection somebody's plan is waiting on. */
function usesGoogle(workflows: StoredWorkflow[]): boolean {
  return workflows.some((w) =>
    (w.blocks as { preset?: string }[]).some(
      (b) => b?.preset && Object.hasOwn(AUTOMATION_BY_PRESET, b.preset),
    ),
  );
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export async function outstandingFor(
  accountEmail: string,
  { workflows, joiners, entitlement }: Context,
): Promise<OutstandingItem[]> {
  const items: OutstandingItem[] = [];
  const account = await getAccount(accountEmail);

  /* --- Broken, and nobody will find out otherwise ----------------------- */

  for (const joiner of joiners) {
    for (const step of joiner.steps) {
      if (step.actor !== "craig") continue;
      const state = runStateOf(step);

      if (state === "failed") {
        items.push({
          id: `failed:${joiner.id}:${step.id}`,
          ask: `${firstName(joiner.name)}'s account didn't get created.`,
          detail:
            step.run?.message ??
            "Craig tried and Google refused. It can be run again from their page.",
          tone: "urgent",
          href: `/people/${joiner.id}`,
          cta: "Look",
        });
      } else if (isRunInterrupted(step)) {
        items.push({
          id: `stuck:${joiner.id}:${step.id}`,
          ask: `${firstName(joiner.name)}'s account is stuck part-way.`,
          detail:
            "An attempt started and never reported back. Craig can ask Google what actually happened.",
          tone: "urgent",
          href: `/people/${joiner.id}`,
          cta: "Check",
        });
      } else if (step.run?.emailProblem) {
        items.push({
          id: `nopassword:${joiner.id}:${step.id}`,
          ask: `${firstName(joiner.name)} has an account but never got the password.`,
          detail: step.run.emailProblem,
          tone: "urgent",
          href: `/people/${joiner.id}`,
          cta: "Look",
        });
      }
    }
  }

  if (account?.google?.needsReconnect) {
    items.push({
      id: "google:reconnect",
      ask: "Google Workspace needs connecting again.",
      detail:
        "The permission it was given has stopped working, so no new accounts are being created until a Workspace admin reconnects it.",
      tone: "urgent",
      href: "/settings",
      cta: "Reconnect",
    });
  }

  /* --- Waiting on you, and somebody can feel it ------------------------- */

  for (const joiner of joiners) {
    const progress = progressOf(joiner);
    const admin = progress.overall.admin;
    if (admin.total > 0 && admin.done < admin.total) {
      const left = admin.total - admin.done;
      items.push({
        id: `tick:${joiner.id}`,
        ask: `${firstName(joiner.name)} is waiting on you for ${left === 1 ? "one thing" : `${left} things`}.`,
        detail:
          "Steps on their onboarding that only you can mark done — nothing moves past them until you do.",
        tone: "waiting",
        href: `/people/${joiner.id}`,
        cta: "Tick",
      });
    }
  }

  if (!account?.google && usesGoogle(workflows)) {
    items.push({
      id: "google:connect",
      ask: "Connect Google Workspace.",
      detail:
        "One of your workflows creates accounts, and it can't run until a Workspace admin connects it once.",
      tone: "waiting",
      href: "/settings",
      cta: "Connect",
    });
  }

  if (joiners.length > 0 && outOfSeats(joiners.length, entitlement.limit)) {
    items.push({
      id: "seats",
      ask: "You're out of seats.",
      detail: `Everyone already invited keeps theirs. Adding anybody else needs more — ${entitlement.price} a month for ${entitlement.paidSeats}.`,
      tone: "waiting",
      href: "/settings",
      cta: "See plans",
    });
  }

  /* --- Yours to finish, at your own pace -------------------------------- */

  for (const workflow of workflows) {
    if (workflow.published) continue;
    items.push({
      id: `unpublished:${workflow.id}`,
      ask: `${workflow.name} isn't published yet.`,
      detail:
        "It runs against nobody until it is. Publishing is also where you invite the first person onto it.",
      tone: "tidy",
      href: `/workflows/${workflow.id}`,
      cta: "Open",
    });
  }

  return items;
}
