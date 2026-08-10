import { requireUser } from "@/lib/craig/current-user";
import { listDocuments } from "@/lib/craig/documents";
import { subscriptionFor } from "@/lib/craig/accounts";
import { listJoiners } from "@/lib/craig/joiners";
import { listWorkflows } from "@/lib/craig/workflows";
import { seatEntitlement } from "@/lib/craig/seats";
import { outstandingFor } from "@/lib/craig/outstanding";
import { HomeScreen } from "./home-screen";

/**
 * Home — where somebody lands, and where Craig keeps track of the company.
 *
 * Signing in used to drop you on `/welcome`, the screen where Craig drafts your
 * first workflow. That is exactly right for somebody's first ten minutes and
 * wrong every day after: a returning admin was put back into building something
 * rather than into their own company, and there was no screen anywhere that
 * simply said what was going on.
 *
 * So the two are separated. This is the room you come back to; `/welcome` is
 * the one you pass through once. The forward below is the only place that
 * decides between them — two screens each deciding whether the other should
 * have the visitor is how a redirect loop gets built.
 *
 * **"Nothing yet" is deliberately about workflows rather than about the
 * account's age.** Craig with no workflow has nothing to report: nobody has
 * been started, nothing has run. It is the same test `/welcome` uses to decide
 * whether to show its stepper, read from the same place, so the two cannot
 * disagree about whose first run this is.
 *
 * Everything is read on the server and passed down. Home's whole job is to be a
 * true statement about the account, and a screen that assembled that from the
 * browser's own cache would be telling you about a browser rather than about a
 * company — which is the bug that sent a returning admin back through
 * onboarding in the first place.
 */
export default async function Home() {
  const user = await requireUser();

  const [workflows, joiners, subscription, documents] = await Promise.all([
    listWorkflows(user.email),
    listJoiners(user.email),
    subscriptionFor(user.email),
    /* Counted here beside the other two rather than on the Resources screen,
       because this is the screen that reports what the account *is*. Read in
       the same `Promise.all` so all four numbers describe one moment. */
    listDocuments(user.email),
  ]);

  /* No redirect, and that is the fix rather than a better condition.
     
     This screen used to send an account with no workflows to `/welcome`. The
     first attempt at fixing it asked a smarter question — does this account
     have *anything*, workflows or people or documents — which was still the
     wrong shape, because it kept overriding an explicit navigation. Somebody
     who clicks Home has said what they want. Answering with a different screen
     is the app arguing with them, and it is worst exactly when they are trying
     to get back to familiar ground after deleting something.
     
     Home already reads correctly with nothing on it — "Nothing needs you right
     now" — and Craig sits on it ready to be told about the company, with a
     door to `/welcome` beside him. So an empty account gets a real screen and
     an offer, instead of a redirect and no way back. */

  const entitlement = seatEntitlement(subscription, joiners.length);
  const outstanding = await outstandingFor(user.email, {
    workflows,
    joiners,
    entitlement,
  });

  return (
    <HomeScreen
      user={user}
      outstanding={outstanding}
      workflowCount={workflows.length}
      peopleCount={joiners.length}
      documentCount={documents.length}
    />
  );
}
