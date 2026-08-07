"use client";

import * as React from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  buttonVariants,
  Dialog,
  Field,
  Input,
  SelectMenu,
  Separator,
} from "@/components/ui";
import { Mail, Warning } from "@/components/ui/icons";
import { WORKFLOWS, stepCount } from "@/lib/demo-workflow";
import { assignable, consequences, type Onboarding } from "@/lib/onboarding";
import { COMPANY } from "@/lib/demo";

/**
 * Add a seat, and a workflow starts running against it.
 *
 * This is the product's actual loop, so it's one short form rather than a
 * wizard. Name, email, when they start, which workflow — an admin has all four
 * in their head already, and asking for them across three screens is how a
 * two-minute job becomes a task somebody puts off.
 *
 * The consequences panel is the point of the dialog. Pressing this sends real
 * mail to a real person under the company's name, and "are you sure?" is a
 * worse question than "here is exactly what happens". It updates live as the
 * workflow changes, so the choice and its effect are never a screen apart.
 */

const START_OPTIONS = [
  { id: "Monday", label: "Next Monday" },
  { id: "in 2 weeks", label: "In two weeks" },
  { id: "in a month", label: "In a month" },
  { id: "not set yet", label: "Not decided yet" },
];

export function AddSeat({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (seat: Onboarding) => void;
}) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState("");
  const [startsIn, setStartsIn] = React.useState(START_OPTIONS[1].id);
  const [workflowId, setWorkflowId] = React.useState(WORKFLOWS[0].id);

  const check = assignable(workflowId);
  const effect = consequences(workflowId);
  const ready = name.trim() !== "" && email.trim() !== "" && check.ok;

  function reset() {
    setName("");
    setEmail("");
    setRole("");
    setStartsIn(START_OPTIONS[1].id);
    setWorkflowId(WORKFLOWS[0].id);
  }

  function close() {
    reset();
    onClose();
  }

  function submit() {
    if (!ready) return;
    onAdd({
      id: crypto.randomUUID(),
      name: name.trim(),
      email: email.trim(),
      role: role.trim() || "Not set",
      startsIn,
      workflowId,
      done: 0,
      state: "invited",
    });
    close();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      title="Add someone"
      description={`They get a seat at ${COMPANY.name}, and the workflow you pick starts running against it.`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button size="sm" disabled={!ready} onClick={submit}>
            Add and start
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 px-5 py-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nils Hoffman"
            />
          </Field>
          <Field label="Work email" hint="Where the first email goes.">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nils@katalis.ai"
            />
          </Field>
          <Field label="Role" hint="Shown to whoever owns a step.">
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Engineer"
            />
          </Field>
          <Field label="Starts">
            <SelectMenu
              label="Starts"
              value={startsIn}
              onChange={setStartsIn}
              options={START_OPTIONS}
            />
          </Field>
        </div>

        {/* Labelled with the company rather than "Workflow". Ada doesn't think
            of it as picking a workflow, she thinks of it as putting somebody
            through Katalis's onboarding. */}
        <Field
          label={`${COMPANY.name} onboarding`}
          hint="One per kind of hire. This is what actually runs."
        >
          <SelectMenu
            label={`${COMPANY.name} onboarding`}
            value={workflowId}
            onChange={setWorkflowId}
            options={WORKFLOWS.map((w) => ({
              id: w.id,
              label: w.name,
              description: `${stepCount(w.blocks)} steps`,
            }))}
          />
        </Field>

        <Separator />

        {check.ok ? (
          <div className="flex flex-col gap-2.5">
            <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
              What happens when you press it
            </p>

            <div className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-sunken p-3">
              <Mail className="mt-0.5 size-4 shrink-0 text-text-subtle" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-base">
                  <span className="font-medium">
                    {effect.immediate?.name ?? "One email"}
                  </span>{" "}
                  <span className="text-text-muted">
                    goes to {email.trim() || "them"} straight away.
                  </span>
                </p>
                <p className="text-sm text-text-muted">
                  {effect.steps} steps then run in order. {effect.toOthers}{" "}
                  {effect.toOthers === 1 ? "person" : "people"} get told about
                  the steps that fall to them, when those steps come up — not
                  all at once now.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* A workflow that can't run is a workflow that can't be assigned.
             Saying so here beats letting someone add a seat and then wondering
             for a week why nothing happened — and the way out is a button, not
             an instruction to go and find the builder. */
          <div className="flex items-start gap-2.5 rounded-lg bg-warning-subtle p-3 text-warning">
            <Warning className="mt-0.5 size-4 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
              <div className="flex flex-col gap-0.5">
                <p className="text-base font-medium">
                  This one can&apos;t run yet
                </p>
                <p className="text-sm opacity-90">
                  {check.reason}. Nothing else here changes while you fix it.
                </p>
              </div>
              <Link
                href={`/builder/${workflowId}`}
                className={buttonVariants({ size: "sm", variant: "secondary" })}
              >
                Finish the workflow
              </Link>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** The state chip for a row in the onboarding list. */
export function SeatState({ state }: { state: Onboarding["state"] }) {
  if (state === "blocked") {
    return (
      <Badge tone="warning" size="sm">
        <Warning />
        Blocked
      </Badge>
    );
  }
  return (
    <Badge tone={state === "running" ? "info" : "neutral"} size="sm">
      {state === "running" ? "In progress" : "Invited"}
    </Badge>
  );
}
