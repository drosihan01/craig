"use client";

import { useRouter } from "next/navigation";
import { Badge, Dialog, List, ListIcon, ListItem } from "@/components/ui";
import { AutoAwesome, Draw } from "@/components/ui/icons";
import { createBlankWorkflow } from "@/lib/craig/store";

/**
 * The two ways a workflow can start.
 *
 * Craig is first, and first is the recommendation. The hard part of a small
 * company's onboarding is never the part somebody would think to put on a
 * canvas — it's the half-dozen things everyone there already knows and nobody
 * has written down, and the only reliable way to get those out is to be asked.
 * Somebody who starts blank because blank was the nearer button builds the
 * onboarding they can remember off the top of their head, which is always the
 * shorter one, and they never find out what was missing.
 *
 * Blank is here anyway, and deliberately not buried. People reach this dialog
 * already knowing exactly what they want often enough — a second workflow
 * that's a variation on the first, a plan already agreed in a meeting — and
 * being interviewed about a company you founded, to arrive at a canvas that was
 * one press away, is a tax charged to the people who were clearest about what
 * they needed.
 *
 * Two rows rather than two buttons in the footer. A footer of equal-weight
 * buttons reads as a confirmation with a right answer and a wrong one, and it
 * has nowhere to say what either choice actually does — which is the only thing
 * that makes the recommendation more than the order they happen to be in.
 */

export function NewWorkflowDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();

  function startBlank() {
    const workflow = createBlankWorkflow();

    /* Closed before the push, not left for the route change to take with it.
       A client-side navigation to a route this session hasn't loaded yet can
       take a visible moment, and a dialog still sitting there through it looks
       like the press didn't land — the second press would make a second
       workflow, and they'd arrive at the editor with a stray one behind them. */
    onClose();
    router.push(`/workflows/${workflow.id}`);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New workflow"
      description="Craig writes one from a conversation about your company, or you take the canvas and build it yourself."
    >
      <div className="px-5 py-5">
        {/* `List` rows rather than a hand-rolled pair of cards. The row already
            forks between an anchor and a button on whether it was handed an
            href, which is exactly the fork these two options need — one goes to
            a page that exists, the other has to make something before it knows
            where it's going — and the focus ring, the hover and the inset
            divider come with it. Hand-rolled cards would be a second copy of
            all of that, free to drift from the workflow rows on the page
            behind this one. */}
        <List>
          <ListItem
            href="/welcome"
            leading={
              <ListIcon tone="accent">
                <AutoAwesome />
              </ListIcon>
            }
            title={
              <span className="flex items-center gap-2">
                <span className="truncate">Talk to Craig</span>
                {/* In the title, not the `trailing` slot. Trailing stops clicks
                    from reaching the row so that controls parked there don't
                    also trigger it — and on a row that is an anchor, that means
                    a click landing on the badge never reaches Next's handler
                    and the browser navigates the document itself. A full page
                    load, and the account's whole session with it. */}
                <Badge tone="accent" size="sm" className="shrink-0">
                  Recommended
                </Badge>
              </span>
            }
            description="He asks how your company works — what you sell, who does what, who's arriving — and writes the first draft."
            footnote="Best if your onboarding lives in people's heads"
          />

          <ListItem
            onClick={startBlank}
            /* Dashed rather than filled, which is the same tile the empty state
               on this page draws itself in. It says "nothing in here yet"
               without needing a word, and it keeps the one filled accent tile
               in the dialog pointing at the option worth taking. */
            leading={
              <ListIcon tone="muted">
                <Draw />
              </ListIcon>
            }
            title="Start blank"
            description="Straight to the editor with the trigger on the canvas. Every step after it is yours to add."
            footnote="Best if you already know the steps you want"
          />
        </List>
      </div>
    </Dialog>
  );
}
