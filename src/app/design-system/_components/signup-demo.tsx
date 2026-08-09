"use client";

import * as React from "react";
import {
  AuthDivider,
  Badge,
  Button,
  CraigLockup,
  Field,
  GoogleButton,
  Input,
  PasswordInput,
} from "@/components/ui";

/**
 * The split sign-up, at a size that fits in a specimen frame.
 *
 * Reproduced rather than imported: /sign-up owns a full <main> with a
 * min-h-screen grid and its own router push, none of which belongs inside a
 * documentation page. What is copied is the part being documented — the two
 * panels, and the inference.
 */

/* Mirrors PUBLIC_DOMAINS in src/app/sign-up/page.tsx. A gmail address says
   nothing about where somebody works, so there is nothing to infer from it. */
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

const TRY = ["theo@calderdx.com", "ada@katalis.ai", "theo@gmail.com"];

export function SignUpDemo() {
  const [email, setEmail] = React.useState("");
  const [company, setCompany] = React.useState("");
  /* Set once the inferred name has been shown, so typing in the field stops it
     being overwritten on the next keystroke. */
  const [touched, setTouched] = React.useState(false);

  const inferred = companyFromEmail(email);
  const companyValue = touched ? company : inferred;

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-subtle">Try:</span>
        {TRY.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTouched(false);
              setEmail(t);
            }}
            className="rounded-sm border border-border bg-surface-sunken px-1.5 py-0.5 font-mono text-2xs text-text-muted transition-colors hover:border-border-strong hover:text-text"
          >
            {t}
          </button>
        ))}
        <span className="text-xs text-text-subtle">
          — the third one infers nothing, on purpose.
        </span>
      </div>

      <div className="grid overflow-hidden rounded-lg border border-border lg:grid-cols-[24rem_1fr]">
        <div className="flex flex-col gap-5 bg-surface px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <CraigLockup className="text-base" />
            <Badge size="sm">/sign-up</Badge>
          </div>

          <div>
            <GoogleButton />
            <AuthDivider label="or use your work email" />

            {/* Left-aligned, and no wider than the form needs. A centred column
                of labels makes the eye travel further down a form than it has
                to. */}
            <div className="flex flex-col gap-3.5">
              <Field label="Your name">
                <Input placeholder="Theo Calder" autoComplete="off" />
              </Field>

              <Field label="Work email">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="off"
                />
              </Field>

              <Field
                label="Company"
                hint={
                  inferred && !touched
                    ? "Worked out from your email — change it if that's not right."
                    : undefined
                }
              >
                <Input
                  value={companyValue}
                  onChange={(e) => {
                    setTouched(true);
                    setCompany(e.target.value);
                  }}
                  placeholder="Calder Diagnostics"
                  autoComplete="off"
                />
              </Field>

              <Field label="Password" hint="At least 12 characters.">
                <PasswordInput
                  placeholder="••••••••••••"
                  autoComplete="new-password"
                />
              </Field>

              <Button size="lg" className="w-full">
                Create account
              </Button>
            </div>
          </div>
        </div>

        {/* The same dot grid the workflow canvas uses — this is where sign-up
            ends up. Hidden below lg, exactly as the real page hides it. */}
        <aside
          className="hidden items-center justify-center border-l border-border bg-canvas px-10 lg:flex"
          style={{
            backgroundImage:
              "radial-gradient(circle, var(--color-border-strong) 1.25px, transparent 1.25px)",
            backgroundSize: "56px 56px",
          }}
        >
          <p className="max-w-[16rem] text-2xl font-semibold leading-tight tracking-[-0.03em]">
            Onboard at the speed of Craig.
          </p>
        </aside>
      </div>
    </div>
  );
}
