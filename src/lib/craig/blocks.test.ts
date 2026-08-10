import { describe, expect, it } from "vitest";
import {
  EXTRAS_FIELDS,
  PAYROLL_DETAILS_EXTRAS_FIELD,
  PERSONAL_DETAILS_EXTRAS_FIELD,
} from "./contract";
import { blockFor, providerNeededBy } from "./blocks";
import {
  DOCUSIGN_SIGNING_METHOD,
  GOOGLE_WORKSPACE_PRESET,
  SIGNING_METHOD_FIELD,
  SIGN_CONTRACT_PRESET,
} from "@/lib/workflow/library";

/**
 * The two rules in this codebase that have each already shipped a bug, and
 * would ship the same one again with nothing to stop them.
 *
 * Neither is visible. A block that needs a connection and says it doesn't
 * renders perfectly; an allowlist that drops a key returns HTTP 200. Both were
 * found by a person reading a diff, which is not a strategy.
 */

describe("providerNeededBy", () => {
  it("gives the flat requirement for an unconditional block", () => {
    expect(providerNeededBy({ preset: GOOGLE_WORKSPACE_PRESET })).toBe(
      "google-workspace",
    );
  });

  it("needs nothing for a block with no provider at all", () => {
    expect(providerNeededBy({ preset: "middle-name" })).toBeNull();
    expect(providerNeededBy({ preset: "not-a-real-preset" })).toBeNull();
  });

  /**
   * The conditional case, and the reason this function exists.
   *
   * A contract only needs DocuSign when its signing-method field says so.
   * Reading `definition.provider` directly is **silently right** for every
   * other block and wrong for this one — which is exactly how it shipped: a
   * DocuSign contract refused by the Publish button while wearing no badge on
   * the canvas, and a DocuSign connection card offered on contracts Craig
   * signs himself.
   */
  it("needs nothing for a contract Craig signs himself", () => {
    expect(
      providerNeededBy({
        preset: SIGN_CONTRACT_PRESET,
        config: { [SIGNING_METHOD_FIELD]: "craig" },
      }),
    ).toBeNull();
  });

  it("needs DocuSign only once the block asks for DocuSign", () => {
    expect(
      providerNeededBy({
        preset: SIGN_CONTRACT_PRESET,
        config: { [SIGNING_METHOD_FIELD]: DOCUSIGN_SIGNING_METHOD },
      }),
    ).toBe("docusign");
  });

  it("has a flat `provider` of null for the conditional block", () => {
    /* Belt and braces: if somebody ever gives `sign-contract` a flat provider,
       every unconfigured contract starts demanding a connection and this says
       so before anybody publishes one. */
    expect(blockFor(SIGN_CONTRACT_PRESET)?.provider).toBeNull();
  });
});

describe("EXTRAS_FIELDS", () => {
  /**
   * The list the invite client strips against and the invite route accepts
   * against. When they disagree the admin ticks a box, publishes, invites,
   * gets a 200, and the new starter is never asked — nothing thrown, nothing
   * logged, the step rendering correctly with the fields missing.
   *
   * That has happened twice, once per block that added a multiselect. It is
   * one exported constant now precisely so it cannot happen a third time, and
   * this is the test that notices if somebody unpicks that.
   */
  it("carries every extras field a block can hold", () => {
    expect(EXTRAS_FIELDS).toContain(PERSONAL_DETAILS_EXTRAS_FIELD);
    expect(EXTRAS_FIELDS).toContain(PAYROLL_DETAILS_EXTRAS_FIELD);
  });

  it("holds no duplicates, so one tick cannot be read twice", () => {
    expect(new Set(EXTRAS_FIELDS).size).toBe(EXTRAS_FIELDS.length);
  });

  it("keeps the two blocks' fields distinct", () => {
    /* They are separate ids on purpose: an emergency-contact tick arriving in
       the payroll list must be refusable, and it cannot be if both blocks
       share one key. */
    expect(PERSONAL_DETAILS_EXTRAS_FIELD).not.toBe(PAYROLL_DETAILS_EXTRAS_FIELD);
  });
});
