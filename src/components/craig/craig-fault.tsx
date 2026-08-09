"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui";
import { Cloud, Key, Lock, Schedule, Warning } from "@/components/ui/icons";
import { SIGN_IN_PATH } from "@/lib/craig/contract";

/**
 * What the screen says when the model doesn't answer.
 *
 * Two rules, and they pull against each other until you separate voice from
 * attribution.
 *
 * It has to read like the rest of the product, because a stack trace above the
 * composer is a different piece of software breaking through the one you were
 * talking to. But it must not be *attributed* to Craig — he didn't say it, and
 * a failure dressed as a message is the screen inventing a turn that never
 * happened. So the copy is plain and the presentation is deliberately not his:
 * no mark, no bubble, a dashed frame and a small icon. Everything he actually
 * says has the mark beside it, and that stays the one thing on the screen that
 * means "he said this".
 *
 * No retry button. The hook keeps the failed turn in the transcript, so
 * re-sending would either duplicate it or need a rewind this screen can't
 * perform — and the composer is one keystroke away and genuinely works. The
 * one action here is the one the person can't do for themselves: signing in
 * again.
 */

export type FaultKind =
  "auth" | "rate-limit" | "no-key" | "network" | "unknown";

export interface Fault {
  kind: FaultKind;
  /** What went wrong and what to do about it, in one or two sentences. */
  line: string;
}

/* The hook hands back a sentence, not a status code — deliberately, since the
   client shouldn't have to know the provider's wire format. So the kind is
   read back out of the words. Matching on phrasing is fragile in general;
   here the strings are written in this repo and the fallback is honest, which
   is the difference between a heuristic and a guess. */
const PATTERNS: [FaultKind, RegExp][] = [
  ["auth", /\b401\b|not signed in|unauthor|session (has )?(expired|run out)/i],
  ["rate-limit", /\b429\b|rate.?limit|too many requests|quota|slow down/i],
  [
    "no-key",
    /api key|api_key|not configured|no model|missing key|\bkey\b.*\bset\b/i,
  ],
  [
    "network",
    /failed to fetch|network|connection|offline|couldn.t be reached/i,
  ],
];

const LINES: Record<FaultKind, string> = {
  auth: "Your session has run out. Sign in again to carry on — nothing here is saved yet, so copy anything you want to keep first.",
  "rate-limit":
    "Too many messages too quickly. Give it a minute and send that one again.",
  "no-key":
    "There's no model key configured, so there's nothing behind Craig to answer with. It goes in .env.local as OPENAI_API_KEY, and the dev server has to restart before it picks it up.",
  network:
    "That didn't get through — the connection dropped on the way. Send it again once you're back.",
  /* Replaced by the message itself. The contract promises it's safe to show,
     and inventing a friendlier sentence would throw away the only thing
     anybody has to go on. */
  unknown: "",
};

const ICONS: Record<FaultKind, typeof Warning> = {
  auth: Lock,
  "rate-limit": Schedule,
  "no-key": Key,
  network: Cloud,
  unknown: Warning,
};

export function classifyFault(error: string | null | undefined): Fault | null {
  if (!error) return null;

  for (const [kind, pattern] of PATTERNS) {
    if (pattern.test(error)) return { kind, line: LINES[kind] };
  }
  return { kind: "unknown", line: error };
}

export function CraigFault({ error }: { error: string | null | undefined }) {
  const fault = classifyFault(error);
  if (!fault) return null;

  const Icon = ICONS[fault.kind];

  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-dashed border-border bg-surface-sunken px-3.5 py-3"
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-text-subtle" />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        <p className="text-base leading-relaxed text-text-muted">
          {fault.line}
        </p>
        {fault.kind === "auth" && (
          <Link
            href={SIGN_IN_PATH}
            className={buttonVariants({ size: "sm", variant: "secondary" })}
          >
            Sign in again
          </Link>
        )}
      </div>
    </div>
  );
}
