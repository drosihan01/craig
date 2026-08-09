import { requireUser } from "@/lib/craig/current-user";
import { WorkflowList } from "./workflow-list";

export const metadata = {
  title: "Workflows — Craig",
};

/**
 * A server component wrapping the screen, purely to hold the guard.
 *
 * Every page in `(app)` needs `requireUser()` for the reasons set out on
 * the welcome page: the proxy is a matcher rather than a wall, and it only
 * ever sees the cookie. This is the check that knows whether the account
 * behind it still exists.
 */
export default async function ShowcaseWorkflowsPage() {
  const user = await requireUser();
  return <WorkflowList user={user} />;
}
