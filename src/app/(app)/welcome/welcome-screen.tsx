"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AppShell,
  BackLink,
  Button,
  CraigMark,
  Dialog,
  NavRail,
  NavRailItem,
  Separator,
  Stepper,
  type Step,
} from "@/components/ui";
import { ArrowBack } from "@/components/ui/icons";
import {
  CraigConversation,
  DRAFT_REQUEST,
  readyToDraft,
} from "@/components/showcase/craig-conversation";
import { DraftStrength } from "@/components/showcase/draft-strength";
import type { Session } from "@/lib/showcase/contract";
import { useShowcase } from "@/lib/showcase/store";
import { useCraigChat } from "@/lib/showcase/use-craig-chat";
import { useCraigThread } from "@/lib/showcase/use-craig-thread";

/**
 * Discovery, with a model behind it.
 *
 * The layout is v3's setup screen and the argument for it hasn't changed: this
 * is not a wizard, because a wizard can only ever learn what somebody thought
 * to put a field in for, and the thing that makes a small company's onboarding
 * hard is never a thing a form has a field for.
 *
 * What has changed is that the columns either side both track the same
 * conversation and neither repeats it. The left one says where you are in the
 * three phases. The right one says how good a workflow he could write from what
 * he has, which is the only argument on the screen for answering one more
 * question — and it appears the moment there's a conversation to measure, not
 * when it happens to have found something.
 *
 * Nothing about the person or their company is hardcoded here. Anybody can sign
 * up with any email, so the name in the greeting and the account in the corner
 * come from the session the server already verified.
 *
 * **This is a session, not a room.** The left column used to carry Home,
 * Workflows and People — hidden on a first run, back once there was something
 * in them — and that was the wrong shape for what happens here. Drafting a
 * workflow is one sitting with a beginning and an end, and a column offering
 * three other places to be invites you out of it half-answered; the builder and
 * Settings both made this argument first and both landed on the same column,
 * which is the way out and nothing else. So the nav here is a single back
 * control at either width, and the stepper under it.
 */

/**
 * Where back goes, and why it isn't Home.
 *
 * Home forwards an account with no workflows straight here — see the redirect
 * in `(app)/page.tsx` — and an account with no workflows is precisely the one
 * most likely to be pressing this. A back arrow pointing at `/` would bounce
 * off that redirect and land on the screen it was cancelling out of, which
 * reads as a control that doesn't work.
 *
 * Workflows is the room this session was trying to fill. It renders honestly
 * when it's empty, it carries the New workflow button that starts this again,
 * and it is where both routes into this screen begin — the dialog behind that
 * button, and the editor's "no such workflow" state.
 */
const BACK = "/workflows";

