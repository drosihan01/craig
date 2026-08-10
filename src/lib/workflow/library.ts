import {
  AltRoute,
  Apps,
  Badge,
  CalendarMonth,
  Description,
  Draw,
  EventAvailable,
  FactCheck,
  Groups,
  Handshake,
  HowToReg,
  Link,
  LaptopMac,
  Lock,
  Mail,
  Person,
  Quiz,
  RocketLaunch,
  School,
  TaskAlt,
  VerifiedUser,
} from "@/components/ui/icons";
/* Real marks where a freely licensed one exists. Slack and AWS get the same
   neutral placeholder as each other rather than a semantic guess apiece —
   `Apps` reads as "no logo available", where a cloud for AWS and a speech
   bubble for Slack read as two different opinions. See
   scripts/gen-brand-icons.py for why those two can't be drawn. */
import {
  Asana,
  Dropbox,
  Figma,
  GitHub,
  Google,
  Jira,
  Linear,
  Notion,
  Okta,
  OnePassword,
  Zoom,
} from "@/components/ui/brand-icons";
import type { BlockKind, WorkflowBlock } from "@/components/ui";

/**
 * The block library — what an admin actually picks from.
 *
 * Three ideas, and they're separate on purpose.
 *
 * `BlockKind` (in workflow-builder) is the *mechanism*: what the engine does
 * with a block. There are six and there should stay six.
 *
 * A `BlockPreset` is a *named piece of onboarding* sitting on one of those
 * mechanisms. "Set up MFA" and "Invite to GitHub" are both tasks as far as the
 * engine is concerned, but nobody builds an onboarding by thinking "I need
 * three tasks". Adding a preset is data; adding a kind changes the engine.
 *
 * A `SetupField` is what the preset needs before it can run. This is the part
 * that makes a block real rather than a label: "Sign contract" means nothing
 * until a template is attached and somebody is named to countersign, and
 * "Invite to GitHub" means nothing without the org and the permission level.
 * Required fields with no value are exactly what "unconfigured" means — the
 * badge is derived from them rather than typed in, so it can't lie.
 *
 * Each SaaS account is its own preset rather than one "tools & access" block
 * with a list inside it. They're provisioned in different places by different
 * people with different permission models, they fail independently, and an
 * admin needs to see at a glance that the GitHub invite went out and the AWS
 * one didn't.
 */

export type FieldKind =
  "text" | "url" | "select" | "multiselect" | "person" | "file" | "when";

export interface SetupField {
  id: string;
  label: string;
  kind: FieldKind;
  /** Placeholder or example — says what a good answer looks like. */
  hint?: string;
  options?: { id: string; label: string }[];
  /**
   * Where a multiselect's choices come from when they aren't listed. "people"
   * offers the team; anything else is a free list the admin types into, because
   * Craig can't know which documents a quiz should read or which Okta groups
   * exist.
   */
  from?: "people";
  /** The block counts as unconfigured until this has a value. */
  required?: boolean;
}

export interface BlockPreset {
  id: string;
  label: string;
  /**
   * Why this one can't be picked yet. Shown in place of the description and
   * greys the card out.
   *
   * Left in the picker rather than deleted: the list is the product's claim
   * about what onboarding is made of, and a shorter list would be a smaller
   * claim. Saying "not yet" is honest; quietly not having it looks like an
   * oversight.
   */
  unavailable?: string;
  /** One line, shown in the picker. */
  description: string;
  /** Which mechanism the engine runs. */
  kind: BlockKind;
  icon: React.ComponentType<{ className?: string }>;
  /** Prefilled onto the block. */
  title: string;
  summary?: string;
  /**
   * Something this block always does that the admin can't change. Shown in the
   * inspector next to the fields they can. Fixed behaviour is still behaviour
   * and hiding it is how a workflow surprises somebody.
   */
  note?: string;
  setup: SetupField[];
}

export interface BlockCategory {
  id: string;
  label: string;
  /** Shown under the category heading in the picker. */
  description: string;
  presets: BlockPreset[];
}

/* Reused across every account preset — same shape, different service. */
const WHO_PROVISIONS: SetupField = {
  id: "owner",
  label: "Who provisions it",
  kind: "person",
  required: true,
};

/**
 * The default vocabulary for a `when` field. Everything is relative to the
 * start date, never a calendar date — a workflow is a template, and a template
 * pinned to 3 March is a template used once.
 *
 * Exported so a field can declare `kind: "when"` with no options and still
 * resolve a stored value to a label.
 */
export const WHEN_OPTIONS = [
  { id: "on-signing", label: "As soon as they sign" },
  { id: "week-before", label: "A week before day one" },
  { id: "day-before", label: "The day before" },
  { id: "day-one", label: "Day one" },
  { id: "first-week", label: "First week" },
];

const WHEN: SetupField = {
  id: "when",
  label: "When",
  kind: "when",
  hint: "Relative to the start date",
  options: WHEN_OPTIONS,
};

/* Services Craig can't provision yet, and why. Everything absent from here is
   pickable. */
const UNAVAILABLE: Record<string, string> = {
  aws: "Cloud access keeps a human in the loop — deliberate, not missing",
  notion: "Notion's API can't manage workspace members",
  figma: "Seat management needs an Enterprise plan",
  okta: "Coming when Craig supports SSO",
  onepassword: "Needs a SCIM bridge — coming later",
  jira: "Coming soon",
  asana: "Coming soon",
  zoom: "Coming soon",
  dropbox: "Coming soon",
  "custom-app": "Coming soon",
};

