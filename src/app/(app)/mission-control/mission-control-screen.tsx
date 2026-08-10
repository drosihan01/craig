"use client";

import * as React from "react";
import Link from "next/link";
import {
  AppShell,
  BackLink,
  NavRail,
  NavRailItem,
  NavTree,
  NavTreeItem,
  Separator,
} from "@/components/ui";
import { ArrowBack, ArrowForward, Mail, Palette } from "@/components/ui/icons";
import type { Session } from "@/lib/craig/contract";

/**
 * Where this is a detour out of, in one place.
 *
 * Settings is the only screen that links here and the only one worth returning
 * to, so the destination is a constant rather than a prop — and naming it beats
 * the word "Back" for exactly the reason Settings' own link *can't* name it:
 * there is one answer, not three, so the label may as well be the useful one.
 */
const BACK = { href: "/settings", label: "Settings" };

/**
 * Both tools, once.
 *
 * They appear three times on this screen — in the nav, in the rail, and as the
 * cards that are the page — and all three read this list. Two hand-written
 * copies of a two-item nav is how a rail ends up offering a route the panel
 * dropped months ago, which is the mistake `ShowcaseNavRail` was written to
 * avoid; there is no reason a third copy would be any more trustworthy.
 *
 * `nav` and `title` are deliberately allowed to differ. The row and the rail
 * label the *room* — "Mail" matches the icon beside it and is what `/email`
 * calls itself in its own header — while the card has room for the tool's
 * actual name. Collapsing the two would mean either a nav row reading
 * "Mailmaker" next to a design system nobody calls a componentmaker, or a card
 * introducing the tool by the name of the drawer it lives in.
 *
 * The icons are the ones each thing already wears: `Mail` sits on every row of
 * the mailmaker's own template list, and `Palette` is what the design system is
 * drawn with wherever it is mentioned. A hub that picked new symbols would be
 * introducing second names for two things the product has already named.
 */
const TOOLS = [
  {
    href: "/email",
    nav: "Mail",
    title: "Mailmaker",
    icon: <Mail />,
    description:
      "Every email Craig sends, edited beside a live preview of how it lands, against the same templates the invite route reads at send time. The words go out under the company's name to somebody who was hired last week, so they are worth reading before that person does.",
  },
  {
    href: "/design-system",
    nav: "Design system",
    title: "Design system",
    icon: <Palette />,
    description:
      "Every component the product is made of, drawn live on the product's own shell rather than on a page built to flatter it — so when the frame breaks, it breaks here first, in front of somebody who can fix it.",
  },
];

/**
 * The workshop, as a room.
 *
 * It borrows Settings' shape rather than the list screens': the way out at the
 * top of the column, then what the page is about. Workflows and People are
 * rooms you move between; this is somewhere you stepped into, out of Settings,
 * to pick one of two tools and leave. The product's own nav has no business in
 * here, because nothing on this page is the product — and a column offering
 * People and Workflows would be inviting somebody out before they had done the
 * one thing they came for, which is the argument Settings and the builder both
 * make about themselves.
 *
 * The account cell is on for the reason it is on everywhere else: this is a
 * screen behind the sign-in door, and the corner of every other screen behind
 * that door says which account is holding it open. It is also the only way to
 * sign out, so a shell that dropped it would be a room you can only leave by
 * going back the way you came.
 */
export function MissionControlScreen({ user }: { user: Session }) {
  return (
    <AppShell
      title="Mission control"
      account={{ name: user.name, email: user.email }}
      /* Collapsed, the column keeps everything it had, because everything it
         had was an icon and a word: the way out, and two rooms. That is the
         case `navRail` exists for. Settings' nav survives the squeeze because
         it is a single link; the design system's does not, because it is a
         filter box and forty anchors, which is why that screen still collapses
         to nothing and this one doesn't. */
      navRail={
        <NavRail>
          <NavRailItem
            href={BACK.href}
            label={BACK.label}
            icon={<ArrowBack />}
          />
          {TOOLS.map((tool) => (
            <NavRailItem
              key={tool.href}
              href={tool.href}
              label={tool.nav}
              icon={tool.icon}
            />
          ))}
        </NavRail>
      }
      nav={<MissionControlNav />}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 py-10">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">
            Mission control
          </h1>
          <p className="text-md text-text-muted">
            The tools this product is built with, rather than the product
            itself. Nobody outside the team has any use for them — which is
            exactly why they needed a door of their own instead of two more rows
            at the bottom of somebody&apos;s account settings.
          </p>
        </header>

        <Separator />

        <div className="flex flex-col gap-3">
          {TOOLS.map((tool) => (
            <ToolCard
              key={tool.href}
              href={tool.href}
              title={tool.title}
              description={tool.description}
              icon={tool.icon}
            />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

/**
 * The way back, then the two rooms.
 *
 * Neither row is ever marked current, because neither can be: both leave this
 * shell entirely for a screen that draws its own. Deriving `current` from the
 * pathname here would be a branch that only ever evaluates false, and a nav
 * that lit a row up on a page it doesn't own would be lying about where you
 * are.
 */
function MissionControlNav() {
  return (
    <div className="flex flex-col gap-5">
      <BackLink href={BACK.href} className="px-2">
        {BACK.label}
      </BackLink>

      <Separator />

      <NavTree>
        {TOOLS.map((tool) => (
          <NavTreeItem
            key={tool.href}
            href={tool.href}
            label={tool.nav}
            icon={tool.icon}
          />
        ))}
      </NavTree>
    </div>
  );
}

/**
 * One tool, with room for a sentence about it.
 *
 * A card rather than the bare bordered row Settings uses, and the extra weight
 * is most of the argument for this page existing. Down there these were two of
 * five sections competing for one column, so a row each was the most they could
 * fairly take; here they are the content. The sentence is the part that was
 * missing — a link labelled "Design system" tells somebody new to this codebase
 * nothing they couldn't have guessed from the URL, and the tool that most needs
 * explaining is the one whose name sounds like a folder.
 */
function ToolCard({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3.5 shadow-e1 transition-[border-color,box-shadow] duration-150 ease-out-quart hover:border-border-strong hover:shadow-e2"
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-text-muted [&_svg]:size-4">
        {icon}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-md font-semibold">{title}</span>
        <span className="text-sm leading-relaxed text-text-muted">
          {description}
        </span>
      </span>

      {/* Nudges on hover by the same 2px the back link moves, in the opposite
          direction. The two read as one gesture rather than as two effects
          picked separately. */}
      <ArrowForward
        aria-hidden
        className="mt-1.5 size-4 shrink-0 text-text-subtle transition-transform duration-150 ease-out-quart group-hover:translate-x-0.5"
      />
    </Link>
  );
}
