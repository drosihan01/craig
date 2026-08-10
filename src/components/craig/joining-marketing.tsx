"use client";

import * as React from "react";

/**
 * What the panel beside `/join` says, written for the person actually reading
 * it.
 *
 * `/join` moved onto the two-panel sign-in layout with its aside deliberately
 * empty, because the default is `AuthMarketing` — claims aimed at somebody
 * deciding whether to *buy* Craig. Nobody arriving here is buying anything.
 * They were hired, they were sent a link, and the only question in their head
 * is what this is and whether they have to do something.
 *
 * So these answer that instead. Same shape as `MARKETING_LINES` and the same
 * one rule: **every line maps to something the product actually does.** A
 * promise made on the first screen and broken on the second is worse than a
 * blank panel, and this reader will be on the second screen within about ten
 * seconds.
 *
 * - Asking about the company is `search_resources` against whatever the
 *   employer shared, on `/me/ask`.
 * - Being walked through the tasks is the checklist on `/me`, one step at a
 *   time with the current one carrying the form.
 * - Not needing a password is literally true: the link is the credential, and
 *   there is no account to create.
 * - The last is Craig's automated steps — the Google account he makes before
 *   day one — which is the thing this product exists to do.
 */
const LINES: { headline: string; sub: string }[] = [
  {
    headline: "Get to know your new company.",
    sub: "Ask Craig anything they've shared with you — the handbook, the policies, how things work here.",
  },
  {
    headline: "Craig will walk you through it.",
    sub: "One thing at a time, in the order it happens, so you always know what's next and what isn't yours yet.",
  },
  {
    headline: "No password to remember.",
    sub: "The link in your invitation is the whole thing. There's no account to create and nothing to set up.",
  },
  {
    headline: "Some of it is already done.",
    sub: "Your accounts and access are being set up before you arrive. You'll find them waiting rather than requested.",
  },
];

/* Picked once per page load rather than on a timer, matching `AuthMarketing`.
   A line that changes while somebody is reading it is a line nobody finishes,
   and this reader is mid-sentence into a form. */
let clientPick: number | null = null;

const subscribeToNothing = () => () => {};

function pickOnce() {
  if (clientPick === null) {
    clientPick = Math.floor(Math.random() * LINES.length);
  }
  return clientPick;
}

export function JoiningMarketing() {
  /* Server renders index 0 and the client may pick another — through
     `useSyncExternalStore` so the swap happens after hydration rather than as
     a mismatch React has to complain about. Same mechanism as the admin's. */
  const index = React.useSyncExternalStore(
    subscribeToNothing,
    pickOnce,
    () => 0,
  );
  const line = LINES[index];

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h2 className="text-4xl font-semibold leading-[1.1] tracking-[-0.03em]">
        {line.headline}
      </h2>
      <p className="text-xl leading-relaxed text-text-muted">{line.sub}</p>
    </div>
  );
}
