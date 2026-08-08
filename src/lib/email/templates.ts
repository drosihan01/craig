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
