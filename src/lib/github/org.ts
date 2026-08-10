import "server-only";

import { API_ORIGIN, API_VERSION } from "./config";
import { fail, type GitHubFailed } from "./result";

/**
 * Inviting somebody to a GitHub organisation, and finding out whether they came.
 *
 * The counterpart of `src/lib/google/directory.ts`, and the second integration
 * in this product that can genuinely *do* something rather than record an
 * intention. Everything here speaks to `api.github.com` with an already-minted
 * user token; getting one, refreshing it and storing it is `auth.ts` and
 * `store.ts`, and this file deliberately knows none of that.
 *
 * ## The shape this shares with Google, and the one thing it doesn't
 *
 * An invitation is `awaiting`, exactly like a Workspace seat: `POST` creates a
 * *pending* invitation and nothing makes the person a member except the person
 * accepting it. So the runner's states carry over unchanged, and the polling
 * question — "have they accepted yet" — is the same question.
 *
 * The difference is that GitHub cannot answer it cleanly, and pretending
 * otherwise would be the bug. See `invitationState` below.
 *
 * ## Every failure comes back, none is thrown
 *
 * Same contract as the rest of `src/lib/github`. GitHub's own error strings go
 * to the server log; what comes back is a reason named for whoever has to fix
 * it and a sentence safe to put on a screen.
 *
 * **`api.github.com` uses honest status codes.** That is worth stating because
 * `github.com` — the host `auth.ts` exchanges tokens against — does not: it
 * returns HTTP 200 with an `error` field in the body. Two hosts with opposite
 * conventions inside one integration is exactly how a status-code check comes
 * to read every failure as success, so the two files check differently on
 * purpose.
 */

/** GitHub's documented roles for an organisation invitation. */
export type OrgRole = "direct_member" | "admin" | "billing_manager";

const headers = (token: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": API_VERSION,
});

/**
 * One place that turns a GitHub response into one of our reasons.
 *
 * Kept apart from the calls so that "what does a 403 mean here" is answered
 * once. GitHub overloads 403 and 404 heavily — a 404 on an org endpoint
 * usually means "your token cannot see this org" rather than "no such org",
 * because GitHub hides what you may not read rather than admitting it exists.
 * Telling an admin their organisation does not exist when the real problem is
 * a missing installation would send them to create a second one.
 */
async function refuse(response: Response, what: string): Promise<GitHubFailed> {
  const body = await response.text().catch(() => "");
  console.error(`[github] ${what} failed: ${response.status} ${body.slice(0, 400)}`);

  if (response.status === 401) {
    return fail(
      "needs-reconnect",
      "GitHub no longer accepts this connection, so nothing was sent. An organisation owner needs to connect it again.",
    );
  }

  if (response.status === 403) {
    /* Both rate limits arrive as 403, and they are told apart by headers
       rather than by the body. Worth the distinction because "wait a minute"
       and "wait until tomorrow" are different sentences, and the invitation
       endpoint has a documented daily cap as well as an hourly one. */
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining === "0" || response.headers.get("retry-after")) {
      return fail(
        "rate-limited",
        "GitHub is rate-limiting this organisation, so the invitation wasn't sent. It's worth trying again later — GitHub caps how many invitations an organisation can send in a day.",
      );
    }
    return fail(
      "unauthorized",
      "GitHub refused this. The app is connected, but it needs Members (write) on the organisation and the person who connected it has to be an organisation owner.",
    );
  }

  if (response.status === 404) {
    return fail(
      "not-installed",
      "GitHub can't see that organisation with this connection. Usually that means the app was authorised but never installed on the organisation itself — an owner installs it once.",
    );
  }

  if (response.status === 422) {
    /* Validation, and the one case worth reading the body for. GitHub returns
       422 both for "already a member or already invited" — which is not a
       failure anybody needs to act on — and for genuinely malformed input. */
    if (/already/i.test(body)) {
      return fail(
        "invalid-request",
        "GitHub says that person is already a member of the organisation, or already has an invitation waiting.",
      );
    }
    return fail(
      "invalid-request",
      "GitHub refused the invitation as invalid. The most common cause is a team that no longer exists on the organisation.",
    );
  }

  if (response.status >= 500) {
    return fail("rejected", "GitHub had a problem at their end, so nothing was sent. Trying again usually works.");
  }

  return fail("rejected", "GitHub refused the invitation and didn't say why in a way we can act on.");
}

