import type { Metadata } from "next";
import { currentJoiner, requireJoiner } from "@/lib/craig/current-joiner";
import { progressOf } from "@/lib/craig/joiners";
import type {
  Joiner,
  PayrollDetails,
  PersonalDetails,
} from "@/lib/craig/contract";
import { dueDateFrom } from "@/lib/workflow/library";
import { listDocumentsForJoiner } from "@/lib/craig/documents";
import type { StoredDocument } from "@/lib/craig/documents";
import {
  readPersonalDetails,
  summariseDetails,
} from "@/lib/craig/personal-details";
import {
  readPayrollDetails,
  summarisePayroll,
} from "@/lib/craig/payroll-details";
import { canSealJoinerAnswers } from "@/lib/craig/sealed-answer";
import { contractStatus, type ContractStatus } from "@/lib/craig/contract-signing";
import { joinerContractPath } from "@/lib/craig/contract";
import {
  JoinerScreen,
  type ContractRow,
  type JoinerView,
  type PlanStep,
  type Resource,
} from "./joiner-screen";

/**
 * A server component wrapping the new starter's screen, for the guard and for
 * the words.
 *
 * The guard first, and for the same reason every other page in `(app)` has
 * one: the proxy is a matcher that reads a cookie, and it cannot tell whether
 * the person that cookie names still has a seat. `requireJoiner()` can, because
 * the store is genuinely reachable here — which is what makes taking somebody's
 * seat back, or resetting the showcase, actually close this page rather than
 * leave it open in a browser holding a ninety-day token.
 *
 * The words second, and that is the more interesting half. Everything below
 * turns stored data into the sentences the screen shows, on the server, on
 * purpose. Dates are the reason: an ISO instant formatted while rendering is
 * formatted twice — once in the server's timezone and once in the reader's —
 * and either side of midnight those are different days. React reports that as
 * a hydration mismatch; the person reads it as the wrong date on their own
 * record. Doing it once, here, means there is only ever one answer.
 */

export async function generateMetadata(): Promise<Metadata> {
  /* `currentJoiner` rather than `requireJoiner`: this runs before the page and
      must not redirect from inside a title. It costs nothing to call twice —
      the lookup is `cache`d for the render, so this and the page below share
      one read of the cookie and one read of the store. */
  const joiner = await currentJoiner();

  return {
    title: joiner ? `Starting at ${joiner.company} — Craig` : "Your onboarding",
    /* Somebody's onboarding, reachable by a long-lived link in their email.
       Nothing about it belongs in a search index. */
    robots: { index: false, follow: false },
  };
}

