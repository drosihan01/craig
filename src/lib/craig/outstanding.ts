import "server-only";
import { AUTOMATION_BY_PRESET, JOINER_HOME, type Joiner } from "./contract";
import { getAccount } from "./accounts";
import { isRunInterrupted, progressOf, runStateOf } from "./joiners";
import { outOfSeats, seatEntitlement, type SeatEntitlement } from "./seats";
import { listJoiners } from "./joiners";
import { subscriptionFor } from "./accounts";
import { listWorkflows } from "./workflows";
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

  /* Craig has stopped chasing, and this is the only place that says so
     besides one email a fortnight ago.

     `urgent`, above the "waiting on you" items, because it is the only line on
     this screen that reports a *person* who has gone quiet rather than a task
     the reader has not got to. Everything else here waits patiently and is
     still true tomorrow; this one has a start date attached to it.

     Deliberately in the same list as everything else rather than in a banner
     of its own. An escalation that needs its own furniture is an escalation
     nobody built the second one of — and by construction there is at most one
     of these per person, ever, because `handedOverAt` is set once. */
  for (const joiner of joiners) {
    if (!joiner.handedOverAt) continue;

    const theirs = joiner.steps.filter(
      (s) => s.actor === "joiner" && !s.completedAt,
    );
    if (theirs.length === 0) continue;

    items.push({
      id: `handedover:${joiner.id}`,
      ask: `${firstName(joiner.name)} hasn't responded, and I've stopped asking.`,
      detail: `Three reminders, no movement on ${theirs.length === 1 ? "one thing" : `${theirs.length} things`}. I won't email them about it again — this one needs a word from a person.`,
      tone: "urgent",
      href: `/people/${joiner.id}`,
      cta: "Look",
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


/* --- As notifications ------------------------------------------------------ */

/**
 * The same items, in the shape the bell reads.
 *
 * The header's corner used to hold a theme switch, and the bell only appeared
 * on two screens, both feeding it hardcoded demo rows. A bell that can never
 * ring is decorative, and this codebase has removed three such controls in a
 * day — a model picker the server ignored, a microphone with no speech behind
 * it, a Sign out that cleared the wrong cookie. Rather than add a fourth, the
 * bell now reads the list Home already computes, which is real and is already
 * the answer to "what needs me".
 *
 * A derivation rather than a second store, so the two can never disagree: the
 * panel and the bell are one list read twice. When "someone finished a step"
 * joins them it belongs *here*, beside these, for the same reason.
 *
 * `timestamp` is deliberately absent. These are states rather than events —
 * being out of seats did not happen at a moment — and `AppNotification` takes
 * an optional one precisely so this does not have to invent "just now" every
 * time the page loads.
 */
/**
 * The bell's contents for an account, fetched and mapped in one call.
 *
 * Every admin screen wants the same list, and the alternative was each page
 * assembling the three inputs `outstandingFor` needs — workflows, joiners,
 * entitlement — before it could ask. That is four queries per screen written
 * out five times, and the fifth screen is where somebody passes a stale
 * entitlement and the bell quietly disagrees with the page.
 *
 * **Not for joiner screens.** `/me` runs on the same shell, and this list is
 * the *employer's* — seats, billing, unpublished workflows, other people's
 * broken steps. A new starter must never be handed it. There is no accidental
 * path to that here: this takes an account email, and a joiner has none.
 */
export async function notificationsFor(accountEmail: string) {
  const [workflows, joiners, subscription] = await Promise.all([
    listWorkflows(accountEmail),
    listJoiners(accountEmail),
    subscriptionFor(accountEmail),
  ]);

  const items = await outstandingFor(accountEmail, {
    workflows,
    joiners,
    entitlement: seatEntitlement(subscription, joiners.length),
  });

  return asNotifications(items);
}

/**
 * The bell's contents for a *new starter*, which is a different list entirely.
 *
 * `/me` runs on the same shell as the admin's screens, so it would otherwise
 * inherit `notificationsFor` — seats, billing, unpublished workflows, other
 * people's broken steps. None of that is theirs. This is the joiner's
 * equivalent, built from their own record and nothing else, which is the same
 * rule the whole joiner surface follows: it takes a `Joiner`, so there is no
 * argument a caller could pass that reaches the employer's account.
 *
 * Three things are worth telling somebody being onboarded, and they are all
 * about *them*: the step waiting on them, an account that is ready and needs a
 * sign-in, and their start date once it is close. Nothing about how the company
 * is getting on with its half — that is on their plan already, phrased for
 * them, and a bell is for things that need you.
 */
export function joinerNotifications(joiner: Joiner) {
  const out: {
    id: string;
    kind: "overdue" | "approval" | "complete" | "info";
    title: string;
    description: string;
    href?: string;
  }[] = [];

  const { next } = progressOf(joiner);

  if (next) {
    out.push({
      id: `next:${next.id}`,
      kind: "approval",
      title: next.title,
      description: "This is the next thing waiting on you.",
      href: JOINER_HOME,
    });
  }

  /* The one automated step that needs them to do something. `awaiting` means
     the account exists and nobody has signed into it yet — see RunState — so
     it is the only run state a new starter can act on. The others are the
     company's problem and are already described on their plan. */
  for (const step of joiner.steps) {
    if (step.actor !== "craig") continue;
    if (runStateOf(step) !== "awaiting") continue;
    out.push({
      id: `awaiting:${step.id}`,
      kind: "complete",
      title: `${step.title} is ready`,
      description:
        "Your password is in the email we sent you — sign in once and this one is finished.",
      href: JOINER_HOME,
    });
  }

  return out;
}

export function asNotifications(
  items: OutstandingItem[],
): {
  id: string;
  kind: "overdue" | "approval" | "info";
  title: string;
  description: string;
  href?: string;
}[] {
  return items.map((item) => ({
    id: item.id,
    /* Three tones onto three kinds, chosen by who has to act rather than by
       severity: urgent is a thing blocking somebody today, waiting is a thing
       sitting with you, tidy is neither. */
    kind:
      item.tone === "urgent"
        ? ("overdue" as const)
        : item.tone === "waiting"
          ? ("approval" as const)
          : ("info" as const),
    title: item.ask,
    description: item.detail,
    href: item.href,
  }));
}
