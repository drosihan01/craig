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
  Delete,
  Key,
  Refresh,
  Warning,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";

/**
 * Connecting a customer's Google Workspace, from the builder's side.
 *
 * The model is one consent, once: a super admin at the customer grants this
 * deployment permission to manage their users, and what comes back is kept so
 * that Craig can create a seat months later with nobody present. This panel is
 * where that connection is made, inspected and undone.
 *
 * It lives in the sandbox rather than in a settings screen because there is no
 * settings screen yet and because inventing one for a connection nobody has
 * tested would be building the product backwards. What is here is a builder's
 * control — plainer than the product, but written as English rather than as
 * jargon, because the states it has to explain are ones a real customer will
 * eventually read a version of.
 *
 * The whole design is in what it refuses to offer. There are three separate
 * reasons the button might not work — no OAuth client on this deployment, no
 * encryption key to store the result with, and nobody signed in — and each one
 * is fixed by a different person in a different place. A single greyed-out
 * button would collapse all three into "it's broken". So the state is read
 * from the server and the panel shows whichever sentence is actually true,
 * and only offers Connect when pressing it can lead somewhere.
 */

/**
 * What `GET /api/google/connection` answers with.
 *
 * Narrowed here rather than shared with the route, for the reason the Mail tab
 * gives about its own response type: a client component that imports from a
 * route handler is one careless edit away from importing the server's
 * credentials with it. The shape is small and the route is next door.
 */
type ConnectionState = {
  setup: {
    available: boolean;
    /** Which of the three variables aren't set, by name. */
    missing: string[];
    /** What the consent screen will ask for, read from lib/google/config. */
    scopes: string[];
    /** The one Google treats as sensitive, and the one that does the work. */
    sensitiveScope: string;
    /** What the callback accepts, or what it would accept if configured. */
    redirectUri: string;
    /** False when the line above is this server's own origin, not the env. */
    redirectUriFromEnvironment: boolean;
  };
  storage: { ready: boolean; variable: string; message: string };
  connection: {
    domain: string | null;
    adminEmail: string | null;
    scopes: string[];
    /** Unix seconds. */
    connectedAt: number;
    needsReconnect: boolean;
  } | null;
};

type Reply = ({ ok: true } & ConnectionState) | { ok: false; error?: string };

/** Why there is nothing to draw. `calm` decides whether it looks like a fault. */
interface Problem {
  calm: boolean;
  message: string;
}

