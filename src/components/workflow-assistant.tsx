"use client";

import * as React from "react";
import {
  Button,
  CraigMark,
  PromptBar,
  type WorkflowBlock,
} from "@/components/ui";
import {
  ALL_PRESETS,
  blockFromPreset,
  findPreset,
} from "@/lib/workflow/library";
import { NEW_HIRE, PEOPLE } from "@/lib/demo";
import { cn } from "@/lib/cn";

/**
 * Craig, inside the builder.
 *
 * The canvas is a good editor and a bad conversation. Filling in a Slack
 * workspace URL means selecting the block, finding the field and typing —
 * three deliberate acts for something Ada could say in four words. So this
 * takes what she says, works out which step it belongs to, and makes the
 * change. She never has to know that "katalis.slack.com" is the `workspace`
 * field of the block called Slack.
 *
 * It opens with Craig having already noticed a gap and proposing a way to
 * close it himself. That's the agentic shape: he doesn't wait to be asked,
 * and he doesn't act on something this consequential without a yes.
 *
 * Front-end only, and deliberately narrow. Links, channel names and "add a
 * <thing>". Anything else it says plainly it can't do — an editor that
 * quietly does the wrong thing is worse than one that does nothing.
 */

interface Line {
  id: string;
  from: "craig" | "ada";
  text: string;
  /** The block it changed, so the line can jump back to it. */
  blockId?: string;
}

const JASON = PEOPLE.jason.name.split(" ")[0];
const NILS = NEW_HIRE.name.split(" ")[0];

/* The multiselect stores option ids ("eng"), not what they're called
   ("#engineering"), so both the write and the readback go through the field
   rather than through a guess about what the ids look like. */
const CHANNEL_FIELD = findPreset("slack")?.setup.find(
  (f) => f.id === "channels",
);

const channelNames = (ids: string[]) =>
  ids
    .map(
      (id) =>
        CHANNEL_FIELD?.options?.find((o) => o.id === id)?.label ?? `#${id}`,
    )
    .join(", ");

/** What someone typed, mapped onto option ids where one exists. Anything the
    workspace has that we don't know about is kept as-is — the field takes
    custom values, and refusing an unfamiliar channel name would be worse. */
