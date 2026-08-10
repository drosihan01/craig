import { COMPANY, NEW_HIRE, PEOPLE } from "@/lib/demo";

/**
 * What Craig sends, and to whom.
 *
 * These are transactional, not marketing. Every one of them is triggered by a
 * workflow step and goes to exactly one person about exactly one thing — no
 * lists, no campaigns, no unsubscribe, because there's nothing to unsubscribe
 * from. That distinction matters legally and it matters to the writing: nobody
 * opted into these, so none of them are allowed to waste a reader's time.
 *
 * The copy is Ada's problem, not ours. It goes out under Katalis's name to
 * somebody she just hired, so it lives in the product where she can read and
 * change it, rather than being buried in a template file nobody sees.
 *
 * Fixture data. Goes when there's somewhere to persist it.
 */


/**
 * Who the mail actually comes from.
 *
 * Two different things, and conflating them is how transactional mail ends up
 * in spam:
 *
 * The **envelope** is a domain we control. It has to be — sending as
 * `katalis.ai` when we don't own it is spoofing, DMARC bins it, and no amount
 * of good copy survives that. Craig sends as himself and puts the customer in
 * the display name.
 *
 * It sends from a **subdomain**, not the root. If transactional sending ever
 * picks up a spam trap or a bad bounce rate, the reputation damage is confined
 * to `mail.` and never touches the address a human reads their post at.
 *
 * Reply-To is a real monitored inbox, because a new starter's first instinct
 * when something is confusing is to hit reply, and that should reach a person
 * rather than bounce.
 *
 * Sending from the *customer's* own domain is the better version and a later
 * one — it needs each customer to add DNS records, which is a setup step Ada
 * hasn't earned yet on day one.
 */

/**
 * Where mail comes from until `mail.craig-ob.me` has its DNS records.
 *
 * Resend's shared sandbox address. It sends today and it only sends to the
 * address that owns the Resend account, which is the right shape for a test
 * harness and useless for a product — the whole reason the real subdomain is
 * still worth doing.
 */
export const FALLBACK_FROM = "onboarding@resend.dev";

export const SENDER = {
  /**
   * Display name — the company's, and only the company's.
   *
   * It used to read "Craig, for {company}", which was honest about the plumbing
   * and wrong about the relationship. This email is a company welcoming
   * somebody they have hired; the first thing that person sees in their inbox
   * should be the name of the place they are joining, not the name of the tool
   * that sent it. A new starter has no idea what Craig is, and "Craig, for
   * Northgate" reads either as a person they're supposed to know or as a
   * mailing service — neither of which is who is writing to them.
   *
   * Craig is still attributed, once, quietly, at the bottom of the email. That
   * is the whole of the white-labelling: the message belongs to the company,
   * the footer says what made it.
   *
   * This is a policy about *which* string is the display name, and not a
   * sanitiser — it is imported by the preview, which runs in a browser, and it
   * returns whatever it is given. The company it is usually given was typed by
   * a stranger at sign-up, and a newline in it would be header injection. That
   * is handled where the header is actually built, by `fromHeader` in
   * `send.ts`; do not add a `trim()` here and take it for the same thing.
   */
  name: (company: string) => company,

  /**
   * The envelope address, from the environment, because which address is
   * sendable is a fact about DNS rather than about this code. Everything above
   * describes the address this *should* be; Resend refuses it with a 403 until
   * the records exist, so the default is the one that works. Setting
   * `NEXT_PUBLIC_CRAIG_MAIL_FROM=craig@mail.craig-ob.me` the hour they land
   * moves every send and every preview across with no deploy.
   *
   * `NEXT_PUBLIC_` because the preview renders it and a preview that shows an
   * address other than the one that will arrive is a preview that lies. There
   * is nothing to withhold: this value is in the header of every email that
   * goes out. The key is the secret; the address it sends from is the opposite
   * of one, and lives in `send.ts` where no browser can reach it.
   */
  address: process.env.NEXT_PUBLIC_CRAIG_MAIL_FROM || FALLBACK_FROM,

  replyTo: "hello@craig-ob.me",
};

export interface MergeField {
  token: string;
  label: string;
  /** What it resolves to in the preview. */
  example: string;
}

/**
 * The vocabulary. Deliberately short — a merge field is a promise that the
 * value will be there at send time, and the more of them there are the more
 * ways an email has to arrive with a hole in it.
 */
