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
  {
    id: "seat-invite",
    name: "Seat invite",
    trigger: "A new seat is added — the trigger, so this is always the first thing Craig sends",
    audience: "starter",
    subject: "You're starting at {{company}} on {{start_date}}",
    preheader: "A few things to sort before day one — none of them long.",
    body: `Hi {{first_name}},

Welcome to {{company}}. I'm Craig — I look after the boring half of starting somewhere new, so {{sender}} doesn't have to remember all of it.

There are a few things to get through before {{start_date}}. Nothing takes long, and they'll come one at a time rather than all at once.

Your first one is ready now.`,
    cta: "Get started",
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