/**
 * What each way the flow can end actually means, in words.
 *
 * Keyed by the codes in `google-outcome.ts`, which is the only thing the
 * server puts in the URL — so nothing a stranger can type into `?google=`
 * renders as prose, and an unrecognised code renders as nothing at all rather
 * than as a blank alarming box.
 *
 * Several of these are not failures and are toned accordingly. Somebody
 * closing Google's consent screen has made a decision, not hit a bug, and a
 * red box telling them so would be the product being rude about a reasonable
 * choice.
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
    body: "Google Workspace is connected. From here on, creating a seat needs nobody present — the permission granted just now is what does the work at three in the morning.",
  },
  disconnected: {
    tone: "neutral",
    title: "Disconnected",
    body: "The stored permission has been deleted from this deployment. The grant itself still exists in Google until its owner removes it at myaccount.google.com — this half is gone either way.",
  },
  cancelled: {
    tone: "neutral",
    title: "Nothing was connected",
    body: "The consent screen was closed without granting anything, which is a perfectly reasonable thing to do. No permission was given and nothing was stored.",
  },
  "signed-out": {
    tone: "warning",
    title: "Nobody was signed in",
    body: "A connection belongs to an account, and there wasn't one to attach this to. Sign in to the showcase and start again.",
  },
  "no-key": {
    tone: "warning",
    title: "Nowhere to store it",
    body: "Nobody was sent to Google, because this deployment has no key to encrypt the result with — and writing that permission down in the clear is worse than not having it. The missing variable is named below.",
  },
  mismatch: {
    tone: "warning",
    title: "That didn't match",
    body: "Google's answer didn't match the request this browser made — usually because it took more than ten minutes, or because it finished in a different browser to the one it started in. Nothing was stored. Start again from this page.",
  },
  "personal-account": {
    tone: "warning",
    title: "That's a personal Google account",
    body: "It signed in perfectly well, but there's no Workspace behind it and so no users to manage. Nothing was stored. Connect again and pick an account that is a super admin of the company's Google Workspace.",
  },
  "not-stored": {
    tone: "danger",
    title: "Granted, but not kept",
    body: "The permission was granted and this deployment couldn't store it, so nothing was kept rather than something being written down badly. Whoever runs this deployment has to fix that before it will work.",
  },
  "not-configured": {
    tone: "neutral",
    title: "Not set up here",
    body: "This deployment has no Google OAuth client, so nothing was attempted and nothing is wrong.",
  },
  "needs-reconnect": {
    tone: "warning",
    title: "Needs reconnecting",
    body: "The permission that was granted is no longer valid. Nothing is broken and nothing was lost — a Workspace admin has to press Connect once more.",
  },
  "bad-credentials": {
    tone: "danger",
    title: "Google didn't accept our credentials",
    body: "This is our end rather than the customer's: the OAuth client id, secret or redirect URI doesn't match what's registered in the Cloud console. A secret rotated there and not here fails exactly like this.",
  },
  unauthorized: {
    tone: "warning",
    title: "Permission wasn't granted",
    body: "Google wouldn't grant the ability to manage users. Either the box was left unticked on the consent screen, or the person who consented isn't a super admin of that Workspace.",
  },
  "invalid-request": {
    tone: "neutral",
    title: "Nothing was connected",
    body: "Google's answer didn't carry what was needed to finish. Nothing was stored. Try connecting again.",
  },
  "rate-limited": {
    tone: "neutral",
    title: "Too many attempts",
    body: "Google is rate limiting token requests for this application. Nothing was stored. Try again shortly.",
  },
  rejected: {
    tone: "danger",
    title: "Google refused",
    body: "Google turned the request down for a reason it didn't name usefully. The full reason is in the server log.",
  },
  unreachable: {
    tone: "warning",
    title: "Couldn't reach Google",
    body: "No network, or the request timed out. Nothing was stored and nothing was changed.",
  },
};

/** `1754697600` as "4 August 2026, 15:20". Local time, like every other date
    in this repo — a connection made this morning should say this morning. */
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