export default async function JoinerHomePage() {
  const joiner = await requireJoiner();
  const progress = progressOf(joiner);

  /* Their employer's shared documents, and only those — the filtering is
     `listDocumentsForJoiner`'s, done in the query, so nothing here has to
     remember the rule. It takes the joiner rather than an account id for the
     same reason: there is no argument this page could pass that would widen
     it. */
  const documents = await listDocumentsForJoiner(joiner);

  /* `next` is the one step with a form on it. It skips over the company's own
     steps deliberately: a new starter waiting on somebody else's name tag is
     not a new starter who should be stopped from giving their date of birth,
     and the plan below still shows them the order everything happens in. */
  const currentId = progress.next?.id ?? null;

  /* Their own sealed answers, opened here because this is the server and this
     is their own record. Nothing of what comes out reaches the browser whole —
     `readableAnswer` turns each into one line, for the reasons `summariseDetails`
     and `summarisePayroll` set out. One query per block for the whole plan
     rather than one per step, and no query at all for the plans that have no
     such step, which is most of them.

     Two reads rather than one because they are two different envelopes with two
     different AADs, and a single sweep would have to try each row both ways —
     which is a decrypt-and-fail per row, to save a round trip that the great
     majority of plans do not make at all. */
  const wantsDetails = joiner.steps.some((s) => s.field === "personal-details");
  const details = wantsDetails
    ? await readPersonalDetails(joiner.id)
    : new Map<string, PersonalDetails>();

  const wantsPayroll = joiner.steps.some((s) => s.field === "payroll-details");
  const payroll = wantsPayroll
    ? await readPayrollDetails(joiner.id)
    : new Map<string, PayrollDetails>();

  /* Whether this deployment can encrypt an answer at all. Asked before the
     form is drawn rather than after it is filled in: somebody who types twelve
     boxes and is then told the server won't take them has been wasted, and the
     honest alternative — storing it in the clear "just this once" — is the one
     thing this feature exists to prevent. One question for both blocks, because
     there is one key. */
  const canCollect = canSealJoinerAnswers();

  /* Where each contract step has got to, resolved from rows only — no bytes are
     downloaded to render a list. One query pair per contract step, and none at
     all for the great majority of plans that have none, which is why this is a
     loop over the matching steps rather than a flag threaded through
     `toPlanStep`. Sequential rather than `Promise.all` because a plan with two
     contracts in it does not exist and building for it would spend concurrency
     on nothing. */
  const contracts = new Map<string, ContractStatus>();
  for (const step of joiner.steps) {
    if (step.field !== "contract") continue;
    contracts.set(step.id, await contractStatus(joiner, step));
  }

  const view: JoinerView = {
    firstName: joiner.name.split(" ")[0] || joiner.name,
    company: joiner.company,
    workflowName: joiner.workflowName,
    startsOn: upcoming(joiner.startDate)
      ? readableDate(joiner.startDate)
      : null,
    steps: joiner.steps.map((step) =>
      toPlanStep(step, step.id === currentId, joiner, {
        details: details.get(step.id),
        payroll: payroll.get(step.id),
        canCollect,
        contract: contracts.get(step.id),
      }),
    ),
    done: progress.done,
    total: progress.total,
    finished: progress.finished,
    /* Both halves in, which is a different sentence from theirs being done.
       "That is everything" the morning the company has not made the name tag
       yet would be this screen's one outright lie. */
    allDone: progress.overall.finished,
    resources: documents.map(toResource),
  };

  return <JoinerScreen view={view} />;
}

/**
 * One stored document as one row of the list.
 *
 * The kind and the size are words here rather than a MIME type and a byte
 * count, for the same reason every date on this page is formatted server-side:
 * this is the only place that has to know, and doing it once means there is only
 * ever one answer. "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
 * is not a thing to show somebody in their first week.
 */
function toResource(document: StoredDocument): Resource {
  return {
    id: document.id,
    name: document.name,
    kind: KINDS[document.contentType] ?? "File",
    size: readableSize(document.sizeBytes),
  };
}

const KINDS: Record<string, string> = {
  "application/pdf": "PDF",
  "text/plain": "Text",
  "text/markdown": "Text",
  "application/msword": "Word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "Word",
  "application/rtf": "Word",
  "image/png": "Image",
  "image/jpeg": "Image",
};

/**
 * Bytes as a person reads them.
 *
 * One decimal place on megabytes and none on kilobytes, because "1.2 MB" is a
 * useful distinction and "847.3 KB" is noise. Base 1024, matching what every
 * operating system will have told them about the same file.
 */
function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * One stored step as one row of the plan.
 *
 * The field only travels when this is the step being asked for. A step
 * belonging to somebody at the company has none to begin with, and the one
 * ahead of them keeps its own back until its turn — so the screen is handed
 * exactly one thing it can draw a box for, and cannot invent a second by
 * reading a flag the wrong way round.
 */
