"use client";

import { Button, Dialog, Separator } from "@/components/ui";

/**
 * The one place this product asks for money.
 *
 * It sits where it should: somebody has already added a person, watched a
 * workflow start against them, and is coming back to do it again. Nothing has
 * been taken away from them and nothing has gone wrong — they have simply run
 * out of room — so the dialog's whole job is to be accurate about two things:
 * what the money buys, and what they keep if they say no.
 *
 * The price is the largest thing in it. A paywall that makes you hunt for the
 * number is a paywall that has decided the number is bad news, and $49 for five
 * seats is not bad news for a company hiring its second person. Saying it plainly
 * and immediately is worth more than any amount of framing around it.
 *
 * The half most paywalls leave out is the panel at the bottom. "What happens to
 * the person I already added" is the first thing anybody wants to know, and
 * answering it before they ask is the difference between a price and a threat.
 */

/**
 * How many people the free plan can add, not counting whoever holds the account.
 *
 * Here rather than on the page that enforces it, because the number and the
 * screen that explains the number are the same fact — a limit raised in one
 * place and described in the other is a dialog that argues with the button that
 * opened it.
 */
export const FREE_SEATS = 1;

/** What the paid plan is, said once so the price and the promise can't drift. */
const PRICE = "$49";
const PAID_SEATS = 5;

export function SeatPaywall({
  open,
  onClose,
  holder,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * Whoever is using the free seat, if the page knows.
   *
   * Named where it can be, because "Priya has your free seat" is a fact about
   * this account and "you have used your seat" is a fact about accounts in
   * general — and only one of them reads as a product that has been paying
   * attention. Optional, since nothing here depends on it being there.
   */
  holder?: string;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="You're out of seats"
      description={
        holder
          ? `The free plan is one seat, and ${holder.split(" ")[0]} has it.`
          : "The free plan is one seat, and it's taken."
      }
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Not now
          </Button>
          {/* Ends the flow rather than pretending to continue it. The word is
              the offer, not a receipt — nothing here has taken anybody's money
              and the button must never read as though it has. */}
          <Button size="sm" onClick={onClose}>
            Upgrade my seats
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 px-5 py-5">
        <p className="text-base leading-relaxed text-text-muted">
          Nothing has gone wrong — you&apos;ve just run out of room. Upgrade
          your seats and the next person can be added the same way as the first.
        </p>

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-sunken p-4">
          {/* The number, at the size the number deserves — 32px, half again as
              big as the page's own heading. `items-baseline` so "a month" sits
              on the price's baseline rather than floating somewhere against
              the middle of its 40px line box. */}
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-4xl font-semibold tracking-[-0.03em] text-text">
              {PRICE}
            </span>
            <span className="text-md text-text-muted">a month</span>
          </div>

          <p className="text-base leading-relaxed text-text-muted">
            Up to {PAID_SEATS} seats, plus your own account, which doesn&apos;t
            count against them — the person you&apos;re adding now and the next
            few after them, at the same price.
          </p>

          <Separator />

          <div className="flex flex-col gap-1.5">
            <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
              If you don&apos;t
            </p>
            <p className="text-sm leading-relaxed text-text-muted">
              {holder ? `${holder.split(" ")[0]}'s` : "The"} onboarding carries
              on exactly as it is, and your workflows stay written. The only
              thing that changes is that Craig can&apos;t start anybody new.
            </p>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