/**
 * The one preset wired to a real API, named rather than spelled out.
 *
 * Three places have to agree on this string: the preset itself, the set of
 * blocks the showcase will actually run, and the block settings panel, which
 * shows whether the customer's Google Workspace is connected only for this
 * one. A literal in each is three chances to typo one and get silence — the
 * panel would simply never appear, on the block where being told is the whole
 * point.
 */
export const GOOGLE_WORKSPACE_PRESET = "google-workspace";

/**
 * The presets with a real connection behind them, named for the same reason
 * Google is. The registry row in `blocks.ts`, the settings panel map in
 * `block-settings.tsx` and the preset itself all have to agree on the string,
 * and a literal in each is three chances to typo one and get silence instead
 * of a panel — on the blocks where being told about the connection is the
 * whole point.
 */
export const SLACK_PRESET = "slack";
export const LINEAR_PRESET = "linear";
export const GITHUB_PRESET = "github";

/** An account on a third-party service. */
function account(
  id: string,
  label: string,
  description: string,
  icon: BlockPreset["icon"],
  fields: SetupField[],
): BlockPreset {
  return {
    id,
    label,
    description,
    kind: "task",
    icon,
    title: label,
    unavailable: UNAVAILABLE[id],
    setup: [...fields, WHO_PROVISIONS, WHEN],
  };
}