function toPlanStep(
  step: Joiner["steps"][number],
  current: boolean,
  joiner: Joiner,
  sealed: {
    /** Their own answer, already opened, when this step holds one. */
    details?: PersonalDetails;
    /** The same, for the payroll block. Separate rather than a union, because
        a step is one or the other and a caller passing the wrong one should be
        a compile error rather than a summary about the wrong form. */
    payroll?: PayrollDetails;
    /** Whether a sealed answer can be taken at all on this deployment. */
    canCollect: boolean;
    /** Where a contract step has got to, when this is one. */
    contract?: ContractStatus;
  },
): PlanStep {
  const { startDate } = joiner;

  /* Resolved here, where the start date is, and formatted here for the reason
     every other date on this page is: an ISO instant formatted during render
     is formatted twice in two timezones, which is a hydration mismatch and a
     wrong date.

     Not shown once a step is done. A deadline is a thing to act on, and
     "due Thursday" beside something already finished is either noise or, when
     it was finished late, a reproach nobody needs on their first week. */
  const dueOn =
    !step.completedAt && step.due !== undefined
      ? (() => {
          const date = dueDateFrom(startDate, step.due);
          return date
            ? (readableDay(date.toISOString()) ?? undefined)
            : undefined;
        })()
      : undefined;

  const automated = step.actor === "craig" ? craigWords(step, joiner) : null;

  /* A step this deployment cannot take an answer for. It keeps its place in
     the plan and loses its form: a box that refuses everything typed into it
     is worse than no box, and this person cannot set an environment variable.
     The sentence says whose problem it is without naming the problem, which is
     the same rule every automated step's wording follows. */
  const uncollectable =
    (step.field === "personal-details" || step.field === "payroll-details") &&
    !step.completedAt &&
    !sealed.canCollect;

  return {
    id: step.id,
    title: step.title,
    actor: step.actor,
    doneOn: (step.completedAt && readableDay(step.completedAt)) || undefined,
    answer: readableAnswer(step, sealed.details, sealed.payroll),
    /* A contract step never carries a field to the screen, and that is enforced
       twice over: here, and by `AnswerForm`'s prop type, which excludes it. The
       field is what makes the screen draw a box, and a box is exactly the wrong
       thing for a contract — it would be a text input on a plan row, next to a
       document nobody had read, capable of closing a step that has no signature
       behind it. The way in is `contract` above. */
    field:
      current && !uncollectable && step.field !== "contract"
        ? step.field
        : undefined,
    askEmergencyContact: step.askEmergencyContact,
    askSuperFund: step.askSuperFund,
    askTaxFileNumber: step.askTaxFileNumber,
    contract: sealed.contract
      ? toContractRow(sealed.contract, step.id, joiner.company)
      : undefined,
    dueOn,
    detail:
      automated?.detail ??
      (uncollectable
        ? `I can't collect this safely just yet, so I'm not going to ask for it. Nothing here is waiting on you — ${joiner.company} has something to sort out at their end first.`
        : undefined),
    badge: automated?.badge,
  };
}

/**
 * A contract step's state, as the one line the plan can show.
 *
 * The unavailable sentences are written here rather than on the screen for the
 * reason every other sentence on this page is: this side knows *why*, and a
 * component that guessed would be guessing about somebody's employment
 * paperwork. They follow the same rule the automated steps' wording follows —
 * say whose problem it is, never name the mechanism, and never let it read as
 * something this person failed to do.
 *
 * "Not a PDF" earns its own sentence rather than being folded into the generic
 * one, because it is the mistake an admin will actually make: they have a `.docx`
 * of the contract, they upload it, and every part of the product accepts it right
 * up to the point somebody has to read it. An honest sentence here is what gets
 * that fixed in a minute rather than reported as "the contract doesn't work".
 */
function toContractRow(
  status: ContractStatus,
  stepId: string,
  company: string,
): ContractRow {
  if (status.state === "signed") {
    return {
      state: "signed",
      href: joinerContractPath(stepId),
      name: status.documentName,
    };
  }

  if (status.state === "ready") {
    return {
      state: "ready",
      href: joinerContractPath(stepId),
      name: status.documentName,
    };
  }

  return {
    state: "unavailable",
    reason:
      status.problem === "not-a-pdf"
        ? `The file on this one isn't a PDF, so I can't show it to you here. ${company} has something to sort out first — nothing here is waiting on you.`
        : `There's no contract attached to this one yet. ${company} has something to sort out first — nothing here is waiting on you.`,
  };
}

/**
 * An automated step, in the only two things this person needs to know about it.
 *
 * Five run states collapse to three sentences here, and the collapsing is the
 * design rather than a shortcut. Waiting, running and failed are one sentence
 * — it is being sorted — because from this chair they are the same fact: an
 * account they have not got yet, that somebody else is responsible for. The
 * fault that separates them is real and belongs on the admin's screen, where
 * somebody can connect Google Workspace or buy a licence. Putting it here would
 * hand a person on their first week a problem report about their own job, with
 * no button on it.
 *
 * The two states that get their own words are the two where something has
 * actually changed for them: an address that now exists and a password waiting
 * in their inbox, and then the day they used it.
 *
 * Nothing in `run.message` is ever printed. That field is written for whoever
 * can act on it and names environment variables, consent screens and Google
 * console pages — a vocabulary that has no business on this screen even when it
 * would technically be accurate.
 */
