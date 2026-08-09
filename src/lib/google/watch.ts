import "server-only";

import { accessTokenFor, type GoogleConnection } from "./auth";
import { fail, type GoogleFailed } from "./result";

/**
 * Asking Google to tell us when a customer's directory changes, and asking it
 * to stop.
 *
 * Two calls — `users.watch` and `channels.stop` — written the same way
 * `directory.ts` writes `users.insert` and `users.get`, and for the same
 * reasons: `fetch` rather than `googleapis`, a result rather than a throw, and
 * a `GoogleConnection` at every call site so that acting for the wrong company
 * is a thing you would have to type.
 *
 * What a watch actually is, because the name suggests something it isn't. It
 * is not a subscription to a *user*; it is a subscription to a *tenant's*
 * directory, created with that tenant's access token, over that tenant's
 * domain. Google mints a **channel** — an id we choose, a resource id it
 * chooses, an expiry it chooses — and thereafter POSTs to a public HTTPS
 * address of ours every time something in that directory changes. There is no
 * per-user subscription to create and no global one either: one channel per
 * connected Workspace is the only shape the API offers, which is why the
 * channel table is keyed on the connection.
 *
 * The notification tells us **that** something changed, in **whose** directory.
 * It does not tell us what the user now looks like — and even if a future
 * revision of the API put the whole resource in the body, this code would still
 * not read it. The body arrives on an unauthenticated POST to a public URL:
 * anybody who finds the address can send one. The channel token proves the
 * *channel* is ours; nothing proves the *body* is Google's. So a notification is
 * treated as a hint that it is worth asking, and the answer comes from an
 * authenticated `users.get`. Same argument the Stripe webhook makes about
 * re-reading the subscription instead of trusting the payload, with an extra
 * reason: Stripe at least signs its bodies.
 *
 * Unverified: this repo has no OAuth client and no tenant to point at, so
 * neither request below has ever been sent. The endpoints, the channel resource
 * shape, the `event` values and the stop path are from Google's Admin SDK push
 * notifications documentation rather than from a response. Two details are
 * worth flagging as the likely first casualties, because both fail in ways that
 * do not look like themselves:
 *
 *   - The receiving address must be one Google will accept. It has to be
 *     public HTTPS with a valid certificate, and Google's push documentation
 *     requires the receiving domain to be registered and verified for the
 *     project. A `*.vercel.app` address satisfies this; a tunnel usually does
 *     not, and refuses at `users.watch` time with a `400`, not at delivery time.
 *   - The `channels.stop` path is `/admin/directory_v1/channels/stop` — an
 *     underscore, and no `v1` segment — which is not the `/admin/directory/v1`
 *     prefix every other call in this repo uses. It is Google's spelling, not a
 *     typo, and getting it wrong produces a `404` that reads as "no such
 *     channel" rather than as "no such route".
 */

/** Where a watch is created. The same prefix `directory.ts` uses. */
const DIRECTORY_ROOT = "https://admin.googleapis.com/admin/directory/v1";

/**
 * Where a channel is stopped, and it is genuinely a different prefix.
 *
 * `channels.stop` is not part of the Directory collection — it is the shared
 * channels endpoint that several Google APIs expose under their own legacy
 * path, and for the Admin SDK that path is spelled with an underscore. Written
 * out in full rather than assembled from `DIRECTORY_ROOT` so that nobody
 * "tidies" it into consistency.
 */
const CHANNELS_STOP =
  "https://admin.googleapis.com/admin/directory_v1/channels/stop";

/** Long enough for a slow network, short enough not to pin a handler open. */
const TIMEOUT_MS = 15_000;

/**
 * Which directory events are worth a delivery.
 *
 * `update` and nothing else. The event this whole feature waits for is
 * `agreedToTerms` flipping from false to true when somebody signs in for the
 * first time, which Google classes as an update to the user. `add` is a seat
 * *we* just created, so a notification about it tells us something we already
 * know; `delete`, `makeAdmin` and `undelete` are real events that no step here
 * is waiting on. Subscribing to everything and acting on one thing means paying
 * for the noise on every delivery — and every delivery costs a `users.get`.
 *
 * Google takes `event` as a repeated query parameter, so widening this is
 * adding a string rather than changing the call.
 */
const EVENTS = ["update"] as const;

