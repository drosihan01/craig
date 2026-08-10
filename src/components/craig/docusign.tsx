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
  CheckCircle,
  Cloud,
  Delete,
  Draw,
  Refresh,
  Warning,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { DOCUSIGN_OUTCOME_PARAM } from "@/lib/craig/docusign-outcome";
import type { WorkspaceAccount } from "@/components/craig/google-workspace";

/**
 * Connecting the company's DocuSign account, from the customer's side.
 *
 * Unverified: no DocuSign account has ever been connected, so every state
 * below has been rendered only with the server answering "nothing configured".
 * What a live one still has to prove: that a completed consent round-trips
 * into the `connected` card with the right account named on it, and that the
 * outcome codes a real redirect carries match the table here.
 *
 * The same two rules as the Google and Slack panels, because they were paid
 * for there: nobody here can fix our configuration, so nobody here is shown it
 * — every deployment-side gap collapses into one calm "not available yet"; and
 * every state names the account, because a connection is a pairing of two
 * accounts and this screen is the only place both are knowable at once.
 *
 * Two rules are this panel's own.
 *
 * **It must not promise automation.** `blocks.ts` says this block has no
 * runner, so connecting DocuSign today buys standing permission and nothing
 * else — no envelope has ever been sent by this code. The copy says exactly
 * that.
 *
 * **It must say which DocuSign it is talking to.** Everywhere else in this
 * product a connection is a connection. Here there are two environments, and
 * an envelope signed in the demo one is a test document, not a legally binding
 * signature — which is precisely the property this whole block exists to buy.
 * A panel that said "Connected" over a demo account would be hiding the only
 * fact that matters about it, so the environment is shown wherever the
 * connection is.
 *
 * There is no DocuSign glyph in `brand-icons.tsx` — the marks that can be
 * drawn are the freely licensed ones — so the contract block's own Material
 * glyph stands in, matching the block library tile.
 */

/**
 * What `GET /api/docusign/connection` answers with. Narrowed here rather than
 * imported from the route, for the reason the Google panel gives: a client
 * component importing from a route handler is one careless edit from importing
 * the server's credentials with it.
 */
type Reply =
  | {
      ok: true;
      setup: {
        available: boolean;
        environment: "demo" | "production" | null;
      };
      storage: { ready: boolean };
      connection: {
        accountName: string | null;
        adminEmail: string | null;
        scopes: string[];
        /** Unix seconds. */
        connectedAt: number;
        needsReconnect: boolean;
      } | null;
    }
  | { ok: false; error?: string };

/**
 * Four states plus the two refusals, flattened exactly as the Google panel
 * flattens its own — "no application registered" and "nowhere to keep a token"
 * are different jobs for different people and one sentence for a customer,
 * while "we couldn't ask" must never be rendered as "you aren't connected".
 */
export type DocusignState =
  | { status: "loading" }
  /** Nothing to offer, and nothing the reader can do about it. Calm. */
  | { status: "unavailable" }
  /** Available and nobody has connected. The normal starting point. */
  | { status: "disconnected"; environment: "demo" | "production" | null }
  | {
      status: "connected";
      accountName: string | null;
      adminEmail: string | null;
      connectedAt: number;
      needsReconnect: boolean;
      environment: "demo" | "production" | null;
    }
  /** The session went away underneath us. Nothing is claimed either way. */
  | { status: "signed-out" }
  /** The request itself didn't complete. Nothing is claimed either way. */
  | { status: "unreachable" };

/**
 * Reads the connection, and hands back the state plus a way to read it again.
 * Same shape as `useGoogleWorkspace`, same reasons: the panel lives deep
 * inside the editor's canvas with no server boundary to hang a fetch off, and
 * `read` returns rather than stores so both callers keep their `setState` at
 * the call site.
 */
