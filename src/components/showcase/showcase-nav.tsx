"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import {
  NavRail,
  NavRailItem,
  NavTree,
  NavTreeItem,
  Separator,
} from "@/components/ui";
import { AltRoute, Groups, Home } from "@/components/ui/icons";

/**
 * The showcase's left column.
 *
 * Every screen here was built on its own and each one rolled its own nav, so
 * none of them linked to any of the others — you could finish a workflow and
 * have no way out of the page you were on. This is the fix, and it belongs in
 * one place: a nav is a promise about what the product does, and three
 * different navs is three different promises.
 *
 * Three items, not six. Home is where Craig keeps track of the company; the
 * other two are the things this product does. Listing rooms it doesn't have is
 * a worse first impression than a short list. A room that exists and is empty
 * is the other case, and it's `disabled` below rather than a missing row.
 *
 * Current is derived from the pathname rather than passed in, so a page can't
 * render a nav that disagrees with the route it's on.
 *
 * `disabled` is the one thing a page does get to say, because emptiness is a
 * property of the account and not of the route: on a brand-new one both rooms
 * are bare, and the welcome screen is the only screen that knows it. Shutting
 * the rows rather than removing them is the argument in `NavTreeItem` — the
 * short list is worth keeping, but a list that quietly grows an item is worse
 * than one that says which door is locked.
 */

/**
 * Iconed, which is the menu row as the design system draws it.
 *
 * These were bare labels — the right component, given none of what makes it
 * legible. `NavTreeItem` puts the icon in a bordered tile that fills with the
 * accent on the row you're on, so the current page is marked twice over rather
 * than by weight alone; without one the row loses that and the column reads as
 * two words stacked in a margin.
 *
 * The icons are the ones each thing already wears elsewhere. A workflow is
 * `AltRoute` on every row of the list and on its own empty state, and a nav
 * that picked something else would be introducing a second symbol for a thing
 * the product has already named.
 *
 * The reason a room is shut lives here beside it rather than at the call site,
 * because it belongs to the room: Workflows is empty for the same reason on
 * every screen that finds it empty. So the nav owns the sentence and a page
 * owns only the flag, and the second screen that needs to shut a row can't
 * invent a second wording for a door this file has already described.
 *
 * `hidden` is the stronger version of that, and it exists for exactly one
 * moment: somebody's very first run, before they have anything at all. The
 * argument above — that a shut door labelled with its reason beats a list that
 * quietly grows — holds for an account with *some* history, where the rooms are
 * real and merely empty. It does not hold for the first screen anybody sees,
 * where two locked doors beside a stepper are two things to wonder about
 * instead of one thing to do. So the first run gets the stepper and nothing
 * else, and the rooms appear, unlocked, the moment there is something in them.
 */
/**
 * Home, People, Workflows — in that order, and People before Workflows on
 * purpose.
 *
 * It read the other way round for a while, which followed the order things get
 * *built* in: Craig drafts a workflow, then somebody is given a seat on it. But
 * a nav is not a history of how the account was assembled, it is a list of the
 * places worth going, and after the first week the traffic reverses. A workflow
 * is written once and edited rarely; people arrive continuously, and every
 * question this product exists to answer — has their account been made, what is
 * still waiting on me, has Irena got her visa yet — is a question about a
 * person. Workflows is the machinery behind that, and machinery belongs below
 * the thing it serves.
 */
const ITEMS = [
  {
    label: "Home",
    href: "/",
    icon: <Home />,
    shut: "There's nothing here until Craig has something to tell you about",
  },
  {
    label: "People",
    href: "/people",
    icon: <Groups />,
    shut: "You can give somebody a seat once there's a workflow to start them on",
  },
  {
    label: "Workflows",
    href: "/workflows",
    icon: <AltRoute />,
    shut: "Craig drafts your first workflow from this conversation",
  },
];

/**
 * Which row is the page you are on.
 *
 * A prefix match everywhere except the root, which needs an exact one — Home
 * lives at `/`, and `"/workflows".startsWith("/")` is true, so a plain prefix
 * test lights up Home on every screen in the product. Shared by the panel and
 * the rail so the two cannot disagree about where you are.
 */
const isCurrent = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);

export function ShowcaseNav({
  disabled,
  hidden,
  children,
}: {
  /** Shuts both rows. See the note above `ITEMS`. */
  disabled?: boolean;
  /** Removes both rows outright. First run only — see the note above `ITEMS`. */
  hidden?: boolean;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-5">
      {!hidden && (
        <NavTree>
          {ITEMS.map((item) => (
            <NavTreeItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              current={isCurrent(pathname, item.href)}
              disabled={disabled}
              reason={item.shut}
            />
          ))}
        </NavTree>
      )}

      {/* Page-specific detail sits under the nav, not instead of it — which
          is exactly the mistake that stranded the setup screen.

          The separator goes with the rows it separates: with the nav hidden
          there is nothing above this to divide it from, and a rule floating at
          the top of an otherwise empty column reads as a missing section. */}
      {children && (
        <>
          {!hidden && <Separator />}
          {children}
        </>
      )}
    </div>
  );
}

/**
 * The same nav with the panel collapsed.
 *
 * Built from the same `ITEMS`, so a page added to one is a page added to both.
 * The alternative — a second hand-written list — is how a rail ends up
 * offering a route the expanded nav dropped months ago.
 *
 * No `children` here. The detail a page hangs under the nav is counts and
 * prose, and neither has an icon; a rail that tried to keep them would be
 * showing the parts of the column that survive squeezing rather than the parts
 * that matter.
 *
 * `disabled` for the same reason it's shared: a rail that still walked you
 * into the empty page while the expanded panel refused would make collapsing
 * the panel the way round the rule, and the two widths would be telling the
 * person two different things about the same account.
 *
 * `hidden` travels with it for exactly that reason. A first run that hid the
 * rooms in the panel and kept them in the rail would put the whole point of
 * hiding them one click away.
 */
export function ShowcaseNavRail({
  disabled,
  hidden,
}: {
  disabled?: boolean;
  hidden?: boolean;
}) {
  const pathname = usePathname();

  if (hidden) return null;

  return (
    <NavRail>
      {ITEMS.map((item) => (
        <NavRailItem
          key={item.href}
          href={item.href}
          label={item.label}
          icon={item.icon}
          current={isCurrent(pathname, item.href)}
          disabled={disabled}
          reason={item.shut}
        />
      ))}
    </NavRail>
  );
}
