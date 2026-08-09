"use client";

import * as React from "react";
import Link from "next/link";
import {
  AgentPhase,
  AgentQuestion,
  Button,
  CraigMark,
  MessageBody,
  PersonTurn,
  PromptBar,
  buttonVariants,
} from "@/components/ui";
import { ArrowForward, AutoAwesome, Description } from "@/components/ui/icons";
import { DRAFT_REQUEST } from "@/lib/craig/contract";
import type { CraigMessage, ShowcaseWorkflow } from "@/lib/craig/store";
import { CraigFault } from "./craig-fault";
import { SourceChips, type Source } from "./source-chips";

/**
 * The conversation, with a real model in the middle.
 *
 * The demos this is descended from were richer than they had any right to be,
 * because everything Craig said was known in advance. Quick replies could be
 * three phrasings of the answer the script needed next; the hand-off card knew
 * how many steps the workflow had before it existed. None of that survives
 * contact with a model, and the honest question this component answers is
 * which of those interactions were about *driving a script* and which were
 * about *talking to an agent*. The second kind all survive. The first kind are
 * rebuilt on something true or they're gone.
 *
 * The transcript scrolls and the composer doesn't. Everything conditional —
 * the failure notice, the hand-off, the quick replies — stacks between the two,
 * so the things you might act on are always in the same place and none of them
 * can scroll away mid-thought.
 */

/* He's answered enough times to have something to draft from. A count is a
   blunt instrument, but the alternatives are worse: asking the model whether
   it's ready costs a turn and it'll say yes, and watching for him to offer in
   prose means parsing his phrasing, which changes every time the prompt is
   edited. This only gates when an *offer* appears — the button underneath it
   asks him, and he's free to say he needs more first. */
const ENOUGH_ANSWERS = 3;

/**
 * The message the hand-off button sends.
 *
 * Re-exported rather than defined here now that the chat route reads it too —
 * it decides from that sentence whether Craig may draft at all. Kept exported
 * from this file so the screens that already import it are unchanged.
 */
export { DRAFT_REQUEST };

export function readyToDraft(messages: CraigMessage[]): boolean {
  return (
    messages.filter(
      (m) => m.role === "assistant" && !m.streaming && m.content.trim() !== "",
    ).length >= ENOUGH_ANSWERS
  );
}

/*
 * There are no opening suggestions, and that's a change rather than an
 * omission. An earlier version offered three, written from a fixture company
 * whose pitch and headcount were known constants. Anybody can sign up now, so
 * the only honest content for that first message is a description of a company
 * this screen has never heard of — and a chip that guesses it is the product
 * putting a claim about somebody's business in their mouth before Craig has
 * asked a single question.
 *
 * Nothing is lost from the second turn on. The quick replies below are moves
 * rather than claims, so they survive not knowing anything, and the right-hand
 * column carries the "here's what's worth telling him" job for the whole
 * conversation instead of only its first line.
 */

