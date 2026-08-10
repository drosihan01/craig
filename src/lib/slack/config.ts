import "server-only";

/**
 * Our Slack app — the one set of credentials this deployment owns.
 *
 * Unverified: no Slack app has been registered for this deployment and no
 * workspace has ever been connected. Everything below follows Slack's OAuth
 * v2 documentation; the first live install is what proves the scope list is
 * one Slack will actually grant, and that the redirect matches what the app
 * config at api.slack.com holds.
 *
 * ## Why these scopes, and why not the obvious one
 *
 * The block this serves says "Workspace invite and the channels they should
 * land in on day one". Slack's API can only do half of that sentence, and it
 * is worth being precise about which half, because the natural reading — Craig
 * invites the new starter to Slack — is the half it cannot do:
 *
 * **Inviting somebody to a workspace is `admin.users.invite`, and that method
 * only exists on Enterprise Grid.** It needs a *user* token carrying
 * `admin.users:write`, granted by an admin of the Grid *organisation*, on a
 * paid Enterprise plan. There is no non-Enterprise equivalent: the old
 * `users.admin.invite` was never documented and Slack has closed it. A normal
 * workspace — free, Pro, Business+ — invites people the way it always has, by
 * a human admin sending an invite from Slack's own UI.
 *
 * So this integration scopes down to what a normal workspace genuinely
 * permits, which is everything *after* the person exists:
 *
 *   users:read         base directory read; `users.info` and friends
 *   users:read.email   `users.lookupByEmail` — "has our new starter joined
 *                      yet?", matched on the address the admin already holds
 *   channels:read      list public channels, so a channel picker can offer
 *                      real names instead of the hardcoded five in the preset
 *   channels:join      the bot can enter a public channel by itself, which
 *                      matters because of the rule below
 *   channels:manage    `conversations.invite` — put the joined person into
 *                      their day-one channels
 *
 * `conversations.invite` has a rule the docs state and a first live call must
 * confirm the shape of: **the caller has to be a member of the channel it is
 * inviting into.** For public channels `channels:join` covers it — the bot
 * joins first, then invites. Private channels would need `groups:*` scopes
 * *and* a human to invite the bot in; deliberately not requested, because a
 * consent screen asking to manage private channels is a scarier screen for a
 * capability the preset doesn't promise.
 *
 * These are all *bot* scopes (the `scope` parameter; `user_scope` stays
 * empty). A bot token survives the installing admin leaving the company —
 * a user token dies with their membership, which for an onboarding product
 * is the worst possible expiry trigger.
 *
 * The environment is:
 *
 *   SLACK_CLIENT_ID       from the app's Basic Information at api.slack.com
 *   SLACK_CLIENT_SECRET   issued with it
 *   SLACK_OAUTH_REDIRECT_URI  the absolute https:// URL Slack sends the
 *                         customer back to, matching a Redirect URL on the
 *                         app config. Production is
 *                         https://craig-alpha.vercel.app/api/slack/callback —
 *                         the stable alias, never a per-build URL, which has
 *                         already bitten this repo once (see
 *                         craig-integration-block-tips).
 *
 * None of them are NEXT_PUBLIC_, and one of them never can be.
 */

/**
 * Joined with commas rather than spaces — Slack's install documentation shows
 * comma-separated scope lists on the authorize URL. Docs elsewhere accept
 * spaces too; "accepts both" is exactly the kind of claim the Google block
 * learned to distrust, so this uses the spelling the install guide itself
 * uses, and the first live consent is what confirms it.
 */
export const SCOPES = [
  "users:read",
  "users:read.email",
  "channels:read",
  "channels:join",
  "channels:manage",
] as const;

/**
 * The one the future runner cannot work without. Checked against what Slack
 * actually granted, the way the Google block checks its directory scope: the
 * consent screen may grant less than was asked, and a connection that cannot
 * invite anybody into a channel should refuse to store itself now rather than
 * fail on somebody's first morning.
 */
export const INVITE_SCOPE = "channels:manage";

export interface SlackClient {
  clientId: string;
  /** Never logged, never returned to a browser, never in a redirect. */
  clientSecret: string;
  redirectUri: string;
}

export type ClientResult =
  | { configured: true; client: SlackClient }
  | {
      configured: false;
      /** The variables that are missing, or set to something unusable. */
      incomplete: string[];
      /** Safe to show. Names the situation, never a value. */
      message: string;
    };

const CLIENT_ID = "SLACK_CLIENT_ID";
const CLIENT_SECRET = "SLACK_CLIENT_SECRET";
const REDIRECT_URI = "SLACK_OAUTH_REDIRECT_URI";

/**
 * Same rule as the Google block, for the same two reasons: Slack compares the
 * redirect against the app config and rejects drift, so a value derived from
 * the request is a guess; and `Host` is attacker-controlled, so deriving from
 * it lets a crafted header steer where an authorisation code is sent. Slack
 * is stricter than Google in one respect — it requires https everywhere, with
 * no loopback exception, so local development needs a tunnel rather than
 * http://localhost. Enforced here so the failure is a sentence before anybody
 * leaves the site instead of Slack's error page after they have.
 */
function usableRedirect(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The app credentials, or a precise account of what is missing.
 *
 * Not cached — three string reads — so adding the variables and restarting is
 * the whole setup loop. The nothing-set and some-set messages differ on
 * purpose: nothing set is the normal state of this repo and deserves calm;
 * some set is almost always a typo in a variable name, and that person needs
 * the name.
 */
export function slackClient(): ClientResult {
  const clientId = process.env[CLIENT_ID]?.trim() ?? "";
  const clientSecret = process.env[CLIENT_SECRET]?.trim() ?? "";
  const redirectUri = process.env[REDIRECT_URI]?.trim() ?? "";

  const incomplete: string[] = [];
  if (!clientId) incomplete.push(CLIENT_ID);
  if (!clientSecret) incomplete.push(CLIENT_SECRET);
  if (!redirectUri) incomplete.push(REDIRECT_URI);

  if (incomplete.length === 3) {
    return {
      configured: false,
      incomplete,
      message:
        "Slack isn't set up on this deployment, so nothing was attempted. It needs an app registered at api.slack.com — see .env.example for SLACK_CLIENT_ID, SLACK_CLIENT_SECRET and SLACK_OAUTH_REDIRECT_URI.",
    };
  }

  if (incomplete.length > 0) {
    return {
      configured: false,
      incomplete,
      message: `Slack is half set up: ${incomplete.join(", ")} ${incomplete.length === 1 ? "is" : "are"} missing from the environment. Add ${incomplete.length === 1 ? "it" : "them"} and restart the server so the value is re-read.`,
    };
  }

  if (!usableRedirect(redirectUri)) {
    return {
      configured: false,
      incomplete: [REDIRECT_URI],
      message: `${REDIRECT_URI} has to be an absolute https:// URL — Slack refuses plain http even on localhost — and it has to match a Redirect URL on the app config at api.slack.com character for character.`,
    };
  }

  return { configured: true, client: { clientId, clientSecret, redirectUri } };
}

/**
 * Can anybody connect Slack on this deployment, without going near a secret.
 * Names of missing variables only — they are documentation — for the route
 * that has to explain why there is no Connect button.
 */
export function slackSetupStatus(): {
  available: boolean;
  missing: string[];
} {
  const result = slackClient();
  return result.configured
    ? { available: true, missing: [] }
    : { available: false, missing: result.incomplete };
}