const channelIds = (names: string[]) =>
  names.map(
    (n) =>
      CHANNEL_FIELD?.options?.find(
        (o) => o.label.replace(/^#/, "").toLowerCase() === n.toLowerCase(),
      )?.id ?? n,
  );

/**
 * What Craig noticed before the panel was opened.
 *
 * Read off the workflow rather than written down, because the same panel opens
 * on an empty draft and on a finished one. An assistant that greets a blank
 * canvas by naming a Slack step that isn't there has told you exactly how much
 * attention it was paying.
 */
function opening(blocks: WorkflowBlock[], gaps: WorkflowBlock[]): Line[] {
  const slackGap = gaps.find((b) => b.preset === "slack");
  const line = (text: string) => [{ id: "l1", from: "craig" as const, text }];

  if (slackGap)
    return line(
      `${count(gaps.length, "step")} still ${gaps.length === 1 ? "needs" : "need"} you, and one of them I can probably work out myself. Nobody has said which Slack channels ${NILS} should be in — I could just copy whichever ones ${JASON} is in, since he's the closest match. Want me to?`,
    );

  if (gaps.length > 0)
    return line(
      `${count(gaps.length, "step")} won't run yet — ${list(gaps.map((b) => b.title))}. Paste me the link or tell me the answer and I'll put it where it goes.`,
    );

  if (blocks.length <= 1)
    return line(
      "Nothing in here but the trigger. Tell me what a new starter needs — \u201cadd a sign contract\u201d, or paste a link to something they'll need access to — and I'll build it out.",
    );

  return line(
    "Everything here has what it needs, so this one is ready to publish. Paste a link or name a step and I'll keep going.",
  );
}

/** Craig counts things out loud a lot; this keeps him grammatical. */
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

const list = (items: string[]) =>
  items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/* Option ids. What Jason is in, which is the whole point of the offer. */
const SUGGESTED_CHANNELS = ["general", "eng", "incidents", "deploys"];

/** Which service a pasted URL belongs to, and which field it fills. */
const LINKS: { match: RegExp; preset: string; field: string; label: string }[] =
  [
    {
      match: /slack\.com/i,
      preset: "slack",
      field: "workspace",
      label: "Slack",
    },
    { match: /github\.com/i, preset: "github", field: "org", label: "GitHub" },
    {
      match: /linear\.app/i,
      preset: "linear",
      field: "workspace",
      label: "Linear",
    },
    {
      match: /notion\.so/i,
      preset: "notion",
      field: "workspace",
      label: "Notion",
    },
    { match: /atlassian\.net/i, preset: "jira", field: "site", label: "Jira" },
    { match: /figma\.com/i, preset: "figma", field: "team", label: "Figma" },
  ];

/**
 * The conversation, held above the panel.
 *
 * Craig selects the block he just changed, and selecting swaps the panel to
 * that block's fields — which would unmount him and throw away everything he
 * just said. So the transcript lives in the page and the panel only renders
 * it. Leaving and coming back finds the thread where it was.
 */
export function useCraigPanel(blocks: WorkflowBlock[]) {
  const gaps = blocks.filter((b) => {
    const preset = b.preset ? findPreset(b.preset) : undefined;
    return preset?.setup.some((f) => f.required && !hasValue(b.config?.[f.id]));
  });

  /* Seeded once. The greeting describes the workflow as it was when she
     arrived, and rewriting it as she fixes things would be Craig editing what
     he already said. */
  const [lines, setLines] = React.useState<Line[]>(() => opening(blocks, gaps));
  /* The offer only exists when there's a Slack gap to offer against. */
  const [offerOpen, setOfferOpen] = React.useState(() =>
    gaps.some((b) => b.preset === "slack"),
  );
  /* What he's doing right now, or null when he isn't. An agent that answers
     instantly is a lookup table; showing the work is most of what makes the
     difference legible. */
  const [thinking, setThinking] = React.useState<string | null>(null);
  const timersRef = React.useRef<number[]>([]);

  React.useEffect(() => {
    const pending = timersRef.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  return {
    lines,
    setLines,
    offerOpen,
    setOfferOpen,
    thinking,
    setThinking,
    timersRef,
  };
}

export type CraigPanel = ReturnType<typeof useCraigPanel>;

export function WorkflowAssistant({
  blocks,
  chat,
  onPatch,
  onInsert,
  onSelect,
}: {
  blocks: WorkflowBlock[];
  chat: CraigPanel;
  onPatch: (id: string, changes: Partial<WorkflowBlock>) => void;
  onInsert: (block: WorkflowBlock) => void;
  onSelect: (id: string) => void;
}) {
  const {
    lines,
    setLines,
    offerOpen,
    setOfferOpen,
    thinking,
    setThinking,
    timersRef,
  } = chat;

  const gaps = blocks.filter((b) => {
    const preset = b.preset ? findPreset(b.preset) : undefined;
    return preset?.setup.some((f) => f.required && !hasValue(b.config?.[f.id]));
  });

  const scrollRef = React.useRef<HTMLDivElement>(null);

  /* Remounting after a trip to the block inspector lands at the top of a
     transcript that may already be long. Jump to the end on mount, not just
     on change. */
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  /* Craig's answers arrive below the fold once the transcript is taller than
     the panel. Scrolling on every change rather than on a length check keeps
     it right when a line is replaced rather than appended. */
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, thinking]);

  const add = (from: Line["from"], text: string, blockId?: string) =>
    setLines((prev) => [
      ...prev,
      { id: crypto.randomUUID(), from, text, blockId },
    ]);

  /**
   * Do the phases, then answer.
   *
   * The labels aren't decoration — each one names a thing Craig would actually
   * have to do, in the order he'd do it, so the wait explains itself. The
   * change lands with the last phase rather than at the start, because a panel
   * that updates while he's still "checking" gives the game away.
   */
  function work(phases: string[], done: () => void) {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    const beat = 620;
    phases.forEach((label, i) => {
      timersRef.current.push(
        window.setTimeout(() => setThinking(label), i * beat),
      );
    });
    timersRef.current.push(
      window.setTimeout(() => {
        setThinking(null);
        done();
      }, phases.length * beat),
    );
  }

  const blockFor = (preset: string) => blocks.find((b) => b.preset === preset);

  function acceptSuggestion() {
    setOfferOpen(false);
    add("ada", `Yes — copy ${JASON}'s.`);

    const slack = blockFor("slack");
    if (!slack) {
      add("craig", "There's no Slack step in this workflow any more.");
      return;
    }
    work(
      [
        `Looking at ${JASON}'s channels`,
        "Checking which ones a new engineer needs",
        "Adding them to the Slack step",
      ],
      () => {
        onPatch(slack.id, {
          config: { ...slack.config, channels: SUGGESTED_CHANNELS },
        });
        onSelect(slack.id);
        add(
          "craig",
          `Done — ${channelNames(SUGGESTED_CHANNELS)}. That was the last thing Slack needed, so it'll run now. I've left the right-to-work check alone; that one I'd only be guessing at.`,
          slack.id,
        );
      },
    );
  }

  function declineSuggestion() {
    setOfferOpen(false);
    add("ada", "I'll tell you.");
    work(["Standing down"], () =>
      add(
        "craig",
        "Go on then — type them below with the hashes and I'll put them in.",
      ),
    );
  }

  function handle(text: string) {
    const input = text.trim();
    if (!input) return;
    setOfferOpen(false);
    add("ada", input);

    /* 1. A pasted link — the most common thing in her clipboard, and the one
          where working out where it goes is pure tedium. */
    const url = input.match(/\b[\w.-]+\.[a-z]{2,}(?:\/\S*)?/i)?.[0];
    if (url) {
      const link = LINKS.find((l) => l.match.test(url));
      if (!link) {
        work(["Reading the link"], () =>
          add("craig", `I don't know which step ${url} belongs to. Which one?`),
        );
        return;
      }
      const block = blockFor(link.preset);
      if (!block) {
        add(
          "craig",
          `That's a ${link.label} link, but there's no ${link.label} step here yet. Add one and paste it again.`,
        );
        return;
      }
      work(
        [`Reading the ${link.label} link`, `Filling in the ${link.label} step`],
        () => {
          onPatch(block.id, { config: { ...block.config, [link.field]: url } });
          onSelect(block.id);
          add("craig", `Put that on ${link.label}.`, block.id);
        },
      );
      return;
    }

    /* 2. Channel names only ever mean one thing. */
    const typed = [...input.matchAll(/#([\w-]+)/g)].map((m) => m[1]);
    if (typed.length > 0) {
      const channels = channelIds(typed);
      const slack = blockFor("slack");
      if (!slack) {
        add("craig", "There's no Slack step in this workflow.");
        return;
      }
      work(["Setting the Slack channels"], () => {
        onPatch(slack.id, { config: { ...slack.config, channels } });
        onSelect(slack.id);
        add(
          "craig",
          `Set Slack to ${channelNames(channels)}. That was the last thing it needed.`,
          slack.id,
        );
      });
      return;
    }

    /* 3. "add a reference check" — matched against the library rather than a
          keyword list, so it stays true as presets change. */
    if (/^(add|include|also)\b/i.test(input)) {
      const rest = input.replace(/^(add|include|also)\s+(a|an|the)?\s*/i, "");
      const preset = ALL_PRESETS.find(
        (p) =>
          rest.toLowerCase().includes(p.label.toLowerCase()) ||
          p.label.toLowerCase().includes(rest.toLowerCase()),
      );
      if (!preset) {
        add(
          "craig",
          `I don't have a block for that. Closest thing is a plain task — say "add a task" and I'll put one in.`,
        );
        return;
      }
      if (preset.unavailable) {
        add("craig", `I can't do ${preset.label} yet — ${preset.unavailable}.`);
        return;
      }
      work(
        [`Looking up ${preset.label}`, "Adding it to the end of the workflow"],
        () => {
          const block = blockFromPreset(preset, `b${Date.now()}`);
          onInsert(block);
          onSelect(block.id);
          const needs = preset.setup.filter((f) => f.required).length;
          add(
            "craig",
            `Added ${preset.label} at the end. It needs ${count(needs, "thing")} from you — I've opened it.`,
            block.id,
          );
        },
      );
      return;
    }

    add(
      "craig",
      "I can take a link, a list of channels, or “add a reference check”. More than that and I'd be guessing at your workflow, which I'd rather not do.",
    );
  }

  return (
    /* A column, not a stack. The transcript takes whatever height is left and
       scrolls inside itself, so the composer stays on the bottom edge of the
       panel however long the conversation gets — a chat whose input drifts
       down the page as it fills is a chat you have to chase. */
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div
        ref={scrollRef}
        className="scrollbar-thin -mr-2 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-2"
      >
        {lines.map((l) =>
          l.from === "craig" ? (
            /* Mark above the copy, not beside it — the same shape the main
               chat uses, so his turns read as an agent's rather than as a
               second kind of speech bubble. */
            <div key={l.id} className="flex flex-col gap-1.5">
              <CraigMark className="size-5 shrink-0 text-accent" />
              <button
                type="button"
                onClick={() => l.blockId && onSelect(l.blockId)}
                disabled={!l.blockId}
                className={cn(
                  "min-w-0 rounded-md text-left text-sm leading-relaxed text-text-muted",
                  l.blockId && "hover:text-text",
                )}
              >
                {l.text}
              </button>
            </div>
          ) : (
            <p
              key={l.id}
              className="ml-auto max-w-[85%] rounded-xl rounded-br-sm bg-accent-subtle px-3 py-2 text-sm text-accent-subtle-fg"
            >
              {l.text}
            </p>
          ),
        )}

        {/* The pending turn. Mark in place, phase beside it — no spinner, for
            the reason the main chat gives: the mark and the changing label are
            already two signals that he's going. Keyed so each phase replays
            the animation instead of the text snapping. */}
        {thinking && (
          <div className="flex items-center gap-2">
            <CraigMark className="size-5 shrink-0 text-accent" />
            <span
              key={thinking}
              className="text-sm text-text-muted motion-safe:animate-[step-phase_260ms_cubic-bezier(0.25,1,0.5,1),soft-pulse_2.2s_ease-in-out_260ms_infinite]"
            >
              {thinking}
            </span>
          </div>
        )}
      </div>

      {offerOpen && !thinking && (
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" onClick={acceptSuggestion}>
            Yes, copy {JASON}&apos;s
          </Button>
          <Button size="sm" variant="secondary" onClick={declineSuggestion}>
            I&apos;ll tell you
          </Button>
        </div>
      )}

      {/* sm, and no dictation: this is a ~300px column, and the panel was
          already the crowded part of the screen. */}
      <div className="shrink-0">
        <PromptBar
          size="sm"
          busy={Boolean(thinking)}
          dictation={false}
          placeholder="Paste a link, or name a step…"
          onSubmit={handle}
          footnote={
            gaps.length > 0
              ? `${count(gaps.length, "step")} still ${gaps.length === 1 ? "needs" : "need"} something.`
              : blocks.length <= 1
                ? "No steps yet."
                : "Nothing is missing."
          }
        />
      </div>
    </div>
  );
}

const hasValue = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v.length > 0 : Boolean(v && v.trim());
