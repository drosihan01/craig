"use client";

import { Button, Callout, Dialog, Separator } from "@/components/ui";

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
 * The numbers used to live here, and the argument for that was a good one: the
 * limit and the screen explaining the limit are the same fact, and a number
 * raised in one place and described in the other is a dialog that argues with
 * the button that opened it.
 *
 * It stopped being true when the limit stopped being a constant. What somebody
 * may have is now a property of their subscription, which lives on the server
 * and which a client component has no way to read — so the fact moved to
 * `lib/showcase/seats`, where the entitlement rule is argued in full, and this
 * dialog is *told* what to say. The old argument survives in a stronger form:
 * the page that enforces the limit and the dialog that explains it are now
 * given the same numbers by the same function, so they cannot disagree even in
 * principle.
 */
export function SeatPaywall({
  open,
  onClose,
  onUpgrade,
  upgrading = false,
  error = null,
  holder,
  seats,
  paidSeats,
  price,
  subscribed = false,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * What the money button actually does, when anything does.
   *
   * Optional, and it falls back to `onClose` — which is what this button did
   * before there was anywhere to send anybody, and is still the honest
   * behaviour on a deployment with no payments configured. A button wired to a
   * checkout that cannot exist would fail after the click, which is a worse
   * place to find out than never having promised.
   */
  onUpgrade?: () => void;
  /**
   * True from the press until the browser has left for Stripe.
   *
   * The gap is a real one — creating a Checkout Session is a round trip to
   * Stripe and back before anything visibly happens — and an unchanged button
   * during it reads as a button that didn't work. The second press it invites
   * would be a second session.
   */
  upgrading?: boolean;
  /**
   * Why the checkout didn't open, if it didn't.
   *
   * It belongs inside the dialog rather than on the page behind it. Whatever
   * went wrong, the person is still standing here deciding whether to pay, and
   * an explanation they have to close this to read is one they won't.
   */
  error?: string | null;
  /**
   * Whoever is using the free seat, if the page knows.
   *
   * Named where it can be, because "Priya has your free seat" is a fact about
   * this account and "you have used your seat" is a fact about accounts in
   * general — and only one of them reads as a product that has been paying
   * attention. Optional, since nothing here depends on it being there.
   */
  holder?: string;
  /** How many seats they are entitled to now, from the server. */
  seats: number;
  /** How many the paid plan offers — the number sold, not the number held. */
  paidSeats: number;
  /** The price, already written the way it should be read. */
  price: string;
  /**
   * Whether a live plan is what `seats` comes from.
   *
   * It changes what this dialog is. Pitching a plan to somebody who already
   * bought it is the single most irritating thing a paywall can do, and it is
   * also a lie — they are not one payment away from more seats, they are a
   * change to an existing subscription away. Note it means *live*: a lapsed
   * plan is not a plan, and somebody whose card finally failed should see the
   * offer again rather than a description of something they no longer have.
   */
  subscribed?: boolean;
}) {
  /* The whole dialog turns on this one word, so it is derived once. `seats` is
     the entitlement, which on the free plan is one — but not always, because
     a lapsed plan leaves somebody entitled to however many people already
     hold a seat, and telling that person "the free plan is one seat" while
     four colleagues are onboarding would be flatly wrong. */
  const plural = seats === 1 ? "seat" : "seats";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="You're out of seats"
      description={headline({ seats, subscribed, holder })}
      footer={
        /* At the top of the plan there is nothing to sell, so nothing is
           offered.

           This used to show "Upgrade my seats" here too, which sent somebody
           already paying for the largest plan we have to Stripe's billing
           portal — a screen about cards and invoices, in answer to a question
           about seats. It looked like an upsell and behaved like a filing
           cabinet, and neither was what they asked for. One button that closes
           is the honest end to a dialog whose news is "not yet". */
        subscribed ? (
          <Button size="sm" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Not now
            </Button>
            {/* The word is the offer, not a receipt — nothing at this point has
                taken anybody's money and the button must never read as though
                it has. Falling back to `onClose` keeps that true on a
                deployment with no checkout behind it: the flow ends rather
                than pretending to continue, which is what it did before there
                was an `onUpgrade` to hand it. */}
            <Button
              size="sm"
              onClick={onUpgrade ?? onClose}
              disabled={upgrading}
            >
              {upgrading ? "Opening checkout…" : "Upgrade my seats"}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4 px-5 py-5">
        {/* Above the pitch, because it is now the more important thing on the
            screen: the offer is unchanged and they have already read it, and
            what they don't know is why pressing it did nothing. */}
        {error && <Callout tone="danger">{error}</Callout>}

        {/* Two different pieces of news. For a free account this is a door
            with a price on it; at the top of the plan it is a wall, and
            telling somebody to upgrade when they are already on the largest
            plan we sell is the sentence that makes a product feel like it
            isn't listening. */}
        <p className="text-base leading-relaxed text-text-muted">
          {subscribed ? (
            <>
              Nothing has gone wrong — you&apos;ve filled every seat on the
              plan. Bigger plans are something we&apos;re working on, and
              they&apos;ll show up here when they&apos;re ready.
            </>
          ) : (
            <>
              Nothing has gone wrong — you&apos;ve just run out of room. Upgrade
              your seats and the next person can be added the same way as the
              first.
            </>
          )}
        </p>

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-sunken p-4">
          {/* The price is the offer, so it is only shown to somebody who
              hasn't taken it. Quoting a plan at the person already paying for
              it is both irritating and untrue — they are not one payment away
              from more seats, they are a change to a subscription away, and
              this dialog is not where that change is priced. So the same panel
              says what they have instead, and the half below it, which is
              about what they keep, is identical either way. */}
          {subscribed ? (
            <p className="text-base leading-relaxed text-text-muted">
              You&apos;re on {seats} {plural} already, and every one of them is
              in use. Your plan and payment details live in Settings, if
              that&apos;s what you came looking for.
            </p>
          ) : (
            <>
              {/* The number, at the size the number deserves — 32px, half again
                  as big as the page's own heading. `items-baseline` so "a
                  month" sits on the price's baseline rather than floating
                  somewhere against the middle of its 40px line box. */}
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-[-0.03em] text-text">
                  {price}
                </span>
                <span className="text-md text-text-muted">a month</span>
              </div>

              <p className="text-base leading-relaxed text-text-muted">
                Up to {paidSeats} seats, plus your own account, which
                doesn&apos;t count against them — the person you&apos;re adding
                now and the next few after them, at the same price.
              </p>
            </>
          )}

          {/* "If you don't" is the answer to a decision, and at the top of the
              plan there isn't one — nothing is being offered, so nothing is
              being declined. Leaving it up would read as a consequence for
              refusing something they were never asked. */}
          {!subscribed && (
            <>
              <Separator />

              <div className="flex flex-col gap-1.5">
                <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
                  If you don&apos;t
                </p>
                <p className="text-sm leading-relaxed text-text-muted">
                  {holder ? `${holder.split(" ")[0]}'s` : "The"} onboarding
                  carries on exactly as it is, and your workflows stay written.
                  The only thing that changes is that Craig can&apos;t start
                  anybody new.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/**
 * The one line under the title, which is the only sentence here that can be
 * factually wrong.
 *
 * Three cases rather than one, because the limit has three provenances and a
 * single sentence covering all of them could only do it by saying nothing. The
 * free-plan wording is the original, kept word for word: it is the case
 * practically everybody hits, and "the free plan is one seat, and Priya has it"
 * is the version of this that sounds like a product paying attention.
 *
 * The middle case is the one nobody would think to write. Somebody whose plan
 * lapsed keeps the seats already in use — `seatLimit` refuses to take them —
 * so they can be out of seats while entitled to four of them, and telling that
 * person "the free plan is one seat" would contradict both the list they just
 * came from and the panel below.
 */
function headline({
  seats,
  subscribed,
  holder,
}: {
  seats: number;
  subscribed: boolean;
  holder?: string;
}): string {
  if (subscribed) {
    return seats === 1
      ? "Your plan is one seat, and it's taken."
      : `Your plan is ${seats} seats, and they're all taken.`;
  }

  if (seats > 1) {
    return `You're on ${seats} seats, and they're all taken.`;
  }

  return holder
    ? `The free plan is one seat, and ${holder.split(" ")[0]} has it.`
    : "The free plan is one seat, and it's taken.";
}
