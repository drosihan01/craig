"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CraigMark } from "@/components/ui";
import { cn } from "@/lib/cn";
import { NEW_HIRE, PEOPLE } from "@/lib/demo";
import { ACTIVITY, outstanding } from "@/lib/craig-activity";
import { RUN_STEPS } from "@/lib/demo-run";
import { findResource } from "@/lib/demo-resources";
import { findPreset } from "@/lib/workflow/library";
import { gaps, setConfig, type Gap } from "@/lib/workflow-store";
import type { DemoWorkflow } from "@/lib/demo-workflow";

/**
 * Craig, on Home.
 *
 * The same conversation as the builder panel, one level up. What changes is
 * what he can be asked: the builder edits the workflow in front of it, this
 * answers about the whole account — where somebody is up to, what he's chasing,
 * and the questions he's already put to her.
 *
 * Answering one of his own questions here is the point. The worklist above the
 * composer asks which Slack channels a new engineer needs; typing the answer
 * into the box below should close that row, not open a page. Both read the
 * same store, so the list can't disagree with the builder about what's left.
 *
 * Anything that means *building* goes to the builder. A canvas is the right
 * tool for arranging steps and a chat is not, and pretending otherwise would
 * mean reimplementing the builder badly inside a text box.
 */

export interface ChatLine {
  id: string;
  from: "craig" | "ada";
  text: string;
  /** Rendered under the text as tappable context. */
  refs?: { label: string; href: string }[];
}

const NILS = NEW_HIRE.name.split(" ")[0];

/** Craig counts out loud a lot; this keeps him grammatical. */
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

const listOf = (items: string[]) =>
  items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/* ---------------------------------------------------------------------- */
/*  What he can be asked                                                  */
/* ---------------------------------------------------------------------- */

/** Which service a pasted URL belongs to, and the field it fills. */
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
  ];

/** Words that mean "make me a workflow" rather than "tell me something". */
const BUILD =
  /\b(build|create|make|draft|new|add)\b.*\b(workflow|onboarding|flow|step|block|check)\b/i;

const STATUS =
  /\b(where|how far|status|progress|up to|blocked|blocking|waiting|stuck|chas)/i;

