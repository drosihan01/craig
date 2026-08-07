"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AuthDivider,
  AuthShell,
  Button,
  Field,
  GoogleButton,
  Input,
  ContinueAs,
  PasswordInput,
} from "@/components/ui";
import { PEOPLE } from "@/lib/demo";

/**
 * Front-end only. Validation is real; authentication is not — there is no
 * backend, so "signing in" here just routes to the admin home. That's fine for
 * a demo and unacceptable for anything else: the route it lands on must be
 * guarded server-side before this ships, or it's a login page that lets anyone
 * in by clicking a button.
 */
export default function SignInPage() {
  const router = useRouter();
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

    // No credential check — see the note above.
    setPending(true);
    window.setTimeout(() => router.push("/"), 500);
  }

  return (
    <AuthShell
      title="Sign in to Craig"
      footer={
        <>
          New here?{" "}
          <Link
            href="/sign-up"
            className="text-accent underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      {returning ? (
        <>
          <ContinueAs
            account={{
              name: PEOPLE.ada.name,
              email: PEOPLE.ada.email,
              method: "google",
            }}
            onContinue={() => router.push("/")}
            onUseAnother={() => setReturning(false)}
          />
          <AuthDivider label="or sign in another way" />
        </>
      ) : (
        <>
          <GoogleButton onClick={() => router.push("/")} />
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
    </AuthShell>
  );
}