export interface Invitation {
  /** GitHub's own id for the invitation. */
  id: number;
  /** The address it was sent to, as GitHub recorded it. */
  email: string | null;
  /** Their GitHub login, if GitHub already knew the address. Usually null. */
  login: string | null;
}

export type InviteResult = { ok: true; invitation: Invitation } | GitHubFailed;

/**
 * Invite somebody to the organisation, optionally straight into teams.
 *
 * **`team_ids` are numeric and GitHub will not accept names.** A block
 * configured with "Engineering" produces a 422 that reads as a malformed
 * request, so whatever collects teams has to resolve them to ids first — this
 * function takes ids only, so that mistake cannot be made here.
 *
 * The address is the one the new starter was invited to Craig with, which is
 * deliberate: it is the address their employer already believes is theirs, and
 * inviting a *different* one would put a stranger in the organisation on the
 * strength of a typo.
 */
export async function inviteToOrg(options: {
  token: string;
  org: string;
  email: string;
  role?: OrgRole;
  teamIds?: number[];
}): Promise<InviteResult> {
  const { token, org, email, role = "direct_member", teamIds } = options;

  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}/orgs/${encodeURIComponent(org)}/invitations`, {
      method: "POST",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        role,
        ...(teamIds && teamIds.length > 0 ? { team_ids: teamIds } : {}),
      }),
    });
  } catch (cause) {
    console.error("[github] invite unreachable:", cause);
    return fail(
      "unreachable",
      "GitHub didn't answer, so it isn't clear whether the invitation went out. Check the organisation's pending invitations before sending another.",
    );
  }

  /* 201 is the documented success. Anything else is a refusal, including the
     2xx codes GitHub does not document here — a `200` from this endpoint would
     mean something we do not understand, and guessing is how a failure becomes
     a step marked done. */
  if (response.status !== 201) return refuse(response, "invite");

  const body = (await response.json().catch(() => null)) as {
    id?: number;
    email?: string | null;
    login?: string | null;
  } | null;

  if (typeof body?.id !== "number") {
    return fail(
      "rejected",
      "GitHub accepted the invitation but didn't return one we can follow up on, so its progress can't be tracked.",
    );
  }

  return {
    ok: true,
    invitation: { id: body.id, email: body.email ?? email, login: body.login ?? null },
  };
}

/**
 * Where an invitation has got to.
 *
 * `accepted` here means **"no longer pending and not failed"**, which is not
 * quite the same thing and the difference is worth stating rather than hiding.
 *
 * GitHub offers no "was this accepted" endpoint. It offers a list of *pending*
 * invitations and a list of *failed* ones, and an invitation that has left both
 * has either been accepted or been cancelled by an organisation owner — the
 * API exposes no way to tell those apart. So an owner who invites somebody,
 * changes their mind and cancels will see the step settle as though the person
 * joined.
 *
 * That was chosen over the alternative, which is worse. Membership can only be
 * confirmed with `GET /orgs/{org}/members/{username}`, and a username is
 * exactly what an email invitation does not have: `login` is null until GitHub
 * already knows the address. Demanding a verified membership would therefore
 * leave the *ordinary* case — inviting somebody who has never had a GitHub
 * account — pending forever, which is a step that never completes for the
 * majority of real hires. A rare wrong `done` beats a routine permanent
 * `awaiting`.
 *
 * When GitHub *does* give us a login, it is used: membership is checked
 * properly, and only then is `accepted` actually verified.
 */
export type InvitationState =
  | { ok: true; state: "pending" }
  | { ok: true; state: "accepted"; verified: boolean }
  | { ok: true; state: "failed"; reason: string | null }
  | GitHubFailed;

export async function invitationState(options: {
  token: string;
  org: string;
  invitationId: number;
  email: string;
  /**
   * Their GitHub login, if the invitation carried one when it was created.
   *
   * From the caller rather than looked up here, because by the time this
   * matters the invitation has left both lists and there is nothing left to
   * read it off. Whoever stored the invitation id is the only thing that still
   * knows it, and it is the difference between a verified `accepted` and an
   * inferred one.
   */
  login?: string | null;
}): Promise<InvitationState> {
  const { token, org, invitationId, email, login } = options;
  const wanted = email.trim().toLowerCase();

  const pending = await listInvitations(token, org, "invitations");
  if (!pending.ok) return pending;

  const stillPending = pending.rows.find(
    (row) =>
      row.id === invitationId ||
      (row.email ?? "").trim().toLowerCase() === wanted,
  );
  if (stillPending) return { ok: true, state: "pending" };

  const failed = await listInvitations(token, org, "failed_invitations");
  if (!failed.ok) return failed;

  const didFail = failed.rows.find(
    (row) =>
      row.id === invitationId ||
      (row.email ?? "").trim().toLowerCase() === wanted,
  );
  if (didFail) {
    return { ok: true, state: "failed", reason: didFail.failedReason ?? null };
  }

  /* Gone from both lists. When the invitation carried a login we can settle
     this for certain; otherwise it is the inference documented above, and
     `verified: false` is how a caller can tell which one it got. */
  if (login) {
    const member = await isMember(token, org, login);
    if (!member.ok) return member;
    return { ok: true, state: "accepted", verified: member.member };
  }

  return { ok: true, state: "accepted", verified: false };
}

interface InvitationRow {
  id: number;
  email: string | null;
  login: string | null;
  failedReason: string | null;
}

type ListResult = { ok: true; rows: InvitationRow[] } | GitHubFailed;

/**
 * One page is enough, and that is a decision rather than an oversight.
 *
 * GitHub paginates at 30 by default and this asks for 100. An organisation
 * with more than a hundred invitations outstanding at once is not a company
 * onboarding one person at a time, and following pages would turn a routine
 * poll into an unbounded number of requests against an endpoint with a
 * documented rate limit. If it is ever wrong, it is wrong in the direction of
 * an invitation that stays `pending` until somebody presses check — visible,
 * and not a lie.
 */
async function listInvitations(
  token: string,
  org: string,
  path: "invitations" | "failed_invitations",
): Promise<ListResult> {
  let response: Response;
  try {
    response = await fetch(
      `${API_ORIGIN}/orgs/${encodeURIComponent(org)}/${path}?per_page=100`,
      { headers: headers(token) },
    );
  } catch (cause) {
    console.error(`[github] ${path} unreachable:`, cause);
    return fail("unreachable", "GitHub didn't answer, so their progress couldn't be checked.");
  }

  if (!response.ok) return refuse(response, path);

  const body = (await response.json().catch(() => null)) as
    | { id?: number; email?: string | null; login?: string | null; failed_reason?: string | null }[]
    | null;

  if (!Array.isArray(body)) {
    return fail("rejected", "GitHub's answer wasn't in a shape we could read.");
  }

  return {
    ok: true,
    rows: body
      .filter((row): row is { id: number } & typeof row => typeof row.id === "number")
      .map((row) => ({
        id: row.id,
        email: row.email ?? null,
        login: row.login ?? null,
        failedReason: row.failed_reason ?? null,
      })),
  };
}

type MemberResult = { ok: true; member: boolean } | GitHubFailed;

/**
 * Whether a login is a member of the organisation.
 *
 * `204` is a member and `404` is not — GitHub answers this one with status
 * codes and an empty body, so there is nothing to parse and a `!response.ok`
 * check would read "not a member" as an error.
 */
async function isMember(token: string, org: string, login: string): Promise<MemberResult> {
  let response: Response;
  try {
    response = await fetch(
      `${API_ORIGIN}/orgs/${encodeURIComponent(org)}/members/${encodeURIComponent(login)}`,
      { headers: headers(token) },
    );
  } catch (cause) {
    console.error("[github] membership check unreachable:", cause);
    return fail("unreachable", "GitHub didn't answer, so their membership couldn't be confirmed.");
  }

  if (response.status === 204) return { ok: true, member: true };
  if (response.status === 404) return { ok: true, member: false };
  return refuse(response, "membership");
}
