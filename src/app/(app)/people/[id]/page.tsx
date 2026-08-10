import { currentUser, requireUser } from "@/lib/craig/current-user";
import {
  getJoiner,
  isRunInterrupted,
  progressOf,
} from "@/lib/craig/joiners";
import type {
  DetailLine,
  Joiner,
  PayrollDetailLine,
} from "@/lib/craig/contract";
import { maskDetails, readPersonalDetails } from "@/lib/craig/personal-details";
import { maskPayroll, readPayrollDetails } from "@/lib/craig/payroll-details";
import { sealingProblem } from "@/lib/craig/sealed-answer";
import { NoPerson, PersonProgress } from "./person-progress";

/**
 * One person's onboarding, fetched on the server because it has to be.
 *
 * This page used to read the browser's own copy of who had a seat, which was
 * fine for as long as nothing ever happened to them. It stopped being fine the
 * moment the new starter got a screen: they fill their steps in on their own
 * device, in their own browser, and nothing they do could ever reach a
 * `localStorage` key belonging to the person tracking it. The whole point of
 * this screen — Mara seeing what step her new joiner is on — only works if the
 * progress is read from the one place both people write to.
 *
 * Two guards, and they are the same guard twice over. `requireUser()` is the
 * check every page in `(app)` carries: the proxy turns anonymous requests
 * away at the edge but it is a matcher rather than a wall, and it only ever
 * sees the cookie, so this is the check that knows whether the account behind
 * it still exists.
 *
 * The second is new and belongs to this page in particular. The joiner store is
 * one file shared by every account on the deployment, and the only thing
 * standing between them is `accountEmail` — so a page that fetched by id alone
 * would hand anybody who guessed a UUID somebody else's name, address, start
 * date and date of birth. A person who isn't yours is therefore treated as a
 * person who isn't there: exactly the same empty state, no separate wording. A
 * page that said "that isn't yours" would be confirming that the id is real,
 * which is the one fact the guard exists to withhold.
 */

/**
 * Whether this account may see this person at all.
 *
 * Folded to lower case, because `listJoiners` folds too and the two must agree:
 * a person who appears on the list and then can't be opened is a broken link,
 * and it would only break for the accounts whose stored address differs in case
 * from the one in their session — which is nobody in testing and somebody in
 * the end.
 */
const belongsTo = (joiner: Joiner, email: string) =>
  joiner.accountEmail.trim().toLowerCase() === email.trim().toLowerCase();

/**
 * The tab says who this is, which it couldn't before.
 *
 * The old static title was justified on the grounds that whose page this is
 * wasn't server data. It is now, and the tab is where somebody with three of
 * these open tells them apart.
 *
 * It carries the ownership check as well, and that is not belt and braces: a
 * title is rendered into the HTML of a page that otherwise refuses to show
 * anything, so naming a stranger's new starter there would leak precisely what
 * the empty state below is careful not to. `currentUser` rather than
 * `requireUser` because metadata is the wrong place to run a redirect from —
 * the page itself does that a moment later, and a signed-out visitor just gets
 * the generic title on their way to sign-in.
 */
export async function generateMetadata(
  props: PageProps<"/people/[id]">,
) {
  const user = await currentUser();
  if (!user) return { title: "Person — Craig" };

  const { id } = await props.params;
  const joiner = await getJoiner(id);
  if (!joiner || !belongsTo(joiner, user.email)) {
    return { title: "Person — Craig" };
  }

  return { title: `${joiner.name} — Craig` };
}

