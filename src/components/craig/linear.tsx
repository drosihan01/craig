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
import { Linear } from "@/components/ui/brand-icons";
import {
  CheckCircle,
  Cloud,
  Delete,
  Refresh,
  Warning,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { LINEAR_OUTCOME_PARAM } from "@/lib/craig/linear-outcome";
import type { WorkspaceAccount } from "@/components/craig/google-workspace";

/**
 * Connecting the company's Linear workspace, from the customer's side.
 *
 * Unverified: this panel has never rendered a real connection, because no
 * Linear workspace has ever been connected. Until one has, every state below
 * except "unavailable" and "disconnected" is a claim about payloads nothing
 * has produced.
 *
 * The model and both of its rules are `google-workspace.tsx`'s, argued at
 * length there. Nobody here can fix our configuration, so nobody here is
 * shown it — the three deployment states collapse into one calm sentence
 * with no button that could only fail. And every state names the account,
 * because a connection is a pairing of two accounts and a screen that names
 * neither is how the wrong pair gets joined; that lesson was paid for with a
 * real Google tenant.
 *
 * What this panel does not have that Google's does is exactly what the
 * feature does not have: no push-health row, because there is no
 * subscription to be healthy; no reconnect warning, because nothing refreshes
 * a token yet and so nothing can discover a dead grant. Each arrives with
 * the runner, not before — a warning wired to a state no code can set is a
 * warning that has never once been true.
 */

/**
 * What `GET /api/linear/connection` answers with. Narrowed here rather than
 * shared with the route: a client component importing from a route handler
 * is one careless edit away from importing the server's credentials with it.
 */
type Reply =
  | {
      ok: true;
      setup: { available: boolean };
      storage: { ready: boolean };
      connection: {
        urlKey: string | null;
        adminEmail: string | null;
        scopes: string[];
        /** Unix seconds. */
        connectedAt: number;
        needsReconnect: boolean;
      } | null;
    }
  | { ok: false; error?: string };

/**
 * The connection as this side of the product understands it. The flattening
 * of the deployment booleans into `unavailable` and the strict separation of
 * `unreachable` — "we couldn't ask" must never render as "you aren't
 * connected" — are both Google's arguments, unchanged.
 */
export type LinearState =
  | { status: "loading" }
  /** Nothing to offer, and nothing the reader can do about it. Calm. */
  | { status: "unavailable" }
  /** Available and nobody has consented. The normal starting point. */
  | { status: "disconnected" }
  | {
      status: "connected";
      urlKey: string | null;
      adminEmail: string | null;
      connectedAt: number;
    }
  /** The session went away underneath us. Nothing is claimed either way. */
  | { status: "signed-out" }
  /** The request itself didn't complete. Nothing is claimed either way. */
  | { status: "unreachable" };

/**
 * Reads the connection, and hands back the state plus a way to read it
 * again. A hook rather than a prop from the server for the reason
 * `useGoogleWorkspace` gives: this panel's home is a block's settings panel,
 * a client component deep inside a canvas with no server boundary to hang a
 * fetch off, and reading here means it is right the moment it opens — which
 * matters most immediately after connecting.
 */
function useLinearConnection(): {
  state: LinearState;
  reload: () => Promise<void>;
} {
  const [state, setState] = React.useState<LinearState>({ status: "loading" });

  /* Guards the writes against a component that has gone away mid-fetch —
     selecting a different block unmounts this one, and a resolved promise
     writing into an unmounted tree is a warning nobody can act on. */
  const liveRef = React.useRef(true);

  const read = React.useCallback(async (): Promise<LinearState> => {
    try {
      const response = await fetch("/api/linear/connection");
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
        urlKey: payload.connection.urlKey,
        adminEmail: payload.connection.adminEmail,
        connectedAt: payload.connection.connectedAt,
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
 * the codes in `linear-outcome.ts`, so nothing a stranger types into
 * `?linear=` renders as prose and an unrecognised code renders as nothing at
 * all. Written for a workspace admin who has never heard of a client id;
 * Linear's real words are in the server log, and the failures that are
 * genuinely ours say so plainly.
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
    body: "Your Linear workspace is connected. Nothing runs on it yet — inviting new starters automatically is still being built — but the permission is in place for when it does.",
  },
  disconnected: {
    tone: "neutral",
    title: "Disconnected",
    body: "Craig no longer holds permission to your Linear workspace. Anybody already in the workspace is untouched.",
  },
  cancelled: {
    tone: "neutral",
    title: "Nothing was connected",
    body: "The consent screen was closed without granting anything, which is a perfectly reasonable thing to do. No permission was given and nothing was stored.",
  },
  "signed-out": {
    tone: "warning",
    title: "You were signed out along the way",
    body: "A connection belongs to an account, and by the time Linear answered there wasn't one to attach it to. Nothing was stored. You're signed in now, so connecting again will finish properly.",
  },
  "no-key": {
    tone: "warning",
    title: "Nobody was sent to Linear",
    body: "We couldn't have kept the permission safely, so we didn't ask you for it — and not asking is better than asking and then losing it. This one is ours to sort out, not yours. Nothing was granted and nothing was stored.",
  },
  mismatch: {
    tone: "warning",
    title: "That didn't match",
    body: "Linear's answer didn't match the request this browser made — usually because it took more than ten minutes, or because it finished in a different browser to the one it started in. Nothing was stored. Start again from this page.",
  },
  "not-an-admin": {
    tone: "warning",
    title: "That account can't invite anybody",
    body: "It signed in perfectly well, but it isn't a workspace admin, and inviting people is exactly what this connection is for. Nothing was stored. Connect again as an admin of your Linear workspace.",
  },
  "not-stored": {
    tone: "danger",
    title: "Granted, but not kept",
    body: "You granted the permission and we couldn't store it safely, so we kept nothing rather than keeping it badly. This one is ours to fix. You can remove the grant in Linear's security settings if you'd rather it didn't exist.",
  },
  "not-configured": {
    tone: "neutral",
    title: "Not available yet",
    body: "Connecting Linear isn't something this account can do yet, so nothing was attempted and nothing is wrong.",
  },
  "bad-credentials": {
    tone: "danger",
    title: "Linear wouldn't accept us",
    body: "Linear turned us away before it ever asked you anything, so you were never shown a consent screen. This one is ours rather than yours: nothing was granted, and nothing about your workspace was changed.",
  },
  unauthorized: {
    tone: "warning",
    title: "Permission wasn't granted",
    body: "Linear wouldn't grant the ability to manage your workspace. Either the admin permission was declined on the consent screen, or it isn't available to this application. Without it nobody can be invited.",
  },
  "invalid-request": {
    tone: "neutral",
    title: "Nothing was connected",
    body: "Linear's answer didn't carry what was needed to finish. Nothing was stored. Try connecting again.",
  },
  "rate-limited": {
    tone: "neutral",
    title: "Too many attempts",
    body: "Linear is turning requests away for the moment. Nothing was stored. Try again shortly.",
  },
  rejected: {
    tone: "danger",
    title: "Linear refused",
    body: "Linear turned the request down without saying usefully why. Nothing was granted and nothing was stored. One more attempt is worth trying; after that it's ours to look into.",
  },
  unreachable: {
    tone: "warning",
    title: "Couldn't reach Linear",
    body: "The request to Linear timed out or couldn't get through. Nothing was stored and nothing was changed.",
  },
};

/** For `useSyncExternalStore` below: nothing to subscribe to, nothing to
    clean up. Module-level so its identity is stable across renders. */
const emptySubscribe = () => () => {};

/** `1754697600` as "4 August 2026, 15:20". Local time, like every date here. */
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
 * Headless like its Google counterpart, and sized to the 320px block panel
 * that is currently its only home.
 */
export function LinearConnect({ account }: { account: WorkspaceAccount }) {
  const { state, reload } = useLinearConnection();
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState<string | null>(null);

  /** An outcome this panel produced itself, which wins over the URL's. */
  const [acted, setActed] = React.useState<string | null>(null);

  /**
   * The `?linear=` code the connect flow redirected back with, read straight
   * off the URL, and the difference from Google is this panel's only home.
   * Google's panel gets its outcome from the settings page's `searchParams`;
   * this one's single mount is a block's settings column, where no server
   * boundary exists to read the URL for it. `useSyncExternalStore` is the
   * shape React 19 wants browser-only reads in: the server snapshot is null,
   * so prerender and hydration claim nothing, and the first client render
   * reads the real value — without the setState-in-effect cascade the lint
   * refuses, and without `useSearchParams`'s prerender demands on a page
   * that never needed them. The subscription is empty because the query
   * string only changes on a navigation, which remounts this panel anyway.
   */
  const arrived = React.useSyncExternalStore(
    emptySubscribe,
    () => new URLSearchParams(window.location.search).get(LINEAR_OUTCOME_PARAM),
    () => null,
  );

  async function disconnect() {
    setBusy(true);
    setFailed(null);
    try {
      const response = await fetch("/api/linear/connection", {
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
         whether a connection exists, and a panel drawing its own conclusion
         about that can be confidently wrong. */
      await reload();
    } catch {
      setFailed(
        "That didn't reach us. Your workspace is still connected — try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const shown = OUTCOMES[acted ?? arrived ?? ""];

  return (
    <div className="flex flex-col gap-3">
      {shown && (
        <Callout
          tone={shown.tone}
          title={shown.title}
          /* No icon on the neutral ones — half of these outcomes are somebody
             reasonably deciding something, and a triangle that appears next
             to reasonable things stops meaning anything by the time it
             appears next to an unreasonable one. */
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

      {/* Neither of these claims anything about the company's account,
          because neither request got far enough to know. */}
      {state.status === "signed-out" && (
        <Callout tone="neutral" title="Sign in again">
          Your session has expired, so there was nothing to read this against.
          Sign in and this page will say where your workspace stands.
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

/**
 * The feature is off, said as a fact about the product rather than a fault,
 * covering "no OAuth application" and "nowhere to keep a token" in one calm
 * sentence — they are different facts fixed by the same person, and neither
 * is the customer. No Connect button, because pressing it could only fail.
 */
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
 * The state every account starts in. The identity line is not decoration —
 * consent pairs the Linear workspace chosen on Linear's screen with the
 * Craig account it is written against, and this is the last screen where
 * both are visible at once. The admin warning sits before the redirect for
 * the reason Google's does: consenting as a non-admin looks fine on the day
 * and is refused at the callback, and better yet is nobody making the trip.
 */
function NotConnected({ account }: { account: WorkspaceAccount }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Linear className="size-4" />
        <span className="text-base font-medium">Not connected</span>
      </div>

      <p className="text-sm text-text-muted">
        Sign in to Linear as a workspace admin. It attaches to{" "}
        <span className="font-medium text-text">{account.email}</span>.
      </p>

      <ConnectLink label="Connect Linear" />
    </div>
  );
}

/**
 * A live connection, named on both sides — "connected" alone is a claim to
 * be trusted, and "linear.app/katalis, granted by mara@katalis.ai on
 * 4 August" is a claim to be checked, which is what whoever is reading this
 * after the fact is usually here to do.
 */
function Connected({
  state,
  busy,
  onDisconnect,
}: {
  state: Extract<LinearState, { status: "connected" }>;
  busy: boolean;
  onDisconnect: () => void;
}) {
  /* The callback refuses to store a connection without a workspace key, so
     the fallback should be unreachable; it exists because the alternative on
     a hand-edited row is the word "null" where a company's name goes. */
  const workspace = state.urlKey ? `linear.app/${state.urlKey}` : "your workspace";

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Linear className="size-4" />
          <span className="text-base font-medium">{workspace}</span>
          <Badge size="sm" tone="success">
            Connected
          </Badge>
        </div>
        <p className="text-sm text-text-muted">
          {state.adminEmail
            ? `Granted by ${state.adminEmail} on ${readableWhen(state.connectedAt)}.`
            : `Granted on ${readableWhen(state.connectedAt)}.`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ConnectLink label="Connect again" variant="secondary" />
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
        Anybody already in the workspace is untouched.
      </p>
    </div>
  );
}

/* --- Small pieces ---------------------------------------------------------- */

/**
 * A plain anchor, and not `next/link`, for the reason spelled out on
 * Google's `ConnectLink`: `Link` prefetches, a prefetch mints a state and
 * sets the cookie, and a real click moments later overwrites it — every
 * connection failing verification, intermittently, in a way that reads
 * exactly like the CSRF defence working. An `<a>` is fetched when somebody
 * clicks it and at no other time.
 */
function ConnectLink({
  label,
  variant = "primary",
}: {
  label: string;
  variant?: "primary" | "secondary";
}) {
  /* Where to come back to. Travels as a query parameter and ends up inside
     the *signed* state on the server, which is what stops it being an open
     redirect. */
  const pathname = usePathname();

  return (
    <a
      href={`/api/linear/connect?from=${encodeURIComponent(pathname)}`}
      className={cn(buttonVariants({ variant, size: "sm" }), "self-start")}
    >
      <Refresh />
      {label}
    </a>
  );
}

/* --- The step's settings panel --------------------------------------------- */

/**
 * The Linear step's connection, rendered above the step's own fields.
 *
 * Unlike Google's, this block keeps its setup fields — teams, role, who
 * provisions it — because unlike Google's, nothing runs on this step yet: a
 * person does the inviting, and the fields are their instructions. The
 * sentence below says exactly what the connection buys today, which is the
 * publish gate and nothing more. When a runner exists, this sentence and
 * those fields both change; promising the automation now would be the panel
 * lying about which decade of the feature it is standing in.
 */
export function LinearStep({ account }: { account: WorkspaceAccount }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Connection
        </p>
        <p className="text-xs leading-relaxed text-text-muted">
          Inviting them automatically is still being built. Connecting your
          workspace is the first half: it proves the permission works, and
          publishing a workflow with this step needs it in place.
        </p>
      </div>

      <LinearConnect account={account} />
    </div>
  );
}
