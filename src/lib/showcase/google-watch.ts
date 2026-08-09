import "server-only";

import { oauthClient } from "@/lib/google/config";
import { stopChannel, watchUsers } from "@/lib/google/watch";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/types";
import { GOOGLE_PROVIDER, googleConnectionFor } from "./accounts";
import { constantTimeEqual, encode, signingKey } from "./session";

/**
 * Which tenants Google is currently telling us about, and keeping that true.
 *
 * The seam between one customer's connected Workspace and one live push
 * channel at Google. Everything here is per tenant, and the reason is not
 * symmetry — it is that a channel *cannot* be anything else. A `users.watch` is
 * created with one customer's access token over one customer's domain; there is
 * no credential in this system capable of creating a channel that spans two
 * companies, and if there were, using it would mean one company's directory
 * changes arriving on the same wire as another's.
 *
 * Three things live here and they are here together because each one is
 * meaningless without the others:
 *
 * **The channel id**, which is minted rather than random, and carries the
 * tenant inside it. **The channel token**, which is derived rather than stored,
 * and is what makes the receiving endpoint something other than a public button
 * marked "settle this step". **The renewal schedule**, which reads the expiry
 * Google gave us rather than a lifetime this file assumed.
 *
 * What this deliberately does not own is what to *do* about a notification.
 * That is `api/google/notifications/route.ts`, and the split is the same one
 * `google-connection.ts` makes: this file answers "whose directory changed and
 * is this delivery real", and the answer to "so what" belongs with the workflow
 * rules in `automation.ts`, which already knows what accepting a seat means.
 *
 * Nothing here throws. It is called from a webhook, from a cron sweep, and from
 * `after()` on a redirect — three places with nobody to catch anything.
 *
 * **Unverified.** This deployment has no OAuth client and no tenant, so no
 * channel has ever been created and no notification has ever arrived. What is
 * exercised is everything either side of the network: the id round-trips
 * through `tenantOfChannel`, the token verifies against itself, and the store
 * refuses calmly when nothing is connected.
 */

/**
 * Where Google POSTs notifications. Must match the directory holding the
 * receiver's `route.ts`, which nothing can check for us — the same caveat
 * `GOOGLE_CALLBACK_PATH` carries, and the same reason it is a named constant.
 */
export const GOOGLE_NOTIFICATIONS_PATH = "/api/google/notifications";

/**
 * How often the sweep actually runs.
 *
 * Once a day, because that is what the Hobby plan allows — see the `crons`
 * entry in `vercel.json`. It is stated here because the renewal policy below is
 * meaningless without it: a lead time is only safe relative to how often
 * anything is looking.
 */
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * How close to expiry a channel is renewed.
 *
 * The policy is a quarter of whatever life Google actually granted, which is
 * the shape that survives not knowing that number in advance — Gmail documents
 * seven days for its own `users.watch` and the Admin SDK does not commit to
 * anything, so a hardcoded "renew after six days" is either far too eager or
 * catastrophically too late.
 *
 * **Google grants 48 hours.** Measured, on the first real channel this repo
 * ever created: `expires_at - renewed_at` came back at exactly two days, not
 * the seven the documentation had led this code to expect.
 *
 * That number turns a quarter-life lead into a bug. A quarter of 48 hours is a
 * twelve-hour window, the sweep runs every twenty-four, and a window narrower
 * than the interval that checks it can be stepped straight over: the channel is
 * "not due yet" at one sweep and expired by the next. Pushes would have stopped
 * every couple of days, silently, which is the exact failure this whole file is
 * arranged to avoid.
 *
 * So the lead is also floored at **one and a half sweep intervals**. A channel
 * is renewed while it still has comfortably more life than the gap until the
 * next look, with half an interval spare for a sweep that fails or a deploy
 * that eats one. For a 48-hour channel that means renewing roughly daily, which
 * is one API call per tenant per day — the cheap side of the trade by a wide
 * margin.
 *
 * The quarter still governs anything long: a seven-day channel has a 42-hour
 * lead and is renewed with nearly two days to spare, exactly as before.
 */
const MIN_RENEW_LEAD_MS = Math.round(SWEEP_INTERVAL_MS * 1.5);

/** How long a dedupe record is worth keeping. Comfortably longer than any
    channel life Google has been observed to grant, because a record that
    outlives the channel it names costs a row and one that doesn't costs a
    duplicate delivery being acted on twice. */
