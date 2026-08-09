"use client";

import * as React from "react";

/**
 * Pressing the money button, written once for the two screens that offer it.
 *
 * People and the workflow editor both open the same paywall, so they both need
 * the same three-step dance: ask the server for a Checkout Session, leave for
 * Stripe, and say something useful if that fails. Two copies of it would be two
 * chances for one screen to handle a decline differently from the other, and
 * the screen that got it wrong would be the one nobody tested.
 *
 * The navigation is a full page assignment rather than a router push, on
 * purpose. Stripe's checkout is not part of this app and must not be treated as
 * though it were — it is a different origin, it owns the back button while it
 * is up, and `router.push` cannot go there at all.
 */

export interface Upgrade {
  /** Start a checkout and leave for it. */
  start: () => void;
  /** Open Stripe's portal for an account that already has a plan. */
  manage: () => void;
  /**
   * True from the press until the browser leaves, and never reset on success.
   *
   * The redirect takes a moment, and a button that re-enables itself during it
   * invites a second press — which is a second Checkout Session, and on a bad
   * day a second subscription. Staying disabled until the page is gone is the
   * cheapest way to make that impossible.
   */
  pending: boolean;
  /** Safe to show, already worded for the person reading it. */
  error: string | null;
}

/** Same shape from both routes, so one reader does for both. */
async function ask(path: string): Promise<
  | { ok: true; url: string }
  | { ok: false; status: number; error: string; manage: boolean }
> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  } catch {
    /* The network, not the payment. Worth telling apart from a decline: one is
       "try again", the other is "try a different card". */
    return {
      ok: false,
      status: 0,
      error: "Couldn't reach the server. Check your connection and try again.",
      manage: false,
    };
  }

  const body = (await response.json().catch(() => null)) as {
    url?: unknown;
    error?: unknown;
    manage?: unknown;
  } | null;

  if (response.ok && typeof body?.url === "string" && body.url) {
    return { ok: true, url: body.url };
  }

  return {
    ok: false,
    status: response.status,
    error:
      typeof body?.error === "string" && body.error
        ? body.error
        : "Something went wrong. Try again in a moment.",
    manage: body?.manage === true,
  };
}

export function useUpgrade(): Upgrade {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /* Guards the whole sequence, not just the button's disabled attribute. A
     keyboard repeat or a double click can fire twice before React has
     re-rendered, and the second one would create a second Checkout Session
     against the same account. */
  const runningRef = React.useRef(false);

  const go = React.useCallback(async (path: string) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setPending(true);
    setError(null);

    const result = await ask(path);

    if (result.ok) {
      /* Deliberately leaves `pending` true and the guard closed. This tab is
         on its way to Stripe; there is no state worth restoring. */
      window.location.assign(result.url);
      return;
    }

    /* Already paying, so the button was the wrong offer rather than a failed
       one. Send them where they can actually change what they have, instead of
       reporting a conflict they did nothing to cause. */
    if (result.manage) {
      const portal = await ask("/api/showcase/billing/portal");
      if (portal.ok) {
        window.location.assign(portal.url);
        return;
      }
    }

    setError(result.error);
    setPending(false);
    runningRef.current = false;
  }, []);

  const start = React.useCallback(() => {
    void go("/api/showcase/billing/checkout");
  }, [go]);

  const manage = React.useCallback(() => {
    void go("/api/showcase/billing/portal");
  }, [go]);

  return { start, manage, pending, error };
}
