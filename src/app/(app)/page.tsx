import { redirect } from "next/navigation";
import { WELCOME_PATH } from "@/lib/showcase/contract";
import { requireUser } from "@/lib/showcase/current-user";
import { subscriptionFor } from "@/lib/showcase/accounts";
import { listJoiners } from "@/lib/showcase/joiners";
import { listWorkflows } from "@/lib/showcase/workflows";
import { seatEntitlement } from "@/lib/showcase/seats";
import { outstandingFor } from "@/lib/showcase/outstanding";
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

  const [workflows, joiners, subscription] = await Promise.all([
    listWorkflows(user.email),
    listJoiners(user.email),
    subscriptionFor(user.email),
  ]);

  /* Only while there is genuinely nothing. The moment Craig drafts something
     this stops firing and `/welcome` becomes a screen nobody is sent to. */
  if (workflows.length === 0) redirect(WELCOME_PATH);

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
    />
  );
}
