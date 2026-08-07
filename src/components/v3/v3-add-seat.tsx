"use client";

import * as React from "react";
import { Button, Dialog, Field, Input, Select } from "@/components/ui";
import { V3_STARTER } from "@/lib/v3/company";
import { V3_WORKFLOW } from "@/lib/v3/workflow";
import { inviteStarter } from "@/lib/v3/store";

/**
 * Scene five — giving Priya a seat.
 *
 * Four fields, and the personal address is the one that matters. Everything
 * after her contract is addressed to priya@calderdx.com, but that account
 * doesn't exist yet and won't until she's signed — so the first email has to
 * go somewhere she can actually read it. Getting this wrong sends the contract
 * to a mailbox that is created by signing the contract.
 *
 * Pre-filled because this is a demo, and because the interesting thing here is
 * what happens the second you press the button, not the typing.
 */
export function V3AddSeat({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
}) {
  const [sending, setSending] = React.useState(false);
  const timerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function invite() {
    if (sending) return;
    setSending(true);
    timerRef.current = window.setTimeout(() => {
      inviteStarter();
      setSending(false);
      onInvited();
    }, 1000);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a person"
      description="They get an email from Craig, and the workflow starts against them."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={invite} loading={sending} data-v3-send>
            {sending ? "Sending" : "Send invite"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name">
          <Input defaultValue={V3_STARTER.name} />
        </Field>

        <Field
          label="Personal email"
          hint="Her work account doesn't exist yet — signing the contract is what creates it"
        >
          <Input defaultValue={V3_STARTER.personalEmail} />
        </Field>

        <Field label="Role">
          <Input defaultValue={V3_STARTER.role} />
        </Field>

        <Field label="Workflow">
          <Select defaultValue={V3_WORKFLOW.id}>
            <option value={V3_WORKFLOW.id}>{V3_WORKFLOW.name}</option>
          </Select>
        </Field>

        <Field label="Start date">
          <Input defaultValue={V3_STARTER.startDate} />
        </Field>
      </div>
    </Dialog>
  );
}
