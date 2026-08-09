"use client";

import * as React from "react";
import Link from "next/link";
import { Badge, Callout, Skeleton } from "@/components/ui";
import { Google } from "@/components/ui/brand-icons";
import { CheckCircle, Key, Warning } from "@/components/ui/icons";
import { SETTINGS_PATH } from "@/lib/showcase/google-outcome";

/**
 * Whether this deployment *could* connect a Google Workspace — and nothing else.
 *
 * This panel used to be the connect flow: it had the button, the connected
 * card, and Disconnect. That was defensible while there was no settings screen
 * and nobody had ever completed a consent, and it stopped being defensible the
 * moment somebody did. A real Workspace got attached to whichever showcase
 * account happened to be signed in while its owner was reading this page — a
 * throwaway test account — because nothing on this screen ever said which
 * account the consent would land on, and because the sandbox is signed in as
 * whoever the builder last was.
 *
 * So the flow moved to `/showcase/settings`, where a customer does it and where
 * the account is named before anybody leaves for Google. What did *not* move is
 * this: the three variables and the encryption key, which are the deployment's
 * own configuration, are named here and only here. A customer cannot register
 * an OAuth client and must never be shown a checklist for one — the showcase
 * says the feature isn't available yet, which is true and actionable by exactly
 * the right person, who is reading this page.
 *
 * There is deliberately no second copy of the connect UI below. Two panels
 * offering the same button is how two screens end up disagreeing about whether
 * a company is connected, and one of them would be the one nobody maintains.
 * Connection state lives with the account, so it is read where the account is.
 */

/**
 * What `GET /api/google/connection` answers with, narrowed to the half this
 * panel is for.
 *
 * Typed here rather than imported from the route, for the reason the Mail tab
 * gives about its own response type: a client component that imports from a
 * route handler is one careless edit away from importing the server's
 * credentials with it. The `connection` field is deliberately absent — whether
 * a particular account has consented is not this screen's business any more,
 * and a type that can't express it is a stronger statement than a comment.
 */
type Reply =
  | {
      ok: true;
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
    }
  | { ok: false; error?: string };

type Setup = Extract<Reply, { ok: true }>["setup"];
type Storage = Extract<Reply, { ok: true }>["storage"];

/** Why there is nothing to draw. `calm` decides whether it looks like a fault. */
interface Problem {
  calm: boolean;
  message: string;
}

export function GoogleConnect() {
  const [state, setState] = React.useState<{
    setup: Setup;
    storage: Storage;
  } | null>(null);

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

  /* Guards the write below against a component that has gone away while the
     request was in flight — the sandbox switches sections while this is
     loading, and a resolved promise writing into an unmounted tree is a
     warning nobody can act on. Read only inside the callback, never in
     render. */
  const liveRef = React.useRef(true);

  React.useEffect(() => {
    liveRef.current = true;

    void (async () => {
      try {
        const response = await fetch("/api/google/connection");
        const payload = (await response.json()) as Reply;
        if (!liveRef.current) return;

        if (!payload.ok) {
          setProblem({
            /* 401 is "sign in to the showcase", which is a normal thing to find
               yourself doing on a page nothing guards. */
            calm: response.status === 401,
            message:
              payload.error ?? `Couldn't read the setup (${response.status}).`,
          });
          return;
        }

        setState({ setup: payload.setup, storage: payload.storage });
      } catch {
        /* The route answers every refusal as JSON, so reaching here means the
           request itself never completed — the dev server restarting mid-click
           is the usual one. */
        if (!liveRef.current) return;
        setProblem({
          calm: false,
          message: "The request never completed. Is the dev server still up?",
        });
      }
    })();

    return () => {
      liveRef.current = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-semibold tracking-[-0.01em]">
          Google Workspace
        </h2>
        <p className="text-md leading-relaxed text-text-muted">
          A company connects their own Google Workspace once, as a super admin,
          and what comes back is kept so Craig can create a new starter&apos;s
          account later without anybody being there. That is the most dangerous
          thing this deployment stores, and this page is only about whether it
          is capable of storing it.
        </p>
      </div>

      <Callout tone="neutral" title="Connecting happens in the product">
        The connect flow lives on the customer&apos;s settings screen, because
        the consent attaches a real Workspace to whichever account is signed in
        — and this hub is signed in as whoever you last were. Go there to
        connect, to see what is connected, or to disconnect.{" "}
        <Link
          href={SETTINGS_PATH}
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          Open settings
        </Link>
      </Callout>

      {problem && (
        <Callout tone={problem.calm ? "neutral" : "danger"}>
          {problem.message}
        </Callout>
      )}

      {!state && !problem && <Skeleton className="h-40 w-full" />}

      {state && <Readiness setup={state.setup} storage={state.storage} />}
    </div>
  );
}

/* --- Can this deployment do it at all -------------------------------------- */

/**
 * The two halves that have to be true before anybody can connect anything.
 *
 * An OAuth client to ask permission with, and a key to keep the answer under.
 * They are checked separately because they are two different variables set by
 * the same person at two different moments, and being told which one is missing
 * is the entire difference between a five-minute fix and an afternoon.
 *
 * When both hold, this says so in one line and stops. A checklist of things
 * already done is noise on every subsequent visit, and the useful fact at that
 * point is a single word.
 */
function Readiness({ setup, storage }: { setup: Setup; storage: Storage }) {
  const ready = setup.available && storage.ready;

  if (ready) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <Google className="size-4" />
          <span className="text-base font-medium">
            This deployment can connect a Workspace
          </span>
          <Badge size="sm" tone="success">
            <CheckCircle />
            Ready
          </Badge>
        </div>
        <p className="text-base leading-relaxed text-text-muted">
          There is an OAuth client to ask permission with and a key to keep the
          answer under. Whether any particular account has actually connected is
          a fact about that account, and it is on their settings screen rather
          than here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <Google className="size-4" />
        <span className="text-base font-medium">
          Not set up on this deployment
        </span>
      </div>

      <p className="text-base leading-relaxed text-text-muted">
        Nobody can connect anything until this is fixed, and the product says so
        gently: a customer is told the feature isn&apos;t available yet, because
        a customer cannot register an OAuth client and shouldn&apos;t be shown
        one. This is configuration, not a fault — whoever runs this deployment
        fixes it once, for everybody.
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

/* --- What a person has to do in the Cloud console -------------------------- */

/**
 * The setup steps, on the one screen where they are the useful content.
 *
 * Shown only when there is no OAuth client, which is exactly the state where
 * the alternative is a missing feature and no account of what would bring it
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
function CloudSetup({ setup }: { setup: Setup }) {
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

      <Callout
        tone="warning"
        icon={<Warning />}
        title="A test app's connections die after 7 days"
      >
        While the OAuth app is in Testing with External users, Google revokes
        refresh tokens a week after they are granted. It works all week and
        stops on Sunday, with nothing to point at. Publishing the app fixes it —
        and publishing with a sensitive scope means going through Google&apos;s
        verification.
      </Callout>

      <Callout
        tone="warning"
        icon={<Warning />}
        title="Whoever connects must be a super admin"
      >
        Consenting works perfectly well without that privilege, and then every
        account this tries to create comes back 403. So it looks fine on the day
        somebody connects and breaks on a new starter&apos;s first morning. The
        settings screen says so before the button, which is the only place it
        can usefully be said.
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