export interface WatchedChannel {
  /** Ours, echoed back on every notification as `X-Goog-Channel-ID`. */
  channelId: string;
  /**
   * Google's opaque id for the resource being watched.
   *
   * Kept because `channels.stop` needs it alongside the channel id and there
   * is no way to derive or re-request it — a channel whose resource id was
   * dropped can only be left to expire, which means up to a week of deliveries
   * for a tenant that may have disconnected.
   */
  resourceId: string;
  resourceUri: string | null;
  /**
   * Unix milliseconds, as Google returned it.
   *
   * Google's answer rather than a lifetime we assumed. Gmail documents seven
   * days for its own `users.watch`; the Admin SDK's channel documentation does
   * not commit to a number this repo has verified. Reading the expiry we were
   * given means the renewal schedule is right whatever the number turns out to
   * be, and stays right if Google changes it.
   */
  expiresAt: number;
}

export type WatchResult = { ok: true; channel: WatchedChannel } | GoogleFailed;
export type StopResult = { ok: true } | GoogleFailed;

/* --- Reading Google's answers ---------------------------------------------- */

interface DirectoryError {
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
}

const asString = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

/**
 * Which failure this is, and — the part that matters here — *whose* it is.
 *
 * Deliberately a different classifier from `directory.ts`'s, rather than a
 * shared one with a phase flag. The two calls fail for opposite reasons and
 * point at opposite people. Creating a *user* fails because of something about
 * the customer: their licence count, their admin's privileges, an address
 * somebody already has. Creating a *watch* fails, nearly always, because of
 * something about **us**: the address we asked Google to deliver to. That is a
 * deployment's configuration, not a tenant's, and folding the two vocabularies
 * together would produce a message telling a customer to check their Google
 * Admin console about a URL they have never seen.
 *
 * The reason strings are Google's own, from the Directory API common-errors
 * guide and the push notifications guide.
 */
function classify(status: number, error: DirectoryError): GoogleFailed {
  const reason = (error.error?.errors?.[0]?.reason ?? "").toLowerCase();
  const text = (error.error?.message ?? "").toLowerCase();

  /* The one worth naming precisely, because it is the failure everybody hits
     first and the only one whose message is actionable in under a minute.
     Google refuses an address it will not deliver to — plain HTTP, a hostname
     it cannot resolve, a certificate it does not like, or a domain that has not
     been verified for the Cloud project — and it refuses it here, when the
     watch is created, rather than silently never delivering. */
  if (
    text.includes("webhook") ||
    text.includes("address") ||
    text.includes("not a valid") ||
    reason === "pushnotificationbadrequest"
  ) {
    return fail(
      "invalid-request",
      "Google refused the address it was asked to send directory notifications to. It has to be a public https:// URL with a certificate Google trusts, on a domain registered for this deployment's Cloud project — a tunnel or a localhost address is refused here rather than at delivery time. Check GOOGLE_WATCH_ADDRESS, or the origin of GOOGLE_OAUTH_REDIRECT_URI if that variable isn't set. This one is ours to fix, not the customer's.",
    );
  }

  if (
    reason === "ratelimitexceeded" ||
    reason === "userratelimitexceeded" ||
    reason === "quotaexceeded" ||
    status === 429
  ) {
    return fail(
      "rate-limited",
      "Google is rate limiting the Directory API, so the notification channel wasn't created. Nothing is broken — the next renewal sweep will try again.",
    );
  }

  if (reason === "accessnotconfigured" || text.includes("has not been used")) {
    return fail(
      "unauthorized",
      'The Admin SDK API isn\'t enabled in the Google Cloud project behind this deployment, so no notification channel could be created. Enable "Admin SDK API" in the Cloud console under APIs & Services. This one is ours to fix, not the customer\'s.',
    );
  }

  if (status === 401) {
    return fail(
      "needs-reconnect",
      "Google rejected the access token when creating a notification channel. It was accepted moments ago when it was issued, so the connection was almost certainly withdrawn in between — a Workspace admin needs to connect Google Workspace again.",
    );
  }

  if (status === 403) {
    return fail(
      "unauthorized",
      "Google won't let this connection watch the directory. Almost always the person who connected Google Workspace isn't a super admin — consenting works perfectly well without that privilege and watching the directory does not.",
    );
  }

  /* A stopped channel that was already gone. Named rather than lumped in with
     the rest because it is the *expected* outcome of stopping a channel that
     expired on its own, and the caller treats it as success. */
  if (status === 404 || reason === "notfound") {
    return fail(
      "no-such-user",
      "Google has no record of that notification channel. Either it expired on its own, or it was already stopped.",
    );
  }

  if (status === 400 || reason === "badrequest" || reason === "invalid") {
    return fail(
      "invalid-request",
      "Google refused the notification channel as invalid. The usual cause is the receiving address; the full reason is in the server log.",
    );
  }

  if (status >= 500) {
    return fail(
      "rejected",
      "Google's Directory API is having a problem at their end, so no notification channel was created. Nothing to fix here; the next renewal sweep will try again.",
    );
  }

  return fail(
    "rejected",
    `Google refused to set up directory notifications (${status}). The full reason is in the server log.`,
  );
}

