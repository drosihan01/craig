import { getAccount } from "@/lib/craig/accounts";
import type { ConnectionProvider } from "@/lib/craig/blocks";
import { requireUser } from "@/lib/craig/current-user";
import { listJoiners } from "@/lib/craig/joiners";
import { seatEntitlement } from "@/lib/craig/seats";
import { docusignViewFor } from "@/lib/docusign/store";
import { githubViewFor } from "@/lib/github/store";
import { linearConnectionViewFor } from "@/lib/linear/store";
import { slackViewFor } from "@/lib/slack/store";
import { WorkflowEditor } from "./workflow-editor";

export const metadata = {
  title: "Workflow — Craig",
};

/**
 * A server component wrapping the editor, holding the guard and the seats.
 *
 * Same reasoning as every other page in `(app)`: the proxy turns anonymous
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
  props: PageProps<"/workflows/[id]">,
) {
  const user = await requireUser();
  const { id } = await props.params;

  /* Names, not whole records. The editor wants two things from this — how many
     seats are taken, and who to offer as the owner of a step — and both are
     answered by the names. Handing down each joiner's steps as well would put
     one person's date of birth into the props of a page about a workflow. */
  const seats = (await listJoiners(user.email)).map((joiner) => joiner.name);

  /**
   * Which providers this account has working connections to.
   *
   * A list of provider ids and deliberately nothing more. `account.google` is
   * already the public view — it cannot carry the refresh token, by
   * construction — but the editor needs to know only *which* connections exist,
   * and props on a client component are shipped to a browser, so that is all it
   * gets. The panel inside the editor reads the rest for itself from
   * `/api/google/connection` when somebody opens the block.
   *
   * A list rather than the boolean this used to be, because the question the
   * editor asks is now per block rather than about Google: `blocks.ts` knows
   * which provider each block needs, so what it wants back is which providers
   * are available, not one bit about the only one that existed when this was
   * written. Linear is the second entry the list was shaped for — a push,
   * as promised, not a refactor.
   *
   * `needsReconnect` counts as absent rather than as a separate state, because
   * the question this answers is "would the step work", and a grant Google has
   * revoked would not. The block's own panel draws the distinction, where there
   * is room to say what happened and what fixes it. Linear's flag is checked
   * for the same reason even though nothing sets it yet — the code that could
   * discover a dead Linear grant arrives with the runner, and this line being
   * ready for it costs nothing.
   */
  const account = await getAccount(user.email);
  const google = account?.google ?? null;
  /* Each connection lives in its own store rather than on the account record
     — the argument is in `src/lib/slack/store.ts` — so they are asked for
     separately and in parallel, since none of them depends on the others.

     `needsReconnect` counts as absent for all of them, for the reason the
     Google comment above gives: the question this answers is "would the step
     work", and a grant the provider has revoked would not. Each block's own
     panel draws the distinction, where there is room to say what happened.

     GitHub is the third entry in this `Promise.all` and cost exactly one line
     of it, which is the shape working: a provider is a store to read and a
     ternary to push, not a change to how this page is put together.

     DocuSign is the fourth, and the only one whose block does not always need
     it: a contract step signed in Craig asks for nothing, so `blocks.ts`
     decides per step whether this entry is wanted. This list stays what it has
     always been — which connections exist — and says nothing about which are
     needed. */
  const [slack, linear, github, docusign] = await Promise.all([
    slackViewFor(user.email),
    linearConnectionViewFor(user.email),
    githubViewFor(user.email),
    docusignViewFor(user.email),
  ]);

  const connectedProviders: ConnectionProvider[] = [
    ...(google && !google.needsReconnect
      ? (["google-workspace"] as const)
      : []),
    ...(slack && !slack.needsReconnect ? (["slack"] as const) : []),
    ...(linear && !linear.needsReconnect ? (["linear"] as const) : []),
    ...(github && !github.needsReconnect ? (["github"] as const) : []),
    ...(docusign && !docusign.needsReconnect ? (["docusign"] as const) : []),
  ];

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
      connectedProviders={connectedProviders}
    />
  );
}