export default async function ShowcasePersonPage(
  props: PageProps<"/people/[id]">,
) {
  const user = await requireUser();
  const { id } = await props.params;

  const joiner = await getJoiner(id);
  if (!joiner || !belongsTo(joiner, user.email)) {
    return <NoPerson user={user} />;
  }

  const progress = progressOf(joiner);

  /* `overall` leads, and the flattening below is what makes that the only
     reading available. The admin's question is how the onboarding is going, not
     how the other person is doing — half of it is their own work — so the
     numbers this page shows first are both sides together.

     `next` is only passed on when it has an actor, which narrows the type and
     is also the honest shape: `overall.next` is drawn from steps that all have
     one, and claiming a step is waiting on somebody when the record doesn't say
     who would be exactly the invented state this screen exists to avoid.

     The three shares come along so the column can split the outstanding work
     without deriving "which steps are whose" a second time. Each is counted
     rather than inferred from the others, so there is one rule about who owns
     what and it lives in `progressOf`. */
  const next = progress.overall.next?.actor
    ? {
        title: progress.overall.next.title,
        actor: progress.overall.next.actor,
      }
    : null;

  /* Worked out here rather than in the card, because it is a comparison against
     the current time and a component that made it while rendering would make it
     twice — once on the server and once in the browser a beat later. React
     calls that a hydration mismatch; a person reads it as a status that changes
     when they look away. The same reason every date on this page is already
     words by the time it is a prop. */
  const interrupted = joiner.steps
    .filter((step) => isRunInterrupted(step))
    .map((step) => step.id);

  /**
   * The sealed answers, opened here and masked before they leave.
   *
   * This is the whole of the "sealed at rest, readable by their admin" claim,
   * in three lines: the row holds ciphertext, the server opens it because it
   * has the key and this reader has been proven to own this person, and what
   * crosses to the browser is a list of labels with the values struck out.
   *
   * Masked on this side rather than in the component, and that is the decision
   * worth defending. Sending the real values and hiding them with CSS — a blur,
   * a `type="password"`, a `hidden` attribute — is not hiding: they would be in
   * the HTML of a page people leave open, screenshot and share their screen on,
   * and one inspector tab away for anybody in the room. The full values are
   * fetched, once, when somebody presses Reveal.
   *
   * A step whose answer cannot be opened is simply absent from the map, and the
   * card says so rather than drawing an empty panel. `sealingProblem()` names
   * the one cause that has a fix — the key is not set on this deployment — and
   * is null when there is nothing useful to say.
   *
   * The payroll block gets its own map for the same reason it gets its own
   * envelope: a step is one kind or the other, the two mask by different rules,
   * and one record keyed by step id with a union in it would be a record the
   * dialog has to guess about. Neither is read at all when the plan has no such
   * step, which is most plans.
   */
  const details: Record<string, DetailLine[]> = {};
  if (joiner.steps.some((step) => step.field === "personal-details")) {
    for (const [stepId, answer] of await readPersonalDetails(joiner.id)) {
      details[stepId] = maskDetails(answer);
    }
  }

  const payroll: Record<string, PayrollDetailLine[]> = {};
  if (joiner.steps.some((step) => step.field === "payroll-details")) {
    for (const [stepId, answer] of await readPayrollDetails(joiner.id)) {
      payroll[stepId] = maskPayroll(answer);
    }
  }

  return (
    <PersonProgress
      user={user}
      person={{
        id: joiner.id,
        name: joiner.name,
        email: joiner.email,
        role: joiner.role,
        startDate: joiner.startDate,
        workflowId: joiner.workflowId,
        workflowName: joiner.workflowName,
        invitedAt: joiner.invitedAt,
        steps: joiner.steps,
        interrupted,
        details,
        payroll,
        sealingProblem: sealingProblem(),
      }}
      progress={{
        done: progress.overall.done,
        total: progress.overall.total,
        finished: progress.overall.finished,
        next,
        /* Three shares rather than one and a subtraction. The column used to
           work out the reader's own half by taking the new starter's away from
           the total, which was exactly right with two kinds of step and became
           wrong the day there were three: every account Craig was still
           creating would have been counted as work sitting on the admin's desk,
           in amber, with nothing they could do about it. */
        theirs: progress.overall.joiner,
        mine: progress.overall.admin,
        craig: progress.overall.craig,
      }}
    />
  );
}