export function GoogleConnect({
  /** The `?google=` code the connect flow redirected back with, if any. */
  outcome,
}: {
  outcome?: string | null;
}) {
  const [state, setState] = React.useState<ConnectionState | null>(null);
  /**
   * Why there is nothing to show, and whether that is a problem.
   *
   * `calm` is the whole reason this is an object rather than a string. Not
   * being signed in is by far the most common way this panel has nothing to
   * draw, and it is not a fault — it is a sentence and a next step. Rendering
   * it in the same red box as "the server fell over" would teach whoever uses
   * this to ignore red boxes, which is the only thing they are for.
   */
  const [problem, setProblem] = React.useState<Problem | null>(null);
  const [busy, setBusy] = React.useState(false);
  /**
   * An outcome this panel produced itself, which wins over the one in the URL.
   *
   * Without it, disconnecting on a page still carrying `?google=connected`
   * would leave a green "Connected" box sitting above a panel that now says
   * nobody is connected. The URL describes how this page was arrived at; this
   * describes what has happened since.
   */
  const [acted, setActed] = React.useState<string | null>(null);

  /* Guards the writes below against a component that has gone away while a
     request was in flight — the sandbox switches sections while this is
     loading, and a resolved promise writing into an unmounted tree is a
     warning nobody can act on. Read only inside callbacks, never in render. */
  const liveRef = React.useRef(true);

  /**
   * Fetches the state and *returns* it rather than storing it.
   *
   * Which reads like a small thing and isn't. Both callers want the same
   * request and want to do something slightly different around it — one is a
   * component appearing, the other is a button that has just deleted
   * something — and a function that set the state itself would have to be
   * called from inside the effect, which is exactly the cascading-render
   * pattern React 19's lint refuses. Returning the answer keeps every
   * `setState` at the call site, where the surrounding code makes it obvious
   * what is being reacted to.
   */
  const read = React.useCallback(async (): Promise<{
    state: ConnectionState | null;
    problem: Problem | null;
  }> => {
    try {
      const response = await fetch("/api/google/connection");
      const payload = (await response.json()) as Reply;

      if (!payload.ok) {
        return {
          state: null,
          problem: {
            /* 401 is "sign in to the showcase", which is a normal thing to
               find yourself doing on a page nothing guards. */
            calm: response.status === 401,
            message:
              payload.error ??
              `Couldn't read the connection (${response.status}).`,
          },
        };
      }

      return {
        state: {
          setup: payload.setup,
          storage: payload.storage,
          connection: payload.connection,
        },
        problem: null,
      };
    } catch {
      /* The route answers every refusal as JSON, so reaching here means the
           request itself never completed — the dev server restarting mid-click
           is the usual one. */
      return {
        state: null,
        problem: {
          calm: false,
          message: "The request never completed. Is the dev server still up?",
        },
      };
    }
  }, []);

  React.useEffect(() => {
    liveRef.current = true;
    void read().then((result) => {
      if (!liveRef.current) return;
      setState(result.state);
      setProblem(result.problem);
    });
    return () => {
      liveRef.current = false;
    };
  }, [read]);

  async function disconnect() {
    setBusy(true);
    try {
      const response = await fetch("/api/google/connection", {
        method: "DELETE",
      });
      if (!response.ok) {
        setProblem({
          calm: response.status === 401,
          message: `Couldn't disconnect (${response.status}).`,
        });
        return;
      }
      setActed("disconnected");
      /* Re-read rather than patching the local copy. The server is what
         decides whether a connection exists, and a panel that draws its own
         conclusion about that is a panel that can be confidently wrong. */
      const result = await read();
      if (!liveRef.current) return;
      setState(result.state);
      setProblem(result.problem);
    } catch {
      setProblem({
        calm: false,
        message: "The request never completed. Is the dev server still up?",
      });
    } finally {
      setBusy(false);
    }
  }

  const shown = OUTCOMES[acted ?? outcome ?? ""];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-semibold tracking-[-0.01em]">
          Google Workspace
        </h2>
        <p className="text-md leading-relaxed text-text-muted">
          A company connects their own Google Workspace here, once, as a super
          admin. What comes back is kept so Craig can create a new
          starter&apos;s account later without anybody being there — which is
          the whole point, and also why it is the most dangerous thing this
          deployment stores.
        </p>
      </div>

      {shown && (
        <Callout
          tone={shown.tone}
          title={shown.title}
          icon={shown.tone === "success" ? <CheckCircle /> : <Warning />}
        >
          {shown.body}
        </Callout>
      )}

      {problem && (
        <Callout tone={problem.calm ? "neutral" : "danger"}>
          {problem.message}
        </Callout>
      )}

      {!state && !problem && <Skeleton className="h-40 w-full" />}

      {state && <Panel state={state} busy={busy} onDisconnect={disconnect} />}

      <p className="text-xs leading-relaxed text-text-subtle">
        Untested against a real Google Workspace. This repo has never had an
        OAuth client or a tenant to point at, so nothing below this line has
        ever completed a consent — the flow is written from Google&apos;s
        documentation rather than from a response anybody has seen.
      </p>
    </div>
  );
}

/* --- The state that is actually true --------------------------------------- */

