import "server-only";

import { accessTokenFor } from "@/lib/google/auth";
import { createUser, getUser, hasAcceptedSeat } from "@/lib/google/directory";
import {
  isWaitingOnSetup,
  needsReconnect,
  type GoogleFailed,
} from "@/lib/google/result";
import { findTemplate, SENDER } from "@/lib/email";
import { renderEmail } from "@/lib/email/html";
import { sendEmail } from "@/lib/email/send";
import { markGoogleNeedsReconnect } from "@/lib/showcase/accounts";
import type {
  Joiner,
  JoinerStep,
  RunProblem,
  RunState,
  StepRun,
} from "./contract";
import { googleForAccount } from "./google-connection";
import {
  claimAutomatedStep,
  getJoiner,
  isRunInterrupted,
  nextAutomatedStep,
  runStateOf,
  updateRun,
} from "./joiners";

/**
 * The step Craig actually runs, and the only part of this showcase that changes
 * something outside itself.
 *
 * Everything before this was bookkeeping — a person typed a date of birth, a
 * person ticked a box, and the product wrote down that they had. This module is
 * the first thing here that goes and does the work: when the step before it
 * completes, it creates a Google Workspace account in the customer's own tenant
 * and emails the new starter their address at the personal inbox they were
 * hired through. Nobody is watching when it happens, which is the point.
 *
 * Three entry points, and the split between them is deliberate.
 *
 * `fireNextAutomatedStep` is the workflow moving. It is called from the two
 * routes where a step gets completed, it claims the next step *inside* the
 * request and does the slow half after the response — so the person who
 * answered a form is never left waiting on somebody else's API.
 *
 * `runClaimedStep` is that slow half, and it is also what the admin's button
 * calls directly. Same work, different patience: an explicit press should show
 * its own outcome rather than finish silently a moment after the page reloads.
 *
 * `reconcileRun` is the opposite of both: it changes nothing at Google and only
 * ever reads. It answers "have they accepted their seat yet" and "did that
 * interrupted run get through", and because it is a read it is safe to call as
 * often as anybody opens a page.
 *
 * Nothing in here throws. `src/lib/google/*` returns results rather than
 * throwing for exactly this reason, and this module keeps that promise upward:
 * every outcome, including the ones nobody planned for, ends as a `StepRun`
 * that a screen can draw.
 *
 * **Unverified.** This deployment has no Google OAuth client and no tenant, so
 * no request in here has ever been sent. What has been exercised is the path
 * everybody can see: no connection at all, which produces a calm `waiting`
 * without a single network call. The shapes of the calls come from
 * `src/lib/google/*`, which documents its own sources.
 */

/**
 * How often a seat is worth asking about.
 *
 * The acceptance check runs when somebody opens the person's page, which means
 * its frequency is decided by how often an anxious hiring manager refreshes.
 * A minute is far finer than the event it is watching — somebody signing in for
 * the first time, once, at some point over a fortnight — and it keeps a page
 * that gets reloaded twenty times from spending twenty of the tenant's daily
 * Directory quota on the same question.
 */
const CHECK_EVERY_MS = 60_000;

/**
 * How long after creating a seat a `404` from Google is propagation rather than
 * absence.
 *
 * Google's own common-errors guide warns that a freshly created user is not
 * immediately visible to every backend, and `directory.ts` repeats the warning
 * on `no-such-user`. Without this window the first check after a successful
 * creation could report the account as missing and mark a perfectly good seat
 * as broken — the worst possible false alarm, because it is the one that
 * arrives seconds after everything worked.
 */
const SETTLING_MS = 120_000;

/** Where the welcome email's button points. Google's own front door. */
const SIGN_IN_URL = "https://accounts.google.com/";

/** The template that carries somebody their new address. Not a caller's choice. */
const TEMPLATE_ID = "workspace-account";

/* --- Turning a failure into a state ---------------------------------------- */

