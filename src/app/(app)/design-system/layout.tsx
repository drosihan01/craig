import {
  AppShell,
  Badge,
  BackLink,
  Separator,
} from "@/components/ui";
import { requireUser } from "@/lib/craig/current-user";
import { SectionNav } from "./_components/section-nav";
import { ShellAside } from "./_components/shell-aside";

/**
 * The design system runs on the product's own shell rather than a bespoke
 * layout — if the frame breaks, it breaks here first.
 */
/**
 * The guard sits on the layout rather than the page, because the page is
 * `"use client"` and cannot redirect. It covers this route and anything added
 * under it, which is the property worth having: a section added later inherits
 * the door instead of having to remember it.
 *
 * This lived outside the router until now and so needed no guard — it was
 * served to nobody. Giving it a URL is what makes the guard necessary, and
 * doing both in one change is deliberate: a route reachable for even one deploy
 * before it is guarded is a route somebody can find.
 *
 * The session it returns is now used rather than discarded, and the two things
 * it feeds are the two ways this screen was still behaving like a page outside
 * the product.
 *
 * **The account cell was Ada.** `ACCOUNT` is demo seed data — a fixture invented
 * so every screenshot could be about one imaginary company — and it was being
 * handed to the shell's profile box, so the corner of an internal tool has been
 * naming a person who does not exist to whichever real human is looking at it.
 * That was harmless while this was a demo served to nobody and is not harmless
 * behind a sign-in door: the same box on every other screen is how you check
 * which account you are in, and it is the only way to sign out. One of the two
 * is worse than useless if it names the wrong person.
 *
 * **There was no way out.** The nav is a list of anchors within this one page,
 * so once you were here the only exits were the browser's back button and
 * typing a URL. The back link is the same one Settings uses, pointed at the
 * room this is now reached from — see `/mission-control`, which is the screen
 * that describes what this is before you open it.
 */
export default async function DesignSystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <AppShell
      title="Design system"
      /* The way out, then the page's own index — the order Settings composes
         its column in, and the order anything reached *from* somewhere should:
         the exit is the one control that belongs to no particular section, so
         it goes above the rule rather than into the list.
         `SectionNav` is untouched below it; this screen's job is unchanged and
         only its frame has moved.
         No `navRail`, deliberately. Collapsing still takes this column to
         nothing, because a filter box and forty anchors are exactly what the
         rail's own note says does not survive being squeezed to 52px — and a
         rail holding only the back arrow would trade the index for the exit
         rather than keeping both. */
      nav={
        <div className="flex flex-col gap-5">
          <BackLink href="/mission-control" className="px-2">
            Mission control
          </BackLink>

          <Separator />

          <SectionNav />
        </div>
      }
      aside={<ShellAside />}
      asideTitle="On this page"
      actions={<Badge tone="neutral">v0.1</Badge>}
      account={{ name: user.name, email: user.email }}
    >
      {children}
    </AppShell>
  );
}