export function CraigConversation({
  messages,
  phase,
  busy,
  error,
  draft,
  onSend,
  onGenerate,
  generating = false,
  offerDraft = true,
  placeholder,
  header,
  offer = null,
  newWorkflowHref = "/welcome",
}: {
  messages: CraigMessage[];
  phase: string | null;
  busy: boolean;
  error: string | null;
  /** The workflow Craig has drafted, once he has. Null until then. */
  draft: ShowcaseWorkflow | null;
  onSend: (text: string, attachments?: string[]) => void;
  /**
   * Pressing Generate. Given by the screen rather than done here, because what
   * follows the draft landing is a navigation, and a transcript should not be
   * the thing that decides where you end up.
   */
  onGenerate?: () => void;
  /** Generate has been pressed and the workflow hasn't arrived yet. */
  generating?: boolean;
  /**
   * Whether a long enough conversation should offer to build a workflow.
   *
   * True on the screen whose whole purpose is producing one. False on Home,
   * where the same three-answer heuristic would interrupt somebody asking after
   * a new starter with an offer to build something they never mentioned.
   */
  offerDraft?: boolean;
  /** Overrides the opening prompt. The default is written for a first run. */
  placeholder?: string;
  /**
   * Above the transcript and inside the scroller.
   *
   * Inside, because a header on a conversation is read once — Home's greeting
   * answers "what should I do", which is the question somebody has before they
   * have asked one. Held outside the scroller it would be a permanent band that
   * every later message passes behind.
   */
  header?: React.ReactNode;
  /**
   * A door Craig offered to somewhere he cannot go himself.
   *
   * Home has no drafting tool on purpose, so when what somebody describes needs
   * a workflow that does not exist, what he can produce is a control rather
   * than a canvas. See `offer_new_workflow` in `craig-agent.ts`.
   */
  offer?: "new-workflow" | null;
  /** Where that door leads, carrying whatever handover the screen wants. */
  newWorkflowHref?: string;
}) {
  const [text, setText] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  /* `PromptBar` owns its own file list and has no way to be told to drop it,
     so a send that carried attachments remounts it. Cheap, and it re-focuses
     the box on the way, which is where the cursor wants to be next. */
  const [composerRound, setComposerRound] = React.useState(0);
  /* Attachment names, against the index of the turn they were sent with.
     `ChatTurn` has nowhere to put them — the route only needs the names, and
     widening the contract so the transcript could draw a chip would be the
     screen's problem leaking into the wire. */
  const [sentWith, setSentWith] = React.useState<Record<number, string[]>>({});

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const pinnedRef = React.useRef(true);
  const composerRef = React.useRef<HTMLTextAreaElement | null>(null);

  /* Follows the answer down, but only for a reader who was already at the
     bottom. Yanking somebody back while they're re-reading an earlier turn is
     worse than letting new text arrive off-screen. */
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, phase]);

  const started = messages.length > 0;
  const last = messages[messages.length - 1];
  const settled = !busy && last?.role === "assistant" ? last.content : null;
  const question = settled ? splitQuestion(settled).question : null;

  const replies = React.useMemo(
    /* A failed turn leaves whatever arrived before it broke. Offering replies
       to half a question is offering to answer something he didn't finish
       asking. */
    () => (error ? [] : suggestReplies(question)),
    [error, question],
  );

  const send = React.useCallback(
    (body: string, names?: string[]) => {
      pinnedRef.current = true;
      onSend(body, names?.length ? names : undefined);
    },
    [onSend],
  );

  function submit(body: string) {
    const names = files.map((f) => f.name);
    if (names.length > 0) {
      setSentWith((prev) => ({ ...prev, [messages.length]: names }));
      setFiles([]);
      setComposerRound((n) => n + 1);
    }
    send(body, names);
  }

  const pick = React.useCallback(
    (reply: string) => {
      /* Sent as-is, and the box keeps whatever was half-typed in it. Somebody
         who picked an option chose those words; somebody who was mid-sentence
         when they picked it did not choose to lose the sentence. */
      send(reply);
    },
    [send],
  );

  /* Number keys, continuing into the composer's own number. Deliberately not
     while a text field has focus — at that point the digit is a digit, and
     "3 of us" is a sentence somebody is entitled to start typing. */
  React.useEffect(() => {
    if (replies.length === 0) return;

    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLInputElement ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      ) {
        return;
      }

      const n = Number(e.key);
      if (n >= 1 && n <= replies.length) {
        e.preventDefault();
        pick(replies[n - 1]);
      } else if (n === replies.length + 1) {
        e.preventDefault();
        composerRef.current?.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [replies, pick]);

  const offerHandoff =
    offerDraft && (Boolean(draft) || (!busy && !error && readyToDraft(messages)));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (!el) return;
          pinnedRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto pb-8"
      >
        {/* Clearance under the header, as an element rather than as padding on
            the scroller or the column around it.

            Padding on the *column* is the worst of the three: it is outside the
            scrollable area, so it is a permanent band that every message passes
            behind on its way up and never occupies. Padding on the scroller
            scrolls away correctly but cannot be scrolled *into* — the content
            can never reach the top of the box, which is what makes a long
            transcript feel like it is stuck an inch below the rule.

            A spacer is content. It holds the first line clear on arrival and
            then scrolls fully out of the way like anything else, so the top of
            the conversation really is the top. */}
        <div aria-hidden className="h-10 shrink-0" />

        {header}

        {messages.map((m, i) => {
          if (m.role === "user") {
            return (
              <PersonSaid key={m.id} text={m.content} files={sentWith[i]} />
            );
          }
          /* A turn that failed before a word arrived is dropped rather than
             drawn. The mark with nothing under it reads as Craig having said
             nothing, which is a different and much worse claim than the
             failure notice above the composer, which says what happened. */
          if (!m.streaming && m.content.trim() === "") return null;

          return (
            <CraigSaid
              key={m.id}
              text={m.content}
              streaming={m.streaming}
              phase={m.streaming ? phase : null}
              sources={m.sources}
            />
          );
        })}
      </div>

      <div className="flex shrink-0 flex-col gap-3 pb-6">
        <CraigFault error={error} />

        {offer === "new-workflow" && <NewWorkflowDoor href={newWorkflowHref} />}

        {offerHandoff && (
          <Handoff
            draft={draft}
            generating={generating}
            onAsk={onGenerate ?? (() => send(DRAFT_REQUEST))}
          />
        )}

        {replies.length > 0 && <ReplyOptions replies={replies} onPick={pick} />}

        <PromptBar
          key={composerRound}
          autoFocus
          value={text}
          onValueChange={setText}
          inputRef={composerRef}
          numberHint={replies.length > 0 ? replies.length + 1 : undefined}
          placeholder={
            placeholder ??
            (started
              ? "Tell him the next bit…"
              : "start anywhere — what you sell, who does what, who's arriving…")
          }
          onSubmit={submit}
          onAttach={setFiles}
          /* Both off because neither is wired. The route is fixed to one
             model, so a picker offering three would be claiming a data
             boundary this screen can't enforce; and there's no speech to text
             behind the microphone. */
          modelPicker={false}
          dictation={false}
          busy={busy}
          footnote={footnote(files.length > 0, started)}
        />
      </div>
    </div>
  );
}