/**
 * The same failure, said again for the person who is going to read it.
 *
 * Two jobs, and the second one is the reason this is thirty lines rather than
 * three.
 *
 * **Which kind of stuck.** `src/lib/google/result.ts` makes the argument: two
 * of its reasons are not faults at all, they are the states a multi-tenant
 * integration spends most of its life in, and a product that paints them red is
 * misrepresenting itself. So nobody-has-connected-anything stays `waiting` —
 * the step hasn't failed, it hasn't started — and `needs-reconnect` is split
 * off from the rest because it looks identical in code and is a completely
 * different sentence to read: one is "you haven't done this yet", the other is
 * "the thing you did has stopped working, and your new starters aren't getting
 * accounts until you redo it".
 *
 * **Whose words.** This is the part that cannot be skipped. Every message in
 * `src/lib/google/*` is written for whoever runs this deployment, and it says
 * so in its own vocabulary: `GOOGLE_OAUTH_CLIENT_ID`, the Cloud console, the
 * server log, "this one is ours to fix, not the customer's". All of that is
 * exactly right one layer down and none of it may appear in the app, which
 * is a screen a customer looks at. So each reason is said again here in terms
 * of *their* company and *their* Google Workspace, and the library's own
 * sentence goes to the server log where the person it was written for is
 * already looking. Same pattern as `send.ts` and `directory.ts`, one layer up:
 * each layer names a failure for its own audience.
 *
 * Both halves of not-set-up get one sentence deliberately. They are different
 * facts — this deployment has no OAuth client, versus this customer hasn't
 * consented — with the same appearance and the same button, which is precisely
 * the case `isWaitingOnSetup` exists for. Telling a customer that a deployment
 * they don't run is missing a variable they can't set would be accurate and
 * useless.
 */
async function settle(
  failure: GoogleFailed,
  accountEmail: string,
): Promise<{
  state: RunState;
  problem: RunProblem;
  message: string;
}> {
  if (isWaitingOnSetup(failure)) {
    if (failure.reason === "not-configured") {
      /* The one case the customer genuinely cannot act on, so it is logged as
         well as shown. `auth.ts` deliberately doesn't log this — it is the
         normal state of a machine with no credentials and a line per lookup
         would be noise — but a *run* is rare and deliberate, and a deployment
         that is half configured because somebody misspelled a variable name has
         no other way of finding out. */
      console.error("[showcase/automation] no Google client:", failure.message);
    }

    return {
      state: "waiting",
      problem: "not-set-up",
      message:
        "Google Workspace isn't connected yet, so nothing was created. Connect it and this step runs on its own — nobody has to come back and press anything.",
    };
  }

  if (needsReconnect(failure)) {
    /* Recorded against the account, not only reported on this step.
       Google refuses per call, so without this the only place a revoked
       permission is ever visible is whichever new starter happened to reach
       their Google step next — and the Connect panel, the one screen somebody
       would go to fix it, would still be claiming everything is fine. Marking
       it here means the discovery is made once and remembered, wherever it
       happens to be made. */
    await markGoogleNeedsReconnect(accountEmail);

    return {
      state: "failed",
      problem: "needs-reconnect",
      message:
        "Google Workspace needs connecting again. The permission it was given has stopped working — somebody removed it, or an admin's password changed. Nothing is lost, but no accounts get created until a Workspace admin connects it once more.",
    };
  }

  /* Google's own words go to the log, not to the screen. Without this line,
     "refused" would be all anybody ever found out about a failure whose real
     cause was one line further down. */
  console.error(
    `[showcase/automation] google refused (${failure.reason}):`,
    failure.message,
  );

  return { state: "failed", problem: "refused", message: refusal(failure) };
}

/**
 * One sentence per refusal, in the customer's terms.
 *
 * Written out rather than passed through for the reason above, and written for
 * the person who can actually move: a Workspace super admin at the company that
 * bought this. Each one names the next move where there is one, and says
 * plainly that there isn't where there isn't — the two failures that are ours
 * rather than theirs say so without asking them to go and read a log they have
 * no access to.
 *
 * The default is deliberately vague and deliberately not alarming. A reason
 * this doesn't recognise is a reason `src/lib/google/*` gained after this file
 * was written, and inventing a confident sentence about it would be worse than
 * saying it didn't work.
 */
