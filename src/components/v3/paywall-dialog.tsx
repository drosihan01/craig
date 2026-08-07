"use client";

import { Button, Dialog, Separator } from "@/components/ui";
import { V3_NEXT_STARTER, V3_STARTER } from "@/lib/v3/company";

/**
 * The one place Craig asks for money, and the demo's only sales moment.
 *
 * It sits at the point it should: Theo has watched the thing work end to end
 * and is trying to do it again. So the copy's whole job is to be accurate —
 * what the money buys, and what he keeps if he says no. A paywall that hides
 * the second half is the reason people distrust the first, and Craig telling
 * Theo his existing records stay readable costs nothing and is true.
 */

const HIM = V3_NEXT_STARTER.name.split(" ")[0];
const HER = V3_STARTER.name.split(" ")[0];

export function PaywallDialog({
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
      title="You're out of seats"
      description={`${V3_NEXT_STARTER.name} would be your second, and the free plan is one.`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Not now
          </Button>
          <Button size="sm" onClick={onClose}>
            Upgrade — $49/month
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 px-5 py-5">
        <p className="text-base leading-relaxed text-text-muted">
          {HER} has your free seat. Nothing has gone wrong — you&apos;ve just
          run out of room, and {HIM} needs one of his own before I can start him
          as a {V3_NEXT_STARTER.role.toLowerCase()}.
        </p>

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-sunken p-3.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tracking-[-0.02em]">
              $49
            </span>
            <span className="text-sm text-text-muted">a month</span>
          </div>
          <p className="text-sm leading-relaxed text-text-muted">
            Five seats plus your own admin account, which doesn&apos;t count
            against them. That&apos;s {HIM} and four people after him, at the
            same price.
          </p>

          <Separator />

          {/* The half a paywall usually leaves out. He is nine people in a
              regulated shop — "what happens to the record I already have" is
              the first thing he'll want to know, and answering it before he
              asks is the difference between a price and a threat. */}
          <div className="flex flex-col gap-1.5">
            <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
              If you don&apos;t
            </p>
            <p className="text-sm leading-relaxed text-text-muted">
              {HER}&apos;s onboarding stays exactly as it is. Her training
              record, the sign-offs and the dates are all still yours to read,
              export and put in front of an auditor — I don&apos;t lock records
              behind a plan. The workflow stays written too. I just can&apos;t
              run it against anybody new.
            </p>
          </div>
        </div>

        <p className="text-base leading-relaxed text-text-muted">
          {HIM} is {V3_NEXT_STARTER.startsIn} away, so this doesn&apos;t have to
          be today. It takes about a minute whenever you want it.
        </p>
      </div>
    </Dialog>
  );
}
