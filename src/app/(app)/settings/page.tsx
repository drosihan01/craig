import { getAccount } from "@/lib/craig/accounts";
import { requireUser } from "@/lib/craig/current-user";
import { CONNECT_OUTCOME_PARAM } from "@/lib/craig/google-outcome";
import { listJoiners } from "@/lib/craig/joiners";
import { seatEntitlement } from "@/lib/craig/seats";
import { SettingsScreen } from "./settings-screen";

export const metadata = {
  title: "Settings — Craig",
};

/**
 * The account's own settings, which for now means one connection.
 *
 * This screen exists because connecting a Google Workspace needed a permanent
 * address. It lived in the sandbox, which is the builder's hub and says so —
 * fine for a flow nobody had run, and indefensible once it was real: a customer
 * cannot be asked to go to a page headed "not part of the product" to hand over
 * permission to manage their staff, and a connection you can only reach by
 * remembering which screen mentions Google is a connection nobody will ever
 * find to *undo*.
 *
 * Not a third item in the nav. That column is deliberately two rooms, and the
 * argument in `nav.tsx` — that listing rooms the product doesn't
 * really have is a worse first impression than a short list — applies to a
 * settings page holding a single toggle just as much as to anything else.
 * Settings is reached from the account menu, which is where every product of
 * this shape puts it and where the Settings item already sat, pointing
 * nowhere.
 *
 * A server component so `?google=` arrives as a prop rather than being read in
 * the browser, and so `requireUser()` runs before anything renders: this is the
 * screen that names which account a Workspace is about to be attached to, and
 * a name it guessed would be worse than no name at all.
 */
/**
 * Which room this is a detour out of.
 *
 * Settings has no parent in the nav — it opens from the account menu, on every
 * screen — so its back arrow can only be answered by where somebody was
 * standing when they pressed it. The menu puts that in `?from=`.
 *
 * The value is never echoed into the link. It only ever *chooses* between two
 * hardcoded destinations, which is what makes this immune to the open-redirect
 * this shape of feature usually invites: there is no string a visitor can put
 * in that URL which sends the next person anywhere but People or Workflows.
 *
 * The area rather than the exact page, deliberately. Somebody who opened
 * Settings from a workflow lands on the list, which is a predictable place; a
 * link that dropped them back inside one particular builder would be a surprise
 * every time it was right.
 *
 * **The label is always "Back".** It used to name the destination — People,
 * Workflows — which meant the one word on the control had to stay in step with
 * a `?from=` that three screens now set, and it was already wrong for anybody
 * arriving from Home. "Back" is the thing that is true of every origin,
 * including the ones added after this was written, and it is what somebody
 * pressing it is looking for anyway.
 */
function parentArea(from: unknown): { href: string; label: string } {
  const raw = typeof from === "string" ? from : "";
  const href = raw.startsWith("/people")
    ? "/people"
    : raw.startsWith("/workflows")
      ? "/workflows"
      : /* Home, and the fallback. Settings opens from the account menu on every
           screen, so an unrecognised origin is far likelier to be a new room
           than a tampered URL — and Home is the one place everything is
           reachable from. */
        "/";
  return { href, label: "Back" };
}

export default async function ShowcaseSettingsPage(
  props: PageProps<"/settings">,
) {
  const user = await requireUser();

  /* Whatever the connect flow put in the URL, passed through untouched. It is
     matched against a closed set of known codes before a word of it is
     rendered — see `OUTCOMES` — so an arbitrary string in `?google=` renders
     as nothing rather than as prose of a stranger's choosing. */
  const params = await props.searchParams;
  const outcome = params[CONNECT_OUTCOME_PARAM];
  const back = parentArea(params.from);

  /* The account itself, once, rather than a query per fact.
   *
   * This used to be `subscriptionFor(user.email)`, which reads the account row
   * and returns one field off it. Branding needs two more fields off the same
   * row — the logo and the company's name as the *account* records it — and
   * three reads of one row, on one page, would be three chances for them to
   * disagree as well as two round trips nobody needs. `subscription` below is
   * the same value `subscriptionFor` returned, assembled by the same function.
   *
   * The company comes from here rather than from the session on purpose: a
   * signed token minted before somebody's company was recorded carries no
   * company at all (see `Session`), and the one place this screen shows it is
   * beside a preview of the words a new starter will read when their client
   * blocks the logo. That is a bad place to be missing a name. */
  const account = await getAccount(user.email);
  const subscription = account?.subscription ?? null;
  const taken = (await listJoiners(user.email)).length;

  return (
    <SettingsScreen
      user={user}
      outcome={typeof outcome === "string" ? outcome : null}
      back={back}
      subscription={subscription}
      taken={taken}
      entitlement={seatEntitlement(subscription, taken)}
      logo={account?.logo ?? null}
      company={account?.company ?? user.company ?? ""}
    />
  );
}