/**
 * The door out of a conversation that cannot build a workflow.
 *
 * Shaped like `Handoff` below and placed in the same slot, because it is the
 * same move at a different moment: a conversation has reached the point where
 * the next thing is a different screen, and the person should arrive there by
 * pressing one thing rather than by being told where to navigate.
 *
 * A link rather than a button, so it behaves like the navigation it is —
 * middle-click, open in a new tab, and the status bar all work, none of which
 * is true of an `onClick` that calls `router.push`.
 *
 * It carries no description of the workflow. Craig has already said one line
 * about why in the reply above it, and repeating that here would be the screen
 * arguing the case a second time — worse, it would be the product claiming to
 * know what the workflow is before the conversation that decides has happened.
 */
function NewWorkflowDoor({ href }: { href: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-accent bg-accent-subtle/30 p-4">
      <div className="flex flex-col gap-1">
        <p className="text-base font-medium">Start a workflow for this</p>
        <p className="text-sm leading-relaxed text-text-muted">
          We&apos;ll pick up where this left off, on the screen where Craig can
          actually build it. Nothing is created until he drafts something.
        </p>
      </div>
      <Link
        href={href}
        className={buttonVariants({ size: "sm", className: "w-fit" })}
      >
        Build it
        <ArrowForward />
      </Link>
    </div>
  );
}

/* No stop control anywhere on this screen. The hook can abort a turn — it does
   it itself when a second message arrives — but it doesn't expose that, and a
   square button that leaves the text arriving is the worst kind of control. */
