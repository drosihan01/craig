"use client";

import * as React from "react";
import {
  AuthDivider,
  AuthShell,
  Button,
  Field,
  GoogleButton,
  Input,
  Callout,
  ContinueAs,
  PasswordInput,
} from "@/components/ui";
import { Warning } from "@/components/ui/icons";

/**
 * Front-end only. Submitting validates shape and stops — there's no auth
 * backend yet, and pretending otherwise in the client would be worse than
 * doing nothing.
 */
export default function SignInPage() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [errors, setErrors] = React.useState<{
    email?: string;
    password?: string;
  }>({});
  const [pending, setPending] = React.useState(false);
  /* Whether this device has seen someone sign in before. Hard-coded here —
     in the real thing it comes from a client-side hint, never from anything
     treated as proof of identity. */
  const [returning, setReturning] = React.useState(true);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!email.trim()) next.email = "Enter your work email";
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      next.email = "That doesn't look like an email address";
    if (!password) next.password = "Enter your password";

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setPending(true);
    window.setTimeout(() => setPending(false), 900);
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Onboarding workflows for your team"
      footer={
        <>
          <a
            href="/design-system"
            className="text-accent underline-offset-4 hover:underline"
          >
            ← Back to design system
          </a>
          <br />
          <br />
          Trouble signing in?{" "}
          <a href="#" className="text-accent underline-offset-4 hover:underline">
            Contact People &amp; Culture
          </a>
        </>
      }
    >
      {returning ? (
        <>
          <ContinueAs
            account={{
              name: "Dzaky Rosihan",
              email: "dzaky.rosihan@kmart.com.au",
              method: "google",
            }}
            onUseAnother={() => setReturning(false)}
          />
          <AuthDivider label="or sign in another way" />
        </>
      ) : (
        <>
          <GoogleButton />
          <AuthDivider label="or continue with email" />
        </>
      )}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Work email" error={errors.email}>
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Password" error={errors.password}>
          <PasswordInput
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <div className="flex items-center justify-between">
          <a
            href="#"
            className="text-sm text-text-muted underline-offset-4 hover:text-text hover:underline"
          >
            Forgot password?
          </a>
        </div>

        <Button type="submit" size="lg" loading={pending} className="w-full">
          Sign in
        </Button>
      </form>

      <Callout tone="neutral" icon={<Warning />} className="mt-5 text-xs">
        Front-end only — there&apos;s no auth backend wired up yet.
      </Callout>
    </AuthShell>
  );
}
