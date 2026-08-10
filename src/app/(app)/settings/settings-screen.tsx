"use client";

import * as React from "react";
import Link from "next/link";
import {
  AppShell,
  BackLink,
  Badge,
  Button,
  Callout,
  NavRail,
  NavRailItem,
  Separator,
  ThemeToggle,
} from "@/components/ui";
import { ArrowBack, Warning } from "@/components/ui/icons";
import { NavStat } from "@/components/app-nav";
import { CompanyLogoPanel } from "@/components/craig/company-logo";
import { GoogleWorkspaceConnect } from "@/components/craig/google-workspace";
import { useUpgrade } from "@/components/craig/use-upgrade";
import { Google } from "@/components/ui/brand-icons";
import type {
  CompanyLogo,
  Session,
  Subscription,
} from "@/lib/craig/contract";
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
 *
 * Branding sits immediately under the account's details, and that placement is
 * an argument rather than a gap that happened to be free. Account details
 * already ends by naming "the name new starters see at the top of what Craig
 * sends"; the logo is the next sentence of exactly that thought, so the two
 * read as one idea — what this company looks like to somebody they have just
 * hired — instead of as two settings that happen to share a page.
 *
 * It is deliberately **not** in Mission control, which was the obvious-looking
 * shelf because the mailmaker lives behind that door. Mission control says what
 * it is in its own sentence: the tools this product is built with rather than
 * the product itself, that nobody outside the team has any use for. A logo is
 * the opposite of that on every count — it belongs to the customer, only the
 * customer can supply it, and it changes what a stranger receives. Putting it
 * behind a door labelled "not for you" would be hiding the one branding control
 * this product has from the only person who can use it.
 */
export function SettingsScreen({
  user,
  outcome,
  back,
  subscription,
  taken,
  entitlement,
  logo,
  company,
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
  /** The logo on the account, already resolved to the URL an email will use. */
  logo: CompanyLogo | null;
  /**
   * The company's name as the *account row* records it, not as the session
   * happens to carry it.
   *
   * The two are usually the same string and the difference matters exactly
   * here: a session minted before companies were recorded has no company on it
   * at all, and this screen draws that name as the thing a recipient reads when
   * their mail client refuses to load the logo. A blank there would be showing
   * somebody a fallback that is not the one they will get.
   */
  company: string;
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

        <BrandingSection logo={logo} company={company} />

        <Separator />

        <AppearanceSection />

        <Separator />

        <IntegrationsSection user={user} outcome={outcome} />

        <Separator />

        <MissionControlSection />

        <Separator />

        <CloseAccountSection user={user} />
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

/* --- Branding -------------------------------------------------------------- */

/**
 * The logo on the mail, and the one place it can be changed.
 *
 * The lead paragraph is written here rather than inside the panel for the same
 * reason the Google Workspace one is: the control is headless and the room it
 * is standing in supplies the sentence. What this room has to say is *why there
 * is a control at all* — the mail already goes out in the company's name, and
 * this is the rest of that decision rather than a new one.
 *
 * It says "every email Craig sends on your behalf" rather than naming the
 * templates, because that list is somebody else's file and grows without this
 * screen hearing about it. A sentence that had to be kept in step with
 * `templates.ts` would be wrong within a week.
 */
function BrandingSection({
  logo,
  company,
}: {
  logo: CompanyLogo | null;
  company: string;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-semibold tracking-[-0.01em]">Branding</h2>
        <p className="text-md leading-relaxed text-text-muted">
          Your logo, at the top of every email Craig sends on your behalf. A new
          starter should be able to see who has written to them before they read
          a word of it.
        </p>
      </div>

      <CompanyLogoPanel logo={logo} company={company} />
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

/* --- Appearance ------------------------------------------------------------ */

/**
 * The theme switch, in the one room it belongs in.
 *
 * It used to sit in the header of every screen in the product, in the far
 * corner — the most valuable piece of chrome there is — for a preference
 * somebody sets roughly once and then never touches. The corner now holds
 * notifications, which are about work waiting for you and are a reason to look
 * back at it.
 *
 * Labelled rather than a bare icon, because the header gave it context by
 * position and a settings page has to give it context in words. The control
 * itself is the same component, so the two cannot drift: sign-in and sign-up
 * still carry one, since somebody who cannot get in cannot reach this page.
 */
function AppearanceSection() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-semibold tracking-[-0.01em]">Appearance</h2>
        <p className="text-md leading-relaxed text-text-muted">
          Light or dark. Remembered on this device rather than on the account,
          so it follows the machine you are sitting at.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-md font-medium">Theme</span>
          <span className="text-sm text-text-muted">
            Follows your system until you change it here.
          </span>
        </div>
        <ThemeToggle />
      </div>
    </section>
  );
}

/* --- Mission control ------------------------------------------------------- */

/**
 * One door to the internal tools, rather than one row each.
 *
 * Both existed for months with no way in: they sat outside the router entirely,
 * so the only way to look at the design system was to know it was there and
 * type the path — and the path did not resolve. Routing them without linking
 * them would have reproduced the same problem more quietly, which is why this
 * section was written at the same time as their URLs.
 *
 * In Settings rather than the main nav on the argument the nav itself makes:
 * it lists what the product *does*, and these are not that. They are for
 * whoever is building it. Settings is already the room for things about the
 * account rather than about onboarding, which is the closest existing shelf —
 * and it stays the entrance now that the tools have a hub, because this is
 * where people have already learned to look for them.
 *
 * What changed is the number of destinations. It listed both tools directly and
 * described each in a sentence, which meant the only description either one had
 * lived at the bottom of a page about billing and Google Workspace — and every
 * tool added afterwards would have made this section longer than the account's
 * own details. `/mission-control` is where that belongs: it names them, says
 * what they are with room to do it, and holds the way back to here. So this is
 * a single link now, and the sentence under it says what is behind the door
 * rather than repeating both descriptions in miniature.
 *
 * Behind the same door as everything else in `(app)` — all three of them.
 */
function MissionControlSection() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-semibold tracking-[-0.01em]">
          Mission control
        </h2>
        <p className="text-md leading-relaxed text-text-muted">
          The tools this product is built with rather than the product itself.
          Nobody outside the team has any use for them.
        </p>
      </div>

      <ToolLink
        href="/mission-control"
        title="Open mission control"
        description="The design system and the mailmaker, and whatever gets built next — with the way back to here."
      />
    </section>
  );
}

function ToolLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-lg border border-border px-4 py-3 transition-colors hover:border-border-strong"
    >
      <span className="text-md font-semibold">{title}</span>
      <span className="text-sm leading-relaxed text-text-muted">
        {description}
      </span>
    </Link>
  );
}

/* --- Closing the account --------------------------------------------------- */

/**
 * The way out.
 *
 * A product that holds somebody's date of birth, home address, bank details
 * and tax file number and offers no way to be rid of it is not one that can
 * answer a deletion request, and there is no version of this that is somebody
 * else's job.
 *
 * **The address has to be typed.** Not as authorisation — the session already
 * did that — but because this is the one action here that cannot be undone or
 * asked for again, and a confirmation that costs nothing to give is one nobody
 * reads. Typing your own address is small friction that is impossible to do by
 * accident.
 *
 * It lists what will go before asking, because "delete everything" is an
 * abstraction and the things it names are not.
 */
function CloseAccountSection({ user }: { user: Session }) {
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const matches = typed.trim().toLowerCase() === user.email.trim().toLowerCase();

  async function close() {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: typed.trim() }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? "That didn't work. Nothing has been deleted.");
        return;
      }

      /* A hard navigation rather than the router, deliberately: every cached
         RSC payload in this tab describes an account that no longer exists,
         and `router.push` keeps that cache. The rule below is right almost
         everywhere and wrong here — throwing the document away is the point. */
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/";
    } catch {
      setError("That didn't reach the server. Nothing has been deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-semibold tracking-[-0.01em]">
          Close this account
        </h2>
        <p className="text-md leading-relaxed text-text-muted">
          Everything goes: every workflow, everyone you&rsquo;ve onboarded and
          what they told you, the documents you&rsquo;ve uploaded, signed
          contracts, the notebook, and your sign-in. It cannot be undone and we
          cannot get it back for you.
        </p>
      </div>

      {error && (
        <Callout tone="danger" icon={<Warning />} title="Nothing was deleted">
          {error}
        </Callout>
      )}

      {!open ? (
        <div>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Close this account
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg bg-danger-subtle p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              Type <span className="font-semibold">{user.email}</span> to
              confirm.
            </span>
            <input
              type="email"
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-md focus:border-border-strong focus:outline-none"
              aria-label={`Type ${user.email} to confirm`}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="danger"
              disabled={!matches}
              loading={busy}
              onClick={() => void close()}
            >
              Delete everything
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError(null);
              }}
            >
              Keep my account
            </Button>
          </div>
        </div>
      )}
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
