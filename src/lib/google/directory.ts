import "server-only";

import { accessTokenFor, type GoogleConnection } from "./auth";
import { temporaryPassword } from "./password";
import { fail, type GoogleFailed } from "./result";

/**
 * Creating a Google Workspace seat, and finding out whether anybody took it.
 *
 * Two calls against the Admin SDK Directory API — `users.insert` and
 * `users.get` — with `fetch`, for the same reason `src/lib/email/send.ts`
 * talks to Resend with `fetch`: `googleapis` is a generated client for
 * several hundred APIs wrapped around what is, here, two HTTP requests.
 *
 * Worth being explicit about why this is a REST integration at all, because
 * the obvious first moves are both dead ends. Google publishes a set of
 * remote MCP servers for Workspace — Gmail, Drive, Docs, Sheets, Slides,
 * Calendar, Chat and People. Creating a *user* is in none of them: it is the
 * Admin SDK (`admin.googleapis.com`), an administrative API over the tenant
 * rather than an API over one person's data, and it has no MCP server in that
 * set. Google's `gws` CLI does reach it, but a CLI is an operator's tool that
 * holds one machine's credentials — it is not something a multi-tenant server
 * can shell out to on behalf of a particular customer. This is the
 * integration.
 *
 * Every operation takes a `GoogleConnection`, because there is no ambient
 * "our Google account" here. Each customer connects their own Workspace, and
 * the connection identifies whose. Passing it explicitly at every call is
 * what makes acting for the wrong company a thing you would have to type.
 *
 * There is no barrel file next to this one on purpose. Every module in this
 * directory handles either a client secret, a customer's standing permission,
 * or a live password, and a barrel is the easiest way there is to drag a
 * server-only module into a browser bundle by accident — one component
 * imports `@/lib/google` for a type, and the OAuth client comes with it.
 * Server code reaches for `@/lib/google/directory` by name, so crossing that
 * boundary is something you have to type rather than something you inherit.
 *
 * Unverified: this repo has no OAuth client and no tenant to point at, so
 * none of these requests has ever been sent. The endpoint, the request shape,
 * the field semantics and the error reasons below are from Google's Directory
 * API reference and its common-errors guide, not from a response.
 */

const DIRECTORY_ROOT = "https://admin.googleapis.com/admin/directory/v1";

/** Long enough for a slow network, short enough not to pin a handler open. */
const TIMEOUT_MS = 15_000;

/* --- What comes back ------------------------------------------------------- */

/**
 * A seat that now exists, and the one copy of its password.
 *
 * `temporaryPassword` is here because the caller has to put it in an email
 * and there is nowhere else to get it: Google documents `password` as
 * write-only and never returns it in a response body. If this value is
 * dropped, the only remaining fix is an administrator resetting the account
 * by hand. It must not be persisted, and it must not be logged.
 */
export interface CreatedSeat {
  primaryEmail: string;
  /**
   * Google's immutable numeric user id, as a string.
   *
   * Worth keeping alongside the address rather than instead of it: the
   * address is what a person types and can be changed by an administrator
   * later, while this survives a rename. It is a string because Google's ids
   * exceed what a JavaScript number holds exactly.
   */
  id: string | null;
  givenName: string;
  familyName: string;
  /** The only copy. Email it; never log it, never store it. */
  temporaryPassword: string;
  /** Always true. `createUser` sets it and does not offer a way not to. */
  mustChangePassword: boolean;
  /** ISO 8601, as Google returned it. */
  createdAt: string | null;
}

/**
 * The state of a seat, as far as Google will tell us.
 *
 * A deliberately narrow view of a resource with about sixty fields. Every
 * field here is one this product actually reasons about, and adding one
 * should mean somebody has a use for it — a wide passthrough would put a new
 * starter's phone numbers, addresses and org chart position into whatever
 * this gets handed to next, out of somebody else's company.
 */
