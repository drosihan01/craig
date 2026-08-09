"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, PasswordInput } from "@/components/ui";

/**
 * The form half of the sign-in screen.
 *
 * Split out from the page so the page can stay a server component and read
 * `?next=` from its props. The alternative — a client page calling
 * `useSearchParams` — makes the whole route client-rendered to get one string.
 *
 * Nothing here decides anything. It collects two fields, POSTs them, and does
 * what the server says. The session is set by `Set-Cookie` on that response and
 * is `httpOnly`, so this component cannot read it, which is the point.
 */
export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(
          (body as { error?: string } | null)?.error ??
            "Something went wrong. Try again.",
        );
        setPending(false);
        return;
      }

      /* `refresh` as well as `push`: the router may hold a cached payload for
         this route from the redirect that sent us here, rendered without a
         session. Navigating alone can land on that stale copy. */
      router.push(next);
      router.refresh();
      // Left pending on purpose — the button stays disabled through navigation
      // rather than flicking back to "Sign in" for the frame before it unmounts.
    } catch {
      setError("Couldn't reach the server. Check your connection and retry.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Field label="Work email">
        <Input
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending}
        />
      </Field>

      <Field label="Password">
        <PasswordInput
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending}
        />
      </Field>

      {/* Form-level, not per-field. The server won't say which of the two was
          wrong, so pinning the message to one input would be inventing an
          answer it deliberately declined to give. */}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" loading={pending} className="w-full">
        Sign in
      </Button>
    </form>
  );
}
