"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AppShell,
  CraigMark,
  Separator,
  Stepper,
  type Step,
} from "@/components/ui";
import {
  CraigConversation,
  DRAFT_REQUEST,
  readyToDraft,
} from "@/components/showcase/craig-conversation";
import { DraftStrength } from "@/components/showcase/draft-strength";
import type { Session } from "@/lib/showcase/contract";
import { useShowcase } from "@/lib/showcase/store";
import {
  ShowcaseNav,
  ShowcaseNavRail,
} from "@/components/showcase/showcase-nav";
import { useCraigChat } from "@/lib/showcase/use-craig-chat";

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
 */

export function WelcomeScreen({ user }: { user: Session }) {
  const { messages, send, phase, busy, error } = useCraigChat();
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
   * How many workflows existed when this screen opened.
   *
   * Lazy initial state rather than a ref, because it is read while rendering
   * and a ref cannot be. It is captured once and never updated, which is the
   * whole point of it.
   *
   * Without it, coming back here to start a second workflow shows a stepper
   * with every phase already ticked — "Build workflow: complete" — because the
   * account does contain a workflow, just not one from this conversation. The
   * column would be describing your history at you while you tried to make
   * something new. What it should track is this run, so that is what it counts.
   */
  const [before] = React.useState(() => workflows.length);
  const draft =
    workflows.length > before ? workflows[workflows.length - 1] : null;

  /* Not `draft`. That one is this conversation's output; this one asks whether
     the two rooms in the nav have anything in them, and a workflow from last
     week counts for that — coming back to write a second workflow can't shut
     doors you have already walked through. */
  const drafted = workflows.length > 0;

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
    if (draft) router.push(`/showcase/workflows/${draft.id}`);
  }, [draft, router]);

  function generate() {
    setHanding(true);
    send(DRAFT_REQUEST);
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
      navRail={<ShowcaseNavRail disabled={!drafted} />}
      nav={
        /* The nav is always here; on a brand-new account both rows are shut.
           It used to be hidden outright, on the argument that Workflows and
           People are empty until Craig drafts something and offering two dead
           ends is worse than offering nothing. The dead ends are still real —
           a shut row is how they're answered now. Hiding them meant the first
           thing this product showed a new person was a screen with no product
           around it, and then two items arriving from nowhere the moment they
           looked away. Shut, the column says what's here and what earns it,
           and the only thing that changes later is that the rows start
           working. */
        <ShowcaseNav disabled={!drafted}>
          <Stepper steps={steps} compact />
          {/* Retired once there's a workflow. It's an answer to "what is
              about to happen to me", which stops being the question the
              moment something has. */}
          {!drafted && (
            <>
              <Separator />
              <p className="px-1 text-xs leading-relaxed text-text-subtle">
                Craig drafts, you edit. Nothing runs against anyone until you
                publish it and give somebody a seat.
              </p>
            </>
          )}
        </ShowcaseNav>
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
      <div className="mx-auto flex h-[calc(100vh-3rem)] w-full max-w-2xl flex-col pt-10">
        {/* The greeting is the empty state, not a permanent header. A screen
            still introducing itself above turn nine is a screen that hasn't
            noticed the conversation started — and with the composer fixed to
            the bottom, every line it keeps costs the transcript one. */}
        {!started && (
          <header className="flex shrink-0 flex-col gap-2 pb-8">
            <CraigMark className="size-8 text-accent" />
            <h1 className="text-3xl font-semibold tracking-[-0.02em]">
              Hello {firstName} — tell me a little about{" "}
              {company ?? "your company"}.
            </h1>
            <p className="text-md leading-relaxed text-text-muted">
              There&apos;s nothing set up yet and nothing for me to read. What
              you sell, who does what, and who&apos;s arriving — in whatever
              order it comes out.
            </p>
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
          /* Still generating right up until the workflow lands — `busy` goes
             false between his tool call and the last token of his reply, and a
             button that comes back to life for a second in the middle reads as
             a failure you should retry. */
          generating={handing && !draft}
        />
      </div>
    </AppShell>
  );
}
