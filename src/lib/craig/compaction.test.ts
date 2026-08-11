import { describe, expect, it } from "vitest";
import type { AgentInputItem } from "@openai/agents";
import {
  KEEP_TURNS,
  LIMIT_TURNS,
  SUMMARY_PROMPT_TEXT,
  compactionBoundary,
  turnStarts,
  withSummary,
} from "./compaction";

/**
 * Where a long conversation gets cut, pinned.
 *
 * This is the scoreboard the memory work needed and did not have. Everything
 * here fails silently in production: a boundary one item early splits a tool
 * call from its result, a boundary one turn late quietly drops the thing
 * somebody said at the start, and both come back as "Craig forgot" — a
 * complaint with no stack trace and nothing to bisect.
 *
 * The fixture is a discovery interview because that is the conversation the
 * design is for: the load-bearing detail is in turn one and the question that
 * needs it is forty turns later.
 */

const user = (content: string): AgentInputItem => ({ role: "user", content });

const craig = (text: string): AgentInputItem => ({
  role: "assistant",
  status: "completed",
  content: [{ type: "output_text", text }],
});

/** A turn that spent a tool call on its way to an answer. */
const toolTurn = (ask: string, answer: string): AgentInputItem[] => [
  user(ask),
  craig("Let me check the notebook."),
  craig(answer),
];

/** `n` plain question-and-answer turns, numbered so order is assertable. */
const conversation = (n: number): AgentInputItem[] =>
  Array.from({ length: n }, (_, i) => [
    user(`question ${i}`),
    craig(`answer ${i}`),
  ]).flat();

describe("turnStarts", () => {
  it("marks every user message and nothing else", () => {
    expect(turnStarts(conversation(3))).toEqual([0, 2, 4]);
  });

  it("keeps a turn whole when it spent tool calls", () => {
    const items = [...toolTurn("how much leave?", "Four weeks."), user("ta")];
    expect(turnStarts(items)).toEqual([0, 3]);
  });

  it("finds nothing in an empty conversation", () => {
    expect(turnStarts([])).toEqual([]);
  });
});

describe("compactionBoundary", () => {
  it("leaves a short conversation alone", () => {
    expect(compactionBoundary(conversation(LIMIT_TURNS))).toBeNull();
  });

  it("leaves it alone at exactly the limit, not one turn early", () => {
    expect(compactionBoundary(conversation(LIMIT_TURNS))).toBeNull();
    expect(compactionBoundary(conversation(LIMIT_TURNS + 1))).not.toBeNull();
  });

  it("cuts so that KEEP_TURNS turns survive verbatim", () => {
    const items = conversation(LIMIT_TURNS + 1);
    const boundary = compactionBoundary(items);

    expect(turnStarts(items.slice(boundary!))).toHaveLength(KEEP_TURNS);
  });

  it("cuts on a turn boundary, never inside one", () => {
    const items = [
      ...conversation(LIMIT_TURNS),
      ...toolTurn("and expenses?", "Under fifty, just expense it."),
    ];
    const boundary = compactionBoundary(items);

    /* The first surviving item must be the question, not the tool call or the
       answer that followed it. A model handed the back half of a turn has been
       given a reply to something it cannot see. */
    expect(items[boundary!]).toEqual(
      expect.objectContaining({ role: "user" }),
    );
  });

  it("does not summarise when there is nothing before the kept turns", () => {
    /* More turns than the limit, but keeping all of them — the boundary lands
       at zero and there is no prefix to describe. */
    expect(
      compactionBoundary(conversation(5), { keep: 5, limit: 4 }),
    ).toBeNull();
  });

  it("holds the line for several turns before summarising again", () => {
    /* The point of a limit above the keep count: crossing it must not mean a
       model call on every subsequent turn. */
    const justCompacted = conversation(KEEP_TURNS);
    expect(compactionBoundary(justCompacted)).toBeNull();
  });
});

describe("withSummary", () => {
  it("puts the summary in front of the turns it replaces", () => {
    const kept = conversation(2);
    const history = withSummary(kept, "Twelve people, Manchester, remote.");

    expect(history).toHaveLength(kept.length + 2);
    expect(history[0]).toEqual({
      role: "user",
      content: SUMMARY_PROMPT_TEXT,
    });
    expect(history.slice(2)).toEqual(kept);
  });

  it("attributes the summary to Craig, as an answer", () => {
    const [, answer] = withSummary([], "Twelve people, Manchester, remote.");

    expect(answer).toEqual(
      expect.objectContaining({ role: "assistant", status: "completed" }),
    );
  });

  it("carries the summary text through intact", () => {
    const summary = "Twelve people in Manchester. Priya owns the build.";
    const history = withSummary(conversation(1), summary);

    expect(JSON.stringify(history)).toContain(summary);
  });

  it("adds nothing when the summary came back empty", () => {
    /* A failed or empty summariser must degrade to plain trimming, not to a
       pair of messages saying nothing. */
    const kept = conversation(2);
    expect(withSummary(kept, "   ")).toEqual(kept);
  });
});

describe("the whole cut, end to end", () => {
  it("keeps what was said early by describing it, and the rest word for word", () => {
    const items = [
      user("We're twelve people, fully remote, Manchester."),
      craig("Noted. Who handles payroll?"),
      ...conversation(LIMIT_TURNS),
    ];

    const boundary = compactionBoundary(items)!;
    const summary = "Twelve people, fully remote, Manchester.";
    const history = withSummary(items.slice(boundary), summary);

    /* The opening turn is gone from the verbatim tail... */
    expect(JSON.stringify(items.slice(boundary))).not.toContain("Manchester");
    /* ...and present in what Craig is actually handed. */
    expect(JSON.stringify(history)).toContain("Manchester");
    /* And the most recent exchange is untouched at the end. */
    expect(history[history.length - 1]).toEqual(
      craig(`answer ${LIMIT_TURNS - 1}`),
    );
  });
});