export const BLOCK_LIBRARY: BlockCategory[] = [
  {
    id: "paperwork",
    label: "Paperwork",
    description: "The parts that have to happen before anyone can start.",
    presets: [
      {
        id: "sign-contract",
        label: "Sign contract",
        description:
          "Employment agreement, offer letter and any acknowledgements that go with it.",
        kind: "document",
        icon: Draw,
        title: "Sign contract",
        summary: "Employment agreement and required acknowledgements",
        setup: [
          {
            id: "template",
            label: "Contract template",
            kind: "file",
            hint: "The document they'll be sent",
            required: true,
          },
          {
            id: "countersign",
            label: "Who countersigns",
            kind: "person",
            required: true,
          },
          {
            id: "provider",
            label: "Signing method",
            kind: "select",
            hint: "Signing in Craig is also how they get their account",
            options: [
              { id: "craig", label: "In Craig" },
              { id: "docusign", label: "DocuSign" },
              { id: "dropbox-sign", label: "Dropbox Sign" },
              { id: "email", label: "Email a PDF back" },
            ],
            required: true,
          },
          {
            id: "acks",
            label: "Extra acknowledgements",
            kind: "multiselect",
            options: [
              { id: "ip", label: "IP assignment" },
              { id: "nda", label: "NDA" },
              { id: "handbook", label: "Handbook acknowledgement" },
              { id: "code", label: "Code of conduct" },
            ],
          },
        ],
      },
      {
        id: "payroll-details",
        label: "Personal & payroll details",
        description:
          "Legal name, address, bank and tax details, emergency contact.",
        kind: "document",
        icon: Badge,
        title: "Personal and payroll details",
        summary: "Collected once, before the first pay run",
        setup: [
          {
            id: "fields",
            label: "What to collect",
            kind: "multiselect",
            options: [
              { id: "legal-name", label: "Legal name" },
              { id: "address", label: "Home address" },
              { id: "bank", label: "Bank / payment details" },
              { id: "tax", label: "Tax details" },
              { id: "emergency", label: "Emergency contact" },
              { id: "dob", label: "Date of birth" },
            ],
            required: true,
          },
          {
            id: "system",
            label: "Payroll system",
            kind: "select",
            options: [
              { id: "deel", label: "Deel" },
              { id: "remote", label: "Remote" },
              { id: "gusto", label: "Gusto" },
              { id: "manual", label: "Spreadsheet, for now" },
            ],
            required: true,
          },
          WHO_PROVISIONS,
        ],
      },
      /*
       * Three blocks with nothing for the admin to fill in, and the empty
       * `setup` is the decision rather than an omission.
       *
       * Every other preset here asks the admin something before it can run:
       * which template, which channels, who countersigns. These three ask
       * nobody anything at setup time, because doing the work *is* the answer.
       * Only the new starter knows their middle name and only they can type
       * their date of birth; the name tag is made by somebody at the company
       * and then ticked off. A required `SetupField` on any of them would hold
       * Publish shut — `missingRequired` is what that gate reads — until an
       * admin had typed a stranger's birthday into the very step that exists
       * to ask them for it. That's the question answered by the wrong person
       * and the workflow unpublishable for having asked it. An optional field
       * would be a control that changes nothing. So: no fields, Ready the
       * moment the block lands, and the step is closed by whoever does the
       * work.
       *
       * The ids are load-bearing beyond this file. `JOINER_FIELD_BY_PRESET`
       * and `ADMIN_TICK_PRESETS` in the showcase contract key off these exact
       * strings — one decides which form the new starter is shown, the other
       * which steps the admin can tick. Rename one and the step still appears
       * on somebody's screen, with nothing on it and no way to finish it.
       *
       * They sit next to each other because they are two halves of one idea:
       * onboarding passes back and forth between the person arriving and the
       * people expecting them. The titles carry which half, addressed to
       * whoever acts — the new starter reads "provide your date of birth" on
       * their own screen, the admin reads "make their name tag" on the canvas.
       */
      {
        id: "middle-name",
        label: "Provide middle name",
        description:
          "The new starter types it in themselves. Nothing for you to set up.",
        kind: "document",
        icon: Person,
        title: "Provide your middle name",
        summary: "They fill this in themselves",
        setup: [],
      },
      {
        id: "date-of-birth",
        label: "Provide date of birth",
        description:
          "The new starter types it in themselves. Nothing for you to set up.",
        kind: "document",
        icon: CalendarMonth,
        title: "Provide your date of birth",
        summary: "They fill this in themselves",
        setup: [],
      },
      {
        id: "name-tag",
        label: "Make a name tag",
        description:
          "Somebody here makes it and ticks it off. Nothing is asked of the new starter.",
        kind: "task",
        icon: Badge,
        title: "Make their name tag",
        summary: "Somebody here does this and ticks it off",
        setup: [],
      },
      {
        id: "verify-identity",
        label: "Verify employment eligibility",
        description:
          "Right to work or identity check. Which one applies depends on the country.",
        kind: "document",
        icon: HowToReg,
        title: "Verify employment eligibility",
        setup: [
          {
            id: "check",
            label: "Which check",
            kind: "select",
            hint: "Set by where they're employed, not where you are",
            options: [
              { id: "uk-rtw", label: "UK right to work" },
              { id: "us-i9", label: "US Form I-9" },
              {
                id: "de-aufenthalt",
                label: "Germany — residence and work permit",
              },
              { id: "au-vevo", label: "Australia — VEVO check" },
              { id: "other", label: "Something else" },
            ],
            required: true,
          },
          {
            id: "verifier",
            label: "Who verifies it",
            kind: "person",
            required: true,
          },
          {
            id: "deadline",
            label: "Must clear by",
            kind: "when",
            options: [
              { id: "before-start", label: "Before day one" },
              { id: "day-one", label: "Day one" },
            ],
            required: true,
          },
        ],
      },
    ],
  },
  {
    id: "checks",
    label: "Third-party checks",
    description:
      "Run by someone outside the company, so they take days and need consent first.",
    presets: [
      {
        id: "background-check",
        unavailable: "Needs a provider account — coming later",
        label: "Background check",
        description:
          "Criminal record or police check through a provider. Needs consent before it starts.",
        kind: "task",
        icon: FactCheck,
        title: "Background check",
        summary: "Runs with a provider — allow a few days",
        setup: [
          {
            id: "provider",
            label: "Provider",
            kind: "select",
            options: [
              { id: "checkr", label: "Checkr" },
              { id: "certn", label: "Certn" },
              { id: "zinc", label: "Zinc" },
              { id: "sterling", label: "Sterling" },
              { id: "manual", label: "Direct with the police service" },
            ],
            required: true,
          },
          {
            id: "level",
            label: "Level of check",
            kind: "select",
            options: [
              { id: "basic", label: "Basic / standard" },
              { id: "enhanced", label: "Enhanced" },
              { id: "financial", label: "Financial + criminal" },
            ],
            required: true,
          },
          {
            id: "consent",
            label: "Consent form",
            kind: "file",
            hint: "Nothing can be requested without it",
            required: true,
          },
          { id: "chaser", label: "Who chases the result", kind: "person" },
        ],
      },
      {
        id: "reference-check",
        unavailable: "Coming soon",
        label: "Reference check",
        description: "Previous employers, chased by a named person.",
        kind: "task",
        icon: Groups,
        title: "Reference check",
        setup: [
          {
            id: "count",
            label: "How many references",
            kind: "select",
            options: [
              { id: "1", label: "One" },
              { id: "2", label: "Two" },
              { id: "3", label: "Three" },
            ],
            required: true,
          },
          {
            id: "template",
            label: "Question set",
            kind: "file",
            hint: "What you ask each referee",
          },
          WHO_PROVISIONS,
        ],
      },
      {
        id: "health-check",
        unavailable: "Coming soon",
        label: "Occupational health",
        description:
          "Pre-employment health or fitness assessment, where the role needs one.",
        kind: "task",
        icon: HowToReg,
        title: "Occupational health assessment",
        setup: [
          {
            id: "provider",
            label: "Provider",
            kind: "text",
            hint: "Clinic or service",
            required: true,
          },
          { id: "when", label: "Must clear by", kind: "when", required: true },
        ],
      },
    ],
  },
  {
    id: "accounts",
    label: "Accounts & access",
    description:
      "One block per service. They're provisioned in different places by different people and they fail independently.",
    presets: [
      /**
       * The one block that is wired to a real API, and therefore the one with
       * nothing to configure.
       *
       * Written out rather than built by `account()`, because `account()`
       * appends "who provisions it" and "when" to every service — the right
       * default for thirty blocks nobody automates, and wrong for this one. All
       * three fields it used to carry described decisions that have since been
       * taken somewhere better:
       *
       * - **Email domain** comes from Google's `hd` claim on the Workspace that
       *   was actually connected. That is deliberate and argued at length in
       *   `google-connection.ts`: a domain somebody typed is a domain somebody
       *   can typo, and the failure mode is silent — accounts appear on a
       *   domain nobody asked for, weeks later, on a real person's first
       *   morning.
       * - **Who provisions it** is Craig, which is the entire point of the
       *   block existing.
       * - **When** is where it sits in the workflow; it runs when the step
       *   above it completes.
       *
       * So the fields were three inputs with no effect, and the worst kind: not
       * clutter, but a screen inviting somebody to configure something and then
       * ignoring what they said. What takes their place in the panel is the
       * connection state, which is the one thing about this block that is
       * genuinely still a decision.
       */
      {
        id: GOOGLE_WORKSPACE_PRESET,
        label: "Google Workspace",
        description:
          "Company email and calendar. Almost everything else keys off this account existing.",
        kind: "task",
        icon: Google,
        title: "Google Workspace",
        setup: [
          {
            /* The one thing worth asking about this block, and the reason it
               is a toggle rather than always-on: an account with no second
               factor is a company inbox behind one password, which is what
               actually gets phished in somebody's first fortnight — before
               they know how the company writes an email or who the finance
               director is. Not every company enforces it, so the workflow
               says whether this one does.

               Costs nothing to check: `isEnrolledIn2Sv` rides on the same
               user resource the step already reads to see whether they
               accepted, so this is one more condition on a poll that was
               happening anyway. */
            id: "require-mfa",
            label: "Wait for 2-step verification",
            /* A select rather than a toggle, because there is no toggle in
               `FieldKind` and two named answers read better here than a
               switch would anyway: this is a decision about what "done" means
               for the step, and "Yes / No" spelled out is harder to set by
               accident than a control you can brush past. */
            kind: "select",
            options: [
              { id: "no", label: "No — signing in is enough" },
              { id: "yes", label: "Yes — wait for a second factor" },
            ],
            hint: "Signing in is enough by default.",
          },
        ],
      },
      account(
        SLACK_PRESET,
        "Slack",
        "Workspace invite and the channels they should land in on day one.",
        Apps,
        [
          {
            id: "workspace",
            label: "Workspace URL",
            kind: "url",
            hint: "katalis.slack.com",
            required: true,
          },
          {
            id: "channels",
            label: "Channels to add them to",
            kind: "multiselect",
            hint: "The ones nobody thinks to mention",
            options: [
              { id: "general", label: "#general" },
              { id: "eng", label: "#engineering" },
              { id: "incidents", label: "#incidents" },
              { id: "deploys", label: "#deploys" },
              { id: "random", label: "#random" },
            ],
            required: true,
          },
          {
            id: "type",
            label: "Account type",
            kind: "select",
            options: [
              { id: "member", label: "Member" },
              { id: "guest", label: "Single-channel guest" },
            ],
            required: true,
          },
        ],
      ),
      /**
       * The fields are the invite request, and they were not before.
       *
       * This preset used to ask for a **Base permission** — Read, Write,
       * Maintain, Admin — which reads as the obvious question and is the wrong
       * one. Those four are *repository* permissions, granted to a team on a
       * repo. `POST /orgs/{org}/invitations`, the call this block exists to
       * make, takes something else entirely: an organisation `role`, one of
       * `admin`, `direct_member` or `billing_manager`. There is no field in
       * that request a repository permission could go in.
       *
       * So the field asked an admin to decide something the block would then
       * ignore, and — worse — to decide it in a vocabulary that would look
       * answered while the invite went out with GitHub's default. Read the
       * rule this library's own header states: a required field with no effect
       * is not clutter, it is a screen inviting somebody to configure
       * something and then ignoring what they said. Renamed to the thing the
       * API actually accepts, with the values GitHub actually names.
       *
       * `direct_member` is the default here as it is at GitHub, and it is the
       * right default: it is the least the person can be given and still be in
       * the organisation. Billing manager is deliberately offered even though
       * onboarding rarely wants it — leaving it out would mean an admin who
       * does want it silently gets a member instead.
       *
       * Teams stay a free multiselect of names, and there is a gap behind that
       * worth knowing before anybody writes the runner: the API takes `team_ids`,
       * numeric, not slugs. Turning "engineering" into an id needs a
       * `GET /orgs/{org}/teams` call first, and a name that matches no team is
       * a silent no-op rather than an error. That lookup belongs in the runner,
       * against a live organisation — offering a picker here would mean
       * fetching a customer's teams from inside the block library, which is a
       * server call from a data module.
       */
      account(
        GITHUB_PRESET,
        "GitHub",
        "Org invite, the teams they join, and what they can do once they're in.",
        GitHub,
        [
          {
            id: "org",
            label: "Organisation",
            kind: "text",
            hint: "github.com/katalis",
            required: true,
          },
          {
            id: "teams",
            label: "Teams",
            kind: "multiselect",
            hint: "Named exactly as they are in GitHub",
            options: [
              { id: "eng", label: "engineering" },
              { id: "infra", label: "infra" },
              { id: "oncall", label: "on-call" },
            ],
          },
          {
            id: "role",
            label: "Role in the org",
            kind: "select",
            hint: "What they are to the organisation, not to a repo",
            options: [
              { id: "direct_member", label: "Member" },
              { id: "admin", label: "Owner" },
              { id: "billing_manager", label: "Billing manager" },
            ],
            required: true,
          },
        ],
      ),
      account(
        LINEAR_PRESET,
        "Linear",
        "Workspace invite, the teams they're on, and their role in it.",
        Linear,
        [
          {
            id: "workspace",
            label: "Workspace URL",
            kind: "url",
            hint: "linear.app/katalis",
            required: true,
          },
          {
            id: "teams",
            label: "Teams",
            kind: "multiselect",
            options: [
              { id: "eng", label: "Engineering" },
              { id: "infra", label: "Infra" },
              { id: "product", label: "Product" },
            ],
          },
          {
            id: "role",
            label: "Role",
            kind: "select",
            options: [
              { id: "member", label: "Member" },
              { id: "guest", label: "Guest" },
              { id: "admin", label: "Admin" },
            ],
            required: true,
          },
        ],
      ),
      account(
        "aws",
        "AWS",
        "SSO or IAM access, scoped to the accounts they actually need.",
        Apps,
        [
          {
            id: "method",
            label: "How they get in",
            kind: "select",
            options: [
              { id: "sso", label: "IAM Identity Center (SSO)" },
              { id: "iam", label: "IAM user" },
            ],
            required: true,
          },
          {
            id: "accounts",
            label: "Accounts",
            kind: "multiselect",
            options: [
              { id: "dev", label: "dev" },
              { id: "staging", label: "staging" },
              { id: "prod", label: "prod" },
            ],
            required: true,
          },
          {
            id: "role",
            label: "Permission set",
            kind: "select",
            options: [
              { id: "readonly", label: "ReadOnly" },
              { id: "developer", label: "Developer" },
              { id: "admin", label: "Administrator" },
            ],
            required: true,
          },
        ],
      ),
      account(
        "notion",
        "Notion",
        "Workspace invite and which teamspaces they can see.",
        Notion,
        [
          {
            id: "workspace",
            label: "Workspace URL",
            kind: "url",
            hint: "notion.so/katalis",
            required: true,
          },
          {
            id: "spaces",
            label: "Teamspaces",
            kind: "multiselect",
            options: [
              { id: "company", label: "Company" },
              { id: "eng", label: "Engineering" },
              { id: "handbook", label: "Handbook" },
            ],
          },
          {
            id: "permission",
            label: "Permission",
            kind: "select",
            options: [
              { id: "member", label: "Member" },
              { id: "guest", label: "Guest" },
            ],
            required: true,
          },
        ],
      ),
      account(
        "figma",
        "Figma",
        "Team invite, and whether they need an editor seat or just to look.",
        Figma,
        [
          {
            id: "team",
            label: "Team",
            kind: "text",
            hint: "Which Figma team",
            required: true,
          },
          {
            id: "seat",
            label: "Seat",
            kind: "select",
            hint: "Editor seats are billed — viewer isn't",
            options: [
              { id: "viewer", label: "Viewer" },
              { id: "editor", label: "Editor" },
            ],
            required: true,
          },
        ],
      ),
      account(
        "jira",
        "Jira",
        "Project access and the boards they should land on.",
        Jira,
        [
          {
            id: "site",
            label: "Site URL",
            kind: "url",
            hint: "katalis.atlassian.net",
            required: true,
          },
          {
            id: "projects",
            label: "Projects",
            kind: "multiselect",
            options: [
              { id: "eng", label: "ENG" },
              { id: "infra", label: "INFRA" },
              { id: "sup", label: "SUPPORT" },
            ],
          },
          {
            id: "role",
            label: "Role",
            kind: "select",
            options: [
              { id: "member", label: "Member" },
              { id: "admin", label: "Admin" },
            ],
            required: true,
          },
        ],
      ),
      account(
        "asana",
        "Asana",
        "Workspace invite and the projects they're a member of.",
        Asana,
        [
          {
            id: "workspace",
            label: "Workspace",
            kind: "text",
            required: true,
          },
          { id: "projects", label: "Projects", kind: "multiselect" },
        ],
      ),
      account(
        "onepassword",
        "1Password",
        "The vaults they can open. Shared credentials are the quietest over-provisioning there is.",
        OnePassword,
        [
          {
            id: "vaults",
            label: "Vaults",
            kind: "multiselect",
            hint: "Only the ones the role needs",
            options: [
              { id: "eng", label: "Engineering" },
              { id: "infra", label: "Infra" },
              { id: "shared", label: "Company shared" },
            ],
            required: true,
          },
          {
            id: "access",
            label: "Access",
            kind: "select",
            options: [
              { id: "read", label: "Read" },
              { id: "write", label: "Read and write" },
            ],
            required: true,
          },
        ],
      ),
      account(
        "okta",
        "Okta",
        "SSO identity, and the app groups that identity unlocks.",
        Okta,
        [
          {
            id: "org",
            label: "Okta org",
            kind: "url",
            hint: "katalis.okta.com",
            required: true,
          },
          {
            id: "groups",
            label: "Groups",
            kind: "multiselect",
            hint: "Group membership is what actually grants the apps",
            required: true,
          },
        ],
      ),
      account(
        "zoom",
        "Zoom",
        "A licensed seat, if they'll be hosting rather than joining.",
        Zoom,
        [
          {
            id: "license",
            label: "Licence",
            kind: "select",
            options: [
              { id: "basic", label: "Basic (free)" },
              { id: "pro", label: "Licensed" },
            ],
            required: true,
          },
        ],
      ),
      account(
        "dropbox",
        "Dropbox",
        "Shared folders, and whether they can edit or only look.",
        Dropbox,
        [
          {
            id: "folders",
            label: "Shared folders",
            kind: "multiselect",
            required: true,
          },
          {
            id: "access",
            label: "Access",
            kind: "select",
            options: [
              { id: "viewer", label: "Viewer" },
              { id: "editor", label: "Editor" },
            ],
            required: true,
          },
        ],
      ),
      account(
        "vanta",
        "Vanta",
        "Security training, policy acceptance and the device agent — the compliance half, in one place.",
        VerifiedUser,
        [
          {
            id: "tasks",
            label: "What they have to complete",
            kind: "multiselect",
            options: [
              { id: "policies", label: "Accept policies" },
              { id: "training", label: "Security awareness training" },
              { id: "agent", label: "Install the device agent" },
              { id: "background", label: "Background check" },
            ],
            required: true,
          },
          {
            id: "deadline",
            label: "Done by",
            kind: "when",
            hint: "SOC 2 wants a date, not a vibe",
            required: true,
          },
        ],
      ),
      account(
        "custom-app",
        "Another app",
        "Anything the library doesn't name — internal tools, a CRM, a provider console.",
        Link,
        [
          {
            id: "app",
            label: "App name",
            kind: "text",
            required: true,
          },
          {
            id: "url",
            label: "Where to provision it",
            kind: "url",
            hint: "The admin console, not the login page",
            required: true,
          },
          {
            id: "permission",
            label: "Permission level",
            kind: "text",
            hint: "The lowest that lets them do the job",
            required: true,
          },
        ],
      ),
    ],
  },
  {
    id: "security",
    label: "Security & kit",
    description:
      "Multi-factor before the accounts get used in anger, and something to use them on.",
    presets: [
      {
        id: "mfa",
        label: "Set up MFA",
        description:
          "Multi-factor on email, files and remote access. Phishing-resistant where it's offered.",
        kind: "task",
        icon: Lock,
        title: "Set up MFA",
        summary: "Before any of the accounts get used in anger",
        setup: [
          {
            id: "systems",
            label: "Which systems",
            kind: "multiselect",
            options: [
              { id: "email", label: "Email" },
              { id: "files", label: "File storage" },
              { id: "vpn", label: "Remote access / VPN" },
              { id: "code", label: "Source control" },
              { id: "cloud", label: "Cloud console" },
            ],
            required: true,
          },
          {
            id: "method",
            label: "Method",
            kind: "select",
            hint: "A passkey or hardware key resists phishing; SMS doesn't",
            options: [
              { id: "passkey", label: "Passkey" },
              { id: "hardware", label: "Hardware key" },
              { id: "totp", label: "Authenticator app" },
            ],
            required: true,
          },
          { id: "deadline", label: "Done by", kind: "when", required: true },
        ],
      },
      {
        id: "laptop",
        label: "Issue laptop",
        description:
          "Order it, ship it, and get it back at the end. Lead time is usually the long pole.",
        kind: "task",
        icon: LaptopMac,
        title: "Issue laptop",
        setup: [
          {
            id: "spec",
            label: "Model and spec",
            kind: "text",
            hint: "MacBook Pro 14, M4, 24GB",
            required: true,
          },
          {
            id: "ship",
            label: "Ship to",
            kind: "text",
            hint: "Their home address, usually",
            required: true,
          },
          WHO_PROVISIONS,
          {
            id: "when",
            label: "Order",
            kind: "when",
            hint: "Lead time is why this goes first",
            options: [
              { id: "on-signing", label: "The day they sign" },
              { id: "week-before", label: "A week before day one" },
            ],
            required: true,
          },
        ],
      },
    ],
  },
  {
    id: "learning",
    label: "Learning",
    description: "What they have to read, and what they have to be told.",
    presets: [
      {
        id: "training",
        unavailable: "Use Vanta for now",
        label: "Training & required reading",
        description:
          "Security awareness, policies, and anything specific to the role.",
        kind: "document",
        icon: School,
        title: "Training and required reading",
        setup: [
          {
            id: "material",
            label: "Material",
            kind: "file",
            hint: "The document or course they work through",
            required: true,
          },
          { id: "deadline", label: "Done by", kind: "when", required: true },
          {
            id: "ack",
            label: "Acknowledgement",
            kind: "select",
            options: [
              { id: "none", label: "Just read it" },
              { id: "tick", label: "Tick to confirm" },
              { id: "sign", label: "Sign it" },
            ],
          },
        ],
      },
      {
        id: "pop-quiz",
        unavailable: "Coming soon",
        label: "Pop quiz",
        description:
          "A handful of questions pulled from the knowledge base, and a nudge to go and ask Craig the rest.",
        kind: "task",
        icon: Quiz,
        title: "Pop quiz",
        summary: "Drawn from the knowledge base",
        note: "Every quiz ends by pointing them at Ask Craig, so the questions they got wrong have somewhere to go. That part isn't configurable — a quiz that only tells someone they were wrong is a worse version of not asking.",
        setup: [
          {
            id: "source",
            label: "Draw questions from",
            kind: "multiselect",
            hint: "A quiz is only as current as what it reads",
            required: true,
          },
          {
            id: "count",
            label: "How many questions",
            kind: "select",
            options: [
              { id: "3", label: "Three" },
              { id: "5", label: "Five" },
              { id: "10", label: "Ten" },
            ],
            required: true,
          },
          {
            id: "outcome",
            label: "If they get one wrong",
            kind: "select",
            hint: "Nobody is failing an onboarding quiz",
            options: [
              { id: "explain", label: "Show the answer and move on" },
              { id: "chat", label: "Open Ask Craig on that topic" },
              { id: "flag", label: "Tell whoever owns the step" },
            ],
            required: true,
          },
          { id: "when", label: "When", kind: "when", required: true },
        ],
      },
    ],
  },
  {
    id: "people",
    label: "People & role",
    description:
      "The half of onboarding that isn't paperwork — and the half people skip.",
    presets: [
      {
        id: "meet-manager",
        unavailable: "Needs calendar access — coming later",
        label: "Manager 1:1",
        description:
          "A first conversation with whoever they report to, booked rather than hoped for.",
        kind: "task",
        icon: Handshake,
        title: "Manager 1:1",
        setup: [
          {
            id: "manager",
            label: "Manager",
            kind: "person",
            required: true,
          },
          { id: "when", label: "When", kind: "when", required: true },
          {
            id: "length",
            label: "Length",
            kind: "select",
            options: [
              { id: "30", label: "30 minutes" },
              { id: "45", label: "45 minutes" },
              { id: "60", label: "An hour" },
            ],
          },
        ],
      },
      {
        id: "meet-team",
        unavailable: "Needs calendar access — coming later",
        label: "Meet the team",
        description:
          "Named people, booked in. “Say hi to everyone” is not a step.",
        kind: "task",
        icon: Groups,
        title: "Meet the team",
        setup: [
          {
            id: "people",
            label: "Who they should meet",
            kind: "multiselect",
            from: "people",
            hint: "Name them — this is the step that quietly doesn't happen",
            required: true,
          },
          { id: "when", label: "By", kind: "when", required: true },
        ],
      },
      {
        id: "walkthrough",
        unavailable: "Needs calendar access — coming later",
        label: "Walkthrough with an owner",
        description:
          "Half an hour on the part of the system that only lives in someone's head.",
        kind: "task",
        icon: Description,
        title: "Walkthrough",
        setup: [
          {
            id: "topic",
            label: "What they're walked through",
            kind: "text",
            required: true,
          },
          { id: "owner", label: "Who runs it", kind: "person", required: true },
          { id: "when", label: "When", kind: "when", required: true },
        ],
      },
      {
        id: "first-task",
        unavailable: "Coming soon",
        label: "First task",
        description:
          "Something small, real and shippable. Confidence comes from finishing, not reading.",
        kind: "task",
        icon: RocketLaunch,
        title: "First task",
        setup: [
          {
            id: "task",
            label: "The task",
            kind: "text",
            hint: "Small enough to finish in the first week",
            required: true,
          },
          {
            id: "owner",
            label: "Who assigns it",
            kind: "person",
            required: true,
          },
        ],
      },
      {
        id: "check-in",
        unavailable: "Needs calendar access — coming later",
        label: "Check-in",
        description:
          "A proper conversation once they've been here long enough to have opinions.",
        kind: "task",
        icon: EventAvailable,
        title: "30-day check-in",
        setup: [
          { id: "owner", label: "Who runs it", kind: "person", required: true },
          {
            id: "when",
            label: "When",
            kind: "when",
            options: [
              { id: "7", label: "After a week" },
              { id: "30", label: "After 30 days" },
              { id: "90", label: "After 90 days" },
            ],
            required: true,
          },
        ],
      },
    ],
  },
  {
    id: "flow",
    label: "Flow",
    description: "Shape, not content. These control when the rest happens.",
    presets: [
      {
        id: "approval",
        label: "Approval",
        description:
          "Hold everything after this until a named person signs off.",
        kind: "approval",
        icon: HowToReg,
        title: "Approval",
        setup: [
          {
            id: "what",
            label: "What's being approved",
            kind: "text",
            required: true,
          },
          { id: "approver", label: "Approver", kind: "person", required: true },
        ],
      },
      {
        id: "condition",
        label: "Condition",
        description: "Only run what follows if this is true.",
        kind: "branch",
        icon: AltRoute,
        title: "Condition",
        setup: [
          {
            id: "expression",
            label: "Run the rest when",
            kind: "text",
            hint: "e.g. the role is Engineer",
            required: true,
          },
        ],
      },
      {
        id: "notify",
        label: "Notification",
        description: "Email or message someone.",
        kind: "notify",
        icon: Mail,
        title: "Send a message",
        setup: [
          { id: "to", label: "To", kind: "person", required: true },
          { id: "body", label: "Message", kind: "text", required: true },
        ],
      },
      {
        id: "task",
        label: "Task",
        description: "Anything the library doesn't cover.",
        kind: "task",
        icon: TaskAlt,
        title: "New task",
        setup: [
          {
            id: "what",
            label: "What has to happen",
            kind: "text",
            required: true,
          },
          WHO_PROVISIONS,
          { id: "when", label: "When", kind: "when" },
        ],
      },
      {
        id: "document",
        label: "Document",
        description: "Collect or issue a document the library doesn't name.",
        kind: "document",
        icon: Description,
        title: "New document",
        setup: [
          { id: "doc", label: "Document", kind: "file", required: true },
          {
            id: "direction",
            label: "Direction",
            kind: "select",
            options: [
              { id: "collect", label: "Collect it from them" },
              { id: "issue", label: "Issue it to them" },
            ],
            required: true,
          },
        ],
      },
    ],
  },
];