export interface DirectoryUser {
  primaryEmail: string;
  id: string | null;
  /**
   * Google's own words: "This property is `true` if the user has completed an
   * initial login and accepted the Terms of Service agreement." Output only.
   * This is the field that means "they took the seat" — see `hasAcceptedSeat`.
   */
  agreedToTerms: boolean;
  /**
   * ISO 8601, or `null` for a person who has never signed in.
   *
   * `null` is this module's doing, and it is the whole reason this field is
   * normalised rather than passed through. Google does not omit
   * `lastLoginTime` for an account nobody has logged into: it returns the Unix
   * epoch, `1970-01-01T00:00:00.000Z`. So the obvious check —
   * `if (user.lastLoginTime)` — is true for every user ever created, and a
   * workflow built on it would report every new starter as having accepted
   * their seat the instant it was made. Mapping the epoch to `null` here means
   * the obvious check is also the correct one.
   *
   * (The epoch behaviour is consistent and widely relied on, but Google's
   * reference does not document it; the mapping below tests for "at or before
   * the epoch" rather than for that exact string, so a change of spelling
   * costs nothing.)
   */
  lastLoginTime: string | null;
  suspended: boolean;
  archived: boolean;
  /**
   * Set to `true` when the seat is created, and cleared by Google the moment
   * the person chooses their own password.
   */
  changePasswordAtNextLogin: boolean;
  /** Whether Gmail has finished provisioning. Only meaningful with a licence. */
  isMailboxSetup: boolean;
  /**
   * Whether this person has turned on 2-step verification.
   *
   * Google's own field, output only, on the same user resource everything else
   * here reads — so knowing it costs nothing extra: no new scope, no second
   * call, no new polling. That is the whole reason MFA is expressible as a
   * condition on this step rather than as an integration of its own.
   *
   * Distinct from `isEnforcedIn2Sv`, which is about *policy* — whether the
   * domain requires it. A domain can enforce 2SV without this person having
   * completed enrolment yet, and enrolment is the thing an onboarding step
   * waits for. Absent means false, like every other boolean here.
   */
  isEnrolledIn2Sv: boolean;
  /**
   * Whether the domain's policy requires 2-step verification of them.
   *
   * Read but never waited on. It is the answer to "should this person have
   * MFA", which is the admin's configuration rather than the new starter's
   * progress — useful for saying *why* a step is waiting, and wrong to treat
   * as the completion signal.
   */
  isEnforcedIn2Sv: boolean;
  /** ISO 8601, as Google returned it. */
  creationTime: string | null;
}

export type CreateSeatResult = { ok: true; seat: CreatedSeat } | GoogleFailed;
export type GetUserResult = { ok: true; user: DirectoryUser } | GoogleFailed;

/* --- Reading Google's answers ---------------------------------------------- */

/** Google's error envelope. Everything optional: a 502 from a proxy in front
    of Google has none of it. */
interface DirectoryError {
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
}

const asString = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

const asBool = (value: unknown): boolean => value === true;

/**
 * `lastLoginTime`, with the epoch understood as "never".
 *
 * Compared as a timestamp rather than as a string. Google currently spells it
 * `1970-01-01T00:00:00.000Z`, but a match on that literal would silently
 * start reporting "signed in, in 1970" the day the serialisation changed by a
 * millisecond of precision or a timezone offset. `<= 0` is true for every
 * spelling of the epoch there is.
 */
function lastLogin(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const at = Date.parse(raw);
  return Number.isFinite(at) && at > 0 ? raw : null;
}

function toDirectoryUser(
  payload: unknown,
  fallbackEmail: string,
): DirectoryUser {
  const user = (payload ?? {}) as Record<string, unknown>;

  return {
    /* Google's spelling of the address wins over ours. An alias was asked
       about, or the caller's casing differed; either way the primary address
       is the one to carry forward. */
    primaryEmail: asString(user.primaryEmail) ?? fallbackEmail,
    id: asString(user.id),
    /* Absent means false throughout. A freshly created user comes back
       without `agreedToTerms` at all, and reading an absent boolean as
       anything but `false` would mean the seat reports itself accepted in the
       same response that created it. */
    agreedToTerms: asBool(user.agreedToTerms),
    lastLoginTime: lastLogin(user.lastLoginTime),
    suspended: asBool(user.suspended),
    archived: asBool(user.archived),
    changePasswordAtNextLogin: asBool(user.changePasswordAtNextLogin),
    isMailboxSetup: asBool(user.isMailboxSetup),
    isEnrolledIn2Sv: asBool(user.isEnrolledIn2Sv),
    isEnforcedIn2Sv: asBool(user.isEnforcedIn2Sv),
    creationTime: asString(user.creationTime),
  };
}