function refusal(failure: GoogleFailed): string {
  switch (failure.reason) {
    case "unauthorized":
      return "Google won't let this connection create accounts. Nearly always that's because whoever connected Google Workspace isn't a super admin — consenting works perfectly well without that privilege, and creating people doesn't. Connecting again as a super admin fixes it.";

    case "already-exists":
      return "There's already a Google account at that address. Either this has run before, or somebody's personal Google account has claimed the address — a Workspace admin has to sort that out in the Google Admin console before it can be used here.";

    case "quota-exhausted":
      return "This Google Workspace subscription has no free licences left, so there's nowhere to put the account. Somebody has to add one under Billing in the Google Admin console — nothing here can.";

    case "rate-limited":
      return failure.retryAfter
        ? `Google is asking us to slow down. Nothing was created — try again in about ${failure.retryAfter} seconds.`
        : "Google is asking us to slow down, or the day's allowance is spent. Nothing was created; try again shortly.";

    case "invalid-request":
      return "Google refused the account as described. The usual causes are an email domain this Workspace doesn't own, or a password its own policy won't accept.";

    case "unreachable":
      return "Google couldn't be reached, so whether the account was created is genuinely unknown from here. Have a look in the Google Admin console before running this again — if it's there, nothing more needs doing but resetting the password.";

    case "no-such-user":
      return "Google says there's no account at that address.";

    case "bad-credentials":
      return "Something at our end is stopping Google accepting this connection, so nothing was created. It isn't anything that can be fixed from this screen — whoever runs this has the details.";

    default:
      return "Google refused the request and nothing was created. Try again shortly; if it keeps happening, this one needs looking at.";
  }
}

const now = () => new Date().toISOString();

/* --- The address --------------------------------------------------------- */

/**
 * Somebody's name, as the two parts Google insists on.
 *
 * `givenName` and `familyName` are both required by `users.insert`, and
 * `createUser` refuses an empty one before spending a round trip. So the
 * refusal happens here instead, where it can say something useful: a person
 * whose record holds a single word is not a malformed request, it is a name
 * somebody typed into an invitation without a surname, and the admin who typed
 * it is the one who can fix it.
 *
 * Everything between the first word and the last is folded into the surname
 * rather than dropped. "Ana Maria de Souza" is one person with a three-word
 * family name far more often than she is a person with two middle names, and
 * of the two ways to be wrong, keeping what somebody wrote is the recoverable
 * one.
 */
function nameParts(full: string): { given: string; family: string } | null {
  const words = full.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  return { given: words[0], family: words.slice(1).join(" ") };
}

/**
 * The address the seat is created at, derived rather than chosen.
 *
 * Determinism is not tidiness here, it is the recovery mechanism. A run that
 * claimed the step and then vanished — a restart, a deploy, a crash — leaves
 * behind a lock and no record of what it did. Because this function gives the
 * same answer every time for the same person and the same domain, the address
 * that lost run *would* have used can be worked out again and looked up, so
 * "did it get through?" has an answer. A random or timestamped local part would
 * have made an interrupted run permanently unknowable, and the only safe thing
 * to do with an unknowable run is nothing.
 *
 * Accents are folded rather than stripped, so José becomes `jose` and not `jos`.
 * Everything that is not a letter or a digit becomes nothing: an apostrophe in
 * O'Brien and a hyphen in Miller-Cole are both common and neither belongs in a
 * local part that people will have to read down a phone line.
 */
function seatAddress(
  name: { given: string; family: string },
  domain: string,
): string {
  const slug = (part: string) =>
    part
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");

  const given = slug(name.given);
  const family = slug(name.family);
  const local = [given, family].filter(Boolean).join(".");

  return `${local}@${domain.trim().toLowerCase().replace(/^@/, "")}`;
}

/* --- Telling them ---------------------------------------------------------- */

/**
 * The one email that carries the password, and the only chance to send it.
 *
 * Google does not do this. Its API creates the account and tells nobody — there
 * is no welcome mail, no notification, nothing — so a seat created without this
 * call is an account the person it belongs to will never learn exists.
 *
 * Returns a *problem* rather than a result, because the caller only has one
 * question: is there anything the admin needs to be told? A send that worked is
 * the absence of news.
 *
 * There is no bcc, and its absence is deliberate. Every invitation this
 * showcase sends is blind-copied to whoever runs the deployment, so somebody
 * can read what a stranger actually received. This message must not be: it
 * carries a live credential for an account inside a customer's company, and a
 * copy of it in anybody else's inbox is that credential in a second place for
 * ever. The thing that makes the bcc valuable on the invitation is exactly what
 * makes it indefensible here.
 *
 * Nothing about the message is logged. The failure that comes back has already
 * been written for a person by `send.ts`, and the provider's own words went to
 * the server log there — a line here would add nothing and would be one careless
 * edit away from printing the body.
 */
