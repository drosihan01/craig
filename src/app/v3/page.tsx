"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AuthDivider,
  Button,
  CraigLockup,
  Field,
  GoogleButton,
  Input,
  PasswordInput,
  ThemeToggle,
} from "@/components/ui";
import { V3_COMPANY, V3_FOUNDER } from "@/lib/v3/company";
import { resetV3, setScene } from "@/lib/v3/store";

/**
 * Scene one — Theo makes an account.
 *
 * The same shape as the real sign-up page, pre-filled. A demo that makes you
 * type an email before it shows you anything has spent its first ten seconds
 * on the least interesting screen in the product.
 *
 * Resetting on mount is deliberate: arriving here is how you start the demo
 * over, so it should be the same state every time regardless of how far the
 * last run got.
 */
export default function V3SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState<string>(V3_FOUNDER.email);
  const [company, setCompany] = React.useState<string>(V3_COMPANY.name);

  function start() {
    resetV3();
    setScene("setup");
    router.push("/v3/setup");
  }

  return (
    <div className="flex min-h-screen">
      <div className="flex w-full flex-col px-6 py-8 lg:w-[46%] lg:px-14">
        <div className="flex items-center justify-between">
          <CraigLockup />
          <ThemeToggle />
        </div>

        <div className="flex flex-1 flex-col justify-center py-10">
          <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold tracking-[-0.02em]">
                Create your account
              </h1>
              <p className="text-md text-text-muted">
                Craig needs about five minutes and whatever you already have
                written down.
              </p>
            </div>

            <GoogleButton label="Continue with Google" />
            <AuthDivider label="or" />

            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                start();
              }}
            >
              <Field label="Work email">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </Field>

              {/* Read off the domain rather than asked for. Craig can parse
                  "theo@calderdx.com" as well as Theo can, and asking him to
                  type the company name straight after typing it is asking him
                  to prove something we already know. Shown, and editable —
                  inference you can't see is indistinguishable from a mistake. */}
              <Field label="Company" hint="Taken from your email domain">
                <Input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </Field>

              <Field label="Password">
                <PasswordInput value="calder-demo" onChange={() => {}} />
              </Field>

              <Button type="submit" className="w-full" data-v3-signup>
                Create account
              </Button>
            </form>
          </div>
        </div>
      </div>

      <div className="hidden flex-1 flex-col justify-center border-l border-border bg-surface-sunken px-14 lg:flex">
        <div className="flex max-w-md flex-col gap-4">
          <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
            Demo v3
          </p>
          <p className="text-2xl font-semibold leading-snug tracking-[-0.02em]">
            {V3_COMPANY.name} has nine people, a quality system built for four
            hundred, and an audit in March.
          </p>
          <p className="text-md leading-relaxed text-text-muted">
            {V3_COMPANY.pitch}
          </p>
          <p className="text-sm leading-relaxed text-text-subtle">
            Press play, bottom right, to watch the whole thing run — or click
            through it yourself.
          </p>
        </div>
      </div>
    </div>
  );
}