/**
 * Which failure this is, and what to do about it.
 *
 * Google puts a machine-readable `reason` in `error.errors[].reason` and it is
 * far more stable than either the status or the prose, so that is what this
 * branches on first. The statuses are the fallback, because Google reuses
 * them: `403` is the answer both to "the admin who connected this isn't
 * allowed to manage users" and to "the Admin SDK API is switched off in the
 * Cloud project", which are somebody else's problem and ours respectively.
 *
 * The reason strings below are Google's, from the Directory API common-errors
 * guide: `duplicate`, `limitExceeded`, `forbidden`, `accessNotConfigured`,
 * `badRequest`, `notFound`, and the three rate-limit spellings.
 */
function classify(
  status: number,
  error: DirectoryError,
  retryAfter?: number,
): GoogleFailed {
  const reason = (error.error?.errors?.[0]?.reason ?? "").toLowerCase();
  const text = (error.error?.message ?? "").toLowerCase();

  if (reason === "duplicate" || status === 409) {
    return fail(
      "already-exists",
      "That address is already a Google account. Either this seat was created already — check before creating another — or the address belongs to a personal Google account that has claimed it, which an administrator has to resolve in the Admin console before the address can be used.",
    );
  }

  if (reason === "limitexceeded" || status === 412) {
    return fail(
      "quota-exhausted",
      "This Google Workspace subscription has no free seats left. An administrator has to add a licence in the Admin console under Billing — nothing here can create one, and the request will keep failing until they do.",
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
      retryAfter
        ? `Google is rate limiting the Directory API. Try again in ${retryAfter}s.`
        : "Google is rate limiting the Directory API — either too many calls in a moment, or the daily quota is spent.",
      retryAfter,
    );
  }

  if (reason === "accessnotconfigured" || text.includes("has not been used")) {
    return fail(
      "unauthorized",
      "The Admin SDK API isn't enabled in the Google Cloud project behind this deployment. Enable \"Admin SDK API\" in the Cloud console under APIs & Services, then try again — a newly enabled API can take a minute to propagate. This one is ours to fix, not the customer's.",
    );
  }

  if (status === 401) {
    return fail(
      "needs-reconnect",
      "Google rejected the access token. It was accepted when it was issued moments ago, so the connection was almost certainly withdrawn in between — a Workspace admin needs to connect Google Workspace again.",
    );
  }

  if (status === 403) {
    return fail(
      "unauthorized",
      "Google won't let this connection manage users. Almost always the person who connected Google Workspace isn't a super admin — the Directory API only takes user management from an account with that privilege, and consenting works perfectly well without it. Reconnecting as a super admin fixes it.",
    );
  }

  if (status === 404 || reason === "notfound") {
    return fail(
      "no-such-user",
      "Google has no account at that address. If the seat was created moments ago this can be propagation rather than absence — Google's own documentation warns that a new user isn't immediately visible to every backend — so it's worth one retry before treating it as missing.",
    );
  }

  if (status === 400 || reason === "badrequest" || reason === "invalid") {
    return fail(
      "invalid-request",
      "Google refused the request as invalid. The usual causes are an address whose domain isn't one this Workspace account owns, a name field left empty, or a password the tenant's own policy rejects. The full reason is in the server log.",
    );
  }

  if (status >= 500) {
    return fail(
      "rejected",
      "Google's Directory API is having a problem at their end. Nothing to fix here; try again shortly.",
    );
  }

  return fail(
    "rejected",
    `Google refused the request (${status}). The full reason is in the server log.`,
  );
}

/* --- The transport --------------------------------------------------------- */

type Call = { ok: true; payload: unknown } | GoogleFailed;

/**
 * One authenticated request on one customer's behalf, with every outcome
 * already turned into a result.
 *
 * `body` is a string the caller has already serialised, and it is never
 * logged. That is not incidental tidiness: the body of a `users.insert` is
 * the only place a new starter's password ever appears, so a debug line that
 * echoed the request — the first thing anybody adds when a call misbehaves —
 * would write a live credential for somebody's work account into the log
 * permanently. The status and Google's own message are logged instead, which
 * is all any of the branches above actually need.
 */