async function tellThem(
  joiner: Joiner,
  seat: { primaryEmail: string; temporaryPassword: string },
): Promise<string | undefined> {
  const template = findTemplate(TEMPLATE_ID);
  if (!template) {
    console.error(`[showcase/automation] no template "${TEMPLATE_ID}"`);
    return `The account was created, but the message telling ${joiner.name} about it couldn't be put together, so nothing was sent. The temporary password went with it — reset it in the Google Admin console and send them the new one yourself.`;
  }

  /* Every token in the vocabulary, supplied, including the ones this template
     doesn't read. The invite route explains why at length and the reasoning is
     identical: `render` fills anything absent from the *preview's* fixtures, so
     a token left out here doesn't arrive blank in a real email — it arrives as
     a person from a demo company, in a message that otherwise looks correct. */
  const values = {
    first_name: joiner.name.split(" ")[0] || joiner.name,
    full_name: joiner.name,
    company: joiner.company,
    role: joiner.role,
    start_date: "",
    sender: "",
    step: "",
    owner: "",
    link: SIGN_IN_URL,
    work_email: seat.primaryEmail,
    temporary_password: seat.temporaryPassword,
  };

  const { subject, html, text } = renderEmail(template, values);

  const sent = await sendEmail({
    to: joiner.email,
    subject,
    html,
    text,
    fromName: SENDER.name(joiner.company),
    /* The one email in this product that carries a live credential, so no
       copy of it is kept anywhere — not in the development outbox, and not
       in the run record. The password exists in this function, in that
       message, and nowhere else. */
    sensitive: true,
  });

  if (sent.ok) return undefined;

  /* Named for the log and not for the screen. `send.ts` writes for whoever runs
     this deployment — it talks about RESEND_API_KEY, DNS records and sandbox
     senders — and none of that belongs in front of a customer, for the same
     reason none of Google's own wording does. */
  console.error(`[showcase/automation] welcome email failed: ${sent.reason}`);

  /* Two sentences, and the second is the one that matters. The password was the
     only copy that will ever exist — Google documents `password` as write-only
     and never returns it — so a failed send is not something to retry, it is a
     credential that no longer exists anywhere. "Try again" would be advice that
     cannot work: running the step afresh would find the account already there.
     Resetting the password is the only route from here, and saying so plainly
     is worth more than any amount of detail about why the send failed.
     Only the recipient's own address is worth splitting out, because it is the
     one cause the reader can actually correct. */
  const why =
    sent.reason === "invalid-recipient"
      ? `Their personal email address was refused, so the message telling ${joiner.name} about the account never went.`
      : `The message telling ${joiner.name} about the account couldn't be sent.`;

  return `${why} The account itself was created and is fine, but the temporary password went with it and can't be recovered — reset it in the Google Admin console and send them the new one yourself.`;
}

/* --- Creating the seat ----------------------------------------------------- */

/**
 * What one attempt at an automated step found out.
 *
 * Assumes the step is already claimed. It does not check, and that is not an
 * oversight: a function that could both claim and run would be a function
 * somebody eventually calls without claiming, and the whole double-run
 * guarantee is that claiming happens exactly once, synchronously, somewhere
 * else. See `claimAutomatedStep`.
 */
