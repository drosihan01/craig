"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import {
  Badge,
  Button,
  Callout,
  Skeleton,
  buttonVariants,
} from "@/components/ui";
import { GitHub } from "@/components/ui/brand-icons";
import {
  Add,
  CheckCircle,
  Cloud,
  Delete,
  Refresh,
  Warning,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { GITHUB_OUTCOME_PARAM } from "@/lib/craig/github-outcome";
import type { WorkspaceAccount } from "@/components/craig/google-workspace";

/**
 * Connecting the company's GitHub organisation, from the customer's side.
 *
 * Unverified: no GitHub organisation has ever been connected, so every state
 * below has been rendered only with the server answering "nothing configured".
 * What a live one still has to prove: that a completed authorisation
 * round-trips into the `connected` card with the right organisation named on
 * it, and that the outcome codes a real redirect carries match the table here.
 *
 * The same two rules as the Google panel, because they were paid for there:
 * nobody here can fix our configuration, so nobody here is shown it — every
 * deployment-side gap collapses into one calm "not available yet"; and every
 * state names the account, because a connection is a pairing of two accounts
 * and this screen is the only place both are knowable at once.
 *
 * ## Two buttons, and why this panel is the only one with two
 *
 * Install and Authorize are separate acts in GitHub's model. A person can do
 * either without the other, and only one of the two failures is visible from
 * here — an authorisation with no installation produces a real token that can
 * reach nothing, which the exchange refuses with its own outcome
 * (`not-installed`) precisely so this panel can say which of the two is
 * missing. Slack and Linear hide this behind one button because for them it
 * genuinely is one act; pretending the same here would leave somebody pressing
 * Connect over and over at a screen that keeps refusing.
 *
 * ## What this panel must not promise
 *
 * `blocks.ts` says this block has no runner, so nothing here may say Craig
 * sends the invite *yet*. The difference from the Slack panel is worth stating
 * carefully, because it is the reason this block was built: GitHub's API can
 * genuinely do the whole thing —
 * `POST /orgs/{org}/invitations` takes an email, a role and team ids on any
 * normal paid organisation — where Slack's cannot below Enterprise Grid. So
 * the copy says the capability is real and the wiring is not, which is a
 * different sentence from Slack's "a person always sends this one", and both
 * are true of their own provider.
 */

/**
 * What `GET /api/github/connection` answers with. Narrowed here rather than
 * imported from the route, for the reason the Google panel gives: a client
 * component importing from a route handler is one careless edit from importing
 * the server's credentials with it.
 */
type Reply =
  | {
      ok: true;
      setup: { available: boolean };
      storage: { ready: boolean };
      connection: {
        orgLogin: string | null;
        permissions: string[];
        /** Unix seconds. */
        connectedAt: number;
        needsReconnect: boolean;
      } | null;
    }
  | { ok: false; error?: string };

/**
 * Four states plus the two refusals, flattened exactly as the Google panel
 * flattens its own — "no App registered" and "nowhere to keep a credential"
 * are different jobs for different people and one sentence for a customer,
 * while "we couldn't ask" must never be rendered as "you aren't connected".
 */
export type GitHubState =
  | { status: "loading" }
  /** Nothing to offer, and nothing the reader can do about it. Calm. */
  | { status: "unavailable" }
  /** Available and nobody has connected. The normal starting point. */
  | { status: "disconnected" }
  | {
      status: "connected";
      orgLogin: string | null;
      permissions: string[];
      connectedAt: number;
      needsReconnect: boolean;
    }
  /** The session went away underneath us. Nothing is claimed either way. */
  | { status: "signed-out" }
  /** The request itself didn't complete. Nothing is claimed either way. */
  | { status: "unreachable" };

/**
 * Reads the connection, and hands back the state plus a way to read it again.
 * Same shape as `useGoogleWorkspace`, same reasons: the panel lives deep inside
 * the editor's canvas with no server boundary to hang a fetch off, and `read`
 * returns rather than stores so both callers keep their `setState` at the call
 * site.
 */
function useGitHubConnection(): {
  state: GitHubState;
  reload: () => Promise<void>;
} {
  const [state, setState] = React.useState<GitHubState>({ status: "loading" });

  /* Guards writes from a component unmounted mid-fetch — selecting another
     block in the editor does exactly that. */
  const liveRef = React.useRef(true);

  const read = React.useCallback(async (): Promise<GitHubState> => {
    try {
      const response = await fetch("/api/github/connection");
      const payload = (await response.json()) as Reply;

      if (!payload.ok) {
        return response.status === 401
          ? { status: "signed-out" }
          : { status: "unreachable" };
      }

      if (!payload.setup.available || !payload.storage.ready) {
        return { status: "unavailable" };
      }

      if (!payload.connection) return { status: "disconnected" };

      return {
        status: "connected",
        orgLogin: payload.connection.orgLogin,
        permissions: payload.connection.permissions,
        connectedAt: payload.connection.connectedAt,
        needsReconnect: payload.connection.needsReconnect,
      };
    } catch {
      /* The route answers every refusal as JSON, so reaching here means the
         request itself never completed. */
      return { status: "unreachable" };
    }
  }, []);

  React.useEffect(() => {
    liveRef.current = true;
    void read().then((next) => {
      if (liveRef.current) setState(next);
    });
    return () => {
      liveRef.current = false;
    };
  }, [read]);

  const reload = React.useCallback(async () => {
    const next = await read();
    if (liveRef.current) setState(next);
  }, [read]);

  return { state, reload };
}

/**
 * What each way the flow can end means, in the company's own terms. Keyed by
 * the closed set in `github-outcome.ts`, so nothing a stranger types into
 * `?github=` renders as prose, and an unrecognised code renders as nothing
 * rather than as a blank alarming box.
 */
const OUTCOMES: Record<
  string,
  {
    tone: "success" | "neutral" | "warning" | "danger";
    title: string;
    body: string;
  }
> = {
  connected: {
    tone: "success",
    title: "Connected",
    body: "Your GitHub organisation is connected. Nothing runs on it yet — when GitHub steps start running on their own, this permission is what they'll run on, and until then it simply sits here, revocable below.",
  },
  disconnected: {
    tone: "neutral",
    title: "Disconnected",
    body: "Craig no longer holds permission to act on your GitHub organisation. Your members, teams and repositories are untouched. The app may still be installed on the organisation — remove it from the organisation's settings if you'd rather it didn't exist at all.",
  },
  cancelled: {
    tone: "neutral",
    title: "Nothing was connected",
    body: "The consent screen was closed without granting anything, which is a perfectly reasonable thing to do. No permission was given and nothing was stored.",
  },
  "signed-out": {
    tone: "warning",
    title: "You were signed out along the way",
    body: "A connection belongs to an account, and by the time GitHub answered there wasn't one to attach it to. Nothing was stored. You're signed in now, so connecting again will finish properly.",
  },
  "no-key": {
    tone: "warning",
    title: "Nobody was sent to GitHub",
    body: "We couldn't have kept the permission safely, so we didn't ask you for it — and not asking is better than asking and then losing it. This one is ours to sort out, not yours. Nothing was granted and nothing was stored.",
  },
  mismatch: {
    tone: "warning",
    title: "That didn't match",
    body: "GitHub's answer didn't match the request this browser made — usually because it took more than ten minutes, or finished in a different browser to the one it started in. Nothing was stored. Start again from this page.",
  },
  "not-stored": {
    tone: "danger",
    title: "Granted, but not kept",
    body: "You granted the permission and we couldn't store it safely, so we kept nothing rather than keeping it badly. This one is ours to fix. You can revoke it from your GitHub settings if you'd rather the grant didn't exist.",
  },
  "not-configured": {
    tone: "neutral",
    title: "Not available yet",
    body: "Connecting GitHub isn't something this account can do yet, so nothing was attempted and nothing is wrong.",
  },
  "not-connected": {
    tone: "neutral",
    title: "Installed — one step to go",
    body: "The app is on your organisation now. It still needs you to authorise it, which is what gives Craig something to act with. Press Connect below.",
  },
  "not-installed": {
    tone: "warning",
    title: "Not on an organisation yet",
    body: "You authorised Craig, but it isn't installed on a GitHub organisation — so the permission can't reach anything. Install it on the organisation you're onboarding into, then connect again. Only an organisation owner can do the install.",
  },
  "needs-reconnect": {
    tone: "warning",
    title: "It needs connecting again",
    body: "The permission Craig was given is no longer valid — it was revoked, the app was uninstalled, or it went unused long enough to lapse. Nothing is broken; an organisation owner has to connect it once more.",
  },
  "bad-credentials": {
    tone: "danger",
    title: "GitHub wouldn't accept us",
    body: "GitHub turned us away before it ever asked you anything, so you were never shown a consent screen. This one is ours rather than yours: nothing was granted, and nothing in your organisation was changed.",
  },
  unauthorized: {
    tone: "warning",
    title: "Permission wasn't granted",
    body: "Craig is on your organisation but without permission to manage members, which is the one thing this block is for — or the account that connected isn't an organisation owner. Nothing was stored.",
  },
  "invalid-request": {
    tone: "neutral",
    title: "Nothing was connected",
    body: "GitHub's answer didn't carry what was needed to finish. Nothing was stored. Try connecting again.",
  },
  "rate-limited": {
    tone: "neutral",
    title: "Too many attempts",
    body: "GitHub is turning requests away for the moment. Nothing was stored. Try again shortly.",
  },
  rejected: {
    tone: "danger",
    title: "GitHub refused",
    body: "GitHub turned the request down without saying usefully why. Nothing was granted and nothing was stored. One more attempt is worth trying; after that it's ours to look into.",
  },
  unreachable: {
    tone: "warning",
    title: "Couldn't reach GitHub",
    body: "The request to GitHub timed out or couldn't get through. Nothing was stored and nothing was changed.",
  },
};

/** `1754697600` as "4 August 2026, 15:20" — local time, like every other date
    in this product. */
function readableWhen(unixSeconds: number): string {
  if (!unixSeconds) return "an unrecorded time";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(unixSeconds * 1000));
}