async function call(
  connection: GoogleConnection | null,
  path: string,
  init: { method: string; body?: string },
): Promise<Call> {
  const auth = await accessTokenFor(connection);
  if (!auth.ok) return auth;

  let response: Response;
  try {
    response = await fetch(`${DIRECTORY_ROOT}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${auth.token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    /* Logged without the request: the headers carry the bearer token and the
       body may carry a password. */
    console.error(`[lib/google] ${init.method} ${path} unreachable:`, cause);
    return fail(
      "unreachable",
      "Couldn't reach Google — no network, or the request timed out. Whether the account was created is genuinely unknown from here; look the address up before trying again.",
    );
  }

  /* Read as text and parse by hand. An error from a proxy in front of Google
     is HTML, and `response.json()` on it throws a parse error that reads like
     a bug in this file. */
  const raw = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const error = (payload ?? {}) as DirectoryError;
    const header = response.headers.get("retry-after");
    const retryAfter = Number(header);

    /* The one place Google's own words are kept, and a place no browser can
       read. Without this, "the full reason is in the server log" is a lie.
       The account id identifies which customer; it is not a credential. */
    console.error(
      `[lib/google] ${init.method} ${path} ${response.status} for ${connection?.accountId ?? "?"}:`,
      error.error?.message ?? raw.slice(0, 200),
    );

    return classify(
      response.status,
      error,
      header && Number.isFinite(retryAfter) ? retryAfter : undefined,
    );
  }

  return { ok: true, payload };
}

/* --- The operations -------------------------------------------------------- */

export interface NewSeat {
  /** The full address, including a domain the customer's tenant owns. */
  primaryEmail: string;
  givenName: string;
  familyName: string;
  /**
   * Optional. Left out, one is generated by `temporaryPassword()`, which is
   * what you want — it is built for a policy stricter than the tenant's is
   * likely to be. Supply one only when it has to match something else.
   */
  password?: string;
}

/**
 * Creates a Google Workspace account in the connected customer's tenant.
 *
 * Returns the address and the password together, because that pair is the
 * entire point: the next thing that happens is an email to the new starter
 * saying "this is your address, this is your password, you'll be asked to
 * change it". Nothing else can produce the password afterwards.
 *
 * `changePasswordAtNextLogin` is always `true` and is not a parameter. This
 * password has been through an email, which is not a secure channel and is
 * one forward away from being in a thread; the only version of that which is
 * defensible is one that stops working the moment the right person uses it.
 * Making it optional would mean somebody, one day, has a reason not to.
 *
 * `resolveConflictAccount` is deliberately not set, so a conflicting address
 * comes back as a plain `409` rather than quietly sending a stranger's
 * personal Google account an invitation to be absorbed into a company's
 * tenant. That is a decision an administrator should make on purpose, in
 * their own console, and not one this product should make for them.
 *
 * Never throws. Never logs the password.
 */
export async function createUser(
  connection: GoogleConnection | null,
  input: NewSeat,
): Promise<CreateSeatResult> {
  const primaryEmail = input.primaryEmail.trim().toLowerCase();
  const givenName = input.givenName.trim();
  const familyName = input.familyName.trim();

  /* Checked here rather than left to Google. Both names are required by the
     API, and a `400 badRequest` for an empty string is indistinguishable from
     a `400` for six other things — whereas this can say which field, before
     spending a round trip and, more to the point, before there is any chance
     of a half-created account to reason about. */
  if (!primaryEmail.includes("@") || !givenName || !familyName) {
    return fail(
      "invalid-request",
      "A Google seat needs a full email address, a first name and a last name. One of the three is missing, so nothing was sent.",
    );
  }

  const password = input.password ?? temporaryPassword();

  const result = await call(connection, "/users", {
    method: "POST",
    body: JSON.stringify({
      primaryEmail,
      name: { givenName, familyName },
      password,
      changePasswordAtNextLogin: true,
    }),
  });

  if (!result.ok) return result;

  const created = (result.payload ?? {}) as Record<string, unknown>;

  return {
    ok: true,
    seat: {
      primaryEmail: asString(created.primaryEmail) ?? primaryEmail,
      id: asString(created.id),
      givenName,
      familyName,
      /* Passed back out, not read back in. Google's response has no
         `password` field, by design. */
      temporaryPassword: password,
      mustChangePassword: true,
      createdAt: asString(created.creationTime),
    },
  };
}

/**
 * Looks a seat up in the connected customer's tenant.
 *
 * The address is percent-encoded into the path. An email address is legal in
 * a path segment as it stands, but `+` tagging and the occasional address
 * with unusual characters are not, and a `userKey` that arrives at Google
 * subtly mangled produces a `404` that reads as "this person doesn't exist"
 * rather than as "you asked the wrong question".
 *
 * A missing user comes back as `no-such-user` rather than as `ok`, so the
 * caller cannot mistake "no account" for "an account that has done nothing".
 *
 * Never throws.
 */
export async function getUser(
  connection: GoogleConnection | null,
  primaryEmail: string,
): Promise<GetUserResult> {
  const key = primaryEmail.trim().toLowerCase();
  if (!key) {
    return fail(
      "invalid-request",
      "No address to look up, so nothing was sent.",
    );
  }

  const result = await call(connection, `/users/${encodeURIComponent(key)}`, {
    method: "GET",
  });
  if (!result.ok) return result;

  return { ok: true, user: toDirectoryUser(result.payload, key) };
}

/**
 * Has this person actually taken the seat?
 *
 * `agreedToTerms`, and nothing else. Google's documentation for that field is
 * unambiguous — "this property is `true` if the user has completed an initial
 * login and accepted the Terms of Service agreement" — and it is exactly the
 * event the workflow is waiting for: not "an account exists", which was true
 * the moment we made it, but "a person has been there".
 *
 * The two other candidates were both considered and both rejected:
 *
 * `lastLoginTime` looks like the natural answer and is a trap. Google returns
 * the Unix epoch, not an absent field, for an account nobody has signed into,
 * so the intuitive truthiness check reports every account as logged-in from
 * the moment it is created. `DirectoryUser` maps the epoch to `null` so that
 * trap is defused, and after that it is a perfectly good corroborating
 * signal — but it means "signed in", which is a shade weaker than "signed in
 * and accepted the terms", and it is the terms that make the seat theirs.
 *
 * `changePasswordAtNextLogin` going from `true` to `false` is a real signal
 * and a fragile one: it also flips when an administrator clears the flag by
 * hand, and Google documents it as not applying at all when the tenant
 * authenticates through a third-party identity provider. A customer on SSO
 * would therefore report every seat as accepted immediately. Building the
 * product's "they're in" moment on a field that means nothing under a
 * configuration we don't control is not a trade worth making — and in a
 * multi-tenant product, that configuration is genuinely not ours.
 *
 * Suspension and archival veto the answer regardless. A suspended account can
 * have agreed to the terms months ago and still not be a seat anybody can
 * use, and reporting it as accepted would send a welcome message about an
 * account that cannot be signed into.
 */
export function hasAcceptedSeat(user: DirectoryUser): boolean {
  if (user.suspended || user.archived) return false;
  return user.agreedToTerms;
}

/**
 * Has this person finished, given what this workflow asked for?
 *
 * Acceptance is the floor and it is not always the ceiling. An account that
 * exists, has been signed into, and has no second factor on it is a company
 * email address protected by one password — which is the thing that actually
 * gets phished in somebody's first fortnight, when they do not yet know who
 * their finance director is or how the company writes an email.
 *
 * So a workflow may ask for more, and this is the one place that decides
 * whether it got it. Written as a widening of `hasAcceptedSeat` rather than a
 * replacement: the terms are still what makes the seat theirs, and MFA is an
 * extra condition on top of it rather than an alternative to it. An account
 * with 2SV enrolled but the terms unaccepted has not been taken by anybody —
 * which cannot really happen, since enrolment requires signing in, and the
 * ordering here means we do not have to rely on that.
 *
 * `isEnforcedIn2Sv` is deliberately not consulted. That field says the
 * *domain* requires 2SV, which is the customer's policy and not this person's
 * progress: a workflow that waited on it would complete instantly for a
 * customer who has enforcement switched on and never for one who has not,
 * neither of which is "has this person set up a second factor".
 */
export function hasCompletedSeat(
  user: DirectoryUser,
  options?: { requireMfa?: boolean },
): boolean {
  if (!hasAcceptedSeat(user)) return false;
  if (options?.requireMfa && !user.isEnrolledIn2Sv) return false;
  return true;
}