function craigWords(
  step: Joiner["steps"][number],
  joiner: Joiner,
): { detail: string; badge?: string } {
  const run = step.run;
  const seat = run?.seatEmail;

  if (run?.state === "done") {
    /* The address, plainly, on a row that has already gone green. The date is
       the same one the tick carries, so no second formatting rule. */
    return {
      detail: seat
        ? `${seat} — that's your address here now.`
        : `Your ${joiner.company} account is set up.`,
    };
  }

  if (run?.state === "awaiting" && seat) {
    return {
      badge: "Check your email",
      /* Their personal address is named on purpose. This message went to the
         inbox they were hired through rather than to the new one — which they
         cannot read yet, and which is the confusion this sentence exists to
         head off before somebody spends ten minutes looking in the wrong
         place. */
      detail: `Your address is ${seat}. The password is in the email we sent to ${joiner.email} — sign in once, pick your own password, and this one's finished.`,
    };
  }

  return {
    detail: `Your ${joiner.company} email account is being set up. Nothing here for you to do — I'll email you the moment it's ready.`,
  };
}

/**
 * Their own answer, in the shape they gave it.
 *
 * A date of birth is stored as `YYYY-MM-DD` and read back by a person, so it is
 * shown the way a person writes their birthday — with the year, without the
 * weekday, which nobody remembers about the day they were born. Anything the
 * pattern does not recognise is shown exactly as it was typed rather than
 * quietly reformatted: this is the record of what they said.
 *
 * The two sealed blocks arrive as documents rather than strings, and neither is
 * printed out field by field. A row in a plan cannot hold twelve values, and a
 * screen that could would be putting a home address, a date of birth or a bank
 * account on a page somebody is likely to be reading in an office in their first
 * week. `summariseDetails` and `summarisePayroll` are the arguments; the first
 * gives back their name and an acknowledgement of the rest, and the second gives
 * back no value at all, because nothing on that form is a fact this screen
 * should put in front of whoever is standing behind them.
 *
 * They are sentences rather than lookups because the answers never travel on the
 * step: `JoinerStep.value` is empty for a sealed step, so the documents have to
 * be handed in from the one place allowed to open them.
 */
function readableAnswer(
  step: Joiner["steps"][number],
  details: PersonalDetails | undefined,
  payroll: PayrollDetails | undefined,
): string | undefined {
  if (step.field === "personal-details") {
    return details ? summariseDetails(details) : undefined;
  }

  if (step.field === "payroll-details") {
    return payroll ? summarisePayroll(payroll) : undefined;
  }

  if (!step.value) return undefined;
  if (step.field !== "date-of-birth") return step.value;

  const date = fromParts(step.value);
  if (!date) return step.value;

  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/**
 * `2026-08-24` as "Monday 24 August" — the same words the invitation used.
 *
 * The weekday earns its place on this one date and no other: it is the morning
 * somebody has to turn up, and "Monday the 24th" is how that gets remembered.
 */
function readableDate(iso: string): string | null {
  const date = fromParts(iso);
  if (!date) return null;

  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

/**
 * A full timestamp as the day it happened: "7 August".
 *
 * No time of day. "You sent this at 09:14" is a level of surveillance nobody
 * asked for on their own onboarding, and the day is the part that answers the
 * only question the row raises, which is whether it went in.
 */
function readableDay(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
  }).format(date);
}

/**
 * Whether a start date is still ahead.
 *
 * Plain string comparison, which works because both sides are `YYYY-MM-DD` and
 * that format sorts as text — and which sidesteps the timezone trap entirely
 * rather than handling it. It decides whether the screen gets to say "see you
 * on Monday", and saying that to somebody who started a fortnight ago is the
 * kind of small wrongness that tells a person nobody is really watching.
 */
function upcoming(iso: string): boolean {
  const now = new Date();
  const today = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-${`${now.getDate()}`.padStart(2, "0")}`;
  return iso >= today;
}

/**
 * A bare date from its parts, never from `new Date(string)`.
 *
 * That constructor reads `YYYY-MM-DD` as UTC midnight and then formats it in
 * the server's timezone, which anywhere west of Greenwich prints the day
 * before. A start date one day out is the error nobody catches until somebody
 * turns up on the wrong morning.
 */
function fromParts(iso: string): Date | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!parts) return null;

  const date = new Date(
    Number(parts[1]),
    Number(parts[2]) - 1,
    Number(parts[3]),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}
