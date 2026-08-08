"use client";

import * as React from "react";
import { claimAccount } from "@/lib/showcase/store";

/**
 * Keeps the browser's copy of the showcase pointed at whoever is signed in.
 *
 * The showcase has no database, so everything it knows — the conversation, the
 * workflows, the people invited — lives in a module in the browser. A module
 * outlives a client navigation, and signing up is a fetch followed by exactly
 * that rather than a page load. So a second account arrived to find the first
 * one's data already there, and Craig, handed a transcript addressed to
 * somebody else, carried on using their name.
 *
 * An effect rather than something computed while rendering: this writes to a
 * store other components are reading, and doing that mid-render is how you get
 * two components in one pass disagreeing about what's in it.
 *
 * Renders nothing. It exists to run on every showcase page, which is why it
 * sits in the layout — a guard that only some routes remember to include is a
 * guard with holes in it.
 */
export function AccountScope({ email }: { email: string | null }) {
  React.useEffect(() => {
    claimAccount(email);
  }, [email]);

  return null;
}