async function createSeat(
  joiner: Joiner,
): Promise<Partial<StepRun> & { state: RunState }> {
  const { connection, domain, unreadable } = await googleForAccount(
    joiner.accountEmail,
  );

  /* Stored, and unopenable — which is not the same as absent and must not read
     as it. "Nobody has connected yet" is answered by pressing Connect; this is
     answered by finding out why, and pressing Connect here would discard a
     grant a Workspace admin has already given to fix something that was never
     theirs. Loud rather than calm, because new starters are stopped by it. */
  if (unreadable) {
    return {
      state: "failed",
      problem: "needs-reconnect",
      message:
        "The connection to Google Workspace is still there, but this server can't read it, so nothing was created. It needs looking at before anybody reconnects — reconnecting would throw the existing permission away.",
      endedAt: now(),
    };
  }

  /* The probe. With nothing connected there is no address to build and no call
     worth making, but the *sentence* still has to come from the same place
     every other Google sentence comes from — `accessTokenFor(null)` answers
     `not-configured` when this deployment has no OAuth client and
     `not-connected` when this customer hasn't consented, which are two
     different people's jobs and two different messages. Writing our own here
     would be a third opinion about a state we don't own, and it would be the
     one that went stale. */
  if (!connection || !domain) {
    const probe = await accessTokenFor(connection);
    if (!probe.ok)
      return { ...(await settle(probe, joiner.accountEmail)), endedAt: now() };

    /* Connected, working, and Google never told us which domain. That means
       somebody consented with a personal Google account: the id token's `hd`
       claim is only set for accounts that belong to a Workspace domain, and a
       personal account has no tenant to create anybody in. */
    return {
      state: "failed",
      problem: "refused",
      message:
        "Google Workspace is connected, but the account that connected it isn't on a Workspace domain — that happens when somebody consents with a personal Google account rather than a company one. There's no tenant to create a seat in. Connect again as a Workspace super admin.",
      endedAt: now(),
    };
  }

  const name = nameParts(joiner.name);
  if (!name) {
    return {
      state: "failed",
      problem: "refused",
      message: `Google needs a first name and a last name, and "${joiner.name}" is one word. Their account has to be created by hand in the Google Admin console — or invite them again with their full name and this will run itself.`,
      endedAt: now(),
    };
  }

  const primaryEmail = seatAddress(name, domain);

  const created = await createUser(connection, {
    primaryEmail,
    givenName: name.given,
    familyName: name.family,
  });

  if (!created.ok) {
    /* Nothing about the address is recorded on a failure, including on
       `already-exists`. `seatEmail` means "the seat we made", and an address
       that already belonged to somebody — a personal Google account that has
       claimed it, or a colleague with the same name — is not that. Writing it
       down would put an address on the admin's screen under a heading that
       implies this workflow created it. */
    return { ...(await settle(created, joiner.accountEmail)), endedAt: now() };
  }

  const { seat } = created;

  /* Sent before anything is written down, and the password is never written
     down at all — it lives in this scope, goes into one message, and is
     collected. Everything in `StepRun` outlives the process; the password must
     not. */
  const emailProblem = await tellThem(joiner, seat);

  return {
    state: "awaiting",
    seatEmail: seat.primaryEmail,
    seatCreatedAt: seat.createdAt ?? now(),
    emailProblem,
    /* Cleared explicitly. A run that succeeded after a failure must not leave
       the previous attempt's complaint sitting under it. */
    problem: undefined,
    message: undefined,
    endedAt: now(),
  };
}

/**
 * Do the work for a step that has already been claimed.
 *
 * Re-reads the record rather than taking one as an argument, because by the
 * time this runs the response has been sent and the joiner it was handed is a
 * snapshot from before the claim. It also gives the one cheap check worth
 * having at this point: if the step is no longer `running`, something else has
 * settled it — the seat was taken back, the showcase was reset, a reconcile got
 * there first — and the right move is to do nothing rather than to create an
 * account for a plan that has moved on.
 *
 * Never throws, because on the `after` path there is nobody to throw to: an
 * unhandled rejection there is a log line on a server nobody is reading and a
 * step that says "creating the account" for ever.
 */
export async function runClaimedStep(
  joinerId: string,
  stepId: string,
): Promise<void> {
  const joiner = await getJoiner(joinerId);
  if (!joiner) return;

  const step = joiner.steps.find((s) => s.id === stepId);
  if (!step || step.actor !== "craig" || runStateOf(step) !== "running") return;

  try {
    await updateRun(joinerId, stepId, await createSeat(joiner));
  } catch (cause) {
    /* Only reachable if something below broke its own contract — nothing in
       `src/lib/google/*` or `send.ts` throws. Recorded as a failure rather than
       swallowed: a step stuck on `running` because of a bug is invisible, and
       an invisible stuck step is somebody's first week quietly not happening.
       The cause goes to the log; the sentence goes to the screen. */
    console.error(`[showcase/automation] ${stepId} threw:`, cause);
    /* The write itself can fail now that it crosses a network, and this
       function's contract is that it never throws — an unhandled rejection on
       the `after` path is a log line nobody reads and a step stuck on
       `running`. So the failure of recording a failure is itself only
       logged. */
    await updateRun(joinerId, stepId, {
      state: "failed",
      problem: "refused",
      message:
        "Something went wrong here rather than at Google, so nothing was created. The details are in the server log. Try it again — if it keeps happening, this one needs looking at.",
      endedAt: now(),
    }).catch((writeCause) => {
      console.error(
        `[showcase/automation] ${stepId} failed and the failure could not be recorded:`,
        writeCause,
      );
    });
  }
}