function footnote(attaching: boolean, started: boolean) {
  if (attaching) {
    return "Craig is told the filename and nothing else. There's no upload behind this yet, so he'll ask what's in it.";
  }
  /* Not "nothing is created until you ask him to draft it", which is what this
     said and is not true — he owns the drafting tool and fires it himself once
     he has enough, usually without being asked. A promise the product breaks on
     turn three is worse than no promise, and what's actually reassuring is the
     bit that stayed true: a draft is a draft until you publish it. */
  return started
    ? "Craig can make mistakes. Nothing runs against anyone until you publish it."
    : "Craig only knows what you tell him. There's nothing here for him to look up.";
}

/* --- Turns ----------------------------------------------------------------- */

function PersonSaid({ text, files }: { text: string; files?: string[] }) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      {files?.map((name) => (
        <span
          key={name}
          className="flex max-w-full items-center gap-1.5 rounded-md border border-border bg-surface-sunken py-1 pl-1.5 pr-2 text-xs text-text-muted"
        >
          <Description className="size-3.5 shrink-0 text-text-subtle" />
          <span className="truncate">{name}</span>
        </span>
      ))}
      <PersonTurn>{text}</PersonTurn>
    </div>
  );
}

function CraigSaid({
  text,
  streaming,
  phase,
  sources,
}: {
  text: string;
  streaming?: boolean;
  phase: string | null;
  sources?: Source[];
}) {
  /* Only once he's finished. The question is the last thing to arrive, so
     lifting it out mid-stream would pull the sentence you were reading up into
     a box halfway through writing itself. */
  const { body, question } = streaming
    ? { body: text, question: null }
    : splitQuestion(text);

  /* An empty turn with no phase yet is a mark on its own, which reads as
     Craig having said nothing. "Thinking" is the least he is doing. */
  const label = streaming ? (phase ?? (text ? null : "Thinking")) : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <CraigMark className="size-5 shrink-0 text-accent" />
        <AgentPhase label={label} />
      </div>

      {body.trim() !== "" && (
        <MessageBody content={body} streaming={streaming} />
      )}

      {/* Under the prose and above the question, because they belong to what
          he just said rather than to what he's about to ask. */}
      <SourceChips sources={sources} />

      {question && <AgentQuestion className="mt-1">{question}</AgentQuestion>}
    </div>
  );
}

/* --- Quick replies --------------------------------------------------------- */

/**
 * Replies to a question nobody has read yet.
 *
 * In the demos these were three phrasings of one answer, which worked because
 * the script knew what Craig had just asked. With a real model they can't be
 * answers at all: only the person knows how many people work there, and a chip
 * that guesses it would be the product putting a claim about their company in
 * their mouth and then building a workflow on it.
 *
 * So they stop being answers and become *moves* — the things that are true
 * replies to any question he could have asked. "I don't know" is the most
 * valuable of them by a distance, because finding what nobody has written down
 * is the entire job, and somebody who can say it in one click says it far more
 * often than somebody who has to type an admission.
 *
 * The one exception is generated, not fixed: when he's asked exactly one
 * question and it opens with an auxiliary verb, it's a yes/no, and yes and no
 * are genuinely the answers. Two questions and the guard drops it — "yes" to
 * "is that the only account, and who else can create them?" is an answer to
 * neither, and he'd record it as though it were one.
 */
const POLAR =
  /^(is|are|was|were|do|does|did|has|have|had|can|could|will|would|should|am)\b/i;

const DONT_KNOW = "I don't know — nobody's ever written it down.";

export function suggestReplies(question: string | null): string[] {
  if (!question) return [];

  const asked = (question.match(/\?/g) ?? []).length;
  if (asked === 1 && POLAR.test(question)) {
    return ["Yes, that's right.", "No, not quite.", DONT_KNOW];
  }
  return [DONT_KNOW, "Leave that open and ask me something else."];
}

