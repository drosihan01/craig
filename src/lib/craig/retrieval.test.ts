import { describe, expect, it } from "vitest";
import * as retrieval from "./retrieval";
import {
  CAVEAT_MARK,
  documentBody,
  documentWindow,
  notebookSection,
  resourceSnippets,
  retrieved,
} from "./retrieval";

/**
 * That every piece of retrieved text arrives with its constraint attached.
 *
 * This is the test the project needed and did not have. The rule — a constraint
 * on how to use retrieved text belongs *with* the text — was learned from a real
 * failure and then kept by everybody remembering to append a sentence. Which is
 * how `search_resources` came to hand a new starter bare fragments of their
 * employer's handbook with nothing attached at all.
 *
 * The sweep at the bottom is the part that matters. A new retrieval builder
 * added without a caveat fails here rather than in somebody's onboarding.
 */

const BODY = "Four weeks a year, plus public holidays.";

describe("retrieved", () => {
  it("puts the caveat last, because that is the whole point", () => {
    const out = retrieved({
      from: "the notebook",
      body: BODY,
      caveat: "Do not carry that figure to another kind of leave.",
    });

    const lines = out.split("\n");
    expect(lines[lines.length - 1]).toBe(
      `${CAVEAT_MARK} Do not carry that figure to another kind of leave.`,
    );
  });

  it("names the source so the answer can cite it", () => {
    expect(retrieved({ from: "the notebook", body: BODY, caveat: "x" })).toMatch(
      /^From the notebook:/,
    );
  });

  it("keeps the retrieved text intact", () => {
    expect(retrieved({ from: "x", body: BODY, caveat: "y" })).toContain(BODY);
  });
});

describe("notebookSection", () => {
  it("names the heading back, which is the comparison that matters", () => {
    const out = notebookSection("How leave works", BODY);

    /* The heading appears twice on purpose: once framing the text, once in the
       caveat. The #85 failure was Craig treating "the nearest heading" as "the
       answer", and the fix is making him re-read which heading he chose. */
    expect(out).toContain('under "How leave works"');
    expect(out).toContain('That section is titled "How leave works"');
  });

  it("still forbids moving a figure between kinds of leave", () => {
    expect(notebookSection("How leave works", BODY)).toMatch(
      /Never move a figure from one kind of leave/,
    );
  });
});

describe("documentBody", () => {
  it("treats a whole document and a truncated one differently", () => {
    const whole = documentBody("Handbook", BODY, false);
    const part = documentBody("Handbook", BODY, true);

    expect(whole).toContain("the whole of");
    expect(part).toContain("the beginning of");
  });

  it("stops him concluding a document is silent from its first half", () => {
    /* The specific wrong move truncation makes available. From a whole
       document "it isn't in here" is a conclusion; from the first part of one
       it is a guess. */
    expect(documentBody("Handbook", BODY, true)).toMatch(
      /do not conclude the document does not cover it/i,
    );
  });
});

describe("documentWindow", () => {
  it("warns that the middle has been cut out", () => {
    /* The wrong move neither other document caveat covers: passages that read
       as consecutive may be pages apart, with the qualifying condition in the
       gap that was removed. */
    expect(documentWindow("Handbook", BODY)).toMatch(
      /text between them has been cut out/i,
    );
  });

  it("does not claim to be the whole document", () => {
    expect(documentWindow("Handbook", BODY)).not.toMatch(/the whole of/);
  });
});

describe("resourceSnippets", () => {
  const HITS = [
    { name: "Handbook", snippet: "Twenty days plus public holidays." },
    { name: "Expenses policy", snippet: "Under fifty, just expense it." },
  ];

  it("keeps every hit and names each document", () => {
    const out = resourceSnippets(HITS);
    expect(out).toContain('"Handbook"');
    expect(out).toContain('"Expenses policy"');
    expect(out).toContain("Twenty days plus public holidays.");
  });

  it("says a fragment is a fragment", () => {
    /* The caveat this tool had none of. A snippet arrives looking exactly like
       an answer, and the sentence that qualifies it is the one left behind. */
    expect(resourceSnippets(HITS)).toMatch(/fragments matched on wording/i);
  });
});

describe("every builder, swept", () => {
  /**
   * The enforcement.
   *
   * Convention is what the last tool forgot. This walks the module's own
   * exports, so a retrieval builder added later is covered without anybody
   * remembering to come back and add a case here.
   */
  const builders = Object.entries(retrieval).filter(
    ([name, value]) =>
      typeof value === "function" && name !== "retrieved",
  ) as [string, (...args: never[]) => string][];

  it("finds the builders, so this sweep is not vacuously passing", () => {
    expect(builders.map(([name]) => name).sort()).toEqual([
      "documentBody",
      "documentWindow",
      "notebookSection",
      "resourceSnippets",
    ]);
  });

  const call = (name: string): string => {
    switch (name) {
      case "notebookSection":
        return notebookSection("A heading", BODY);
      case "documentBody":
        return documentBody("A document", BODY, false);
      case "documentWindow":
        return documentWindow("A document", BODY);
      case "resourceSnippets":
        return resourceSnippets([{ name: "A document", snippet: BODY }]);
      default:
        throw new Error(
          `No case for "${name}". A new retrieval builder was added — give it one, and check it carries a caveat.`,
        );
    }
  };

  for (const [name] of builders) {
    it(`${name} ends with a caveat`, () => {
      const out = call(name);
      const last = out.split("\n").filter(Boolean).pop() ?? "";

      expect(last.startsWith(CAVEAT_MARK)).toBe(true);
      /* Long enough to name a specific wrong move rather than hedge. */
      expect(last.length).toBeGreaterThan(80);
    });

    it(`${name} keeps the retrieved text`, () => {
      expect(call(name)).toContain(BODY);
    });
  }
});