/**
 * The workflow moving: run the next step, if the next step is one Craig runs.
 *
 * Called by the two routes where a step gets completed. It does two things in
 * two very different amounts of time, and keeping them apart is the whole
 * design:
 *
 * The **claim** happens now, synchronously, inside the request. It is a Map
 * write, it costs nothing, and it is what makes a double-submit harmless — the
 * second request finds `running` and stands down before either one has spoken
 * to Google.
 *
 * The **work** happens in `after`, which Next runs once the response has been
 * sent. So the new starter who just gave their middle name gets their answer
 * back at the speed of a disk write rather than at the speed of Google's
 * Directory API plus an email provider, and the screen they refresh onto shows
 * the account being created, which is exactly what is happening.
 *
 * Deliberately silent about refusals. Not-due, already-running and
 * nothing-follows are all ordinary — the common case is a workflow with no
 * automated step in it at all — and none of them are the business of the person
 * whose form submission triggered this.
 *
 * `after` is a parameter rather than an import, which keeps this module free of
 * the framework and, more usefully, keeps the decision where it belongs. The
 * two routes that complete a step have somebody waiting and pass Next's `after`;
 * the admin's button calls `runClaimedStep` directly and waits for the answer,
 * because a press that finishes silently a moment after the page reloads is a
 * press that appears to have done nothing.
 */
export async function fireNextAutomatedStep(
  joiner: Joiner,
  completedStepId: string,
  after: (task: () => Promise<void>) => void,
): Promise<void> {
  const next = nextAutomatedStep(joiner, completedStepId);
  if (!next) return;

  /* Still inside the request, awaited — the claim is one compare-and-swap
     against the database now rather than a Map write, but the shape holds:
     it lands before the response goes out, so a double-submit's second
     request finds `running` and stands down before either has spoken to
     Google. Only the work itself belongs in `after`. */
  const claim = await claimAutomatedStep(joiner.id, next.id);
  if (!claim.ok) return;

  after(() => runClaimedStep(joiner.id, next.id));
}

/* --- Catching up ----------------------------------------------------------- */

export type ReconcileOutcome =
  /** Asked Google something and wrote down the answer. */
  | "checked"
  /** Nothing to ask about, or asked recently enough. */
  | "skipped";

/**
 * Find out where a seat actually stands, without changing anything.
 *
 * A poll rather than a webhook, and the trade is worth stating. Google can push
 * directory changes, but a push receiver needs a public HTTPS endpoint, a
 * channel registered per tenant, and that channel renewed before it expires —
 * three pieces of standing infrastructure for an event that happens once per
 * new starter. A read, taken when somebody looks, costs one request against a
 * quota measured in thousands and needs nothing that has to be kept alive.
 *
 * Two questions, and they are asked of the same call:
 *
 * **Have they accepted?** `hasAcceptedSeat`, which reads `agreedToTerms` and
 * nothing else. Emphatically not `lastLoginTime`: Google returns the Unix epoch
 * rather than an absent field for an account nobody has signed into, so the
 * obvious truthiness check reports every seat as accepted the instant it is
 * created. `directory.ts` documents the trap and defuses it; this is the caller
 * that would have fallen into it.
 *
 * **Did that interrupted run get through?** The lock is never broken on a
 * timer — a timer that released it would create a second account precisely when
 * the first attempt's fate is unknown. It is broken by asking Google, and the
 * answer is knowable because the address is derived rather than random.
 *
 * Cheap enough to call on a page view and honest about doing nothing: the
 * throttle, the states it ignores, and the `force` a person's explicit press
 * carries are all here rather than in the route, so a second caller can't get
 * the policy subtly different.
 */
