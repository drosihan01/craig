import { requireUser } from "@/lib/showcase/current-user";
import { CONNECT_OUTCOME_PARAM } from "@/lib/showcase/google-outcome";
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
 * argument in `showcase-nav.tsx` — that listing rooms the product doesn't
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
export default async function ShowcaseSettingsPage(
  props: PageProps<"/showcase/settings">,
) {
  const user = await requireUser();

  /* Whatever the connect flow put in the URL, passed through untouched. It is
     matched against a closed set of known codes before a word of it is
     rendered — see `OUTCOMES` — so an arbitrary string in `?google=` renders
     as nothing rather than as prose of a stranger's choosing. */
  const outcome = (await props.searchParams)[CONNECT_OUTCOME_PARAM];

  return (
    <SettingsScreen
      user={user}
      outcome={typeof outcome === "string" ? outcome : null}
    />
  );
}