export function WelcomeScreen({
  user,
  from,
}: {
  user: Session;
  /** The Home conversation Craig offered this from, if that is how they got
      here. Recorded on the thread; nothing is copied out of it. */
  from?: string;
}) {
  /* The account's onboarding conversation, which is one per account and lives
     until it graduates. Opening it here rather than letting the discovery
     transcript sit in module state is what makes it survive a reload — and it
     is the same row the first workflow inherits, so the conversation that
     produced a draft is the one waiting beside it in the editor. */
  useCraigThread("onboarding", undefined, from);
  const { messages, send, phase, busy, error, drafted } = useCraigChat();
  const { gaps, facts, workflows } = useShowcase();

  const firstName = user.name.split(" ")[0];
  /* Sign-up asked for it, so use it. "Tell me a little about your company" to
     somebody who typed the company's name into the form two screens ago reads
     as a product that wasn't listening. Falls back for a session minted before
     the field existed, which can't be edited after the fact. */
  const company = user.company?.trim();

  const started = messages.length > 0;
  const ready = !busy && readyToDraft(messages);

  /**
   * The workflow *this sitting* produced, or null.
   *
   * Taken from the chat stream — Craig's draft tool reports the id it made —
   * rather than inferred from the account's workflow count growing past what it
   * was at mount, which is how this used to work and was wrong in a way that
   * only showed up on a returning account.
   *
   * The count cannot tell the two apart. Workflows arrive from the server a
   * moment after the screen opens (`hydrate`), so "the list got longer" is true
   * of somebody who just drafted one *and* of somebody who has three already
   * and has said nothing yet. The second case threw them straight into the
   * editor of an old workflow the instant the sync landed — on the screen they
   * had opened to build a new one.
   *
   * Reading it off the event that actually happened has no such ambiguity, and
   * it stays correct however many workflows the account gains from elsewhere
   * while this screen is open.
   */
  const draft = drafted ? (workflows.find((w) => w.id === drafted) ?? null) : null;

  /**
   * Whether this is somebody's first run, or a return trip to make another.
   *
   * Not `draft`. That one is this conversation's output; this asks whether the
   * account has ever produced a workflow at all, and one from last week counts
   * for that.
   *
   * Two things hang off it, and both are about a first run being a different
   * screen rather than the same screen with less on it: the line under the
   * stepper introduces the product, which somebody on their second workflow
   * has already had; and the way out only exists once there is somewhere to go
   * back to. See the nav below.
   *
   * A blank somebody started and abandoned does not count. It is not synced and
   * will not survive the next load — see `pending` in `store.ts` — so treating
   * it as history would offer a back link to a list that is about to be empty.
   */
  const returning = workflows.some((w) => !w.pending);

  /**
   * A workflow appearing is the end of this screen.
   *
   * The hand-off used to take two presses on two cards: ask him to draft, wait,
   * then find the card again and open it. One intention split in half, with the
   * interesting part — the canvas assembling itself — happening somewhere
   * nobody was yet.
   *
   * Deliberately not gated on having pressed Generate, which is what this tried
   * first. He owns his own tool and he fires it unprompted more often than not:
   * three answers in, he'd draft, and a run nobody had pressed a button for
   * fell back to exactly the two-step this replaced. The button is one way to
   * reach the draft, not the only one, so the navigation follows the workflow
   * rather than the press.
   *
   * Nothing is lost by moving. The conversation is held in the store and the
   * editor's panel is the same thread continued, so his closing question is
   * still on screen when the canvas opens.
   */
  const router = useRouter();
  const [handing, setHanding] = React.useState(false);

  React.useEffect(() => {
    if (draft) router.push(`/workflows/${draft.id}`);
  }, [draft, router]);

  function generate() {
    setHanding(true);
    send(DRAFT_REQUEST);
  }

  /**
   * Leaving before there's anything to leave with.
   *
   * The back control is the only way out of this screen now, which is what
   * makes it worth interrupting. Everywhere else this product states what will
   * happen rather than asking — the note under the invite dialog is the house
   * style, and the two delete confirmations earn their exception by being the
   * only actions with nothing to undo them. This one earns it differently: a
   * conversation that has answered four questions and not yet been drafted from
   * looks, from the outside, exactly like one that is finished, and the press
   * that ends it is the same arrow you'd use to step out of any other page.
   *
   * Gated on `draft` — this run's workflow — rather than on `returning`, which
   * is true of an account that made one last week and says nothing about
   * whether this sitting produced anything. Once it has, there is nothing to
   * warn about and back is just back.
   *
   * In practice that branch is nearly unreachable, because the effect above
   * hands off to the editor the moment a draft lands. It is written this way
   * anyway: the rule is "ask while there's nothing to show for it", and hanging
   * that off the hand-off happening to be automatic would quietly become wrong
   * the day it isn't.
   */
  const [confirming, setConfirming] = React.useState(false);

  function leave() {
    router.push(BACK);
  }

  /* The rail's version, which is a button and has no navigation to cancel. */
  function pressBack() {
    if (draft) leave();
    else setConfirming(true);
  }

  const steps: Step[] = [
    /* Not "Upload". v3's first phase was reading the documents somebody had
       already written, and a brand-new account has none — a step that can never
       complete is a step that lies about what's expected of you. What actually
       happens first is that they hand over what they've got, which is usually a
       sentence rather than a PDF. */
    {
      id: "tell",
      title: "What you've got",
      state: started ? "complete" : "current",
    },
    {
      id: "discovery",
      title: "Discovery",
      state: !started ? "upcoming" : draft ? "complete" : "current",
    },
    {
      id: "build",
      title: "Build workflow",
      state: draft ? "complete" : ready ? "current" : "upcoming",
    },
  ];

  return (
    <AppShell
      /* No role. `Session` doesn't carry one and "Founder" would be a guess
         about somebody who has told us their name and nothing else. */
      account={{ name: user.name, email: user.email }}
      fill
      /* Collapsed, the column keeps the one thing it has: the way out. Same
         shape the builder and Settings collapse to, and for the same reason —
         a rail is 52px and a stepper doesn't survive being squeezed into it,
         but a back arrow is exactly that wide. */
      navRail={
        /* Nothing at all on a first run — see the note beside the panel. */
        returning ? (
          <NavRail>
            <NavRailItem label="Back" icon={<ArrowBack />} onClick={pressBack} />
          </NavRail>
        ) : undefined
      }
      nav={
        /* No Home, Workflows and People — see the note on the screen itself. */
        <div className="flex flex-col gap-5">
          {/* **The first run has no way out, deliberately.**
           *
           * A back control needs somewhere to go back *to*, and on somebody's
           * very first run there is nowhere: the account has no workflows, and
           * Home forwards an account with none straight back here. An arrow
           * pointing at that is a door onto the room you are standing in.
           *
           * It is also the wrong offer. This screen *is* the one thing a new
           * account is meant to do, and putting an exit beside it spends the
           * first attention anybody gives this product on a way to not use it.
           *
           * Coming back to write a *second* workflow is a different situation
           * with a real answer — there is a list to return to — so that one
           * gets the arrow, and the confirmation below.
           *
           * Keyed on `returning` (the account has a workflow) rather than on
           * `draft` (this sitting produced one). They are genuinely different
           * questions and the file already keeps them apart. */}
          {returning && (
            <>
              <BackLink
                href={BACK}
                /* Cancels the navigation rather than replacing the link. See
                   the note on `BackLink` — a cmd-click opening Workflows in a
                   new tab isn't leaving this one, so it shouldn't be asked
                   about. */
                onNavigate={(e) => {
                  if (draft) return;
                  e.preventDefault();
                  setConfirming(true);
                }}
                className="px-2"
              >
                Back
              </BackLink>

              <Separator />
            </>
          )}

          <Stepper steps={steps} compact />
          {/* Retired once there's a workflow. It's an answer to "what is
              about to happen to me", which stops being the question the
              moment something has. */}
          {!returning && (
            <>
              <Separator />
              <p className="px-1 text-xs leading-relaxed text-text-subtle">
                Craig drafts, you edit. Nothing runs against anyone until you
                publish it and give somebody a seat.
              </p>
            </>
          )}
        </div>
      }
      /* Held back until there's a conversation. At zero answers the meter is
         honest but it's addressed to nobody — a checklist of things you haven't
         said yet, on a screen you have not yet said anything on, is a chore
         list rather than progress. One message in, the same column is the
         reason to keep going. */
      asideTitle={started ? "How much he has" : undefined}
      aside={
        started ? (
          <DraftStrength facts={facts} gaps={gaps} busy={busy} onAsk={send} />
        ) : undefined
      }
    >
      {/* `flex-1 min-h-0` rather than a hardcoded `100vh - 3rem`. The header's
          height was written out here in a second place, so the column was right
          only for as long as nobody changed it — and under `fill` the shell now
          hands down a row that is already exactly that tall. */}
      {/* `pt-10` here and a spacer inside the transcript, which sounds like the
          same thing said twice and is not. This screen has a standing greeting
          above the conversation — it never scrolls, so the space above it is
          just space and padding is the honest way to ask for it. The
          transcript's own clearance has to be an element instead, because
          padding on a scroller cannot be scrolled into and would leave a long
          conversation permanently unable to reach the top of its own box. */}
      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col pt-10">
        {/* The greeting is the empty state, not a permanent header. A screen
            still introducing itself above turn nine is a screen that hasn't
            noticed the conversation started — and with the composer fixed to
            the bottom, every line it keeps costs the transcript one. */}
        {/* **Two different openings, because they are two different
            questions.**

            A first run has to start with the company: Craig knows nothing, has
            nothing to read, and cannot write a step of onboarding until he
            understands how the place works. So he asks about it, and the
            paragraph says plainly that there is nothing here yet.

            Somebody coming back to make a second workflow has already answered
            all of that. Asking them to describe their company again would be
            the product forgetting a conversation it still has on file — and it
            is the wrong question anyway: they did not arrive wondering what
            Craig knows, they arrived with a specific thing they want built. So
            the heading asks for that instead, and the line under it says what
            he is bringing to it rather than what he is missing. */}
        {!started && (
          <header className="flex shrink-0 flex-col gap-2 pb-8">
            <CraigMark className="size-8 text-accent" />
            {returning ? (
              <>
                <h1 className="text-3xl font-semibold tracking-[-0.02em]">
                  What workflow do you want to make?
                </h1>
                <p className="text-md leading-relaxed text-text-muted">
                  I still know what you told me about{" "}
                  {company ?? "your company"}, so start with who this one is
                  for and what has to happen before their first day.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-3xl font-semibold tracking-[-0.02em]">
                  Hello {firstName} — tell me a little about{" "}
                  {company ?? "your company"}.
                </h1>
                <p className="text-md leading-relaxed text-text-muted">
                  There&apos;s nothing set up yet and nothing for me to read.
                  What you sell, who does what, and who&apos;s arriving — in
                  whatever order it comes out.
                </p>
              </>
            )}
          </header>
        )}

        <CraigConversation
          messages={messages}
          phase={phase}
          busy={busy}
          error={error}
          draft={draft}
          onSend={send}
          onGenerate={generate}
          /* Matched to the heading above it, for the same reason. The default
             invites somebody to describe their company from scratch, which is
             the right opening once and a strange thing to be asked on your
             third workflow. Only the empty-composer wording differs — once
             there is a conversation, "tell him the next bit" is true either
             way. */
          placeholder={
            returning
              ? "who's this one for — and what has to happen before day one?"
              : undefined
          }
          /* Still generating right up until the workflow lands — `busy` goes
             false between his tool call and the last token of his reply, and a
             button that comes back to life for a second in the middle reads as
             a failure you should retry. */
          generating={handing && !draft}
        />
      </div>

      {/* Inside the shell rather than beside it, which is where the workflow
          list keeps its own dialogs. It portals to the body either way, so
          this is only about where the state that opens it lives. */}
      <ConfirmLeave
        open={confirming}
        onStay={() => setConfirming(false)}
        onLeave={leave}
      />
    </AppShell>
  );
}