export async function reconcileRun(
  joinerId: string,
  stepId: string,
  options: { force?: boolean } = {},
): Promise<ReconcileOutcome> {
  const joiner = await getJoiner(joinerId);
  if (!joiner) return "skipped";

  const step = joiner.steps.find((s) => s.id === stepId);
  if (!step || step.actor !== "craig") return "skipped";

  const state = runStateOf(step);

  /* `waiting`, `failed` and `done` have nothing outstanding at Google: two of
     them never created anything and the third is finished. `running` is only
     worth asking about once it has stopped plausibly being in flight —
     interrupting a live attempt with a lookup would answer a question that is
     about to answer itself. */
  if (state === "awaiting") return pollSeat(joiner, step, options.force);
  if (state === "running" && isRunInterrupted(step)) {
    return resolveInterrupted(joiner, step);
  }

  return "skipped";
}

/** Whether the last look was recent enough that another one tells us nothing. */
function checkedRecently(step: JoinerStep): boolean {
  const at = step.run?.checkedAt ? Date.parse(step.run.checkedAt) : NaN;
  return Number.isFinite(at) && Date.now() - at < CHECK_EVERY_MS;
}

async function pollSeat(
  joiner: Joiner,
  step: JoinerStep,
  force?: boolean,
): Promise<ReconcileOutcome> {
  const seatEmail = step.run?.seatEmail;
  if (!seatEmail) return "skipped";
  if (!force && checkedRecently(step)) return "skipped";

  const { connection } = await googleForAccount(joiner.accountEmail);
  const found = await getUser(connection, seatEmail);

  if (found.ok) {
    if (hasAcceptedSeat(found.user)) {
      /* The moment the whole step existed for. `updateRun` sets the step's
         `completedAt` alongside this, which is what every count on both screens
         reads. */
      await updateRun(joiner.id, step.id, {
        state: "done",
        checkedAt: now(),
        endedAt: now(),
        problem: undefined,
        message: undefined,
      });
      return "checked";
    }

    /* Suspended and archived accounts land here too, and they should:
       `hasAcceptedSeat` vetoes both regardless of the terms, because an account
       nobody can sign into is not a seat somebody has taken. It reads as still
       waiting, which is true, rather than as an error. */
    await updateRun(joiner.id, step.id, {
      state: "awaiting",
      checkedAt: now(),
      message: undefined,
    });
    return "checked";
  }

  /* Missing, moments after being created, is Google's backends disagreeing
     with each other rather than a missing account — their own guide says so.
     Reporting it would raise an alarm about a seat that is fine, seconds after
     everything worked, which is the worst-timed false alarm this feature has. */
  const created = step.run?.seatCreatedAt
    ? Date.parse(step.run.seatCreatedAt)
    : NaN;
  const settling =
    Number.isFinite(created) && Date.now() - created < SETTLING_MS;

  if (found.reason === "no-such-user" && !settling) {
    /* The account has actually gone — deleted in the Admin console, or the
       address was reassigned. `failed` rather than a note, because it puts the
       step back within reach of being run again: nothing of ours exists at that
       address any more, so creating it is the right move rather than a second
       mailbox. */
    await updateRun(joiner.id, step.id, {
      state: "failed",
      problem: "refused",
      message: `There's no longer a Google account at ${seatEmail}. It was created here and has since been deleted or renamed in the Google Admin console. Running this step again will create it afresh.`,
      checkedAt: now(),
      endedAt: now(),
    });
    return "checked";
  }

  /* Everything else — rate limits, a reconnect, Google having a bad morning —
     leaves the state alone. The seat exists and we simply couldn't ask about
     it, and downgrading a good account because a lookup failed would be this
     feature's most damaging possible bug. */
  await updateRun(joiner.id, step.id, {
    state: "awaiting",
    checkedAt: now(),
    message: settling ? undefined : cantCheck(found),
  });
  return "checked";
}

/**
 * Why a perfectly good seat couldn't be asked about, said without alarming
 * anybody about the seat.
 *
 * Every sentence here opens by saying the account is fine, because that is the
 * fact most at risk of being lost: a failure message under a step whose account
 * exists reads, at a glance, as the account having a problem. It doesn't. The
 * only thing that went wrong is the question.
 *
 * Separate from `refusal` rather than reusing it, and not for tidiness — those
 * sentences all say "nothing was created", which is true when a *creation*
 * fails and is the opposite of true here.
 */
