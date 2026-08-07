"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AuthDivider,
  AuthShell,
  Avatar,
  Button,
  Field,
  GoogleButton,
  PasswordInput,
} from "@/components/ui";
import { COMPANY, NEW_HIRE, PEOPLE } from "@/lib/demo";

/**
 * Claiming a seat.
 *
 * The seam between Ada adding someone and that person having an account, and
 * the thing it's designed around is that **there is no signup form**. Ada
 * provisioned the account when she added the seat; Nils doesn't type his name,
 * his email or his company, because Craig already knows all three and asking
 * again would be asking him to prove something we told him.
 *
 * He does get a real account, though, and that isn't a detail. He's about to
 * hand over bank details, tax details and a residence permit — that belongs
 * behind a session, not behind a link that anyone with access to his inbox can
 * replay. He's also a Katalis person from today, not a visitor: in six months
 * he'll be the one who owns a step for the next hire.
 *
 * So: one decision on this page, and it's how he wants to sign in.
 */
export default function ClaimSeatPage() {
  const router = useRouter();
  const [password, setPassword] = React.useState("");

  return (
    <AuthShell
      title={`${COMPANY.name} is expecting you`}
      subtitle={
        <>
          {PEOPLE.ada.name} added you as {NEW_HIRE.role.toLowerCase()}. Pick how
          you want to sign in and you&apos;re done.
        </>
      }
      footer={
        <>
          Not {NEW_HIRE.name.split(" ")[0]}?{" "}
          <a
            href="mailto:ada@katalis.ai"
            className="text-accent underline-offset-4 hover:underline"
          >
            Tell Ada
          </a>
        </>
      }
    >
      {/* His identity is shown, not asked for. Everything on this card came
          from the seat Ada created. */}
      <div className="mb-5 flex items-center gap-3 rounded-lg border border-border bg-surface-sunken p-3">
        <Avatar name={NEW_HIRE.name} size="md" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-base font-medium">
            {NEW_HIRE.name}
          </span>
          <span className="truncate text-sm text-text-subtle">
            {NEW_HIRE.email}
          </span>
        </div>
      </div>

      <GoogleButton onClick={() => router.push("/onboarding")} />
      <AuthDivider label="or set a password" />

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          router.push("/onboarding");
        }}
      >
        <Field label="Password" hint="At least 12 characters.">
          <PasswordInput
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
          />
        </Field>
        <Button size="lg" className="w-full" disabled={password.length < 12}>
          Set password and continue
        </Button>
      </form>
    </AuthShell>
  );
}
