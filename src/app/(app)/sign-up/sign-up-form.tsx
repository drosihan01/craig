"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Callout, Field, Input, PasswordInput } from "@/components/ui";
import { SIGN_IN_PATH } from "@/lib/craig/contract";
import {
  companyFromEmail,
  validateSignUp,
  type SignUpErrors,
} from "@/lib/craig/sign-up";

/**
 * Four fields, and one of them is a suggestion.
 *
 * A signup form is the first thing a product ever asks of someone and every
 * field is a chance to close the tab, so this asks for the minimum that makes
 * the next screen useful and works the rest out. The company is read off the
 * email domain and shown back, editable — inference you can't see is
 * indistinguishable from a mistake, and this one is a guess rather than a fact.
 *
 * Everything starts empty. Whatever gets typed here is the account: the name
 * becomes who the product calls you, the email becomes the credential, and the
 * company becomes the company. None of it is decided in advance.
 */
export function SignUpForm({ next }: { next: string }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [company, setCompany] = React.useState("");
  /* Set once the inferred name has been shown, so typing in the field stops it
     being overwritten on the next keystroke. */
  const [companyTouched, setCompanyTouched] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [errors, setErrors] = React.useState<SignUpErrors>({});
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const inferred = companyFromEmail(email);
  const companyValue = companyTouched ? company : inferred;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setRefusal(null);

    const fields = { name, email, company: companyValue, password };
    const found = validateSignUp(fields);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    try {
      const response = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });

      if (response.ok) {
        /* Already signed in — the route set the cookie on that response.
           `refresh` as well as `push` because the router may hold a payload for
           the destination rendered back when there was no account at all. Left
           pending through the navigation rather than flicking back to an
           enabled button for the frame before this unmounts. */
        router.push(next);
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => null)) as {
        error?: string;
        errors?: SignUpErrors;
      } | null;

      // 422 means the two rulesets disagreed, which shouldn't happen — show what
      // the server said rather than what this file thought.
      if (body?.errors) setErrors(body.errors);
      else
        setRefusal(
          body?.error ?? "Something went wrong. Try again in a moment.",
        );
      setPending(false);
    } catch {
      setRefusal("Couldn't reach the server. Check your connection and retry.");
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
      <Field label="Your name" error={errors.name}>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoComplete="name"
          disabled={pending}
        />
      </Field>

      <Field label="Work email" error={errors.email}>
        <Input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            /* The only refusal this form produces is "that email is taken", so
               changing the email is what makes retrying worth doing. Cleared in
               the handler rather than an effect. */
            setRefusal(null);
          }}
          placeholder="you@company.com"
          autoComplete="email"
          disabled={pending}
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
          placeholder="Where you work"
          autoComplete="organization"
          disabled={pending}
        />
      </Field>

      <Field
        label="Password"
        error={errors.password}
        hint="At least 12 characters."
      >
        <PasswordInput
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••••••"
          autoComplete="new-password"
          disabled={pending}
        />
      </Field>

      {refusal && (
        <Callout tone="warning" role="alert">
          <div className="flex flex-col items-start gap-2.5">
            <p>{refusal}</p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => router.push(SIGN_IN_PATH)}
            >
              Go to sign in
            </Button>
          </div>
        </Callout>
      )}

      <Button type="submit" size="lg" loading={pending} className="w-full">
        Create account
      </Button>
    </form>
  );
}