function cantCheck(failure: GoogleFailed): string {
  if (isWaitingOnSetup(failure)) {
    return "Their account exists, but Google Workspace isn't connected any more — so there's no way to tell from here whether they've signed in yet.";
  }

  if (needsReconnect(failure)) {
    return "Their account exists, but Google Workspace needs connecting again before anybody can tell whether they've signed in yet.";
  }

  console.error(
    `[showcase/automation] seat check failed (${failure.reason}):`,
    failure.message,
  );

  if (failure.reason === "rate-limited") {
    return "Their account exists. Google is asking us to slow down, so this hasn't been checked just now — it'll be tried again next time somebody opens this page.";
  }

  return "Their account exists, but Google wouldn't answer when asked whether they've signed in yet. Nothing is wrong with the account; it'll be tried again next time somebody opens this page.";
}

/**
 * Ask Google what a lost run actually did.
 *
 * The address is rebuilt rather than remembered, because a run that died before
 * writing anything down left nothing to remember — that is the definition of
 * the state being resolved. `seatAddress` gives the same answer it gave the
 * attempt that vanished, so the lookup is asking about exactly the account that
 * attempt would have made.
 *
 * Both answers are useful and neither is a guess. The account exists: it got
 * through, the seat is real, and the only casualty is the password, which was
 * in memory that no longer exists. The account doesn't exist: nothing was
 * created, and the step can go back to `waiting` where it can be run again
 * safely.
 */
async function resolveInterrupted(
  joiner: Joiner,
  step: JoinerStep,
): Promise<ReconcileOutcome> {
  const { connection, domain } = await googleForAccount(joiner.accountEmail);
  const name = nameParts(joiner.name);

  if (!connection || !domain || !name) {
    /* Can't ask, so can't answer, so nothing moves. Leaving it `running` is the
       conservative reading and the correct one: an unresolvable interrupted run
       is exactly the case where assuming "nothing happened" would create a
       second account for somebody who may already have one. */
    const probe = await accessTokenFor(connection);
    await updateRun(joiner.id, step.id, {
      state: "running",
      checkedAt: now(),
      message: probe.ok
        ? "This one was interrupted part-way through, and there isn't enough here to work out what it managed to do. Have a look in the Google Admin console for their account."
        : "This one was interrupted part-way through, and it can't be checked while Google Workspace isn't connected. Connect it and try again — nothing will be created twice.",
    });
    return "checked";
  }

  const seatEmail = seatAddress(name, domain);
  const found = await getUser(connection, seatEmail);

  if (found.ok) {
    await updateRun(joiner.id, step.id, {
      state: hasAcceptedSeat(found.user) ? "done" : "awaiting",
      seatEmail: found.user.primaryEmail,
      seatCreatedAt: found.user.creationTime ?? now(),
      /* Assumed lost rather than assumed sent, and the asymmetry is on purpose.
         If the email did go out, an administrator resetting the password costs
         the new starter one more message; if it didn't and we said nothing, the
         account sits there for ever with a password nobody has. */
      emailProblem: `This run was interrupted after the account was created, so we can't tell whether ${joiner.name} ever got their password — and the only copy of it is gone either way. Reset it in the Google Admin console and send them the new one.`,
      problem: undefined,
      message: undefined,
      checkedAt: now(),
      endedAt: now(),
    });
    return "checked";
  }

  if (found.reason === "no-such-user") {
    /* Nothing was created, so the lock has nothing to protect. Back to
       `waiting`, with the message cleared — this is the one path that puts an
       interrupted step back in reach of running again, and it is safe precisely
       because Google was asked rather than assumed. */
    await updateRun(joiner.id, step.id, {
      state: "waiting",
      problem: undefined,
      message: undefined,
      startedAt: undefined,
      endedAt: undefined,
      checkedAt: now(),
    });
    return "checked";
  }

  console.error(
    `[showcase/automation] interrupted run unresolved (${found.reason}):`,
    found.message,
  );

  await updateRun(joiner.id, step.id, {
    state: "running",
    checkedAt: now(),
    message:
      "This one was interrupted part-way through, and Google wouldn't say what it managed to do. Nothing here will try it again until that question has an answer — creating a second account for the same person is the one thing worth being slow about. Try again shortly.",
  });
  return "checked";
}
