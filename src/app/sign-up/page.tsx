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
  PasswordInput,
} from "@/components/ui";

/**
 * Creating an account.
 *
 * Three fields, and one of them is inferred. A signup form is the first thing
 * a product ever asks of someone, and every field is a chance for them to
 * close the tab — so this asks for the minimum that lets the next screen be
 * useful, and works the rest out.
 *
 * The company name comes from the email domain. Craig can read "ada@katalis.ai"
 * as well as Ada can, and asking her to type "Katalis" straight after typing
 * "@katalis.ai" is asking her to prove something we already know. It's shown
 * back, editable, rather than assumed silently — inference you can't see is
 * indistinguishable from a mistake.
 *
 * Front-end only. The validation is real; the account isn't. There is no
 * backend, so this routes to /welcome and nothing is created. Before this
 * ships, the route it lands on has to be guarded server-side, or it's a signup
 * page that lets anyone in by clicking a button.
 */

/* Domains that say nothing about where someone works. */
const PUBLIC_DOMAINS = new Set([
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "proton.me",
]);

function companyFromEmail(email: string) {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain || PUBLIC_DOMAINS.has(domain)) return "";
  const name = domain.split(".")[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [company, setCompany] = React.useState("");
  /* Set once the inferred name has been shown, so typing in the field stops
     it being overwritten on the next keystroke. */
  const [companyTouched, setCompanyTouched] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);

  const inferred = companyFromEmail(email);
  const companyValue = companyTouched ? company : inferred;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};

    if (!name.trim()) next.name = "Enter your name";
    if (!email.trim()) next.email = "Enter your work email";
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      next.email = "That doesn't look like an email address";
    else if (PUBLIC_DOMAINS.has(email.split("@")[1]?.toLowerCase() ?? ""))
      next.email = "Use your work email — Craig sends mail as your company";
    if (!companyValue.trim()) next.company = "What's the company called?";
    if (password.length < 12) next.password = "At least 12 characters";

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setPending(true);
    window.setTimeout(() => router.push("/welcome"), 500);
  }

  return (
    <AuthShell
      title="Start with Craig"
      subtitle="Onboarding that runs itself. Free until you hire someone."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="text-accent underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <GoogleButton onClick={() => router.push("/welcome")} />
      <AuthDivider label="or use your work email" />

      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <Field label="Your name" error={errors.name}>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ada Yıldız"
            autoComplete="name"
          />
        </Field>

        <Field
          label="Work email"
          error={errors.email}
          hint="Craig sends mail on behalf of your company, so it can't be a personal address."
        >
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
          />
        </Field>

        <Field
          label="Company"
          error={errors.company}
          hint={
            inferred && !companyTouched
              ? "Worked out from your email — change it if that's not right."
              : undefined
          }
        >
          <Input
            value={companyValue}
            onChange={(e) => {
              setCompanyTouched(true);
              setCompany(e.target.value);
            }}
            placeholder="Katalis"
            autoComplete="organization"
          />
        </Field>

        <Field label="Password" error={errors.password} hint="At least 12 characters.">
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            autoComplete="new-password"
          />
        </Field>

        <Button size="lg" className="w-full" disabled={pending}>
          {pending ? "Setting things up…" : "Create account"}
        </Button>

        <p className="text-center text-xs leading-relaxed text-text-subtle">
          No card needed. Craig is free until you onboard your first person.
        </p>
      </form>
    </AuthShell>
  );
}
