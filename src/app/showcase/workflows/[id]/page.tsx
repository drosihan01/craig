import { getAccount } from "@/lib/showcase/accounts";
import { requireUser } from "@/lib/showcase/current-user";
import { listJoiners } from "@/lib/showcase/joiners";
import { seatEntitlement } from "@/lib/showcase/seats";
import { WorkflowEditor } from "./workflow-editor";

export const metadata = {
  title: "Workflow — Craig",
};

/**
 * A server component wrapping the editor, holding the guard and the seats.
 *
 * Same reasoning as every other `/showcase/*` page: the proxy turns anonymous
 * requests away at the edge, but it is a matcher rather than a wall and it can
 * only see the cookie. `requireUser()` is the check that knows whether the
 * account behind that cookie still exists.
 *
 * The seats are read here for the reason People reads them here: whoever holds
 * one lives on the server, because the new starter fills their steps in on
 * their own device and the admin who removes them does it from another screen
 * again. The editor is a client component and cannot ask; before this it
 * counted the browser's own list of invitees, which meant Craig's panel went on
 * announcing somebody the account had already let go, and publishing offered an
 * invitation the seat limit would have refused a page later. Read once, on the
 * server, and handed down — the same shape People uses.
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

  /* Names, not whole records. The editor wants two things from this — how many
     seats are taken, and who to offer as the owner of a step — and both are
     answered by the names. Handing down each joiner's steps as well would put
     one person's date of birth into the props of a page about a workflow. */
  const seats = listJoiners(user.email).map((joiner) => joiner.name);

  /**
   * Whether a Google Workspace step could actually run for this account.
   *
   * A boolean, and deliberately only a boolean. `account.google` is already the
   * public view — it cannot carry the refresh token, by construction — but the
   * editor needs one bit and props on a client component are shipped to a
   * browser, so it gets the bit. The panel inside the editor reads the rest for
   * itself from `/api/google/connection` when somebody opens the block.
   *
   * `needsReconnect` counts as not connected here rather than as a separate
   * state, because the question this answers is "would the step work", and a
   * grant Google has revoked would not. The block's own panel draws the
   * distinction, where there is room to say what happened and what fixes it.
   */
  const account = getAccount(user.email);
  const google = account?.google ?? null;
  const googleConnected = Boolean(google) && !google?.needsReconnect;

  /**
   * How many seats there are to give, from the same account record.
   *
   * Publishing offers an invitation, so this screen enforces the same limit
   * People does — and it has to be handed the same answer rather than a
   * constant it imported, or publishing becomes a way round a limit the other
   * screen applies. Read off the account already in hand: the plan and the
   * Google connection are both facts about the account, and a second lookup for
   * the second of them would be a second chance for the two to be read at
   * different moments.
   */
  const entitlement = seatEntitlement(
    account?.subscription ?? null,
    seats.length,
  );

  return (
    <WorkflowEditor
      id={id}
      user={user}
      seats={seats}
      entitlement={entitlement}
      googleConnected={googleConnected}
    />
  );
}
