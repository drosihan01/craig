"use client";

import * as React from "react";
import {
  AppShell,
  BackLink,
  Badge,
  Button,
  Callout,
  NavRail,
  NavRailItem,
  Separator,
} from "@/components/ui";
import { ArrowBack } from "@/components/ui/icons";
import { NavStat } from "@/components/app-nav";
import { GoogleWorkspaceConnect } from "@/components/craig/google-workspace";
import { useUpgrade } from "@/components/craig/use-upgrade";
import { Google } from "@/components/ui/brand-icons";
import type { Session, Subscription } from "@/lib/craig/contract";
import type { SeatEntitlement } from "@/lib/craig/seats";

/**
 * The drawer underneath the product: what this account is, what it pays, and
 * what it has connected to.
 *
 * It borrows the builder's shape rather than the list screens'. Workflows and
 * People are rooms you move between; this is somewhere you went *into*, from
 * the account menu, to do one thing and leave — and a column offering two other
 * rooms invites you out of it before you've done that thing. So the navigation
 * here is the way back and nothing else, which is the same argument the builder
 * makes, at either width: expanded it is a back link, collapsed it is a back
 * arrow.
 *
 * Three sections, in the order somebody actually wants them. Billing first
 * because it is the only one with a number that changes and a decision attached
 * to it; the account's own details second, because they are the answer to "is
 * this the right account" and belong near the top but under the thing you came
 * for; integrations last, because they are the longest and the most likely to
 * grow.
 */
export function SettingsScreen({
  user,
  outcome,
  back,
  subscription,
  taken,
  entitlement,
}: {
  user: Session;
  /** The `?google=` code the connect flow redirected back with, if any. */
  outcome: string | null;
  /**
   * The room this is a detour out of, worked out on the server.
   *
   * Not a constant, because Settings has no parent in the nav — it opens from
   * the account menu on every screen, so the only correct destination is
   * wherever they were. A hardcoded "Workflows" was right half the time and
   * quietly wrong for anybody who came from People.
   */
  back: { href: string; label: string };
  /** The plan as Stripe last described it, or nothing on a free account. */
  subscription: Subscription | null;
  /** How many people hold a seat right now. */
  taken: number;
  /** The same entitlement the paywall is quoted from. */
  entitlement: SeatEntitlement;
}) {
  return (
    <AppShell
      title="Settings"
      account={{ name: user.name, email: user.email }}
      /* Collapsed, the column keeps the one thing it has: the way out. */
      navRail={
        <NavRail>
          <NavRailItem
            href={back.href}
            label={back.label}
            icon={<ArrowBack />}
          />
        </NavRail>
      }
      nav={<SettingsNav entitlement={entitlement} taken={taken} back={back} />}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 py-10">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">
            Settings
          </h1>
          <p className="text-md text-text-muted">
            What this account is on, what it pays, and everything it&apos;s
            connected to — including how to take that back.
          </p>
        </header>

        <Separator />

        <BillingSection
          subscription={subscription}
          taken={taken}
          entitlement={entitlement}
        />

        <Separator />

        <AccountSection user={user} />

        <Separator />

        <IntegrationsSection user={user} outcome={outcome} />
      </div>
    </AppShell>
  );
}

/* --- Billing --------------------------------------------------------------- */

/**
 * The plan, and the one button that can change it.
 *
 * Everything a subscription can have done to it — a new card, a different
 * address, an invoice to forward to an accountant, cancelling — happens in
 * Stripe's portal rather than in screens written here. Rebuilding those would
 * mean writing our own cancellation flow, and a cancellation flow written by
 * the company being cancelled on is a thing nobody has ever made good.
 *
 * So this section's whole job is to say what is true today, accurately enough
 * that somebody doesn't need to open the portal to find out.
 */
function BillingSection({
  subscription,
  taken,
  entitlement,
}: {
  subscription: Subscription | null;
  taken: number;
  entitlement: SeatEntitlement;
}) {
  const upgrade = useUpgrade();

  /* Live, rather than merely present. A cancelled subscription is still a
     record on the account — it is how the seats already in use keep working —
     but it is not a plan, and a screen calling it one would be telling somebody
     they are paying for something they cancelled. */
  const live = entitlement.subscribed;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold tracking-[-0.01em]">Billing</h2>
          {live ? (
            <Badge tone="success" size="sm">
              Team
            </Badge>
          ) : (
            <Badge tone="neutral" size="sm">
              Free
            </Badge>
          )}
        </div>
        <p className="text-md leading-relaxed text-text-muted">
          {live
            ? `The Team plan, ${entitlement.price} a month. Cards, invoices and cancelling live with Stripe.`
            : `The free plan is one seat. Team is ${entitlement.price} a month for up to ${entitlement.paidSeats}.`}
        </p>
      </div>

      {upgrade.error && <Callout tone="danger">{upgrade.error}</Callout>}

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-sunken p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
            Seats in use
          </span>
          <span className="text-base font-medium text-text">
            {taken} of {entitlement.limit}
          </span>
        </div>

        {/* Only when there is a subscription to describe. On a free account
            these rows would each be an em dash, which is a table teaching
            somebody the shape of something they don't have. */}
        {subscription && (
          <>
            <Separator />
            <BillingFact
              label={subscription.cancelAtPeriodEnd ? "Ends" : "Renews"}
              value={renewal(subscription)}
            />
            <BillingFact label="Status" value={readableStatus(subscription)} />
          </>
        )}
      </div>

      {/* A cancelled plan gets the offer back rather than a portal link. There
          is nothing left to manage in there, and "Manage billing" pointing at
          an empty subscription is a button that answers a question nobody
          asked. */}
      <div className="flex flex-wrap gap-2">
        {subscription && live ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={upgrade.manage}
            disabled={upgrade.pending}
          >
            {upgrade.pending ? "Opening Stripe…" : "Manage billing"}
          </Button>
        ) : (
          <Button size="sm" onClick={upgrade.start} disabled={upgrade.pending}>
            {upgrade.pending ? "Opening checkout…" : "Upgrade to Team"}
          </Button>
        )}
      </div>
    </section>
  );
}

function BillingFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
        {label}
      </span>
      <span className="text-base text-text-muted">{value}</span>
    </div>
  );
}

/**
 * `1788892946` as "24 August 2026".
 *
 * Built from a Unix timestamp Stripe gave us in seconds, which is the trap:
 * `new Date(1788892946)` is a date in 1970 and looks plausible enough on a
 * screen that nobody would question it.
 */
function renewal(subscription: Subscription): string {
  const at = subscription.currentPeriodEnd;
  if (!Number.isFinite(at) || at <= 0) return "Unknown";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(at * 1000));
}

/**
 * Stripe's status in words somebody would use.
 *
 * `past_due` is the one worth spelling out. It means a payment failed and
 * Stripe is still retrying — the seats keep working throughout, which is
 * deliberate, and somebody seeing the raw word would reasonably assume the
 * opposite and go looking for what they had lost.
 */
function readableStatus(subscription: Subscription): string {
  switch (subscription.status) {
    case "active":
      return subscription.cancelAtPeriodEnd ? "Cancelling" : "Active";
    case "trialing":
      return "Trial";
    case "past_due":
      return "Payment retrying — seats still work";
    case "canceled":
      return "Cancelled";
    case "unpaid":
      return "Unpaid";
    case "paused":
      return "Paused";
    default:
      return "Incomplete";
  }
}

/* --- Account --------------------------------------------------------------- */

/**
 * Who this account is, which is mostly here to answer "am I in the right one".
 *
 * Read-only on purpose. Every field here is either the thing they sign in with
 * or the name a new starter sees at the top of an email, and an edit box next
 * to those implies a rename flow — re-verifying an address, rewriting the mail
 * already sent — that does not exist yet. Showing them plainly is honest;
 * offering to change them would not be.
 */
function AccountSection({ user }: { user: Session }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-semibold tracking-[-0.01em]">
          Account details
        </h2>
        <p className="text-md leading-relaxed text-text-muted">
          The account everything on this deployment belongs to, and the name new
          starters see at the top of what Craig sends.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-sunken p-4">
        <BillingFact label="Name" value={user.name} />
        <Separator />
        <BillingFact label="Email" value={user.email} />
        {user.company && (
          <>
            <Separator />
            <BillingFact label="Company" value={user.company} />
          </>
        )}
      </div>
    </section>
  );
}

/* --- Integrations ---------------------------------------------------------- */

function IntegrationsSection({
  user,
  outcome,
}: {
  user: Session;
  outcome: string | null;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-semibold tracking-[-0.01em]">
          Integrations
        </h2>
        <p className="text-md leading-relaxed text-text-muted">
          What Craig is allowed to do on your behalf, and where to take it back.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Google className="size-4" />
          <h3 className="text-md font-semibold">Google Workspace</h3>
        </div>
        <p className="text-md leading-relaxed text-text-muted">
          Connected once, as a super admin, so Craig can create a new
          starter&apos;s account on the morning it is needed without anybody
          being there. It is the one permission this product asks for, and it
          can be taken back here at any time.
        </p>

        {/* The same component the block panel renders, given a different lead.
            The panel introduces the connection as something a step depends on;
            this introduces it as something the account holds. Neither owns a
            second copy of the button. */}
        <GoogleWorkspaceConnect
          account={{
            name: user.name,
            email: user.email,
            company: user.company,
          }}
          outcome={outcome}
        />
      </div>
    </section>
  );
}

/* --- Nav ------------------------------------------------------------------- */

/**
 * The way back, and the two numbers this page is about.
 *
 * The same shape as the builder's column: a back link, a rule, and a short
 * overview. No Workflows and People — see the note on the screen itself.
 */
function SettingsNav({
  entitlement,
  taken,
  back,
}: {
  entitlement: SeatEntitlement;
  taken: number;
  back: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col gap-5">
      <BackLink href={back.href} className="px-2">
        {back.label}
      </BackLink>

      <Separator />

      <div className="flex flex-col gap-2 px-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Plan
        </p>
        <NavStat
          label="Seats in use"
          value={`${taken} of ${entitlement.limit}`}
        />
        <NavStat
          label="Plan"
          value={entitlement.subscribed ? "Team" : "Free"}
        />
      </div>
    </div>
  );
}
