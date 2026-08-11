import { describe, expect, it } from "vitest";
import { bestDocumentMatch } from "./document-match";

/**
 * Choosing which document to open, pinned.
 *
 * The same failure `sectionOf` had and for the same reason: taking the first
 * loose match lets a short name shadow the longer one that was actually asked
 * for. It fails silently — Craig reads a real document, names it correctly, and
 * answers out of the wrong one.
 */

const LIBRARY = [
  { name: "Handbook" },
  { name: "Remote working handbook" },
  { name: "Expenses policy" },
  { name: "Expenses policy (2024, superseded)" },
];

describe("bestDocumentMatch", () => {
  it("takes the exact name over anything containing it", () => {
    expect(bestDocumentMatch(LIBRARY, "Handbook")?.name).toBe("Handbook");
  });

  it("does not let a short name shadow the one asked for", () => {
    /* "Handbook" is a substring of "Remote working handbook", and appears
       first. Asked for the longer one, the longer one is what comes back. */
    expect(bestDocumentMatch(LIBRARY, "Remote working handbook")?.name).toBe(
      "Remote working handbook",
    );
  });

  it("matches what somebody half-remembers", () => {
    expect(bestDocumentMatch(LIBRARY, "expenses")?.name).toMatch(/Expenses/);
  });

  it("prefers the longest name contained by the question", () => {
    /* Both names are contained in the phrase; the more specific one wins. */
    expect(
      bestDocumentMatch(LIBRARY, "the Expenses policy (2024, superseded) please")
        ?.name,
    ).toBe("Expenses policy (2024, superseded)");
  });

  it("is not case sensitive", () => {
    expect(bestDocumentMatch(LIBRARY, "HANDBOOK")?.name).toBe("Handbook");
  });

  it("returns nothing rather than guessing", () => {
    expect(bestDocumentMatch(LIBRARY, "pension scheme")).toBeNull();
  });

  it("returns nothing for an empty ask", () => {
    expect(bestDocumentMatch(LIBRARY, "   ")).toBeNull();
  });

  it("copes with an empty library", () => {
    expect(bestDocumentMatch([], "Handbook")).toBeNull();
  });
});
