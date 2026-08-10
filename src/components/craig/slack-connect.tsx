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
import {
  Apps,
  CheckCircle,
  Cloud,
  Delete,
  Refresh,
  Warning,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { SLACK_OUTCOME_PARAM } from "@/lib/craig/slack-outcome";
import type { WorkspaceAccount } from "@/components/craig/google-workspace";

/**
 * Connecting the company's Slack workspace, from the customer's side.
 *
 * Unverified: no Slack workspace has ever been connected, so every state
 * below has been rendered only with the server answering "nothing
 * configured". What a live one still has to prove: that a completed install
 * round-trips into the `connected` card with the right workspace named on
 * it, and that the outcome codes a real redirect carries match the table
 * here.
 *
 * The same two rules as the Google panel, because they were paid for there:
 * nobody here can fix our configuration, so nobody here is shown it — every
 * deployment-side gap collapses into one calm "not available yet"; and every
 * state names the account, because a connection is a pairing of two accounts
 * and this screen is the only place both are knowable at once.
 *
 * One rule is this panel's own: **it must not promise automation.** The
 * registry (`blocks.ts`) says this block has no runner, and Slack's API
 * cannot send a workspace invite for anyone outside Enterprise Grid — so the
 * copy says what connecting actually buys today, which is Craig being able
 * to see the workspace, and later (when a runner exists) to place a joined
 * person into their day-one channels. A panel that said "I invite them to
 * Slack" would be the product lying about the one thing this whole registry
 * exists to keep it honest about.
 *
 * The Slack glyph is deliberately not here — Simple Icons dropped the mark
 * at the trademark holder's request (see `brand-icons.tsx`), so the block's
 * Material glyph stands in, matching the block library tile.
 */

/**
 * What `GET /api/slack/connection` answers with. Narrowed here rather than
 * imported from the route, for the reason the Google panel gives: a client
 * component importing from a route handler is one careless edit from
 * importing the server's credentials with it.
 */
type Reply =
  | {
      ok: true;
      setup: { available: boolean };
      storage: { ready: boolean };
      connection: {
        teamName: string | null;
        scopes: string[];
        /** Unix seconds. */
        connectedAt: number;
        needsReconnect: boolean;
      } | null;
    }
  | { ok: false; error?: string };

/**
 * Four states plus the two refusals, flattened exactly as the Google panel
 * flattens its own — "no app registered" and "nowhere to keep a token" are
 * different jobs for different people and one sentence for a customer, while
 * "we couldn't ask" must never be rendered as "you aren't connected".
 */
export type SlackState =
  | { status: "loading" }
  /** Nothing to offer, and nothing the reader can do about it. Calm. */
  | { status: "unavailable" }
  /** Available and nobody has connected. The normal starting point. */
  | { status: "disconnected" }
  | {
      status: "connected";
      teamName: string | null;
      connectedAt: number;
      needsReconnect: boolean;
    }
  /** The session went away underneath us. Nothing is claimed either way. */
  | { status: "signed-out" }
  /** The request itself didn't complete. Nothing is claimed either way. */
  | { status: "unreachable" };

/**
 * Reads the connection, and hands back the state plus a way to read it
 * again. Same shape as `useGoogleWorkspace`, same reasons: the panel lives
 * deep inside the editor's canvas with no server boundary to hang a fetch
 * off, and `read` returns rather than stores so both callers keep their
 * `setState` at the call site.
 */
function useSlackConnection(): {
  state: SlackState;
  reload: () => Promise<void>;
} {
  const [state, setState] = React.useState<SlackState>({ status: "loading" });

  /* Guards writes from a component unmounted mid-fetch — selecting another
     block in the editor does exactly that. */
  const liveRef = React.useRef(true);

  const read = React.useCallback(async (): Promise<SlackState> => {
    try {
      const response = await fetch("/api/slack/connection");
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
        teamName: payload.connection.teamName,
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
 * the closed set in `slack-outcome.ts`, so nothing a stranger types into
 * `?slack=` renders as prose, and an unrecognised code renders as nothing
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
    body: "Your Slack workspace is connected. Nothing runs on it yet — when Slack steps start running on their own, this permission is what they'll run on, and until then it simply sits here, revocable below.",
  },
  disconnected: {
    tone: "neutral",
    title: "Disconnected",
    body: "Craig no longer holds permission to your Slack workspace. Channels and members are untouched — only Craig's access is gone.",
  },
  cancelled: {
    tone: "neutral",
    title: "Nothing was connected",
    body: "The consent screen was closed without granting anything, which is a perfectly reasonable thing to do. No permission was given and nothing was stored.",
  },
  "signed-out": {
    tone: "warning",
    title: "You were signed out along the way",
    body: "A connection belongs to an account, and by the time Slack answered there wasn't one to attach it to. Nothing was stored. You're signed in now, so connecting again will finish properly.",
  },
  "no-key": {
    tone: "warning",
    title: "Nobody was sent to Slack",
    body: "We couldn't have kept the permission safely, so we didn't ask you for it — and not asking is better than asking and then losing it. This one is ours to sort out, not yours. Nothing was granted and nothing was stored.",
  },
  mismatch: {
    tone: "warning",
    title: "That didn't match",
    body: "Slack's answer didn't match the request this browser made — usually because it took more than ten minutes, or finished in a different browser to the one it started in. Nothing was stored. Start again from this page.",
  },
  "not-stored": {
    tone: "danger",
    title: "Granted, but not kept",
    body: "You granted the permission and we couldn't store it safely, so we kept nothing rather than keeping it badly. This one is ours to fix. You can remove the app from your workspace's settings if you'd rather the grant didn't exist.",
  },
  "not-configured": {
    tone: "neutral",
    title: "Not available yet",
    body: "Connecting Slack isn't something this account can do yet, so nothing was attempted and nothing is wrong.",
  },
  "needs-reconnect": {
    tone: "warning",
    title: "It needs connecting again",
    body: "The permission Craig was given is no longer valid — the app was removed from the workspace, or the token was revoked. Nothing is broken; a workspace admin has to connect it once more.",
  },
  "bad-credentials": {
    tone: "danger",
    title: "Slack wouldn't accept us",
    body: "Slack turned us away before it ever asked you anything, so you were never shown a consent screen. This one is ours rather than yours: nothing was granted, and nothing in your workspace was changed.",
  },
  unauthorized: {
    tone: "warning",
    title: "Permission wasn't granted",
    body: "Slack connected, but without the permission Craig actually needs — adding people to channels. Nothing was stored; connecting again after we've sorted our side is the fix.",
  },
  "invalid-request": {
    tone: "neutral",
    title: "Nothing was connected",
    body: "Slack's answer didn't carry what was needed to finish. Nothing was stored. Try connecting again.",
  },
  "rate-limited": {
    tone: "neutral",
    title: "Too many attempts",
    body: "Slack is turning requests away for the moment. Nothing was stored. Try again shortly.",
  },
  rejected: {
    tone: "danger",
    title: "Slack refused",
    body: "Slack turned the request down without saying usefully why. Nothing was granted and nothing was stored. One more attempt is worth trying; after that it's ours to look into.",
  },
  unreachable: {
    tone: "warning",
    title: "Couldn't reach Slack",
    body: "The request to Slack timed out or couldn't get through. Nothing was stored and nothing was changed.",
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
 * Headless like `GoogleWorkspaceConnect`, and sized to the block panel's
 * 320px column, which today is its only home.
 */
export function SlackConnect({ account }: { account: WorkspaceAccount }) {
  const { state, reload } = useSlackConnection();
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState<string | null>(null);

  /**
   * The `?slack=` code the connect flow redirected back with, read straight
   * off the URL rather than through `useSearchParams`. Not squeamishness:
   * this panel is mounted by the workflow editor, which this block must not
   * edit, and `useSearchParams` asks the nearest boundary *above* it to
   * account for the dynamic read. `useSyncExternalStore` is the sanctioned
   * way to read a value React doesn't own — the server snapshot is `null`
   * (the server cannot know the browser's query string), the client snapshot
   * is the code, and the subscribe is empty because the value only ever
   * changes via a full redirect, which remounts everything anyway.
   */
  const outcome = React.useSyncExternalStore(
    React.useCallback(() => () => {}, []),
    () => new URLSearchParams(window.location.search).get(SLACK_OUTCOME_PARAM),
    () => null,
  );

  /* An outcome this panel produced itself, which wins over the one in the
     URL — disconnecting under a `?slack=connected` must not leave a green
     "Connected" box over a panel that now says nobody is. */
  const [acted, setActed] = React.useState<string | null>(null);

  async function disconnect() {
    setBusy(true);
    setFailed(null);
    try {
      const response = await fetch("/api/slack/connection", {
        method: "DELETE",
      });
      if (!response.ok) {
        setFailed(
          "That didn't go through. Your workspace is still connected — try again.",
        );
        return;
      }
      setActed("disconnected");
      /* Re-read rather than patching the local copy: the server decides
         whether a connection exists. */
      await reload();
    } catch {
      setFailed(
        "That didn't reach us. Your workspace is still connected — try again.",
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

      {state.status === "loading" && <Skeleton className="h-44 w-full" />}

      {state.status === "unavailable" && <Unavailable />}

      {state.status === "disconnected" && <NotConnected account={account} />}

      {state.status === "connected" && (
        <Connected state={state} busy={busy} onDisconnect={disconnect} />
      )}

      {/* Neither of these claims anything about the company's workspace,
          because neither request got far enough to know. */}
      {state.status === "signed-out" && (
        <Callout tone="neutral" title="Sign in again">
          Your session has expired, so there was nothing to read this against.
          Sign in and this page will say where your Slack workspace stands.
        </Callout>
      )}

      {state.status === "unreachable" && (
        <Callout tone="neutral" title="Couldn't check just now">
          We couldn&apos;t reach the server to find out whether your workspace
          is connected. Nothing has changed either way — reload the page to try
          again.
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
 * The state every account starts in. The identity line is the Google
 * panel's hard-won rule — a consent is a pairing of two accounts, and this
 * is the last screen where both are visible at once.
 */
function NotConnected({ account }: { account: WorkspaceAccount }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Apps className="size-4" />
        <span className="text-base font-medium">Not connected</span>
      </div>

      <p className="text-sm text-text-muted">
        Sign in to Slack as a workspace admin. It attaches to{" "}
        <span className="font-medium text-text">{account.email}</span>.
      </p>

      <ConnectLink label="Connect Slack" />
    </div>
  );
}

/**
 * A live connection, named on both sides — "Connected" on its own is a claim
 * to be trusted, "Katalis, connected on 4 August" is a claim to be checked.
 */
function Connected({
  state,
  busy,
  onDisconnect,
}: {
  state: Extract<SlackState, { status: "connected" }>;
  busy: boolean;
  onDisconnect: () => void;
}) {
  /* The exchange refuses to store a connection with no workspace name, so
     this fallback should be unreachable — it exists because the alternative
     on an odd record is the word "null" where a company's name goes. */
  const team = state.teamName ?? "your workspace";

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Apps className="size-4" />
          <span className="text-base font-medium">{team}</span>
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

      {state.needsReconnect && (
        <Callout tone="warning" title="This has stopped working">
          The app was removed from the workspace or its permission was
          revoked. A workspace admin has to connect it again.
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
        Your channels and members are untouched either way.
      </p>
    </div>
  );
}

/* --- Small pieces ----------------------------------------------------------- */

/**
 * A plain anchor, not `next/link`, and the reason is load-bearing: `Link`
 * prefetches, prefetching this route mints a state and overwrites the
 * cookie, and the click that follows can then never match the state Slack
 * was actually sent — every connection failing, intermittently, in a way
 * that reads exactly like the CSRF defence working. The Google panel found
 * this the hard way; an `<a>` is fetched on click and at no other time.
 */
function ConnectLink({
  label,
  variant = "primary",
}: {
  label: string;
  variant?: "primary" | "secondary";
}) {
  /* Where to come back to — travels as `?from=`, ends up inside the signed
     state on the server, which is what stops it being an open redirect. */
  const pathname = usePathname();

  return (
    <a
      href={`/api/slack/connect?from=${encodeURIComponent(pathname)}`}
      className={cn(buttonVariants({ variant, size: "sm" }), "self-start")}
    >
      <Refresh />
      {label}
    </a>
  );
}

/* --- The step's settings panel ---------------------------------------------- */

/**
 * The Slack step's settings: the connection, over the step's own fields.
 *
 * Unlike the Google step this one keeps its fields — channels, account type,
 * workspace URL — because nothing reads them *yet* and they are the admin's
 * only place to write down what a runner will one day need. The sentence up
 * top is therefore careful twice over: it says the step can't run without
 * the connection (true — the publish gate enforces it), and it does not say
 * Craig sends the invite (false on every Slack plan below Enterprise Grid,
 * and `blocks.ts` says why).
 */
export function SlackStep({ account }: { account: WorkspaceAccount }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Connection
        </p>
        <p className="text-xs leading-relaxed text-text-muted">
          Slack only lets a person send the workspace invite — that stays
          with whoever runs your Slack. Connecting is what the automatic half
          will run on: noticing the new starter has joined, and adding them
          to their day-one channels. Neither runs yet, and this step
          can&apos;t be published until the workspace is connected.
        </p>
      </div>

      <SlackConnect account={account} />
    </div>
  );
}