const DEDUPE_KEEP_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Domain separation for the channel token, and not decoration.
 *
 * Signed with `SESSION_SECRET`, the same key as the joiner's magic link and the
 * OAuth state cookie, for the reason `google-state.ts` gives: a second secret
 * is a second thing to generate, document and get wrong on a deploy. The cost
 * of sharing a key is that a signature minted for one purpose could be
 * presented as a signature for another, so every message says what it is before
 * it is signed. A magic link can therefore never be replayed as a channel
 * token, even though one key verifies both.
 *
 * The consequence of the shared key is worth writing down, because it is
 * invisible until it bites: rotating `SESSION_SECRET` invalidates every live
 * channel token, so Google keeps delivering and this server starts refusing
 * every delivery as forged. It is self-healing — the next renewal sweep mints
 * a channel with a token under the new key — but between the rotation and the
 * sweep, acceptances are found by the existing poll rather than by push.
 */
const TOKEN_CONTEXT = "google-watch.v1.";

/** Marks a channel id as ours before its parts are believed. */
const CHANNEL_PREFIX = "craig";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ChannelRow = Tables<"google_watch_channels">;

const db = () => supabaseAdmin();

const normalise = (email: string) => email.trim().toLowerCase();

/* --- The channel id -------------------------------------------------------- */

/**
 * A channel id that says which tenant it belongs to.
 *
 * `craig_<connection uuid>_<32 random hex>`.
 *
 * **Underscores, not dots, and that is not cosmetic.** This was written with
 * dots on the strength of Google's documentation calling the id opaque, and the
 * first real `users.watch` call came back:
 *
 *     400 Channel id must match [A-Za-z0-9\-_\+/=]+
 *
 * There is no `.` in that character class. The id is opaque to Google in the
 * sense that it ascribes no meaning to it, not in the sense that any string
 * will do. `_` is in the set and cannot occur in a uuid or in hex, so it stays
 * an unambiguous separator.
 *
 * The structure is entirely for us, and it buys one specific thing: a delivery
 * can be attributed to a tenant *without a database row existing for it*.
 *
 * That window is real rather than theoretical. Renewal creates the replacement
 * channel at Google before writing it down — it has to, since the row needs the
 * resource id Google mints — and Google's first act on a new channel is to send
 * a `sync` message. So there is a moment, every renewal, when a notification
 * arrives for a channel id this database has never seen. With a random id that
 * delivery is unattributable and gets dropped; with this one it is attributable
 * from the id alone, and the row is only ever bookkeeping for the renewal
 * sweep.
 *
 * The random half is not a secret and is not doing security work — the token
 * does that. It is there so a renewed channel is a genuinely new id, which
 * keeps `X-Goog-Message-Number` (which counts per channel and resets) unique
 * within the dedupe table across renewals.
 */
