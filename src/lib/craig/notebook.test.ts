import { describe, expect, it } from "vitest";
import { headingsOf, sectionOf } from "./notebook-text";

/**
 * The index and the retrieval, pinned.
 *
 * These two functions decide what Craig is handed when somebody asks a
 * question, and both fail the same quiet way: a heading missed means he says
 * he does not know something he does know; a section sliced wrongly means he
 * answers confidently from the wrong paragraph. Neither shows up as an error —
 * they show up as an answer that is a bit off, weeks later, in somebody's
 * inbox.
 */

const NOTEBOOK = `# Lark & Finch

We are a twelve-person marketing agency in Manchester.

## How leave works

Four weeks a year, plus public holidays.

### Booking it

In Bob, at least a fortnight ahead.

## Expenses and reimbursement

Anything under $50, just expense it.

## Who to ask about the build

Priya. If she's away, anyone in #eng.`;

describe("headingsOf", () => {
  it("lists every heading, at any level", () => {
    expect(headingsOf(NOTEBOOK)).toEqual([
      "Lark & Finch",
      "How leave works",
      "Booking it",
      "Expenses and reimbursement",
      "Who to ask about the build",
    ]);
  });

  it("finds nothing in a document with no headings", () => {
    expect(headingsOf("Just some prose.\n\nAnd more of it.")).toEqual([]);
  });

  it("ignores a hash that isn't a heading", () => {
    /* `#eng` is a Slack channel, and this notebook is full of them. A naive
       match on a leading `#` would offer it as a section. */
    expect(headingsOf("Ask in #eng if Priya is away.")).toEqual([]);
  });
});

describe("sectionOf", () => {
  it("returns the section and stops at the next sibling", () => {
    const section = sectionOf(NOTEBOOK, "Expenses and reimbursement");
    expect(section).toContain("Anything under $50");
    expect(section).not.toContain("Who to ask");
    expect(section).not.toContain("Four weeks");
  });

  it("includes subsections, because that is what somebody means", () => {
    /* "How leave works" without "Booking it" would answer half a question and
       look complete doing it. */
    const section = sectionOf(NOTEBOOK, "How leave works");
    expect(section).toContain("Four weeks a year");
    expect(section).toContain("In Bob, at least a fortnight ahead");
    expect(section).not.toContain("Anything under $50");
  });

  it("matches loosely, because he asks for what he half-remembers", () => {
    /* Craig picks from the heading list, then asks for "Expenses". Refusing
       that is pedantry dressed as correctness. */
    expect(sectionOf(NOTEBOOK, "Expenses")).toContain("Anything under $50");
    expect(sectionOf(NOTEBOOK, "expenses AND REIMBURSEMENT")).toContain(
      "Anything under $50",
    );
  });

  it("returns null rather than guessing", () => {
    /* The answer that lets him say he does not know — and that is the moment
       worth turning into a note. */
    expect(sectionOf(NOTEBOOK, "Parental leave")).toBeNull();
    expect(sectionOf(NOTEBOOK, "")).toBeNull();
    expect(sectionOf("", "How leave works")).toBeNull();
  });

  it("takes the whole document when asked for the top heading", () => {
    const section = sectionOf(NOTEBOOK, "Lark & Finch");
    expect(section).toContain("twelve-person marketing agency");
    /* An `h1` outranks every `h2`, so everything below belongs to it. */
    expect(section).toContain("Anything under $50");
  });
});
