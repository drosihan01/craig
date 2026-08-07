"use client";

import * as React from "react";
import { Badge, CraigMark, PromptBar, type WorkflowBlock } from "@/components/ui";
import { Check } from "@/components/ui/icons";
import {
  ALL_PRESETS,
  blockFromPreset,
  findPreset,
} from "@/lib/workflow/library";

/**
 * Craig, inside the builder.
 *
 * The canvas is a good editor and a bad conversation. Filling in a Slack
 * workspace URL means selecting the block, finding the field, and typing —
 * three deliberate acts for something Ada could have said in four words. So
 * the right panel takes what she says, works out which step it belongs to,
 * and makes the change.
 *
 * This is the agentic version of editing: she states an intention, Craig
 * decides where it lands. She never has to know that "katalis.slack.com" is
 * the `workspace` field of the block called Slack.
 *
 * Front-end only, and deliberately narrow. It handles pasted links, channel
 * names and "add a <thing>", and says plainly when it can't help rather than
 * guessing — a workflow editor that quietly does the wrong thing is worse
 * than one that does nothing.
 */

export interface Change {
  id: string;
  /** What Craig says he did. */
  said: string;
  /** The block it landed on, for the caller to highlight. */
  blockId?: string;
}

/** Which service a pasted URL belongs to, and which field it fills. */
const LINKS: { match: RegExp; preset: string; field: string; label: string }[] =
  [
    { match: /slack\.com/i, preset: "slack", field: "workspace", label: "Slack" },
    { match: /github\.com/i, preset: "github", field: "org", label: "GitHub" },
    { match: /linear\.app/i, preset: "linear", field: "workspace", label: "Linear" },
    { match: /notion\.so/i, preset: "notion", field: "workspace", label: "Notion" },
    { match: /atlassian\.net/i, preset: "jira", field: "site", label: "Jira" },
    { match: /figma\.com/i, preset: "figma", field: "team", label: "Figma" },
  ];

export function WorkflowAssistant({
  blocks,
  onPatch,
  onInsert,
  onSelect,
}: {
  blocks: WorkflowBlock[];
  onPatch: (id: string, changes: Partial<WorkflowBlock>) => void;
  onInsert: (block: WorkflowBlock) => void;
  onSelect: (id: string) => void;
}) {
  const [log, setLog] = React.useState<Change[]>([]);

  function say(said: string, blockId?: string) {
    setLog((prev) => [{ id: crypto.randomUUID(), said, blockId }, ...prev]);
  }

  function handle(text: string) {
    const input = text.trim();
    if (!input) return;

    const blockFor = (preset: string) =>
      blocks.find((b) => b.preset === preset);

    /* 1. A pasted link. The most common thing Ada has in her clipboard, and
          the one where working out where it goes is pure tedium. */
    const url = input.match(/\b[\w.-]+\.[a-z]{2,}(?:\/\S*)?/i)?.[0];
    if (url) {
      const link = LINKS.find((l) => l.match.test(url));
      if (link) {
        const block = blockFor(link.preset);
        if (block) {
          onPatch(block.id, {
            config: { ...block.config, [link.field]: url },
          });
          onSelect(block.id);
          say(`Put that on ${link.label} — ${url}.`, block.id);
          return;
        }
        say(
          `That's a ${link.label} link, but there's no ${link.label} step in this workflow yet. Add one and paste it again.`,
        );
        return;
      }
      say(`I don't know which step ${url} belongs to. Which one is it for?`);
      return;
    }

    /* 2. Channel names. Only ever means one thing. */
    const channels = [...input.matchAll(/#([\w-]+)/g)].map((m) => m[1]);
    if (channels.length > 0) {
      const block = blockFor("slack");
      if (!block) {
        say("There's no Slack step in this workflow yet.");
        return;
      }
      onPatch(block.id, {
        config: { ...block.config, channels },
      });
      onSelect(block.id);
      say(
        `Set Slack to ${channels.map((c) => `#${c}`).join(", ")}. That was the last thing it needed.`,
        block.id,
      );
      return;
    }

    /* 3. "add a background check", "add linear". Matched against the library
          rather than a keyword list, so it stays true as presets change. */
    const wantsAdd = /^(add|include|also)\b/i.test(input);
    if (wantsAdd) {
      const rest = input.replace(/^(add|include|also)\s+(a|an|the)?\s*/i, "");
      const preset = ALL_PRESETS.find(
        (p) =>
          rest.toLowerCase().includes(p.label.toLowerCase()) ||
          p.label.toLowerCase().includes(rest.toLowerCase()),
      );
      if (preset) {
        if (preset.unavailable) {
          say(`I can't do ${preset.label} yet — ${preset.unavailable}.`);
          return;
        }
        const block = blockFromPreset(preset, `b${Date.now()}`);
        onInsert(block);
        onSelect(block.id);
        const needs = preset.setup.filter((f) => f.required).length;
        say(
          `Added ${preset.label} at the end. It needs ${needs} thing${needs === 1 ? "" : "s"} set up — I've opened it.`,
          block.id,
        );
        return;
      }
      say(
        `I don't have a block for that. The closest thing is a plain task — say "add a task" and I'll put one in.`,
      );
      return;
    }

    /* 4. Anything else. Honest rather than helpful-sounding. */
    say(
      "I can take a link, a list of channels, or “add a background check”. Anything more than that and I'd be guessing at your workflow, which I'd rather not do.",
    );
  }

  const gaps = blocks.filter((b) => {
    const preset = b.preset ? findPreset(b.preset) : undefined;
    if (!preset) return false;
    return preset.setup.some(
      (f) => f.required && !hasValue(b.config?.[f.id]),
    );
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2.5">
        <CraigMark className="mt-0.5 size-5 shrink-0 text-accent" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium">Tell me what to change</p>
          <p className="text-xs leading-relaxed text-text-subtle">
            {gaps.length > 0 ? (
              <>
                {gaps.length} step{gaps.length === 1 ? "" : "s"} still
                {gaps.length === 1 ? " needs" : " need"} something. Paste a link
                or tell me the answer and I&apos;ll put it in the right place.
              </>
            ) : (
              <>
                Nothing is missing. Paste a link or say &ldquo;add a background
                check&rdquo; if you want to change something.
              </>
            )}
          </p>
        </div>
      </div>

      <PromptBar
        placeholder="katalis.slack.com, #general #engineering, add a reference check…"
        onSubmit={handle}
      />

      {log.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          {log.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => c.blockId && onSelect(c.blockId)}
              disabled={!c.blockId}
              className="flex items-start gap-2 rounded-md px-1 py-0.5 text-left text-xs leading-relaxed text-text-muted transition-colors enabled:hover:bg-surface-hover enabled:hover:text-text"
            >
              <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
              <span className="min-w-0 flex-1">{c.said}</span>
            </button>
          ))}
        </div>
      )}

      {gaps.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {gaps.map((b) => (
            <Badge
              key={b.id}
              tone="warning"
              size="sm"
              className="cursor-pointer"
              onClick={() => onSelect(b.id)}
            >
              {b.title}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

const hasValue = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v.length > 0 : Boolean(v && v.trim());
