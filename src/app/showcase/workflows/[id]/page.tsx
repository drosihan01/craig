import { requireUser } from "@/lib/showcase/current-user";
import { WorkflowEditor } from "./workflow-editor";

export const metadata = {
  title: "Workflow — Craig",
};

/**
 * A server component wrapping the editor, purely to hold the guard.
 *
 * Same reasoning as every other `/showcase/*` page: the proxy turns anonymous
 * requests away at the edge, but it is a matcher rather than a wall and it can
 * only see the cookie. `requireUser()` is the check that knows whether the
 * account behind that cookie still exists.
 *
 * The title is static because the workflow's name isn't server data — it lives
 * in the account's own state alongside everything else the showcase has
 * accumulated, and a tab that named it would have to fetch it twice.
 */
export default async function ShowcaseWorkflowPage(
  props: PageProps<"/showcase/workflows/[id]">,
) {
  const user = await requireUser();
  const { id } = await props.params;

  return <WorkflowEditor id={id} user={user} />;
}