export function useHomeChat() {
  const [lines, setLines] = React.useState<ChatLine[]>([]);
  const [thinking, setThinking] = React.useState<string | null>(null);
  const timersRef = React.useRef<number[]>([]);

  React.useEffect(() => {
    const pending = timersRef.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  return { lines, setLines, thinking, setThinking, timersRef };
}

export type HomeChat = ReturnType<typeof useHomeChat>;

export function useAskCraig(chat: HomeChat, workflows: DemoWorkflow[]) {
  const { setLines, setThinking, timersRef } = chat;
  const router = useRouter();

  const add = React.useCallback(
    (from: ChatLine["from"], text: string, refs?: ChatLine["refs"]) =>
      setLines((prev) => [
        ...prev,
        { id: crypto.randomUUID(), from, text, refs },
      ]),
    [setLines],
  );

  /* Phases first, then the answer. Each label names something he'd actually
     have to do, so the wait explains itself rather than being a spinner. */
  const work = React.useCallback(
    (phases: string[], done: () => void) => {
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
    },
    [setThinking, timersRef],
  );

  return React.useCallback(
    (raw: string) => {
      const input = raw.trim();
      if (!input) return;
      add("ada", input);

      const open = gaps(workflows);

      /* 1. An answer to something he asked. The highest-value case by far —
            the question is on screen directly above the box. */
      const answered = takeAnswer(input, open);
      if (answered) {
        work(answered.phases, () => {
          setConfig(
            answered.gap.workflow.id,
            answered.gap.block.id,
            answered.field,
            answered.value,
          );
          add("craig", answered.reply, [
            {
              label: `${answered.gap.block.title} in ${answered.gap.workflow.name}`,
              href: `/builder/${answered.gap.workflow.id}?step=${answered.gap.block.id}`,
            },
          ]);
        });
        return;
      }

      /* 2. Building. The canvas is the right tool and this isn't it. */
      if (BUILD.test(input)) {
        const target = workflows.find((w) =>
          input.toLowerCase().includes(w.name.toLowerCase()),
        );
        work(["Finding the right workflow"], () => {
          add(
            "craig",
            target
              ? `That's a change to ${target.name}. Taking you to it — tell me there and I'll make it.`
              : "That's a build. Taking you to the workflows — say it again on the canvas and I'll do it there.",
          );
          router.push(target ? `/builder/${target.id}` : "/builder");
        });
        return;
      }

      /* 3. Status. Read off the run and the activity log, not written down. */
      if (STATUS.test(input)) {
        work(["Checking where everyone is", "Reading what I chased"], () =>
          add("craig", statusReport(open), [
            { label: `${NILS}'s onboarding`, href: "/onboarding" },
          ]),
        );
        return;
      }

      /* 4. A policy question. He answers from what he's got and says plainly
            when he hasn't got it — the whole value of the Resources page is
            that it lists the gaps as loudly as the documents. */
      const doc = findResource(input);
      work(["Looking through what you've given me"], () => {
        if (doc && doc.state !== "missing") {
          add(
            "craig",
            doc.state === "stale"
              ? `${doc.name} covers that — ${doc.meta}. I'd read it before relying on it; it hasn't been touched in a while and I can't tell what's still true.`
              : `${doc.name} covers that — ${doc.meta}.`,
            [{ label: doc.name, href: "/resources" }],
          );
          return;
        }
        add(
          "craig",
          doc
            ? `${doc.name} is one of the things that doesn't exist — ${doc.meta}. I'd only be inventing a policy, so I won't. Write it down and I'll use it from then on.`
            : "I haven't got anything that answers that. If it isn't in Resources it isn't anywhere I can see, and I'd rather say so than make something up.",
          [{ label: "Resources", href: "/resources" }],
        );
      });
    },
    [add, work, router, workflows],
  );
}

/* ---------------------------------------------------------------------- */
/*  Understanding her                                                     */
/* ---------------------------------------------------------------------- */

interface Answer {
  gap: Gap;
  field: string;
  value: string | string[];
  reply: string;
  phases: string[];
}

/**
 * Is she answering one of his outstanding questions?
 *
 * Matched against the gaps rather than against a keyword list, so it stays
 * true as the workflow changes. Only shapes he can be certain about — a link,
 * a list of channels, one of a field's own options. Guessing at prose would
 * mean quietly writing the wrong thing into a workflow, which is worse than
 * saying he didn't follow.
 */
function takeAnswer(input: string, open: Gap[]): Answer | null {
  /* A pasted link. */
  const url = input.match(/\b[\w.-]+\.[a-z]{2,}(?:\/\S*)?/i)?.[0];
  if (url) {
    const link = LINKS.find((l) => l.match.test(url));
    const gap = link && open.find((g) => g.block.preset === link.preset);
    if (link && gap)
      return {
        gap,
        field: link.field,
        value: url,
        reply: `Put that on ${link.label} in ${gap.workflow.name}. ${remaining(open.length - 1)}`,
        phases: [`Reading the ${link.label} link`, `Filling in ${link.label}`],
      };
  }

  /* Channel names only ever mean one thing. */
  const typed = [...input.matchAll(/#([\w-]+)/g)].map((m) => m[1]);
  const slack = open.find((g) => g.block.preset === "slack");
  if (typed.length > 0 && slack) {
    const field = findPreset("slack")?.setup.find((f) => f.id === "channels");
    const ids = typed.map(
      (n) =>
        field?.options?.find(
          (o) => o.label.replace(/^#/, "").toLowerCase() === n.toLowerCase(),
        )?.id ?? n,
    );
    const names = ids.map(
      (id) => field?.options?.find((o) => o.id === id)?.label ?? `#${id}`,
    );
    return {
      gap: slack,
      field: "channels",
      value: ids,
      reply: `Set Slack to ${listOf(names)}. ${remaining(open.length - 1)}`,
      phases: ["Setting the Slack channels"],
    };
  }

  /* One of a select field's own options, named. "Right to work check" for the
     eligibility step, "Deel" for payroll — she says the answer, not the id. */
  for (const gap of open) {
    const preset = gap.block.preset ? findPreset(gap.block.preset) : undefined;
    for (const f of preset?.setup ?? []) {
      if (!f.required || !f.options) continue;
      if (hasValue(gap.block.config?.[f.id])) continue;
      const option = f.options.find((o) =>
        input.toLowerCase().includes(o.label.toLowerCase()),
      );
      if (!option) continue;
      return {
        gap,
        field: f.id,
        value: option.id,
        reply: `Right — ${option.label} for ${gap.block.title}. ${remaining(open.length - 1)}`,
        phases: [`Setting ${f.label.toLowerCase()}`],
      };
    }
  }

  return null;
}

const remaining = (left: number) =>
  left <= 0
    ? "That was the last gap, so the workflow can run now."
    : `${count(left, "step")} still ${left === 1 ? "needs" : "need"} you.`;

const hasValue = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v.length > 0 : Boolean(v && v.trim());

/** Where everybody is, from the run and the activity log. */
function statusReport(open: Gap[]) {
  const done = RUN_STEPS.filter((s) => s.status === "complete").length;
  const blocked = RUN_STEPS.filter((s) => s.waitingOn);
  const chasing = outstanding;

  const parts = [
    `${NILS} has finished ${done} of ${RUN_STEPS.length}.`,
    blocked.length > 0
      ? `${listOf(blocked.map((s) => s.title))} ${blocked.length === 1 ? "is" : "are"} waiting on ${listOf([...new Set(blocked.map((s) => s.waitingOn ?? PEOPLE.jason.name))])}.`
      : "Nothing is waiting on anyone else.",
    chasing.length > 0
      ? `I've chased ${count(chasing.length, "of them")} already — last time ${ACTIVITY[ACTIVITY.length - 1]?.when.toLowerCase() ?? "recently"}.`
      : "",
    open.length > 0
      ? `${count(open.length, "step")} in the workflow still ${open.length === 1 ? "needs" : "need"} you before anyone else can start.`
      : "",
  ];

  return parts.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------------- */
/*  The transcript                                                        */
/* ---------------------------------------------------------------------- */

export function Transcript({ chat }: { chat: HomeChat }) {
  const { lines, thinking } = chat;
  if (lines.length === 0 && !thinking) return null;

  return (
    <div className="flex flex-col gap-5 pt-8">
      {lines.map((l) =>
        l.from === "craig" ? (
          <div key={l.id} className="flex flex-col gap-1.5">
            <CraigMark className="size-6 text-accent" />
            <p className="text-md leading-relaxed text-text-muted">{l.text}</p>
            {l.refs && l.refs.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {/* Link, not <a>. A hard navigation reloads the app, and the
                    workflow store lives in memory — the change Craig just made
                    would be gone by the time you arrived to look at it. */}
                {l.refs.map((r) => (
                  <Link
                    key={r.href + r.label}
                    href={r.href}
                    className="rounded-md border border-border px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
                  >
                    {r.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p
            key={l.id}
            className={cn(
              "ml-auto max-w-[85%] rounded-xl rounded-br-sm px-3.5 py-2.5",
              "bg-accent-subtle text-base text-accent-subtle-fg",
            )}
          >
            {l.text}
          </p>
        ),
      )}

      {thinking && (
        <div className="flex items-center gap-2">
          <CraigMark className="size-6 shrink-0 text-accent" />
          <span
            key={thinking}
            className="text-sm text-text-muted motion-safe:animate-[step-phase_260ms_cubic-bezier(0.25,1,0.5,1),soft-pulse_2.2s_ease-in-out_260ms_infinite]"
          >
            {thinking}
          </span>
        </div>
      )}
    </div>
  );
}