function ReplyOptions({
  replies,
  onPick,
}: {
  replies: string[];
  onPick: (reply: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {replies.map((reply, i) => (
        <button
          key={reply}
          type="button"
          onClick={() => onPick(reply)}
          className="group flex w-full items-start gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-accent hover:bg-surface-hover"
        >
          <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded bg-surface-sunken text-2xs font-semibold tabular-nums text-text-subtle transition-colors group-hover:bg-accent group-hover:text-accent-fg">
            {i + 1}
          </span>
          <span className="text-sm leading-relaxed text-text-muted transition-colors group-hover:text-text">
            {reply}
          </span>
        </button>
      ))}
    </div>
  );
}

/* --- The hand-off ---------------------------------------------------------- */

/**
 * The end of the conversation, and a decision rather than an outcome.
 *
 * The demo version of this card counted the steps in a workflow that had been
 * written by hand months earlier. This one can't, and shouldn't pretend to:
 * before he's drafted anything the button doesn't build a workflow, it asks him
 * to, which is a real message he can push back on if he still needs more. He
 * has a `draft_workflow` tool and he decides when it fires.
 *
 * One button, and it says Generate. It used to take two — draft it here, then
 * find a second card and press Open it — which split one intention across two
 * screens and left the workflow being assembled somewhere you weren't looking.
 * Pressing this now carries you into the editor and the canvas builds in front
 * of you, which is the part worth watching and was the part nobody saw.
 *
 * The drafted state below is the few seconds between his tool firing and the
 * route changing, plus the fallback for a navigation that never happened. It
 * points at the editor rather than claiming to be finished.
 */
function Handoff({
  draft,
  generating,
  onAsk,
}: {
  draft: ShowcaseWorkflow | null;
  generating: boolean;
  onAsk: () => void;
}) {
  if (draft) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-accent bg-accent-subtle/30 p-4">
        <div className="flex flex-col gap-1">
          <p className="text-base font-medium">Built — {draft.name}</p>
          <p className="text-sm leading-relaxed text-text-muted">
            Opening it now, with anything he had to leave open marked on the
            step it belongs to.
          </p>
        </div>
        <Link
          href={`/workflows/${draft.id}`}
          className={buttonVariants({ size: "sm", className: "w-fit" })}
        >
          Open it
          <ArrowForward />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-accent bg-accent-subtle/30 p-4">
      <div className="flex flex-col gap-1">
        <p className="text-base font-medium">Enough to build from</p>
        <p className="text-sm leading-relaxed text-text-muted">
          He&apos;ll choose the steps from what you&apos;ve told him and say
          what he had to leave open. You&apos;ll land in the editor and watch it
          come together.
        </p>
      </div>
      {/* `loading` rather than a disabled button with the same label. The wait
          is a model call and it is long enough to doubt — several seconds of a
          button that looks pressable and does nothing is how somebody presses
          it twice and asks him to draft two. */}
      <Button
        size="sm"
        className="w-fit"
        onClick={onAsk}
        loading={generating}
        disabled={generating}
      >
        {!generating && <AutoAwesome />}
        {generating ? "Generating" : "Generate workflow"}
      </Button>
    </div>
  );
}

/* --- Prose ----------------------------------------------------------------- */

/**
 * Lifts Craig's closing question out of his prose.
 *
 * He's told to ask one or two concrete questions, at the end, after the
 * bullets. In the demos that was a separate field on the fixture; here it's a
 * shape in his output, and the shape is reliable enough to read back because
 * it's the thing the prompt states first and hardest.
 *
 * The guards are what make it safe rather than clever. It has to be the last
 * paragraph, it has to be one line, it has to be short, and it has to end in a
 * question mark — anything else and his prose is left exactly as he wrote it,
 * which is the correct failure.
 */
function splitQuestion(text: string): {
  body: string;
  question: string | null;
} {
  const paragraphs = text.trimEnd().split(/\n{2,}/);
  if (paragraphs.length < 2) return { body: text, question: null };

  const tail = paragraphs[paragraphs.length - 1].trim();
  const liftable =
    tail.endsWith("?") &&
    !tail.startsWith("- ") &&
    !tail.includes("\n") &&
    tail.length <= 240;

  if (!liftable) return { body: text, question: null };
  return { body: paragraphs.slice(0, -1).join("\n\n"), question: tail };
}