function useDocusignConnection(): {
  state: DocusignState;
  reload: () => Promise<void>;
} {
  const [state, setState] = React.useState<DocusignState>({
    status: "loading",
  });

  /* Guards writes from a component unmounted mid-fetch — selecting another
     block in the editor does exactly that. */
  const liveRef = React.useRef(true);

  const read = React.useCallback(async (): Promise<DocusignState> => {
    try {
      const response = await fetch("/api/docusign/connection");
      const payload = (await response.json()) as Reply;

      if (!payload.ok) {
        return response.status === 401
          ? { status: "signed-out" }
          : { status: "unreachable" };
      }

      if (!payload.setup.available || !payload.storage.ready) {
        return { status: "unavailable" };
      }

      if (!payload.connection) {
        return {
          status: "disconnected",
          environment: payload.setup.environment,
        };
      }

      return {
        status: "connected",
        accountName: payload.connection.accountName,
        adminEmail: payload.connection.adminEmail,
        connectedAt: payload.connection.connectedAt,
        needsReconnect: payload.connection.needsReconnect,
        environment: payload.setup.environment,
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
 * the closed set in `docusign-outcome.ts`, so nothing a stranger types into
 * `?docusign=` renders as prose, and an unrecognised code renders as nothing
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
    body: "Your DocuSign account is connected. Nothing is sent through it yet — when contract steps start running on their own, this permission is what they'll run on, and until then it simply sits here.",
  },
  disconnected: {
    tone: "neutral",
    title: "Craig's copy is gone",
    body: "Craig no longer holds permission to your DocuSign account. One thing is left to you: DocuSign gives applications no way to hand a permission back, so open your DocuSign profile, go to Connected Apps and revoke Craig there to withdraw it at their end too.",
  },
  cancelled: {
    tone: "neutral",
    title: "Nothing was connected",
    body: "The consent screen was closed without granting anything, which is a perfectly reasonable thing to do. No permission was given and nothing was stored.",
  },
  "signed-out": {
    tone: "warning",
    title: "You were signed out along the way",
    body: "A connection belongs to an account, and by the time DocuSign answered there wasn't one to attach it to. Nothing was stored. You're signed in now, so connecting again will finish properly.",
  },
  "no-key": {
    tone: "warning",
    title: "Nobody was sent to DocuSign",
    body: "We couldn't have kept the permission safely, so we didn't ask you for it — and not asking is better than asking and then losing it. This one is ours to sort out, not yours. Nothing was granted and nothing was stored.",
  },
  mismatch: {
    tone: "warning",
    title: "That didn't match",
    body: "DocuSign's answer didn't match the request this browser made — usually because it took more than a few minutes, or finished in a different browser to the one it started in. Nothing was stored. Start again from this page.",
  },
  "not-stored": {
    tone: "danger",
    title: "Granted, but not kept",
    body: "You granted the permission and we couldn't store it safely, so we kept nothing rather than keeping it badly. This one is ours to fix. The consent still exists at DocuSign's end — you can remove it under Connected Apps in your DocuSign profile if you'd rather it didn't.",
  },
  "not-configured": {
    tone: "neutral",
    title: "Not available yet",
    body: "Connecting DocuSign isn't something this account can do yet, so nothing was attempted and nothing is wrong.",
  },
  "needs-reconnect": {
    tone: "warning",
    title: "It needs connecting again",
    body: "The permission Craig was given is no longer valid — DocuSign's permissions lapse after about a month unused, and they also end when somebody revokes them under Connected Apps. Nothing is broken; connecting once more is the whole fix.",
  },
  "bad-credentials": {
    tone: "danger",
    title: "DocuSign wouldn't accept us",
    body: "DocuSign turned us away before it ever asked you anything, so you were never shown a consent screen. This one is ours rather than yours: nothing was granted, and nothing in your DocuSign account was changed.",
  },
  unauthorized: {
    tone: "warning",
    title: "Permission wasn't granted",
    body: "DocuSign connected, but without the permission Craig actually needs — sending a document for signature. Nothing was stored; connecting again after we've sorted our side is the fix.",
  },
  "invalid-request": {
    tone: "neutral",
    title: "Nothing was connected",
    body: "DocuSign's answer didn't carry what was needed to finish — their consent codes expire two minutes after they're issued, so an interruption is usually all it takes. Nothing was stored. Try connecting again.",
  },
  "rate-limited": {
    tone: "neutral",
    title: "Too many attempts",
    body: "DocuSign is turning requests away for the moment. Nothing was stored, and their limits reset on the hour. Try again shortly.",
  },
  rejected: {
    tone: "danger",
    title: "DocuSign refused",
    body: "DocuSign turned the request down without saying usefully why. Nothing was granted and nothing was stored. One more attempt is worth trying; after that it's ours to look into.",
  },
  unreachable: {
    tone: "warning",
    title: "Couldn't reach DocuSign",
    body: "The request to DocuSign timed out or couldn't get through. Nothing was stored and nothing was changed.",
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
export function DocusignConnect({ account }: { account: WorkspaceAccount }) {
  const { state, reload } = useDocusignConnection();
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState<string | null>(null);

  /**
   * The `?docusign=` code the connect flow redirected back with, read straight
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
    () =>
      new URLSearchParams(window.location.search).get(DOCUSIGN_OUTCOME_PARAM),
    () => null,
  );

  /* An outcome this panel produced itself, which wins over the one in the URL
     — disconnecting under a `?docusign=connected` must not leave a green
     "Connected" box over a panel that now says nobody is. */
  const [acted, setActed] = React.useState<string | null>(null);

  async function disconnect() {
    setBusy(true);
    setFailed(null);
    try {
      const response = await fetch("/api/docusign/connection", {
        method: "DELETE",
      });
      if (!response.ok) {
        setFailed(
          "That didn't go through. Your DocuSign account is still connected — try again.",
        );
        return;
      }
      setActed("disconnected");
      /* Re-read rather than patching the local copy: the server decides
         whether a connection exists. */
      await reload();
    } catch {
      setFailed(
        "That didn't reach us. Your DocuSign account is still connected — try again.",
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

      {state.status === "disconnected" && (
        <NotConnected account={account} environment={state.environment} />
      )}

      {state.status === "connected" && (
        <Connected state={state} busy={busy} onDisconnect={disconnect} />
      )}

      {/* Neither of these claims anything about the company's DocuSign,
          because neither request got far enough to know. */}
      {state.status === "signed-out" && (
        <Callout tone="neutral" title="Sign in again">
          Your session has expired, so there was nothing to read this against.
          Sign in and this page will say where your DocuSign account stands.
        </Callout>
      )}

      {state.status === "unreachable" && (
        <Callout tone="neutral" title="Couldn't check just now">
          We couldn&apos;t reach the server to find out whether your DocuSign
          account is connected. Nothing has changed either way — reload the page
          to try again.
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
 * Which DocuSign this deployment is pointed at, shown wherever the connection
 * is.
 *
 * Only the demo case says anything. Production is the expected state and a
 * badge saying so would be noise; demo is the one that has to be impossible to
 * miss, because everything signed in it is a test document with no legal
 * standing — and a contract step that quietly produced test documents would be
 * the most expensive failure this block could have.
 */
function EnvironmentNote({
  environment,
}: {
  environment: "demo" | "production" | null;
}) {
  if (environment !== "demo") return null;
  return (
    <Callout tone="warning" title="This is DocuSign's demo environment">
      Anything signed here is a test document — it carries a demo watermark and
      is not a legally binding signature. Fine for setting a workflow up; not
      something to send a real employment contract through.
    </Callout>
  );
}

/**
 * The state every account starts in. The identity line is the Google panel's
 * hard-won rule — a consent is a pairing of two accounts, and this is the last
 * screen where both are visible at once.
 */
function NotConnected({
  account,
  environment,
}: {
  account: WorkspaceAccount;
  environment: "demo" | "production" | null;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Draw className="size-4" />
        <span className="text-base font-medium">Not connected</span>
      </div>

      <p className="text-sm text-text-muted">
        Sign in to DocuSign as an administrator. It attaches to{" "}
        <span className="font-medium text-text">{account.email}</span>, and
        contracts would be sent from whichever DocuSign account consents.
      </p>

      <EnvironmentNote environment={environment} />

      <ConnectLink label="Connect DocuSign" />
    </div>
  );
}

/**
 * A live connection, named on both sides — "Connected" on its own is a claim
 * to be trusted, "Katalis Pty Ltd, connected on 4 August" is a claim to be
 * checked. The consenting administrator is named too, and for this provider
 * that is not decoration: every envelope this connection would ever send goes
 * out as that person.
 */
function Connected({
  state,
  busy,
  onDisconnect,
}: {
  state: Extract<DocusignState, { status: "connected" }>;
  busy: boolean;
  onDisconnect: () => void;
}) {
  /* DocuSign returns an account name for every account; this fallback exists
     because the alternative on an odd record is the word "null" where a
     company's name goes. */
  const name = state.accountName ?? "your DocuSign account";

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Draw className="size-4" />
          <span className="text-base font-medium">{name}</span>
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
          Connected on {readableWhen(state.connectedAt)}
          {state.adminEmail ? ` by ${state.adminEmail}` : ""}.
        </p>
      </div>

      <EnvironmentNote environment={state.environment} />

      {state.needsReconnect && (
        <Callout tone="warning" title="This has stopped working">
          The permission has lapsed or been revoked. An administrator has to
          connect it again.
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
        Disconnecting deletes Craig&apos;s copy of the permission. DocuSign
        can&apos;t be told to forget it from here — Connected Apps in your
        DocuSign profile is where that&apos;s done.
      </p>
    </div>
  );
}

/* --- Small pieces ----------------------------------------------------------- */

/**
 * A plain anchor, not `next/link`, and the reason is load-bearing: `Link`
 * prefetches, prefetching this route mints a state and overwrites the cookie,
 * and the click that follows can then never match the state DocuSign was
 * actually sent — every connection failing, intermittently, in a way that
 * reads exactly like the CSRF defence working. The Google panel found this the
 * hard way; an `<a>` is fetched on click and at no other time.
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
      href={`/api/docusign/connect?from=${encodeURIComponent(pathname)}`}
      className={cn(buttonVariants({ variant, size: "sm" }), "self-start")}
    >
      <Refresh />
      {label}
    </a>
  );
}

/* --- The step's settings panel ---------------------------------------------- */

/**
 * The contract step's settings: the connection, over the step's own fields.
 *
 * **This panel appears on every "Sign contract" step, including the ones
 * signing in Craig.** `block-settings.tsx` keys panels by preset id and the
 * editor hands them nothing but the account, so a panel cannot see which
 * signing method this particular step has chosen. Rather than silently imply
 * that every contract step needs DocuSign — a false requirement is worse than
 * a missing one, which is the argument `blocks.ts` makes about the publish
 * gate — the first sentence says plainly when it applies. When the editor can
 * hand a panel its block, this becomes a conditional render and the sentence
 * can go.
 *
 * The copy is careful about three things:
 *
 * - It does not say Craig sends the contract. No runner exists; nothing has
 *   ever been sent through this connection.
 * - It says why DocuSign rather than Craig's own signing, because that is a
 *   real decision an admin is making in the field above and the reason is not
 *   obvious from the two labels: the seal, the certificate of completion and
 *   the audit trail are what a disputed contract is defended with.
 * - It does not suggest Craig's own signing is a lesser version of the same
 *   thing. It is the right tool for a handbook acknowledgement and the wrong
 *   one for an employment contract.
 */
export function DocusignStep({ account }: { account: WorkspaceAccount }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Connection
        </p>
        <p className="text-xs leading-relaxed text-text-muted">
          Only used when this step&apos;s signing method is DocuSign — set it to
          anything else and nothing below applies. DocuSign is here for the
          employment contract specifically: the sealed document, certificate of
          completion and audit trail are what a contract is defended with if
          it&apos;s ever disputed. Handbook and code-of-conduct
          acknowledgements are better signed in Craig. Nothing is sent through
          this connection yet, and the step can&apos;t be published without it
          once DocuSign is chosen.
        </p>
      </div>

      <DocusignConnect account={account} />
    </div>
  );
}