export const MERGE_FIELDS: MergeField[] = [
  { token: "first_name", label: "Their first name", example: NEW_HIRE.name.split(" ")[0] },
  { token: "full_name", label: "Their full name", example: NEW_HIRE.name },
  { token: "company", label: "Company", example: COMPANY.name },
  { token: "role", label: "Role", example: NEW_HIRE.role },
  { token: "start_date", label: "Start date", example: "Monday 24 August" },
  { token: "sender", label: "Who it's from", example: PEOPLE.ada.name },
  { token: "step", label: "The step it's about", example: "Sign contract" },
  { token: "owner", label: "Who owns the step", example: PEOPLE.jason.name },
  { token: "link", label: "Where it points", example: "craig.app/s/8f2a" },
  /**
   * The two the Workspace account email needs, and the only two that describe
   * something a step *made* rather than something somebody typed.
   *
   * They are in the vocabulary rather than passed straight into `render` so the
   * preview resolves them like every other token — a template holding a literal
   * `{{work_email}}` in the editor is a template whose author can't see what it
   * says. `unknownTokens` reads the same list, so leaving them out would have
   * flagged a correct template as broken.
   *
   * The password's example is deliberately a shape rather than a plausible
   * secret. It is rendered on a preview screen and stored in nothing, and a
   * fixture that looked like a real credential is a fixture somebody eventually
   * tries.
   */
  { token: "work_email", label: "Their new work address", example: NEW_HIRE.email },
  { token: "temporary_password", label: "One-time password", example: "example-password-not-a-real-one" },
];

export type Audience = "starter" | "owner" | "admin";

export const AUDIENCE: Record<Audience, { label: string; note: string }> = {
  starter: {
    label: "New starter",
    note: "Someone who has never used Craig and never will again.",
  },
  owner: {
    label: "Step owner",
    note: "Whoever the step falls to. Usually already busy.",
  },
  admin: { label: "Admin", note: "The person who built the workflow." },
};

export interface EmailTemplate {
  id: string;
  name: string;
  /** What causes it to send. */
  trigger: string;
  audience: Audience;
  subject: string;
  /** The line the inbox shows after the subject. */
  preheader: string;
  body: string;
  /** Text on the button, when there is one. */
  cta?: string;
}

