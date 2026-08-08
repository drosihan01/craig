import "server-only";

import { googleConnectionFor } from "@/lib/showcase/accounts";
import type { GoogleConnection } from "@/lib/google/auth";

/**
 * The seam between "a customer connected their Google Workspace" and
 * "a workflow step creates somebody an account in it".
 *
 * This was a stub while the two halves were built beside each other, and it is
 * now the join. Everything on this side calls exactly one function so that
 * wiring them together was replacing one body rather than editing every call
 * site — nothing else in `src/lib/showcase` or `src/app/showcase` mentions a
 * refresh token, a consent screen, or a Google account at all.
 *
 * It still answers "nothing connected" on every deployment today, and that is
 * the honest state rather than a placeholder failing badly:
 * `accessTokenFor(null)` answers `not-configured` or `not-connected`,
 * `isWaitingOnSetup` recognises both, and the step sits in `waiting` saying
 * somebody has to connect Google Workspace. That path is the one anybody can
 * actually see right now, so it is the one that had to be good.
 *
 * Two things are needed and both are needed, which is why this returns a
 * record rather than a connection:
 *
 * The **connection** is what `src/lib/google/*` acts with. `accountId` keys the
 * access-token cache and is the reason a token minted for one customer can
 * never be handed to another, so it has to be stable and unique per account —
 * the lowercased account email is what the rest of this showcase already keys
 * accounts by, and it is what the caller passes in.
 *
 * The **domain** is what `newstarter@…` is built from, and it is not optional
 * or derivable. `createUser` needs a primary email on a domain the customer's
 * tenant actually owns; get it wrong and Google answers `400 invalid` with
 * nothing that names the problem. It should be Google's own answer — the `hd`
 * claim on the id token, which `exchangeCode` already returns as
 * `ConnectedWorkspace.domain` — rather than a string somebody typed into a box.
 * The `google-workspace` block does have an "Email domain" field, and it is
 * deliberately not used for this: a workflow's blocks are snapshotted without
 * their config when somebody is invited, and a domain the admin typed is a
 * domain the admin can typo.
 */

export interface AccountGoogle {
  /**
   * The customer's standing permission, or null when there isn't one.
   *
   * Null covers both "this account has never connected" and "this deployment
   * has no OAuth client for anybody to connect with". The two are told apart
   * downstream by `oauthClient()`, which is where that knowledge belongs — this
   * function's answer is about one account, and the environment is not.
   */
  connection: GoogleConnection | null;
  /** Their Workspace domain, from Google. Null when nothing is connected. */
  domain: string | null;
  /**
   * A connection is on the record and this server cannot open it.
   *
   * Distinct from having none, and the distinction is the whole point of
   * carrying it: both leave `connection` null, and they are opposites to the
   * person reading the screen. "Nobody has connected yet" is answered by
   * pressing Connect. "The stored connection can't be opened" is answered by
   * looking at why — and pressing Connect there would throw away a grant a
   * Workspace admin has already given, to fix a problem that was never theirs.
   */
  unreadable: boolean;
}

/**
 * What we may do on one account's behalf inside Google.
 *
 * `async` although the body below is not, because the real one will not be: it
 * reads a store and decrypts a refresh token at rest. Making the shape of the
 * seam match what will fill it means wiring the halves together is one edit
 * rather than one edit and a change to every call site's signature.
 *
 * Never throws. A connection lookup that can fail is a connection lookup every
 * caller has to wrap, and the caller here is the block that creates somebody's
 * email account on their first morning.
 */
export async function googleForAccount(
  accountEmail: string,
): Promise<AccountGoogle> {
  /* The store folds the address itself, which is the point of handing it the
     raw one: a seam that normalised differently from the store behind it would
     look up nothing for accounts whose stored address differs in case — nobody
     in testing, and somebody in the end. */
  const found = googleConnectionFor(accountEmail);

  /* Every refusal collapses to the same pair, deliberately. Whether this
     deployment has no OAuth client, or this customer has never connected, or
     the connection was stored under a key we can no longer open, the answer to
     "what may we do inside Google for them" is the same: nothing. The
     distinction is drawn downstream by `oauthClient()`, where it belongs —
     that one is a fact about the environment and this function's answer is
     about one account. */
  if (found.ok) {
    return {
      connection: found.connection,
      domain: found.domain,
      unreadable: false,
    };
  }

  /* The only refusal worth telling apart here. Everything else — no client on
     this deployment, nobody consented — is "nothing connected", and which of
     those it is gets decided downstream by `oauthClient()`, where the
     environment is knowable. */
  return {
    connection: null,
    domain: null,
    unreadable: found.reason === "unreadable",
  };
}