/**
 * The blocks this showcase can actually carry out, end to end.
 *
 * Everything else in the library is a real onboarding step and stays in the
 * library — the catalogue is the argument that Craig writes plans about how a
 * company works rather than a list of integrations. What it is not, yet, is
 * something that does anything when a new starter reaches it.
 *
 * Three of these the person answers themselves, one somebody here ticks off,
 * and Google Workspace is the one being wired to a real API. A block that
 * looks available and then sits there is worse than one that says it isn't
 * ready: the first wastes somebody's first week waiting, the second is a
 * roadmap.
 *
 * Gated here rather than by editing thirty presets, so turning one back on is
 * one line and nothing about the block itself carries the state.
 */
export const SHOWCASE_PRESETS = new Set<string>([
  "middle-name",
  "name-tag",
  "date-of-birth",
  GOOGLE_WORKSPACE_PRESET,
]);

/* Applied after the library is built, so each preset keeps whatever reason it
   already had. `unavailable` is a sentence shown to the person choosing, and a
   specific one ("Notion's API can't manage workspace members") is worth more
   than the general one. */
for (const category of BLOCK_LIBRARY) {
  for (const preset of category.presets) {
    if (!SHOWCASE_PRESETS.has(preset.id) && !preset.unavailable) {
      preset.unavailable = "Not wired up yet — coming later";
    }
  }
}

