"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Dialog,
  Field,
  Input,
  List,
  ListIcon,
  ListItem,
} from "@/components/ui";
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

  /* Which half of the dialog is showing. "Start blank" no longer creates
     anything — it asks what the thing is called, and only the button on that
     step makes a workflow.

     The old flow created one on the press and navigated, which meant a
     workflow existed the instant somebody was curious about the option. That
     needed `pending` to hide it from the list, a confirm-on-back to offer to
     throw it away, and a deliberate silence in the activity feed so the
     history would not record a thing nobody made. All three were compensation
     for creating too early, and the file said so: "the workflow shouldn't
     exist until there is something in it". Asking for a name is the smallest
     honest thing to put in it. */
  const [naming, setNaming] = React.useState(false);
  const [name, setName] = React.useState("");

  /* Reset on close, so reopening starts clean rather than on the name step
     with last time's half-typed answer still in the box.

     Adjusted during render rather than in an effect: an effect renders the
     stale state once before correcting it, so reopening would flash the name
     step for a frame. `lastOpen` is an identity check on the boolean, which is
     all that is needed to notice the transition. */
  const [lastOpen, setLastOpen] = React.useState(open);
  if (lastOpen !== open) {
    setLastOpen(open);
    if (!open) {
      setNaming(false);
      setName("");
    }
  }

  function create() {
    const trimmed = name.trim();
    if (!trimmed) return;

    const workflow = createBlankWorkflow(trimmed);

    /* Closed before the push, not left for the route change to take with it.
       A client-side navigation to a route this session hasn't loaded yet can
       take a visible moment, and a dialog still sitting there through it looks
       like the press didn't land — the second press would make a second
       workflow, and they'd arrive at the editor with a stray one behind them. */
    onClose();
    router.push(`/workflows/${workflow.id}`);
  }

  if (naming) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title="Name your workflow"
        description="What is this onboarding for? You can change it later."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            {/* Back to the two options rather than closing outright. Somebody
                who opens this and realises they wanted Craig after all should
                not have to find the button again. */}
            <Button variant="secondary" onClick={() => setNaming(false)}>
              Cancel
            </Button>
            <Button onClick={create} disabled={!name.trim()}>
              Create workflow
            </Button>
          </div>
        }
      >
        <div className="px-5 py-5">
          <Field label="Workflow name">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Engineering onboarding"
              /* Enter creates, because a one-field dialog where the keyboard
                 does nothing is a dialog people press the button on twice. */
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  create();
                }
              }}
            />
          </Field>
        </div>
      </Dialog>
    );
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
            onClick={() => setNaming(true)}
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
