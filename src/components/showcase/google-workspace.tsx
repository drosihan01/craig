"use client";

import * as React from "react";
import {
  Badge,
  Button,
  Callout,
  Skeleton,
  buttonVariants,
} from "@/components/ui";
import { Google } from "@/components/ui/brand-icons";
import {
  CheckCircle,
  Cloud,
  Delete,
  Refresh,
  Warning,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/**
 * Connecting the company's own Google Workspace, from the customer's side.
 *
 * The model is one consent, once: a super admin at the company grants Craig
 * permission to manage their users, and what comes back is kept so that a seat
 * can be created months later with nobody present. This is where that
 * connection is made, inspected and undone.
 *
 * It used to live only in the sandbox, and moving it is the whole point of this
 * file. The sandbox is the builder's hub and says so at the top of every
 * screen — it is not part of the product, and it is signed in as whoever the
 * builder last signed in as. Connecting a Workspace from there attached a real
 * company's tenant to a throwaway test account, which is not a bug in the
 * OAuth flow: every step of it worked exactly as written. It is a bug in where
 * the button was. So the button now lives on a screen that belongs to an
 * account and says whose it is before anybody leaves for Google.
 *
 * Two rules run everything below.
 *
 * **Nobody here can fix our configuration, so nobody here is shown it.** The
 * server answers with the names of missing variables, a redirect URI and a
 * scope list, all of which are exactly right for the builder's checklist and
 * none of which belong on a customer's screen: a company that bought this
 * cannot register an OAuth client, and showing them one they can't act on
 * turns "not available yet" into "something is broken and it might be you".
 * Every one of those three deployment states therefore collapses into one calm
 * sentence, and the panel simply doesn't offer a button that could only fail.
 *
 * **Every state names the account.** Before the redirect, the panel says which
 * Craig account the consent will be attached to; after it, it says which
 * Workspace is attached and which admin granted it. That pairing is the
 * mistake this screen exists to make impossible to repeat — the connection is
 * a relationship between two accounts, and a screen that names neither of them
 * lets somebody attach the wrong one to the wrong one and never find out.
 */

/**
 * What `GET /api/google/connection` answers with.
 *
 * Narrowed here rather than shared with the route, for the reason the sandbox
 * gives about its own response type: a client component that imports from a
 * route handler is one careless edit away from importing the server's
 * credentials with it. The shape is small and the route is next door.
 *
 * The deployment fields are read and deliberately dropped — see the note above
 * about what a customer can act on. They are typed anyway so that the
 * conversion below is a total function of what the server actually sends,
 * rather than a guess that silently starts reading `undefined` if the route
 * changes shape.
 */
type Reply =
  | {
      ok: true;
      setup: { available: boolean };
      storage: { ready: boolean };
      connection: {
        domain: string | null;
        adminEmail: string | null;
        scopes: string[];
        /** Unix seconds. */
        connectedAt: number;
        needsReconnect: boolean;
      } | null;
    }
  | { ok: false; error?: string };

/**
 * The connection as this side of the product understands it.
 *
 * Four states, not the three booleans the route returns, and the flattening is
 * the design. "This deployment has no OAuth client" and "this deployment has
 * nowhere to keep a token" are two different jobs for two different people and
 * one single sentence for a customer — there is no button either of them
 * changes, so drawing them apart would only be showing somebody the shape of
 * our infrastructure. `unreachable` is kept separate from all of them because
 * "we couldn't ask" must never be rendered as "you aren't connected": one is a
 * failed request and the other is a claim about the company's account.
 */
export type WorkspaceState =
  | { status: "loading" }
  /** Nothing to offer, and nothing the reader can do about it. Calm. */
  | { status: "unavailable" }
  /** Available and nobody has consented. The normal starting point. */
  | { status: "disconnected" }
  | {
      status: "connected";
      domain: string | null;
      adminEmail: string | null;
      connectedAt: number;
      /** Consent was granted and has since stopped working. */
      needsReconnect: boolean;
    }
  /** The session went away underneath us. Nothing is claimed either way. */
  | { status: "signed-out" }
  /** The request itself didn't complete. Nothing is claimed either way. */
  | { status: "unreachable" };

/**
 * Reads the connection, and hands back a state plus a way to read it again.
 *
 * A hook rather than a prop from the server, because the screen this mostly
 * lives on is a block's settings panel: a client component several layers
 * inside a canvas, with no server boundary to hang a fetch off, re-mounted
 * every time somebody selects a different block. Reading it here means the
 * panel is right the moment it opens rather than as of whenever the page was
 * last rendered — which matters most immediately after connecting.
 *
 * `read` returns the state rather than storing it, which reads like a small
 * thing and isn't. Both callers want the same request and want to do something
 * slightly different around it — one is a component appearing, the other is a
 * button that has just deleted something — and a function that set the state
 * itself would have to be called from inside the effect, which is exactly the
 * cascading-render pattern React 19's lint refuses. Returning the answer keeps
 * every `setState` at the call site.
 */
export function useGoogleWorkspace(): {
  state: WorkspaceState;
  /** Re-reads from the server and stores the answer. For after a disconnect. */
  reload: () => Promise<void>;
} {
  const [state, setState] = React.useState<WorkspaceState>({
    status: "loading",
  });

  /* Guards the writes below against a component that has gone away while a
     request was in flight — selecting a different block in the editor unmounts
     the note mid-fetch, and a resolved promise writing into an unmounted tree
     is a warning nobody can act on. Read only inside callbacks, never during
     render. */
  const liveRef = React.useRef(true);

  const read = React.useCallback(async (): Promise<WorkspaceState> => {
    try {
      const response = await fetch("/api/google/connection");
      const payload = (await response.json()) as Reply;

      if (!payload.ok) {
        /* 401 is the only refusal this route has, and it means the session is
           gone rather than that anything failed. Everything else is treated as
           a request that didn't complete, because the honest thing to say about
           an answer we didn't understand is that we don't know. */
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
        domain: payload.connection.domain,
        adminEmail: payload.connection.adminEmail,
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
 * What each way the flow can end means, in the company's own terms.
 *
 * Keyed by the codes in `google-outcome.ts`, which is the only thing the server
 * puts in the URL — so nothing a stranger can type into `?google=` renders as
 * prose, and an unrecognised code renders as nothing at all rather than as a
 * blank alarming box.
 *
 * These are said again here rather than reused from the builder's panel, and
 * the difference is not cosmetic. `src/lib/google/*` writes for whoever runs
 * this deployment and names client ids, redirect URIs and Cloud console pages;
 * this writes for a super admin at a company who has never heard of any of
 * them. The two failures that are genuinely ours say so plainly instead of
 * asking somebody to go and check a log they have no access to.
 *
 * Several of these are not failures and are toned accordingly. Somebody closing
 * Google's consent screen has made a decision, not hit a bug, and a red box
 * telling them so would be the product being rude about a reasonable choice.
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
    body: "Your Google Workspace is connected. From here on, creating a new starter's account needs nobody present — the permission you granted just now is what does the work at three in the morning.",
  },
  disconnected: {
    tone: "neutral",
    title: "Disconnected",
    body: "Craig no longer holds permission to your Google Workspace, and no more accounts will be created until it's connected again. Accounts already created are untouched.",
  },
  cancelled: {
    tone: "neutral",
    title: "Nothing was connected",
    body: "The consent screen was closed without granting anything, which is a perfectly reasonable thing to do. No permission was given and nothing was stored.",
  },
  "signed-out": {
    tone: "warning",
    title: "You were signed out along the way",
    body: "A connection belongs to an account, and by the time Google answered there wasn't one to attach it to. Nothing was stored. You're signed in now, so connecting again will finish properly.",
  },
  "no-key": {
    tone: "warning",
    title: "Nobody was sent to Google",
    body: "We couldn't have kept the permission safely, so we didn't ask you for it — and not asking is better than asking and then losing it. This one is ours to sort out, not yours. Nothing was granted and nothing was stored.",
  },
  mismatch: {
    tone: "warning",
    title: "That didn't match",
    body: "Google's answer didn't match the request this browser made — usually because it took more than ten minutes, or because it finished in a different browser to the one it started in. Nothing was stored. Start again from this page.",
  },
  "personal-account": {
    tone: "warning",
    title: "That's a personal Google account",
    body: "It signed in perfectly well, but there's no Workspace behind it and so no company accounts to create. Nothing was stored. Connect again and pick an account that's a super admin of your company's Google Workspace.",
  },
  "not-stored": {
    tone: "danger",
    title: "Granted, but not kept",
    body: "You granted the permission and we couldn't store it safely, so we kept nothing rather than keeping it badly. This one is ours to fix. Nothing was created and nothing of yours was changed — you can remove the grant at myaccount.google.com if you'd rather it didn't exist.",
  },
  "not-configured": {
    tone: "neutral",
    title: "Not available yet",
    body: "Connecting Google Workspace isn't something this account can do yet, so nothing was attempted and nothing is wrong.",
  },
  "needs-reconnect": {
    tone: "warning",
    title: "It needs connecting again",
    body: "The permission Craig was given is no longer valid. Nothing is broken and nothing was lost — a Workspace admin has to grant it once more.",
  },
  "bad-credentials": {
    tone: "danger",
    title: "Google wouldn't accept us",
    body: "Google turned us away before it ever asked you anything, so you were never shown a consent screen. This one is ours rather than yours: nothing was granted, and nothing about your Workspace was changed.",
  },
  unauthorized: {
    tone: "warning",
    title: "Permission wasn't granted",
    body: "Google wouldn't grant the ability to manage your users. Either the box was left unticked on the consent screen, or whoever consented isn't a super admin of that Workspace.",
  },
  "invalid-request": {
    tone: "neutral",
    title: "Nothing was connected",
    body: "Google's answer didn't carry what was needed to finish. Nothing was stored. Try connecting again.",
  },
  "rate-limited": {
    tone: "neutral",
    title: "Too many attempts",
    body: "Google is turning requests away for the moment. Nothing was stored. Try again shortly.",
  },
  rejected: {
    tone: "danger",
    title: "Google refused",
    body: "Google turned the request down without saying usefully why. Nothing was granted and nothing was stored. One more attempt is worth trying; after that it's ours to look into.",
  },
  unreachable: {
    tone: "warning",
    title: "Couldn't reach Google",
    body: "The request to Google timed out or couldn't get through. Nothing was stored and nothing was changed.",
  },
};

/**
 * Whose Craig account this is, as the panel needs to say it.
 *
 * Passed in from the server session rather than read here, because it is the
 * one fact on this screen that must not be guessed at: it is the half of the
 * pairing that went wrong, and a client component inferring it from anything
 * other than the signed cookie would be inventing the very thing it is meant
 * to be checking.
 */
export interface WorkspaceAccount {
  name: string;
  email: string;
  company?: string;
}

/** `1754697600` as "4 August 2026, 15:20". Local time, like every other date in
    this product — a connection made this morning should say this morning. */
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
 *
 * Deliberately headless — no title, no framing paragraph — because it is
 * rendered in two places that need different sentences around it and exactly
 * the same thing inside it. The block settings panel introduces it as something
 * this step depends on; the settings screen introduces it as something the
 * account has connected. Each caller writes its own lead and neither owns a
 * second copy of the states, the button, or the account block.
 *
 * Sized to the narrower of the two homes. The block panel is a 320px column, so
 * the card underneath uses `p-4` and a modest type scale rather than the airier
 * spacing a full-width settings page could carry — one component that fits both
 * beats a `compact` flag whose two branches drift apart the first time somebody
 * edits one of them.
 */
export function GoogleWorkspaceConnect({
  account,
  outcome,
}: {
  account: WorkspaceAccount;
  /** The `?google=` code the connect flow redirected back with, if any. */
  outcome?: string | null;
}) {
  const { state, reload } = useGoogleWorkspace();
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState<string | null>(null);

  /**
   * An outcome this panel produced itself, which wins over the one in the URL.
   *
   * Without it, disconnecting on a page still carrying `?google=connected`
   * would leave a green "Connected" box sitting above a panel that now says
   * nobody is connected. The URL describes how this page was arrived at; this
   * describes what has happened since.
   */
  const [acted, setActed] = React.useState<string | null>(null);

  async function disconnect() {
    setBusy(true);
    setFailed(null);
    try {
      const response = await fetch("/api/google/connection", {
        method: "DELETE",
      });
      if (!response.ok) {
        setFailed(
          "That didn't go through. Your Workspace is still connected — try again.",
        );
        return;
      }
      setActed("disconnected");
      /* Re-read rather than patching the local copy. The server decides whether
         a connection exists, and a panel that draws its own conclusion about
         that is a panel that can be confidently wrong. */
      await reload();
    } catch {
      setFailed(
        "That didn't reach us. Your Workspace is still connected — try again.",
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
          /* No icon on the neutral ones, and that is the point of writing the
             tone into the table at all. Half of these outcomes are somebody
             deciding not to grant something, or a request that simply needs
             repeating — putting a warning triangle beside "the consent screen
             was closed, which is a perfectly reasonable thing to do" says the
             opposite of the sentence under it, and a triangle that appears
             next to reasonable things stops meaning anything by the time it
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

      {/* Neither of these claims anything about the company's account, because
          neither request got far enough to know. A panel that renders "not
          connected" after a failed read is a panel that will one day tell
          somebody to connect a Workspace they already connected. */}
      {state.status === "signed-out" && (
        <Callout tone="neutral" title="Sign in again">
          Your session has expired, so there was nothing to read this against.
          Sign in and this page will say where your Workspace stands.
        </Callout>
      )}

      {state.status === "unreachable" && (
        <Callout tone="neutral" title="Couldn't check just now">
          We couldn&apos;t reach the server to find out whether your Workspace
          is connected. Nothing has changed either way — reload the page to try
          again.
        </Callout>
      )}
    </div>
  );
}

/* --- The states ------------------------------------------------------------ */

/**
 * The feature is off, said as a fact about the product rather than a fault.
 *
 * This covers both halves of "we can't do this here" — no OAuth client, and
 * nowhere to keep a token — deliberately in one sentence. They are different
 * facts with the same appearance and the same absence of a button, and telling
 * a customer that a deployment they don't run is missing a setting they can't
 * set would be accurate and useless. Worse, it would read like an accusation:
 * every word of it sounds like something on their side.
 *
 * No Connect button, because pressing it could only fail. A control that is
 * refused teaches nobody anything except that this product doesn't work.
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
 * The state every account starts in, and the screen where the mistake happened.
 *
 * The identity block is not decoration. Consent is a pairing of two accounts —
 * the Google Workspace somebody chooses on Google's own screen, and the Craig
 * account it gets written against — and the browser is the only place both are
 * knowable at once. Google's consent screen names its half and cannot possibly
 * name ours; this is the last screen before the redirect, so it is the only
 * chance anybody gets to notice they are signed in as the wrong one. That is
 * exactly what went unnoticed once already, with a real tenant.
 *
 * The super admin warning is here rather than after the fact for the same
 * reason: consenting works perfectly well without that privilege, and then
 * every account fails weeks later with an authorisation error that points
 * nowhere useful. It looks fine on the day and breaks on somebody's first
 * morning.
 */
function NotConnected({ account }: { account: WorkspaceAccount }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Google className="size-4" />
        <span className="text-base font-medium">Not connected</span>
      </div>

      {/* One line, not a panel. Which Craig account the Workspace lands against
          is the fact that went unnoticed once already, with a real tenant — so
          it stays. What went with it was three paragraphs explaining it, which
          is how a two-fact screen became something nobody reads. */}
      <Attaching account={account}>
        Sign in to Google as a super admin.
      </Attaching>

      <ConnectLink label="Connect Google Workspace" />
    </div>
  );
}

/**
 * A live connection, named on both sides.
 *
 * The domain and the admin who granted it are the two facts that make a green
 * tick worth anything: "connected" on its own is a claim to be trusted, and
 * "katalis.ai, granted by mara@katalis.ai on 4 August" is a claim to be
 * checked. Whoever is looking at this after the fact is usually looking
 * precisely because they suspect the wrong pair got joined together, and that
 * question is unanswerable from a badge.
 */
function Connected({
  state,
  busy,
  onDisconnect,
}: {
  state: Extract<WorkspaceState, { status: "connected" }>;
  busy: boolean;
  onDisconnect: () => void;
}) {
  /* Google only omits the domain for a personal account, which the callback
     refuses to store — so this fallback should be unreachable. It is here
     because the alternative on an old record is the word "null" in the place
     where a company's name goes. */
  const domain = state.domain ?? "your Workspace";

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Google className="size-4" />
          <span className="text-base font-medium">{domain}</span>
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
          {state.adminEmail
            ? `Granted by ${state.adminEmail} on ${readableWhen(state.connectedAt)}.`
            : `Granted on ${readableWhen(state.connectedAt)}.`}
        </p>
      </div>

      {/* Kept, and short. A reconnect is the one state where somebody would
          otherwise press the button again and again — the grant is gone at
          Google's end and only granting it afresh fixes it. */}
      {state.needsReconnect && (
        <Callout tone="warning" title="This has stopped working">
          The permission was removed or expired. A Workspace admin has to grant
          it again — until then, new starters won&apos;t get accounts.
        </Callout>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {/* The same words either way, because it is the same act: Google asks
            for consent from scratch every time, which is what makes a reconnect
            actually fix anything. Only the weight changes — primary when it is
            the thing that needs doing, secondary when it is merely possible. */}
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
        Accounts already created are untouched.
      </p>
    </div>
  );
}

/* --- Small pieces ---------------------------------------------------------- */

/**
 * Which Craig account is at this end of the connection.
 *
 * One component for both states on purpose. The sentence around it differs —
 * before, it is about where the consent will land; after, it is about where it
 * did — but the identity itself has to be rendered identically in both, because
 * the whole value of showing it is that somebody can compare the two and see
 * that they match.
 */
function Attaching({
  account,
  children,
}: {
  account: WorkspaceAccount;
  children: React.ReactNode;
}) {
  return (
    <p className="text-sm text-text-muted">
      {children} It attaches to{" "}
      <span className="font-medium text-text">{account.email}</span>.
    </p>
  );
}

/**
 * A plain anchor, and not `next/link`, which matters more than it looks.
 *
 * `Link` prefetches what it points at. Prefetching this route would mint a
 * state, set the cookie, and throw the redirect away — and then a real click
 * moments later would mint a second state and overwrite the cookie, so the one
 * Google was actually sent could no longer be matched. Every connection would
 * fail verification, intermittently, in a way that reads exactly like the CSRF
 * defence working. An `<a>` is fetched when somebody clicks it and at no other
 * time.
 */
function ConnectLink({
  label,
  variant = "primary",
}: {
  label: string;
  variant?: "primary" | "secondary";
}) {
  return (
    <a
      href="/api/google/connect"
      className={cn(buttonVariants({ variant, size: "sm" }), "self-start")}
    >
      <Refresh />
      {label}
    </a>
  );
}