/* --- The transport --------------------------------------------------------- */

type Call = { ok: true; payload: unknown } | GoogleFailed;

/**
 * One authenticated POST on one customer's behalf, with every outcome already
 * turned into a result.
 *
 * Not shared with `directory.ts`'s `call`, and that is a decision rather than
 * an oversight. What the two have in common is twenty lines of `fetch`,
 * timeout and parse; what they do not have in common is the URL prefix (one of
 * these calls is on a path with an underscore in it), the classifier, and the
 * logging rule. `directory.ts` will not log a request body under any
 * circumstances because the body of a `users.insert` is somebody's live
 * password — a rule worth keeping absolute there and one that would have to be
 * relaxed or explained away here, where the body is a URL and an expiry and
 * logging it is the fastest route to diagnosing a refused address. Sharing the
 * function would mean a `phase` discriminator whose two branches have nothing
 * in common but the word `fetch`.
 *
 * The token is still never logged. That rule has no exceptions anywhere.
 */
async function post(
  connection: GoogleConnection | null,
  url: string,
  body: string,
): Promise<Call> {
  const auth = await accessTokenFor(connection);
  if (!auth.ok) return auth;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    /* Logged without the headers, which carry the bearer token. */
    console.error(`[lib/google] watch POST unreachable:`, cause);
    return fail(
      "unreachable",
      "Couldn't reach Google to set up directory notifications — no network, or the request timed out. Whether the channel was created is unknown from here; it will be reconciled on the next renewal sweep.",
    );
  }

  /* Read as text and parse by hand, for the reason `directory.ts` gives: an
     error from a proxy in front of Google is HTML, and `response.json()` on it
     throws a parse error that reads like a bug in this file. */
  const raw = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const error = (payload ?? {}) as DirectoryError;

    /* Google's own words, and the request body with them. The body here is a
       channel id, a public URL and an expiry — nothing secret — and it is the
       single most useful thing to have in the log when Google says an address
       is unacceptable without saying which part of it it disliked. The channel
       token is the one field held back: see `redactToken`. */
    console.error(
      `[lib/google] watch ${response.status} for ${connection?.accountId ?? "?"}:`,
      error.error?.message ?? raw.slice(0, 200),
      redactToken(body),
    );

    return classify(response.status, error);
  }

  return { ok: true, payload };
}

/**
 * The request body as it is safe to log.
 *
 * The channel token is the shared secret that lets the receiver tell a real
 * delivery from a stranger's POST, so it does not go in a log even though
 * everything beside it does. Replaced rather than removed, so a log line still
 * shows whether a token was sent at all — "no token was set" and "the token was
 * wrong" are different bugs and this is the only place the difference is
 * visible.
 */
function redactToken(body: string): string {
  return body.replace(/"token":"[^"]*"/, '"token":"[redacted]"');
}

/* --- The operations -------------------------------------------------------- */

export interface NewWatch {
  /**
   * The Workspace domain to watch. Google's own answer from the id token's
   * `hd` claim, never a string somebody typed.
   */
  domain: string;
  /** Ours, unique, and the thing every notification will identify itself by. */
  channelId: string;
  /** The public https:// URL Google will POST notifications to. */
  address: string;
  /**
   * The shared secret Google echoes back in `X-Goog-Channel-Token`.
   *
   * The only thing that makes the receiving endpoint anything other than a
   * public "settle this step" button. It is derived rather than stored — see
   * `channelTokenFor` in `lib/craig/google-watch.ts` — so this parameter is
   * always supplied and there is no spelling of this call that omits it.
   */
  token: string;
}

