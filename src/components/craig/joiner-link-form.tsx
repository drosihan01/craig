"use client";

import * as React from "react";
import { Button, Callout, Field, Input } from "@/components/ui";

/**
 * One field, for somebody who has lost their link.
 *
 * The shape is the sign-in form's, because it is the same act — proving you are
 * you, from a screen that knows nothing about you yet — and a person who has
 * seen one of these should not have to work out that this is another. What it
 * drops is everything a joiner does not have: no password, because they never
 * chose one; no "create an account", because they are not getting one; no link
 * to sign in as an admin, because they are not one and offering it is how
 * somebody ends up on a password screen they can never satisfy.
 *
 * **The success message is the same whether or not that address has an
 * invitation.** The route is built that way — see `api/joiner/link` — and this
 * side has to match it or the guarantee is worthless: a form that reset itself
 * on a hit and kept the value on a miss would leak exactly what the route
 * refuses to say. So there is one reply, rendered from what the server sent
 * rather than composed here, and the field is left alone in both cases.
 *
 * Once sent, the form goes away and the sentence stays. Somebody who submits
 * and then sees the same button is somebody who presses it again — and the only
 * thing a second press can produce is a second email or a rate limit, neither
 * of which is what they wanted. What they want is to go and look at their inbox,
 * and the screen should get out of the way and let them.
 */
export function JoinerLinkForm() {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState<string | null>(null);
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setRefusal(null);

    try {
      const response = await fetch("/api/joiner/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };

      if (payload.ok) {
        /* The server's sentence, not one written here. Two copies of a promise
           this careful is two chances for one of them to start claiming
           something about the address. */
        setSent(
          payload.message ??
            "If that address has an invitation, a new link is on its way.",
        );
        return;
      }

      /* Only the two refusals that are about the request rather than about what
         we hold: a malformed address, and asking too often. Both are safe to
         say and both are things the reader can act on. */
      setRefusal(
        payload.error ?? "That didn't work. Try again in a moment.",
      );
    } catch {
      setRefusal(
        "We couldn't reach the server. Nothing was sent — try again in a moment.",
      );
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <Callout tone="success" title="Check your email">
        {sent}
      </Callout>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Field
        label="Your email address"
        hint="The one your invitation was sent to."
      >
        <Input
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
      </Field>

      {refusal && <Callout tone="warning">{refusal}</Callout>}

      <Button type="submit" size="lg" loading={pending} className="w-full">
        Send me a new link
      </Button>
    </form>
  );
}