export const TEMPLATES: EmailTemplate[] = [
  /**
   * The invitation, written in the company's voice rather than in Craig's.
   *
   * This is the one template that reaches somebody who has never heard of this
   * product and never agreed to hear from it. They agreed to work at
   * {{company}}, so that is who the message is from — an email introducing a
   * third-party tool by name, on the day before their first day, reads as a
   * vendor that has got hold of their address rather than as their new employer
   * being organised. Craig appears once, quietly, in the footer, which is where
   * a supplier belongs.
   *
   * Only the tokens the invite route can genuinely fill are used here:
   * `first_name`, `company`, `start_date` and `sender`. `role` and `step` are in
   * the vocabulary and are supplied empty by that route, so a sentence built
   * around either would arrive with a hole in it — see the note beside `values`
   * in the route for why the empty ones are supplied at all.
   *
   * The link is the credential. It is deliberately only ever the button: putting
   * the same URL in the prose as well would double the number of places it can
   * be forwarded, quoted into a ticket, or pasted into a chat.
   */
  {
    id: "seat-invite",
    name: "Seat invite",
    trigger: "A new seat is added — the trigger, so this is always the first thing Craig sends",
    audience: "starter",
    subject: "Welcome to {{company}} — a few things before {{start_date}}",
    preheader:
      "Everything we need from you before your first day, in one place.",
    body: `Hi {{first_name}},

We're really pleased you're joining us at {{company}}, and we're looking forward to seeing you on {{start_date}}.

There are a few things we need from you before then — the details we can't get you set up without. None of them take long.

Your own checklist is below. You don't have to finish it in one sitting: it keeps whatever you've already given us, so you can come back to it whenever suits.

If something on there doesn't look right, {{sender}} is the person to ask.`,
    cta: "Open your checklist",
  },
  /**
   * The link again, for somebody who lost the first one.
   *
   * Its own template rather than resending `seat-invite`, which opens "We're
   * really pleased you're joining us" and describes a first day. That is the
   * right thing to say once, to somebody who has just been hired; said to
   * somebody who is three steps in and looking for the page again, it reads as
   * a company that has forgotten them and started over.
   *
   * What this one has to do is smaller and more careful. It is sent to an
   * address typed by whoever was at the keyboard, so it must not confirm
   * anything to somebody who guessed: no role, no start date, nothing about
   * where they are up to. The person it is genuinely for already knows all of
   * that — what they are missing is the link.
   *
   * `{{company}}` stays because a name they recognise is what stops a magic
   * link reading as phishing, and it is the one detail somebody guessing at the
   * address would already have had to know to be guessing at all.
   */
  {
    id: "joiner-link",
    name: "New link to your checklist",
    trigger: "The new starter asks for their link again",
    audience: "starter",
    subject: "Your link to {{company}}'s checklist",
    preheader: "A fresh link to the checklist you were sent.",
    body: `Hi {{first_name}},

Here's a new link to your {{company}} checklist. The one you were sent before will have stopped working — they expire after a while, which is deliberate.

Anything you'd already filled in is still there. You can pick up where you left off.

If you weren't expecting this, somebody typed your address into the sign-in page by mistake. You can ignore it — nothing has changed and the link below only works from this message.`,
    cta: "Open your checklist",
  },
  /**
   * The one Craig sends himself, at the end of a step he ran himself.
   *
   * Google creates the account and tells nobody — the Directory API sends no
   * welcome mail, has no option to, and the person it belongs to has no way of
   * finding out it exists. So this is not a courtesy on top of the automation;
   * it is the half of the automation that reaches a human, and without it the
   * step creates a mailbox nobody ever opens.
   *
   * Addressed to their *personal* inbox, which is the only address that works:
   * the whole point of the message is that they can't read the new one yet.
   *
   * Same voice as the invitation, for the same reason. This person agreed to
   * work at {{company}}; they have never heard of Craig and never will again,
   * and a message about their new work account arriving from a third-party tool
   * reads as phishing rather than as their employer being organised. Craig gets
   * the one watermark in the footer that every template here gets.
   *
   * The password is in the prose rather than behind the button, and that is the
   * one place this template departs from the invitation's rule about links.
   * There is nothing to click through to — the credential *is* the message —
   * and a "collect your password" link would be one more page between somebody
   * and their first morning, sitting on a URL that would itself have to be a
   * secret.
   */
  {
    id: "workspace-account",
    name: "Workspace account",
    trigger: "The Google Workspace block, once the account actually exists",
    audience: "starter",
    subject: "Your {{company}} email address",
    preheader: "Your work address and a one-time password to get in with.",
    body: `Hi {{first_name}},

Your {{company}} account is set up. This is the address everything else here runs on, so it's worth signing in before your first day rather than on it.

Your address: {{work_email}}
Temporary password: {{temporary_password}}

You'll be asked to choose your own password the first time you sign in, and this one stops working the moment you do. Nobody here can see what you pick.

If it won't let you in, reply to this — it reaches a person.`,
    cta: "Sign in and pick a password",
  },
  {
    id: "step-assigned",
    name: "Step assigned",
    trigger: "A step becomes the responsibility of someone other than the new starter",
    audience: "owner",
    subject: "{{step}} — for {{full_name}}",
    preheader: "Two minutes, and it's the thing holding up the rest.",
    body: `Hi {{first_name}},

{{full_name}} starts on {{start_date}}, and this one's yours: {{step}}.

Worth doing sooner rather than later — the steps run in order, so everything after it is waiting on you.`,
    cta: "Open the step",
  },
  {
    id: "quiz",
    name: "Pop quiz",
    trigger: "The pop quiz block, on the day it's scheduled",
    audience: "starter",
    subject: "Five questions about {{company}}",
    preheader: "Nobody's marking this. It just shows you what's worth asking about.",
    body: `Hi {{first_name}},

Five quick questions about how things work here. Nobody sees your answers and there's no pass mark — the point is to find the two or three things nobody's told you yet.

Anything you get wrong, I'll open a chat about it there and then. Ask me the follow-up too. It's genuinely less annoying than asking a person.`,
    cta: "Start the quiz",
  },
  {
    id: "one-to-one",
    name: "1:1 booked",
    trigger: "A manager 1:1 or meet-the-team block",
    audience: "starter",
    subject: "{{owner}} has half an hour for you",
    preheader: "In your calendar. Bring the questions the quiz raised.",
    body: `Hi {{first_name}},

{{owner}} has put half an hour in your calendar. It's in there now, so you don't need to do anything.

Bring whatever the quiz turned up, and anything else you've been quietly wondering about. This is the bit where the stuff nobody wrote down gets handed over.`,
  },
  {
    id: "nudge",
    name: "Nudge",
    trigger: "A step is past its date and still open",
    audience: "owner",
    subject: "Still waiting on {{step}}",
    preheader: "No rush from me, but the workflow can't move past it.",
    body: `Hi {{first_name}},

{{step}} is still open, and {{full_name}} starts on {{start_date}}.

I'll stop mentioning it once it's done. If it's not actually yours, reassign it and I'll go and bother the right person instead.`,
    cta: "Open the step",
  },

  /**
   * The chase, to the new starter, about their own list.
   *
   * Addressed to somebody who has not done something, which is the hardest
   * audience in this file to write for and the easiest to get wrong. Three
   * rules, all of them load-bearing:
   *
   * **It names the things rather than the failure.** "You still have two
   * things to do" is a fact about a list; "you haven't done your onboarding"
   * is a fact about them. The first is answerable in four minutes and the
   * second is answerable only by feeling bad, and somebody who feels bad about
   * an email tends to deal with it by not opening the next one.
   *
   * **It gives the reason, which is never Craig's convenience.** Every item on
   * this list exists so that something is ready on their first day — an
   * account, a payslip, a signed contract. Saying which is what separates a
   * request from a nag.
   *
   * **It says there is an end to it.** `{{step}}` carries the count and
   * `chases_left` is deliberately absent from the vocabulary: telling somebody
   * "two more emails and I'll stop" invites them to wait out the two. What it
   * promises instead is that finishing stops it, which is true and is the only
   * lever they actually hold.
   *
   * There is no version of this that mentions their manager. The handover
   * exists and it is deliberately invisible from this side — a chase that
   * threatens escalation is a threat, and the person receiving it has been at
   * the company for less than a week.
   */
  {
    id: "chase",
    name: "Chase",
    trigger: "A step of theirs is late, every few days, up to three times",
    audience: "starter",
    subject: "{{step}} — whenever you get a minute",
    preheader: "It's the last thing standing between you and a first day that works.",
    body: `Hi {{first_name}},

{{step}}

It's all on one page, and most people are done in a few minutes. Everything here is so that things actually work on {{start_date}} — an account that opens, a contract that's signed, a first payslip that goes to the right place.

If something's in the way, or you've hit a question the page doesn't answer, reply to this and a person at {{company}} will see it.`,
    cta: "Pick up where you left off",
  },

  /**
   * Craig admitting he isn't getting through, to the person who hired them.
   *
   * The most important email in this file, and the one a reader is most likely
   * to think is a failure message. It isn't — it is the automation doing the
   * one thing automation usually will not: noticing that it has stopped
   * working and asking for a human.
   *
   * A reminder that has failed three times will not succeed on the ninth. The
   * alternatives were to keep sending (which is how a product teaches people
   * to filter its mail, and how a new starter's first impression of their
   * employer becomes "they send robotic email") or to fall silent (which is
   * how an onboarding quietly never finishes and nobody finds out until the
   * person turns up on Monday with no laptop). Both are worse than one honest
   * message to somebody who can walk over and ask.
   *
   * Written to be *useful* rather than apologetic: it says exactly what is
   * outstanding, exactly how many times it was asked for, and what happens
   * next, which is nothing unless a person does something.
   */
  {
    id: "handover",
    name: "Handover",
    trigger: "Craig has chased three times and heard nothing back",
    audience: "owner",
    subject: "I've stopped chasing {{full_name}}",
    preheader: "Three reminders, no movement. This one needs a person.",
    body: `Hi {{first_name}},

I've asked {{full_name}} three times and nothing has moved, so I've stopped — a fourth email from me wasn't going to be the one that worked, and I'd rather tell you than keep going quietly.

Still outstanding:

{{step}}

They start on {{start_date}}. I'm not going to email them about this again unless you ask me to, so if it matters, it needs a word from someone.

Nothing is broken and nothing is lost — everything they've already filled in is exactly where they left it, and the moment they pick it up again it all carries on.`,
    cta: "See where they got to",
  },
];

export const findTemplate = (id: string) => TEMPLATES.find((t) => t.id === id);

/**
 * Substitutes merge fields for a preview.
 *
 * Unknown tokens are left visible as `{{whatever}}` rather than silently
 * blanked. A preview that quietly drops a typo'd token is a preview that
 * tells you the email is fine right up until it goes out with a hole in it.
 */
export function render(text: string, values: Record<string, string> = {}) {
  const defaults = Object.fromEntries(
    MERGE_FIELDS.map((f) => [f.token, f.example]),
  );
  const all = { ...defaults, ...values };
  return text.replace(/\{\{(\w+)\}\}/g, (match, token: string) =>
    token in all ? all[token] : match,
  );
}

/** Tokens used in a template that aren't in the vocabulary. */
export function unknownTokens(template: EmailTemplate) {
  const known = new Set(MERGE_FIELDS.map((f) => f.token));
  const found = new Set<string>();
  for (const part of [template.subject, template.preheader, template.body]) {
    for (const [, token] of part.matchAll(/\{\{(\w+)\}\}/g)) {
      if (!known.has(token)) found.add(token);
    }
  }
  return [...found];
}