/**
 * Subscribes to one customer's directory.
 *
 * Per tenant, because that is the only granularity the API has: the domain in
 * the query string and the access token in the header both belong to one
 * connected Workspace, and there is no credential in this system that could
 * create a channel spanning two of them.
 *
 * No `expiration` is sent. Google accepts one and treats it as a ceiling rather
 * than a request, and asking for a life shorter than the maximum buys nothing
 * but more renewals; asking for a longer one is ignored. Whatever comes back is
 * what the renewal schedule reads.
 *
 * Never throws.
 */
export async function watchUsers(
  connection: GoogleConnection | null,
  input: NewWatch,
): Promise<WatchResult> {
  const domain = input.domain.trim().toLowerCase().replace(/^@/, "");

  /* Checked here rather than left to Google, for the reason `createUser`
     checks its names: a `400` for an empty domain is indistinguishable from a
     `400` for the address, and the address is the field everybody suspects
     first. */
  if (!domain || !input.channelId || !input.address || !input.token) {
    return fail(
      "invalid-request",
      "A directory watch needs a domain, a channel id, a receiving address and a channel token. One of the four is missing, so nothing was sent.",
    );
  }

  const params = new URLSearchParams({ domain });
  /* Repeated rather than comma-joined. Google's `event` is a repeated
     parameter, and a comma-joined value is accepted as a single unknown event
     name — which produces a channel that is created successfully and never
     delivers anything. */
  for (const event of EVENTS) params.append("event", event);

  const result = await post(
    connection,
    `${DIRECTORY_ROOT}/users/watch?${params}`,
    JSON.stringify({
      id: input.channelId,
      type: "web_hook",
      address: input.address,
      token: input.token,
    }),
  );

  if (!result.ok) return result;

  const channel = (result.payload ?? {}) as Record<string, unknown>;
  const resourceId = asString(channel.resourceId);

  /* A 200 with no resource id is a channel that exists at Google and can never
     be stopped by us. Refused rather than stored half-made: a row without it is
     indistinguishable from a row with a wrong one, and both mean up to a week
     of deliveries for a tenant nobody can switch off. Better to have no channel
     and let the next sweep create one. */
  if (!resourceId) {
    console.error("[lib/google] users.watch returned 200 with no resourceId");
    return fail(
      "rejected",
      "Google set up directory notifications but didn't say which resource they belong to, which means they could never be stopped again. The channel was not recorded.",
    );
  }

  /* Google sends the expiry as a string of Unix milliseconds. Parsed rather
     than trusted: a missing or unreadable expiry must not become `NaN` in a
     column the renewal sweep sorts on, and the conservative fallback is "renew
     it on the next sweep" rather than "assume it lives a week". */
  const expiration = Number(channel.expiration);
  const expiresAt =
    Number.isFinite(expiration) && expiration > Date.now() ? expiration : 0;

  if (!expiresAt) {
    console.error(
      "[lib/google] users.watch returned no usable expiration; channel will be renewed immediately",
    );
  }

  return {
    ok: true,
    channel: {
      channelId: asString(channel.id) ?? input.channelId,
      resourceId,
      resourceUri: asString(channel.resourceUri),
      expiresAt,
    },
  };
}

/**
 * Cancels a channel, so Google stops delivering.
 *
 * Both ids are required and neither is optional at Google's end: the channel id
 * says which subscription and the resource id says which resource it was on,
 * and a stop with one of them missing is a `404` that reads like the channel
 * was already gone.
 *
 * `no-such-user` — this module's spelling of Google's `404` — is the *expected*
 * answer for a channel that has already expired, and callers treat it as
 * success. There is nothing to do differently: the desired state is "Google is
 * not delivering on this channel", and a channel Google has never heard of
 * satisfies it.
 *
 * Never throws.
 */
export async function stopChannel(
  connection: GoogleConnection | null,
  channel: { channelId: string; resourceId: string },
): Promise<StopResult> {
  if (!channel.channelId || !channel.resourceId) {
    return fail(
      "invalid-request",
      "Stopping a notification channel needs both its id and its resource id, and one of them is missing, so nothing was sent.",
    );
  }

  const result = await post(
    connection,
    CHANNELS_STOP,
    JSON.stringify({ id: channel.channelId, resourceId: channel.resourceId }),
  );

  return result.ok ? { ok: true } : result;
}