export const ALL_PRESETS: BlockPreset[] = BLOCK_LIBRARY.flatMap(
  (c) => c.presets,
);

export const findPreset = (id: string) => ALL_PRESETS.find((p) => p.id === id);

/** Turns a picked preset into the block that goes on the canvas. */
export function blockFromPreset(
  preset: BlockPreset,
  id: string,
): WorkflowBlock {
  return {
    id,
    kind: preset.kind,
    preset: preset.id,
    title: preset.title,
    summary: preset.summary,
    config: {},
  };
}

const hasValue = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v.length > 0 : Boolean(v && v.trim());

/**
 * The required fields this config hasn't answered.
 *
 * The rule behind "unconfigured", stated once. It lives here rather than in the
 * builder because Craig drafts on the server, where a `"use client"` module's
 * exports are references he can't call — and the alternative was a second copy
 * of "required and empty", which is exactly the drift the derived badge exists
 * to avoid. `missingSetup` in the builder is this, given a block.
 */
export function missingRequired(
  presetId: string | undefined,
  config: Record<string, string | string[]> | undefined,
): SetupField[] {
  const preset = presetId ? findPreset(presetId) : undefined;
  if (!preset) return [];
  return preset.setup.filter((f) => f.required && !hasValue(config?.[f.id]));
}