/**
 * The one thing this screen asks whether you're sure about.
 *
 * Not a general "you have unsaved changes", which is the shape this wants to
 * be and the shape that says nothing. The useful content is narrower: he has
 * been asking questions and has not yet turned the answers into anything, and
 * that is the state somebody can't see from the outside — a conversation four
 * questions in looks exactly like a conversation that finished.
 *
 * It deliberately makes no promise about the transcript. Whether the
 * conversation is still here when you come back depends on where the thread
 * lives, which is moving underneath this screen, and a dialog that told
 * somebody their answers were safe would be the worst possible line to be
 * wrong about. What it says instead is the half that is structural: a workflow
 * exists only when Craig's draft arrives over the stream — `addWorkflow` has
 * exactly one caller — so leaving here cannot add a row to Workflows, and
 * there is nothing to go and tidy up afterwards.
 *
 * The buttons are the two moves rather than Yes and No. "Yes" to what is a
 * question the reader has to answer by re-reading the title, and this product
 * labels its confirmations with the thing that happens — the delete dialogs say
 * "Delete workflow", not "OK".
 */
function ConfirmLeave({
  open,
  onStay,
  onLeave,
}: {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <Dialog
      open={open}
      /* Escape and the backdrop both mean stay, which is the safe half of this
         choice and the one somebody who dismissed it by reflex wanted. */
      onClose={onStay}
      /* Not `sm`. There are two sentences here and 24rem sets them as six
         lines of ragged text. */
      size="md"
      title="Craig hasn't built your workflow yet"
      description="Leaving now cancels this one."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onStay}>
            Keep talking
          </Button>
          <Button size="sm" onClick={onLeave}>
            Leave anyway
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 px-5 py-5">
        <p className="text-base leading-relaxed text-text-muted">
          He&apos;s part-way through working out how the company runs — enough
          to have started, not enough to have written any of it down as a
          workflow.
        </p>
        <p className="text-sm leading-relaxed text-text-subtle">
          So there&apos;s nothing to leave behind. A workflow only exists once
          he drafts one, and no empty draft goes into your list for you to find
          and delete later.
        </p>
      </div>
    </Dialog>
  );
}