function mintChannelId(connectionId: string): string {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${CHANNEL_PREFIX}_${connectionId}_${nonce}`;
}

/**
 * Which connection a channel id belongs to, or null because it isn't ours.
 *
 * Shape-checked rather than pattern-matched loosely. The value arrives in a
 * header on an unauthenticated request, and it is about to be used as a uuid in
 * a query — Postgres rejects a malformed uuid loudly, and a header from a
 * stranger should read as "not ours" rather than as a 500. This is not the
 * authentication step: proving the id was *minted here* is the token's job, and
 * this function is deliberately callable on garbage.
 */
export function tenantOfChannel(channelId: string): string | null {
  const parts = channelId.split("_");
  if (parts.length !== 3) return null;
  if (parts[0] !== CHANNEL_PREFIX) return null;
  if (!UUID.test(parts[1])) return null;
  return parts[1];
}

/* --- The channel token ----------------------------------------------------- */

/**
 * The shared secret Google echoes back on every notification.
 *
 * Derived from the channel id rather than generated and stored, which is the
 * decision this file would most like reviewed and is the one it is most
 * confident about. A stored token is a bearer secret in a database row: it has
 * to be written on create, read on every delivery, kept out of logs, and
 * rotated with the key it was minted under. A derived one is none of those
 * things — there is nothing to store, so there is nothing to leak from the
 * table, and verifying is recomputing.
 *
 * It is not a nonce and does not need to be. Its whole job is to answer "did
 * this deployment mint this channel", and an HMAC over the channel id under a
 * key that never leaves this server answers exactly that. What it deliberately
 * does *not* prove is that the request came from Google — nothing can, short of
 * mutual TLS — which is why the receiver treats a verified notification as a
 * reason to go and ask Google a question rather than as a statement of fact.
 *
 * Returns null when `SESSION_SECRET` is missing, rather than throwing. Every
 * caller here is a webhook or a background sweep with nobody to catch anything,
 * and a deployment with no signing secret should refuse to create channels
 * calmly rather than crash on the first delivery.
 */
export async function channelTokenFor(
  channelId: string,
): Promise<string | null> {
  try {
    const signature = await crypto.subtle.sign(
      "HMAC",
      await signingKey(),
      new TextEncoder().encode(TOKEN_CONTEXT + channelId),
    );
    return encode(new Uint8Array(signature));
  } catch (cause) {
    console.error("[showcase/google-watch] cannot sign a channel token:", cause);
    return null;
  }
}

/**
 * Whether a notification's token is the one this deployment minted for that
 * channel.
 *
 * Constant-time, for the reason `google-state.ts` compares its nonce that way:
 * this is a secret being compared against something a caller supplies, and `===`
 * leaks where two strings diverge to anybody who can measure it. An attacker
 * who can post to this endpoint as often as they like and time the answer is
 * exactly the threat model.
 *
 * A missing token is a refusal rather than a pass. Google only sends
 * `X-Goog-Channel-Token` when the channel was created with one, and every
 * channel this file creates is created with one — so its absence means either
 * a channel we did not make, or a request Google did not send.
 */
export async function verifyChannelToken(
  channelId: string,
  token: string | null,
): Promise<boolean> {
  if (!token) return false;
  const expected = await channelTokenFor(channelId);
  return expected !== null && constantTimeEqual(expected, token);
}

/* --- Where Google delivers ------------------------------------------------- */

/**
 * The public address Google is told to POST to.
 *
 * Derived from `GOOGLE_OAUTH_REDIRECT_URI` by default, and that is worth
 * defending because a second variable was the obvious answer. The redirect URI
 * is already the one place this deployment states its own public origin; it is
 * already required, already validated as an absolute https URL (or loopback),
 * and already has to match Google's records byte for byte. A second variable
 * naming the same origin is a second variable to forget on a deploy, and the
 * failure it produces — notifications posted at the previous deployment — is
 * silent.
 *
 * The override exists for the one case the derivation genuinely cannot serve:
 * a developer whose redirect URI is `http://localhost:3000/...`, which Google
 * accepts for OAuth and refuses outright for a webhook. Pointing
 * `GOOGLE_WATCH_ADDRESS` at a public tunnel is the only way to exercise this
 * locally at all.
 *
 * Loopback is refused here rather than at Google, because Google's refusal
 * arrives as a `400` about the channel with nothing in it that names localhost
 * as the reason.
 */
export function notificationAddress(): {
  ok: boolean;
  address: string;
  message: string;
} {
  const override = process.env.GOOGLE_WATCH_ADDRESS?.trim() ?? "";
  const configured = oauthClient();

  const raw = override
    ? override
    : configured.configured
      ? new URL(
          GOOGLE_NOTIFICATIONS_PATH,
          configured.client.redirectUri,
        ).toString()
      : "";

  if (!raw) {
    return {
      ok: false,
      address: "",
      message:
        "There is nowhere for Google to send directory notifications on this deployment: GOOGLE_OAUTH_REDIRECT_URI isn't set, and neither is GOOGLE_WATCH_ADDRESS. Nothing was attempted.",
    };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {
      ok: false,
      address: "",
      message: `GOOGLE_WATCH_ADDRESS isn't a URL, so no notification channel could be created. It has to be the absolute https:// address of ${GOOGLE_NOTIFICATIONS_PATH} on this deployment.`,
    };
  }

  if (
    url.protocol !== "https:" ||
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1"
  ) {
    return {
      ok: false,
      address: url.toString(),
      message: `Google will only deliver notifications to a public https:// address, and this deployment's is ${url.toString()}. That is fine for OAuth and useless for a webhook — set GOOGLE_WATCH_ADDRESS to a public tunnel if you need to exercise this locally, otherwise acceptance is picked up by the existing check when somebody opens the person's page.`,
    };
  }

  return { ok: true, address: url.toString(), message: "" };
}

/* --- The store ------------------------------------------------------------- */

/** The connection row a channel hangs off, with the account it belongs to. */
interface TenantConnection {
  connectionId: string;
  accountEmail: string;
  domain: string | null;
  needsReconnect: boolean;
}

/**
 * Every connected Google Workspace, with the account email each one belongs to.
 *
 * One query with an embed rather than a join per row: PostgREST resolves
 * `accounts` off the connection's foreign key in the same round trip. The
 * account's *email* is what comes back rather than its id, because that is what
 * every function downstream is keyed by — `googleConnectionFor`,
 * `listJoiners`, `reconcileRun` — and translating it here once is what stops
 * each of them growing its own lookup.
 */
async function tenantConnections(): Promise<TenantConnection[]> {
  const { data, error } = await db()
    .from("connections")
    .select("id, domain, needs_reconnect, accounts!inner(email)")
    .eq("provider", GOOGLE_PROVIDER);

  if (error) {
    console.error("[showcase/google-watch] listing connections failed:", error.message);
    return [];
  }

  return data.map((row) => ({
    connectionId: row.id,
    accountEmail: row.accounts.email,
    domain: row.domain,
    needsReconnect: row.needs_reconnect,
  }));
}

/** One tenant, by the account it belongs to. */
async function tenantByEmail(
  accountEmail: string,
): Promise<TenantConnection | null> {
  const { data, error } = await db()
    .from("connections")
    .select("id, domain, needs_reconnect, accounts!inner(email)")
    .eq("provider", GOOGLE_PROVIDER)
    .eq("accounts.email", normalise(accountEmail))
    .maybeSingle();

  if (error) {
    console.error("[showcase/google-watch] reading a connection failed:", error.message);
    return null;
  }
  if (!data) return null;

  return {
    connectionId: data.id,
    accountEmail: data.accounts.email,
    domain: data.domain,
    needsReconnect: data.needs_reconnect,
  };
}

/** One tenant, by the connection id read out of a channel id. */
export async function tenantByConnection(
  connectionId: string,
): Promise<TenantConnection | null> {
  const { data, error } = await db()
    .from("connections")
    .select("id, domain, needs_reconnect, accounts!inner(email)")
    .eq("id", connectionId)
    .maybeSingle();

  if (error) {
    console.error("[showcase/google-watch] reading a connection failed:", error.message);
    return null;
  }
  if (!data) return null;

  return {
    connectionId: data.id,
    accountEmail: data.accounts.email,
    domain: data.domain,
    needsReconnect: data.needs_reconnect,
  };
}

async function channelFor(connectionId: string): Promise<ChannelRow | null> {
  const { data, error } = await db()
    .from("google_watch_channels")
    .select()
    .eq("connection_id", connectionId)
    .maybeSingle();

  if (error) {
    console.error("[showcase/google-watch] reading a channel failed:", error.message);
    return null;
  }
  return data;
}

/**
 * Whether a channel is close enough to expiry to be worth replacing.
 *
 * A quarter of the life Google actually granted, floored at one and a half
 * sweep intervals. The granted life is `expires_at - renewed_at` rather than a
 * constant, which is what makes this correct without knowing the number, and
 * the floor is what stops a life *shorter* than the docs implied slipping
 * between two sweeps — Google grants 48 hours, and an unfloored quarter of that
 * is narrower than the daily sweep that checks it. See `MIN_RENEW_LEAD_MS`.
 *
 * An unreadable expiry is due. That is the conservative direction: renewing a
 * channel that did not need it costs one API call, and not renewing one that
 * did costs a week of a customer's new starters sitting on a step that never
 * settles.
 */
function isDue(row: ChannelRow, now = Date.now()): boolean {
  const expires = Date.parse(row.expires_at);
  if (!Number.isFinite(expires)) return true;

  const renewed = Date.parse(row.renewed_at);
  const life = Number.isFinite(renewed) ? expires - renewed : 0;
  const lead = Math.max(MIN_RENEW_LEAD_MS, life / 4);

  return now + lead >= expires;
}

/* --- Subscribing ----------------------------------------------------------- */

export type WatchOutcome =
  | {
      ok: true;
      /** `current` means nothing was sent to Google, which is the common case. */
      state: "created" | "renewed" | "current";
    }
  | {
      ok: false;
      /**
       * `not-configured` and `not-connected` are the calm ones, and they are
       * the states this deployment spends nearly all of its life in — the same
       * argument `lib/google/result.ts` makes at length. Nothing that renders
       * these should go red.
       */
      reason: "not-configured" | "not-connected" | "refused";
      message: string;
    };

/**
 * Make sure Google is watching one customer's directory, and keep it that way.
 *
 * The single entry point, called from three places that have nothing else in
 * common: the moment a Workspace is connected, the renewal sweep, and an
 * admin's own request. Each of them wants "there should be a live channel for
 * this tenant" and none of them wants to know whether that means creating one,
 * replacing one, or doing nothing — so the decision lives here rather than
 * being made three times slightly differently.
 *
 * The order of the three writes on a renewal is the part worth reading:
 *
 *   1. Create the replacement at Google.
 *   2. Write it down here, replacing the old row.
 *   3. Stop the old channel at Google.
 *
 * Any other order loses something. Stopping first means a window with no
 * subscription at all, during which the acceptance this feature exists to catch
 * can happen unobserved. Writing first is impossible — the row needs the
 * resource id only Google can mint. A crash between 1 and 2 leaves a channel
 * Google keeps and we have forgotten, which delivers to an endpoint that can
 * still attribute it (the tenant is inside the channel id) and expires on its
 * own within the week. A crash between 2 and 3 leaves a duplicate channel whose
 * deliveries are deduped separately and which also expires on its own. Both are
 * survivable; a gap in coverage is the one that quietly loses an event.
 *
 * Never throws.
 */
export async function ensureWatch(accountEmail: string): Promise<WatchOutcome> {
  const address = notificationAddress();
  if (!address.ok) {
    return { ok: false, reason: "not-configured", message: address.message };
  }

  const tenant = await tenantByEmail(accountEmail);
  if (!tenant) {
    return {
      ok: false,
      reason: "not-connected",
      message:
        "This account hasn't connected Google Workspace, so there is no directory to watch. Nothing was attempted.",
    };
  }

  return ensureWatchForTenant(tenant, address.address);
}

/**
 * The body of `ensureWatch`, with the tenant already resolved.
 *
 * Separate so the sweep can list every connection once and reuse the rows,
 * rather than looking each one up again by email. The sweep is the only caller
 * that would notice, and it is the one that runs against every tenant at once.
 */
async function ensureWatchForTenant(
  tenant: TenantConnection,
  address: string,
): Promise<WatchOutcome> {
  /* A connection already known to be dead. Skipped rather than attempted,
     because every call on it returns `needs-reconnect` and the sweep would
     otherwise spend one Google round trip per dead tenant per run, to learn
     something already written on the row. The customer's screen is already
     saying what has to happen. */
  if (tenant.needsReconnect) {
    return {
      ok: false,
      reason: "not-connected",
      message:
        "This account's Google Workspace connection has stopped working, so no notification channel was created. A Workspace admin has to connect it again; the channel is created automatically when they do.",
    };
  }

  if (!tenant.domain) {
    return {
      ok: false,
      reason: "not-connected",
      message:
        "The stored Google connection doesn't say which Workspace domain it belongs to, so there is no directory to watch. Connect Google Workspace again — the domain comes back with the consent.",
    };
  }

  const existing = await channelFor(tenant.connectionId);
  if (existing && !isDue(existing)) return { ok: true, state: "current" };

  const found = await googleConnectionFor(tenant.accountEmail);
  if (!found.ok) {
    return {
      ok: false,
      reason: found.reason === "not-connected" ? "not-connected" : "refused",
      message: found.message,
    };
  }

  const channelId = mintChannelId(tenant.connectionId);
  const token = await channelTokenFor(channelId);
  if (!token) {
    return {
      ok: false,
      reason: "not-configured",
      message:
        "SESSION_SECRET isn't set on this deployment, and it is what a notification channel's token is signed with. Without it every notification Google sent would be indistinguishable from a stranger's, so no channel was created.",
    };
  }

  const watched = await watchUsers(found.connection, {
    domain: tenant.domain,
    channelId,
    address,
    token,
  });

  if (!watched.ok) {
    /* The library's own words to the log, where the person they were written
       for is already looking — the same split `automation.ts` makes. Nothing
       is retried here: the sweep will come back. */
    console.error(
      `[showcase/google-watch] watch refused (${watched.reason}):`,
      watched.message,
    );
    return { ok: false, reason: "refused", message: watched.message };
  }

  const now = new Date().toISOString();

  const { error } = await db()
    .from("google_watch_channels")
    .upsert(
      {
        connection_id: tenant.connectionId,
        channel_id: watched.channel.channelId,
        resource_id: watched.channel.resourceId,
        resource_uri: watched.channel.resourceUri,
        expires_at: new Date(watched.channel.expiresAt).toISOString(),
        renewed_at: now,
      },
      { onConflict: "connection_id" },
    );

  if (error) {
    /* The channel exists at Google and we could not write it down. Stopped
       again rather than left running: an unrecorded channel is one nothing will
       ever renew and nothing will ever stop, delivering to an endpoint that
       will do the right thing with each delivery but for a week longer than
       anybody intended. */
    console.error(
      "[showcase/google-watch] channel created but not stored:",
      error.message,
    );
    await stopChannel(found.connection, {
      channelId: watched.channel.channelId,
      resourceId: watched.channel.resourceId,
    });
    return {
      ok: false,
      reason: "refused",
      message: `Google set up directory notifications and this server couldn't record them: ${error.message}. The channel was stopped again rather than left running untracked.`,
    };
  }

  /* Last, and best-effort. The replacement is live and written down, so a
     failure here costs a duplicate channel that expires on its own — which is
     why it is neither awaited for correctness nor allowed to change the
     outcome. */
  if (existing) {
    const stopped = await stopChannel(found.connection, {
      channelId: existing.channel_id,
      resourceId: existing.resource_id,
    });
    /* `no-such-user` is this vocabulary's `404`, and for a channel it is the
       expected answer when the old one had already expired. Not worth a line. */
    if (!stopped.ok && stopped.reason !== "no-such-user") {
      console.error(
        `[showcase/google-watch] old channel not stopped (${stopped.reason}); it will expire on its own`,
      );
    }
  }

  return { ok: true, state: existing ? "renewed" : "created" };
}

/**
 * Stop watching one customer's directory, before their connection goes.
 *
 * Called on disconnect, and the order at the call site is forced: this needs
 * the refresh token to authenticate the stop, so it has to run *before* the
 * connection row is deleted. Afterwards there is no credential left with which
 * to tell Google to stop, and the channel keeps delivering until it expires —
 * for a tenant that has just revoked us, which is the worst possible customer
 * to keep polling about.
 *
 * Returns whether there was anything to stop. Never throws.
 */
export async function stopWatch(accountEmail: string): Promise<boolean> {
  const tenant = await tenantByEmail(accountEmail);
  if (!tenant) return false;

  const existing = await channelFor(tenant.connectionId);
  if (!existing) return false;

  const found = await googleConnectionFor(tenant.accountEmail);
  if (found.ok) {
    const stopped = await stopChannel(found.connection, {
      channelId: existing.channel_id,
      resourceId: existing.resource_id,
    });
    if (!stopped.ok && stopped.reason !== "no-such-user") {
      console.error(
        `[showcase/google-watch] channel not stopped on disconnect (${stopped.reason}); it will expire on its own`,
      );
    }
  }

  /* Deleted whether or not Google accepted the stop. The row's only purpose is
     to say what this deployment believes it has running, and after a disconnect
     it has nothing running that it could renew — the cascade off `connections`
     would take it a moment later anyway. */
  const { error } = await db()
    .from("google_watch_channels")
    .delete()
    .eq("id", existing.id);
  if (error) {
    console.error("[showcase/google-watch] channel row not deleted:", error.message);
  }

  return true;
}

export interface SweepReport {
  /** Connections looked at. */
  tenants: number;
  created: number;
  renewed: number;
  /** Already live and not due. The number this should mostly report. */
  current: number;
  /** Nothing connected, or a connection already known to be dead. */
  skipped: number;
  failed: number;
  /** Dedupe records dropped as too old to be a redelivery of anything live. */
  pruned: number;
}

/**
 * Renew everything that needs it, across every tenant.
 *
 * The per-tenant renewal requirement, met by iterating rather than by anything
 * global — there is no global channel to renew, and a sweep that tried to
 * "refresh the subscription" once for the whole deployment would be renewing
 * something that does not exist.
 *
 * It also *creates* what is missing, which makes the sweep the safety net for
 * every other path into `ensureWatch`. A connection made while this deployment
 * had no receiving address, a channel Google dropped, a row lost to a restart
 * mid-renewal: all of them converge here within one sweep, without anybody
 * noticing they were ever wrong. That is why the sweep reads every connection
 * rather than only the ones with a channel row.
 *
 * Cheap in the common case. A tenant with a live channel costs two rows read
 * and no network call at all — `ensureWatch` short-circuits on `isDue` before
 * it decrypts a refresh token, let alone speaks to Google.
 *
 * Sequential rather than parallel, deliberately. Every branch that does
 * anything spends a token refresh and a Directory call against a per-project
 * quota, and a sweep that fanned out across every tenant at once would be this
 * deployment's single largest burst of Google traffic, arriving on a schedule.
 *
 * Never throws.
 */
export async function sweepWatches(): Promise<SweepReport> {
  const report: SweepReport = {
    tenants: 0,
    created: 0,
    renewed: 0,
    current: 0,
    skipped: 0,
    failed: 0,
    pruned: 0,
  };

  const address = notificationAddress();
  if (!address.ok) {
    /* Not a failure of the sweep, and not silent either. A deployment with no
       public address cannot have push notifications at all — the poll in
       `reconcileRun` is still catching acceptances — but somebody who has
       scheduled this sweep deserves to know why it never does anything. */
    console.error(`[showcase/google-watch] sweep skipped: ${address.message}`);
    return report;
  }

  const tenants = await tenantConnections();
  report.tenants = tenants.length;

  for (const tenant of tenants) {
    const outcome = await ensureWatchForTenant(tenant, address.address);

    if (!outcome.ok) {
      if (outcome.reason === "refused") report.failed += 1;
      else report.skipped += 1;
      continue;
    }

    if (outcome.state === "created") report.created += 1;
    else if (outcome.state === "renewed") report.renewed += 1;
    else report.current += 1;
  }

  report.pruned = await pruneDeliveries();
  return report;
}

/* --- Dedupe ---------------------------------------------------------------- */

export type DeliveryRecord =
  /** Never seen. Act on it. */
  | "new"
  /** Seen. Do nothing — Google is redelivering. */
  | "duplicate"
  /**
   * The dedupe record could not be written or read.
   *
   * Deliberately not folded into either of the others, and the caller acts
   * anyway. See `recordDelivery` for why that is the safe direction.
   */
  | "unrecorded";

/**
 * Remember that this notification has been dealt with, and say whether it had
 * been already.
 *
 * The insert *is* the check. A read followed by a write would be two processes
 * racing on the same redelivery, both finding nothing and both acting; the
 * primary key makes Postgres the adjudicator, and `23505` — the unique
 * violation `accounts.ts` already branches on — is how it says somebody else
 * got there first.
 *
 * `unrecorded` is the interesting case and the caller acts on it regardless,
 * which deserves defending because it looks like exactly the wrong call. The
 * defence is that this table is an optimisation on top of an action that is
 * already idempotent, not the only thing standing between a redelivery and a
 * double settle. What a notification actually causes is `reconcileRun`, which
 * re-reads the seat from Google and writes the answer through `updateRun` —
 * and `updateRun` keeps an existing `completedAt` rather than restamping it,
 * precisely so that asking twice cannot move the date somebody accepted their
 * seat. So the worst a lost dedupe record can do is spend a Directory call on a
 * question that already has an answer. Refusing to act because the *bookkeeping*
 * failed would trade that for a missed acceptance, which is the outcome this
 * whole feature exists to prevent.
 */
export async function recordDelivery(
  channelId: string,
  messageNumber: number,
): Promise<DeliveryRecord> {
  if (!Number.isFinite(messageNumber)) return "unrecorded";

  const { error } = await db()
    .from("google_watch_notifications")
    .insert({ channel_id: channelId, message_number: Math.floor(messageNumber) });

  if (!error) return "new";
  if (error.code === "23505") return "duplicate";

  console.error("[showcase/google-watch] dedupe write failed:", error.message);
  return "unrecorded";
}

/**
 * Drop dedupe records too old to be a redelivery of anything still live.
 *
 * This table only ever grows, and nothing else deletes from it. The horizon is
 * generous on purpose: a row kept too long costs bytes, and a row dropped too
 * early costs a redelivery being treated as new, which is the exact failure the
 * table exists to prevent.
 *
 * Returns how many went, so the sweep can say so. Never throws.
 */
export async function pruneDeliveries(): Promise<number> {
  const before = new Date(Date.now() - DEDUPE_KEEP_MS).toISOString();

  const { data, error } = await db()
    .from("google_watch_notifications")
    .delete()
    .lt("received_at", before)
    .select("channel_id");

  if (error) {
    console.error("[showcase/google-watch] prune failed:", error.message);
    return 0;
  }
  return data.length;
}