/**
 * A block's setup, resolved for reading rather than editing.
 *
 * Stored values are ids — "week-before", ["eng", "infra"] — which are the right
 * thing to persist and the wrong thing to show anyone. This turns them back
 * into the words the admin picked, so a dry run can say "Write on engineering,
 * infra" instead of a row of slugs.
 */
export function describeSetup(
  presetId: string | undefined,
  config: Record<string, string | string[]> | undefined,
): { field: SetupField; value: string }[] {
  const preset = presetId ? findPreset(presetId) : undefined;
  if (!preset) return [];

  const labelFor = (f: SetupField, id: string) => {
    const options = f.options ?? (f.kind === "when" ? WHEN_OPTIONS : undefined);
    // Free-list values and person names are already their own label.
    return options?.find((o) => o.id === id)?.label ?? id;
  };

  return preset.setup.flatMap((f) => {
    const raw = config?.[f.id];
    if (!raw || (Array.isArray(raw) && raw.length === 0)) return [];
    const value = Array.isArray(raw)
      ? raw.map((v) => labelFor(f, v)).join(", ")
      : labelFor(f, raw);
    return [{ field: f, value }];
  });
}

/** When a block would happen, in the admin's own words. */
export function timingOf(
  presetId: string | undefined,
  config: Record<string, string | string[]> | undefined,
): string | null {
  const preset = presetId ? findPreset(presetId) : undefined;
  if (!preset) return null;
  const field = preset.setup.find((f) => f.kind === "when");
  if (!field) return null;
  const raw = config?.[field.id];
  if (typeof raw !== "string" || !raw) return null;
  const options = field.options ?? WHEN_OPTIONS;
  return options.find((o) => o.id === raw)?.label ?? raw;
}