function Panel({
  state,
  busy,
  onDisconnect,
}: {
  state: ConnectionState;
  busy: boolean;
  onDisconnect: () => void;
}) {
  const { setup, storage, connection } = state;

  /* Both halves have to be true before Connect can lead anywhere: an OAuth
     client to ask permission with, and a key to keep the answer under. They
     are checked separately because they are two different variables set by the
     same person at two different moments, and being told which one is missing
     is the entire difference between a five-minute fix and an afternoon. */
  if (!setup.available || !storage.ready) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <Google className="size-4" />
          <span className="text-base font-medium">
            Not set up on this deployment
          </span>
        </div>

        <p className="text-base leading-relaxed text-text-muted">
          There is no Connect button because pressing it could only fail. This
          is configuration, not a fault — whoever runs this deployment fixes it
          once, for everybody.
        </p>

        {!setup.available && <CloudSetup setup={setup} />}

        {!storage.ready && (
          <Missing
            title="Nowhere to store a connection"
            body={storage.message}
            variables={[storage.variable]}
          />
        )}

        <p className="text-xs leading-relaxed text-text-subtle">
          Restart the server afterwards — every one of these is read from the
          environment on each call, and a variable added to a process that is
          already running isn&apos;t there.
        </p>
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-col gap-1">
          <span className="text-base font-medium">Not connected yet</span>
          <p className="text-base leading-relaxed text-text-muted">
            This is where every account starts, and it is not a problem. The
            person who presses this has to be a super admin of the
            company&apos;s Google Workspace — consenting works without that
            privilege and then every seat fails weeks later, so it is worth
            checking before rather than finding out after.
          </p>
        </div>
        <ConnectLink label="Connect Google Workspace" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Google className="size-4" />
            <span className="text-base font-medium">
              {connection.domain ?? "Connected"}
            </span>
            {connection.needsReconnect ? (
              <Badge size="sm" tone="warning">
                Needs reconnecting
              </Badge>
            ) : (
              <Badge size="sm" tone="success">
                Connected
              </Badge>
            )}
          </div>
          <p className="text-sm text-text-muted">
            Connected {readableWhen(connection.connectedAt)}
            {connection.adminEmail ? ` by ${connection.adminEmail}` : ""}.
          </p>
        </div>
      </div>

      {connection.needsReconnect && (
        <Callout tone="warning" title="This has stopped working">
          The permission granted when this was connected is no longer valid —
          somebody removed the app from their Google account, an admin&apos;s
          password changed, or the grant expired. No amount of retrying fixes
          it: a Workspace admin has to consent again. Until they do, new
          starters won&apos;t get accounts.
        </Callout>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <ConnectLink
          label={connection.needsReconnect ? "Reconnect" : "Connect again"}
          variant={connection.needsReconnect ? "primary" : "secondary"}
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

      <p className="text-xs leading-relaxed text-text-subtle">
        Disconnecting deletes the stored permission rather than hiding it —
        after it, the account file makes no mention of Google. It does not
        revoke the grant at Google&apos;s end, because only its owner can do
        that, at myaccount.google.com. Connecting again asks for consent from
        scratch, which is what makes a reconnect actually fix anything.
      </p>
    </div>
  );
}

/* --- What a person has to do in the Cloud console -------------------------- */

/**
 * The setup steps, on the one screen where they are the useful content.
 *
 * Shown only when there is no OAuth client, which is exactly the state where
 * the alternative is a missing button and no account of what would bring it
 * back. Once the client exists this disappears, because a checklist of things
 * already done is noise on every subsequent visit.
 *
 * Six steps, because six is what it takes and pretending otherwise wastes
 * somebody's afternoon. The order is the order Google's console makes you do
 * it in — the API before the consent screen, the consent screen before the
 * client — so following it top to bottom works and skipping about doesn't.
 *
 * The two warnings at the end are here rather than in a README because both
 * are failures that happen *later*, look like bugs, and cost a day each. One
 * of them is a connection that works all week and dies on Sunday; the other is
 * a consent that succeeds and then refuses to create anybody. Neither is
 * discoverable from the error it produces.
 *
 * Every value that could disagree with the code is passed in rather than
 * written here: the scopes come from `lib/google/config.ts`, the redirect URI
 * from what the callback actually accepts, and the variable names from the
 * status the server reported. A checklist that drifts from the code is worse
 * than no checklist, because somebody will follow it.
 */
function CloudSetup({ setup }: { setup: ConnectionState["setup"] }) {
  const steps: { title: string; body: React.ReactNode }[] = [
    {
      title: "Create or pick a Google Cloud project",
      body: "Everything below hangs off one project. Any project will do; it is ours, not a customer's.",
    },
    {
      title: "Enable the Admin SDK API",
      body: (
        <>
          <Mono>admin.googleapis.com</Mono>, under APIs &amp; Services. This is
          the one that creates users. Google&apos;s Workspace connectors —
          Gmail, Drive, Calendar and the rest — cannot: they act over one
          person&apos;s data, and making somebody an account is an
          administrative call over the whole tenant. A newly enabled API can
          take a minute to start working.
        </>
      ),
    },
    {
      title: "Google Auth Platform → Audience → External",
      body: "Internal only covers accounts in your own Google Workspace, and every customer is a different one. External is the setting that lets anybody outside this project consent at all.",
    },
    {
      title: "Add the scopes the consent screen will ask for",
      body: (
        <>
          <span className="flex flex-col gap-0.5 pt-0.5">
            {setup.scopes.map((scope) => (
              <span key={scope} className="flex flex-wrap items-center gap-1.5">
                <Mono>{scope}</Mono>
                {scope === setup.sensitiveScope && (
                  <Badge size="sm" tone="warning">
                    sensitive
                  </Badge>
                )}
              </span>
            ))}
          </span>
          <span className="block pt-1">
            Only the sensitive one does any work — it is what creating a user
            requires. The other two are why Google tells us which admin
            consented and which domain they belong to, so the product never has
            to ask a customer to type their own domain into a box.
          </span>
        </>
      ),
    },
    {
      title: "Credentials → Create client → Web application",
      body: (
        <>
          <span className="block">
            Add exactly this as an Authorized redirect URI, character for
            character — including http against https, the port, and the absence
            of a trailing slash:
          </span>
          <span className="flex flex-col gap-0.5 pt-1">
            <Mono>{setup.redirectUri}</Mono>
            <span className="text-xs text-text-subtle">
              {setup.redirectUriFromEnvironment
                ? "This deployment's configured value — what the callback actually sends."
                : "What this server is serving right now. Use it for local development, and set the same string as GOOGLE_OAUTH_REDIRECT_URI."}
            </span>
          </span>
        </>
      ),
    },
    {
      title: "Put the three values in .env.local, then restart",
      body: (
        <>
          <span className="flex flex-col gap-0.5 pt-0.5">
            {[
              "GOOGLE_OAUTH_CLIENT_ID",
              "GOOGLE_OAUTH_CLIENT_SECRET",
              "GOOGLE_OAUTH_REDIRECT_URI",
            ].map((name) => (
              <span key={name} className="flex flex-wrap items-center gap-1.5">
                <Mono>{name}</Mono>
                {setup.missing.includes(name) && (
                  <Badge size="sm" tone="danger">
                    missing
                  </Badge>
                )}
              </span>
            ))}
          </span>
          <span className="block pt-1">
            None of them may ever gain a <Mono>NEXT_PUBLIC_</Mono> prefix — the
            second one is a client secret.
          </span>
        </>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-sunken p-4">
        <span className="text-sm font-medium">
          What has to happen in the Google Cloud console first
        </span>

        <ol className="flex flex-col gap-3 pt-0.5">
          {steps.map((step, i) => (
            <li key={step.title} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-2xs font-semibold text-accent-subtle-fg">
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium">{step.title}</span>
                <span className="text-sm leading-relaxed text-text-muted">
                  {step.body}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <Callout tone="warning" title="A test app's connections die after 7 days">
        While the OAuth app is in Testing with External users, Google revokes
        refresh tokens a week after they are granted. It works all week and
        stops on Sunday, with nothing to point at. Publishing the app fixes it —
        and publishing with a sensitive scope means going through Google&apos;s
        verification.
      </Callout>

      <Callout tone="warning" title="Whoever connects must be a super admin">
        Consenting works perfectly well without that privilege, and then every
        account this tries to create comes back 403. So it looks fine on the day
        somebody connects and breaks on a new starter&apos;s first morning.
        Check the account before pressing Connect, not after.
      </Callout>
    </div>
  );
}

/* --- Small pieces ---------------------------------------------------------- */

/** Long strings that get pasted somewhere: wrap rather than overflow the card,
    and break anywhere, because a scope URL has nowhere polite to break. */
function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="w-fit max-w-full self-start rounded-xs bg-surface px-1 py-0.5 font-mono text-xs break-all text-text">
      {children}
    </code>
  );
}

function Missing({
  title,
  body,
  variables,
}: {
  title: string;
  body: string;
  variables: string[];
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-sunken p-3">
      <div className="flex items-center gap-1.5">
        <Key className="size-3.5 text-text-subtle" />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-sm leading-relaxed text-text-muted">{body}</p>
      {variables.length > 0 && (
        <ul className="flex flex-col gap-0.5 pt-0.5">
          {variables.map((name) => (
            <li key={name} className="font-mono text-xs text-text-subtle">
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
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
