"use client";

import { AppShell } from "@/components/ui";
import { JoinerNav, JoinerNavRail } from "@/components/craig/joiner-nav";
import { JoinerCraig } from "@/components/craig/joiner-craig";

/**
 * The conversation, in the product's frame.
 *
 * Laid out the way Home lays out the admin's Craig, because it is the same job:
 * `fill` on the shell so the content row is a real height, and a centred
 * `max-w-2xl` column that takes its share of it. The composer then sits at the
 * bottom of the window rather than at the bottom of the transcript, which is
 * the difference between a chat and a page with a text box on it.
 *
 * `min-h-0` is the part that looks redundant and is not. A flex child's default
 * `min-height: auto` floors it at its content, so without this the column grows
 * with the transcript instead of scrolling inside it — and the composer,
 * pinned to the bottom of a column that keeps growing, walks off the screen.
 *
 * No `account` prop, so no account cell. `AppShell`'s is wired to Settings and
 * to a Sign out that clears the admin's cookie; both would be controls that
 * look like they work and do nothing. See `joiner-nav.tsx`.
 */
export function AskScreen({
  firstName,
  company,
}: {
  firstName: string;
  company: string;
}) {
  return (
    <AppShell
      title="Ask Craig"
      fill
      navRail={<JoinerNavRail />}
      nav={
        <JoinerNav>
          <p className="px-2 text-xs leading-relaxed text-text-subtle">
            {/* The scope, in the nav rather than over the conversation. It is
                the same sentence the panel used to carry above its first
                message, and it belongs here now: somewhere permanent, out of
                the way of the reply, and readable before you type rather than
                only on an empty screen. */}
            Craig knows your plan and anything {company} has shared with new
            starters. For anything else, ask whoever invited you.
          </p>
        </JoinerNav>
      }
    >
      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
        <JoinerCraig firstName={firstName} />
      </div>
    </AppShell>
  );
}