/* --- Due dates ------------------------------------------------------------ */

/**
 * When a step is due, offered as the handful of answers people actually give.
 *
 * Offsets in days from the person's first day, so a workflow stays a template:
 * the same plan run for the next hire produces different dates without anybody
 * editing it.
 *
 * A short list rather than a date field or a free number. Onboarding deadlines
 * cluster — before they sign, the week before, the day before, day one, end of
 * the first week, end of the first month — and a number box invites precision
 * nobody has ("is the laptop due on day 3 or day 4?") while making the common
 * answers slower to give than the rare ones.
 *
 * `-14` rather than "two weeks" as the stored value, because the storage has
 * to survive this list changing. Relabelling an option or adding one between
 * two others rewrites nothing; storing "two-weeks-before" would mean the day a
 * label changes, every workflow holding it means something slightly different.
 */
export const DUE_OPTIONS: { days: number; label: string; short: string }[] = [
  { days: -14, label: "Two weeks before they start", short: "2 weeks before" },
  { days: -7, label: "A week before they start", short: "1 week before" },
  { days: -1, label: "The day before they start", short: "Day before" },
  { days: 0, label: "Their first day", short: "Day one" },
  { days: 4, label: "End of their first week", short: "First week" },
  { days: 30, label: "End of their first month", short: "First month" },
];

/** The short form for a stored offset, or null when nothing is set. */
export function dueLabel(due: number | undefined): string | null {
  if (due === undefined) return null;
  const known = DUE_OPTIONS.find((o) => o.days === due);
  if (known) return known.short;

  /* An offset that isn't on the list is still readable — a workflow written
     before an option was removed, or one edited by hand. Saying "day 3" is
     better than saying nothing about a step that has a deadline. */
  if (due === 0) return "Day one";
  return due < 0 ? `${-due} days before` : `Day ${due + 1}`;
}

/**
 * The real date, once there is a person to have one.
 *
 * `startDate` is `YYYY-MM-DD` and is parsed as local rather than through
 * `new Date(string)`, which reads a bare date as UTC — that lands on the
 * previous day for anyone west of Greenwich and turns a due date into an
 * off-by-one nobody can reproduce in the office it was written in.
 */
export function dueDateFrom(
  startDate: string,
  due: number | undefined,
): Date | null {
  if (due === undefined) return null;
  const [y, m, d] = startDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d + due);
}