/**
 * The connection itself: what it is, how to make one, how to take it back.
 * Headless like `GoogleWorkspaceConnect`, and sized to the block panel's 320px
 * column, which today is its only home.
 */
export function GitHubConnect({ account }: { account: WorkspaceAccount }) {
  const { state, reload } = useGitHubConnection();
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState<string | null>(null);

  /**
   * The `?github=` code the connect flow redirected back with, read straight
   * off the URL rather than through `useSearchParams`. Not squeamishness: this
   * panel is mounted by the workflow editor, which this block must not edit,
   * and `useSearchParams` asks the nearest boundary *above* it to account for
   * the dynamic read. `useSyncExternalStore` is the sanctioned way to read a
   * value React doesn't own — the server snapshot is `null` (the server cannot
   * know the browser's query string), the client snapshot is the code, and the
   * subscribe is empty because the value only ever changes via a full
   * redirect, which remounts everything anyway.
   */
  const outcome = React.useSyncExternalStore(
    React.useCallback(() => () => {}, []),
    () => new URLSearchParams(window.location.search).get(GITHUB_OUTCOME_PARAM),
    () => null,
  );

  /* An outcome this panel produced itself, which wins over the one in the URL
     — disconnecting under a `?github=connected` must not leave a green
     "Connected" box over a panel that now says nobody is. */
  const [acted, setActed] = React.useState<string | null>(null);

  async function disconnect() {
    setBusy(true);
    setFailed(null);
    try {
      const response = await fetch("/api/github/connection", {
        method: "DELETE",
      });
      if (!response.ok) {
        setFailed(
          "That didn't go through. Your organisation is still connected — try again.",
        );
        return;
      }
      setActed("disconnected");
      /* Re-read rather than patching the local copy: the server decides
         whether a connection exists. */
      await reload();
    } catch {
      setFailed(
        "That didn't reach us. Your organisation is still connected — try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const shown = OUTCOMES[acted ?? outcome ?? ""];

  return (
    <div className="flex flex-col gap-3">
      {shown && (
        <Callout
          tone={shown.tone}
          title={shown.title}
          /* No icon on the neutral ones — the argument is spelt out in the
             Google panel, and it holds letter for letter here. */
          icon={
            shown.tone === "success" ? (
              <CheckCircle />
            ) : shown.tone === "neutral" ? undefined : (
              <Warning />
            )
          }
        >
          {shown.body}
        </Callout>
      )}

      {failed && (
        <Callout tone="danger" icon={<Warning />}>
          {failed}
        </Callout>
      )}

      {state.status === "loading" && <Skeleton className="h-52 w-full" />}

      {state.status === "unavailable" && <Unavailable />}

      {state.status === "disconnected" && <NotConnected account={account} />}

      {state.status === "connected" && (
        <Connected state={state} busy={busy} onDisconnect={disconnect} />
      )}

      {/* Neither of these claims anything about the company's organisation,
          because neither request got far enough to know. */}
      {state.status === "signed-out" && (
        <Callout tone="neutral" title="Sign in again">
          Your session has expired, so there was nothing to read this against.
          Sign in and this page will say where your GitHub organisation stands.
        </Callout>
      )}

      {state.status === "unreachable" && (
        <Callout tone="neutral" title="Couldn't check just now">
          We couldn&apos;t reach the server to find out whether your
          organisation is connected. Nothing has changed either way — reload the
          page to try again.
        </Callout>
      )}
    </div>
  );
}

/* --- The states ------------------------------------------------------------ */

/** The feature is off, said as a fact about the product rather than a fault,
    with no button that could only fail. */
function Unavailable() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <Cloud className="size-4 text-text-subtle" />
        <span className="text-base font-medium">Not available yet</span>
      </div>
      <p className="text-sm text-text-muted">
        Not switched on for this account yet. Nothing here for you to fix.
      </p>
    </div>
  );
}

/**
 * The state every account starts in — and the one place the two-act shape of
 * GitHub's model has to be explained, because a customer who presses only the
 * second button gets a token that can reach nothing and an error that sounds
 * like a permissions problem. Numbered rather than prosed: this is an
 * instruction, and an instruction that can be lost in a paragraph will be.
 *
 * The identity line is the Google panel's hard-won rule — a consent is a
 * pairing of two accounts, and this is the last screen where both are visible
 * at once.
 */
function NotConnected({ account }: { account: WorkspaceAccount }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <GitHub className="size-4" />
        <span className="text-base font-medium">Not connected</span>
      </div>

      <p className="text-sm text-text-muted">
        GitHub takes two steps, and both need an organisation owner. First
        install Craig on the organisation, then authorise it. It attaches to{" "}
        <span className="font-medium text-text">{account.email}</span>.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <ConnectLink label="Install on your org" install icon={<Add />} />
        <ConnectLink label="Connect GitHub" variant="secondary" />
      </div>

      <p className="text-xs text-text-subtle">
        Already installed it? Connect is the only one you need.
      </p>
    </div>
  );
}

