"use client";

import Link from "next/link";
import { Button, buttonVariants, Dialog, Separator } from "@/components/ui";
import { CheckCircle } from "@/components/ui/icons";
import { V3_STARTER } from "@/lib/v3/company";
import { V3_RUN_STEPS } from "@/lib/v3/run";

/**
 * Priya has finished, and Theo is being told so.
 *
 * The obvious version of this screen is confetti and an exclamation mark, and
 * it would land wrong here. Theo never wanted a pleasant first week for its own
 * sake — he wanted a training record he can hand an auditor in March without
 * apologising for it. So the modal is the two dates a finding would have been
 * written against, and nothing else. Praise he didn't ask for reads as
 * flattery; a signed record inside the deadline reads as the thing working.
 */

const HER = V3_STARTER.name.split(" ")[0];

export function CelebrateDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${HER} is onboarded`}
      description={`All ${V3_RUN_STEPS.length} steps closed, and the record is signed.`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          {/* The record is the reward, so the primary action is going and
              looking at it rather than dismissing a nice message. */}
          <Link
            href={`/v3/people/${V3_STARTER.id}`}
            onClick={onClose}
            className={buttonVariants({ size: "sm" })}
          >
            See her record
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-4 px-5 py-5">
        <p className="text-base leading-relaxed text-text-muted">
          {HER} is through everything and she&apos;s part of the team — but the
          part worth telling you about is that the paperwork behind her is
          right.
        </p>

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-sunken p-3.5">
          <Fact
            title="Training record"
            body={`${HER} signed it and you approved it four working days after she started. SOP-014 §5.2 allows five.`}
          />
          <Separator />
          <Fact
            title="National Police Check"
            body="Came back clear in 9 business days. It went out the day she got her seat, so unsupervised lab access opened on the day §4.1 allows it rather than a fortnight later."
          />
        </div>

        <p className="text-base leading-relaxed text-text-muted">
          That&apos;s the whole file for March — signed, dated, and in one
          place. Nothing to reconstruct from a Slack thread.
        </p>
      </div>
    </Dialog>
  );
}

function Fact({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex gap-2.5">
      <CheckCircle className="mt-0.5 size-4 shrink-0 text-success" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-base font-medium">{title}</p>
        <p className="text-sm leading-relaxed text-text-muted">{body}</p>
      </div>
    </div>
  );
}