/**
 * A live connection, named on both sides — "Connected" on its own is a claim
 * to be trusted, "katalis, connected on 4 August" is a claim to be checked.
 *
 * The permission list is shown rather than summarised, which no other provider
 * panel does. It earns the space here because GitHub's permissions are the
 * whole argument for choosing a GitHub App over an OAuth App — the point being
 * that the list is short and boring — and because an organisation owner who
 * approved an older permission set is the one failure this screen can make
 * visible before a runner hits it.
 */
function Connected({
  state,
  busy,
  onDisconnect,
}: {
  state: Extract<GitHubState, { status: "connected" }>;
  busy: boolean;
  onDisconnect: () => void;
}) {
  /* The exchange refuses to store a connection with no organisation, so this
     fallback should be unreachable — it exists because the alternative on an
     odd record is the word "null" where a company's name goes. */
  const org = state.orgLogin ?? "your organisation";

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <GitHub className="size-4" />
          <span className="text-base font-medium">{org}</span>
          {state.needsReconnect ? (
            <Badge size="sm" tone="warning">
              Needs connecting again
            </Badge>
          ) : (
            <Badge size="sm" tone="success">
              Connected
            </Badge>
          )}
        </div>
        <p className="text-sm text-text-muted">
          Connected on {readableWhen(state.connectedAt)}.
        </p>
      </div>

      {state.permissions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
            What it may do
          </p>
          <div className="flex flex-wrap gap-1.5">
            {state.permissions.map((permission) => (
              <Badge key={permission} size="sm" tone="neutral">
                {permission}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {state.needsReconnect && (
        <Callout tone="warning" title="This has stopped working">
          The authorisation was revoked, the app was uninstalled, or it went
          unused long enough to lapse. An organisation owner has to connect it
          again.
        </Callout>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <ConnectLink
          label="Connect again"
          variant={state.needsReconnect ? "primary" : "secondary"}
        />
        <Button
          variant="danger"
          size="sm"
          onClick={onDisconnect}
          loading={busy}
          disabled={busy}
        >
          <Delete />
          {busy ? "Disconnecting" : "Disconnect"}
        </Button>
      </div>

      <p className="text-xs text-text-subtle">
        Your members, teams and repositories are untouched either way.
        Disconnecting takes back Craig&apos;s permission; removing the app from
        the organisation is done in GitHub.
      </p>
    </div>
  );
}

/* --- Small pieces ----------------------------------------------------------- */

/**
 * A plain anchor, not `next/link`, and the reason is load-bearing: `Link`
 * prefetches, prefetching this route mints a state and overwrites the cookie,
 * and the click that follows can then never match the state GitHub was
 * actually sent — every connection failing, intermittently, in a way that
 * reads exactly like the CSRF defence working. The Google panel found this the
 * hard way; an `<a>` is fetched on click and at no other time.
 *
 * `install` picks which of GitHub's two screens the same route sends them to.
 * One component rather than two because the difference is one query parameter
 * and everything else — the return path, the prefetch rule, the styling — is
 * identical, and a second copy is a second place to forget the `<a>`.
 */
function ConnectLink({
  label,
  variant = "primary",
  install = false,
  icon,
}: {
  label: string;
  variant?: "primary" | "secondary";
  install?: boolean;
  icon?: React.ReactNode;
}) {
  /* Where to come back to — travels as `?from=`, ends up inside the signed
     state on the server, which is what stops it being an open redirect. */
  const pathname = usePathname();

  const href = `/api/github/connect?${new URLSearchParams({
    from: pathname,
    ...(install ? { install: "1" } : {}),
  })}`;

  return (
    <a
      href={href}
      className={cn(buttonVariants({ variant, size: "sm" }), "self-start")}
    >
      {icon ?? <Refresh />}
      {label}
    </a>
  );
}

/* --- The step's settings panel ---------------------------------------------- */

/**
 * The GitHub step's settings: the connection, over the step's own fields.
 *
 * The sentence up top is the most carefully written one in this file, because
 * this is the first block where the honest answer is "the API can do this and
 * we haven't wired it" rather than "the API can't". Slack's panel says a human
 * always sends the workspace invite, and that is true of Slack forever below
 * Enterprise Grid. GitHub's is a normal paid-organisation call —
 * one request with an email, a role and the team ids — so saying "a person has
 * to do this" would be false, and saying "Craig does this" would be false
 * today. What it says instead is exactly where the line is, which is also what
 * `blocks.ts` records and what the publish gate enforces.
 */
export function GitHubStep({ account }: { account: WorkspaceAccount }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Connection
        </p>
        <p className="text-xs leading-relaxed text-text-muted">
          GitHub is the one service here that can genuinely send the invite
          itself — the organisation, the teams and the role all go in one
          request. Craig doesn&apos;t make that request yet, so for now
          somebody sends the invite by hand. Connecting is what the automatic
          version will run on, and this step can&apos;t be published until the
          organisation is connected.
        </p>
      </div>

      <GitHubConnect account={account} />
    </div>
  );
}
