import { render, SENDER, type EmailTemplate } from "./templates";

/**
 * What actually goes on the wire.
 *
 * `EmailPreview` is a React component made of flexbox and Tailwind classes. It
 * is the right way to show somebody an email inside the app and the wrong way
 * to send one: Outlook renders through Word, which has never heard of flexbox,
 * ignores `max-width`, and drops any stylesheet that isn't inline. Sending that
 * markup would produce a message that looks correct in every client we happen
 * to check and collapses into a left-aligned column in the one most of these
 * recipients read their post in.
 *
 * So the two are deliberately separate, and the honest cost of that is drift —
 * the preview and the email are the same design maintained twice, and nothing
 * here enforces it. The alternative is one renderer that has to satisfy both a
 * browser and Word, which makes the app UI worse to keep the email possible.
 * When it matters enough, the fix is to render *this* into an iframe and delete
 * the preview's own markup, rather than to meet in the middle.
 *
 * Table-based, inline-styled, 600px, with a plain-text twin. All four are
 * unfashionable and all four are still what works.
 */

/** The one width every client agrees on. */
const WIDTH = 600;

const INK = "#33302b";
const MUTED = "#8a8279";
const PAPER = "#ffffff";
const CANVAS = "#f4f2ef";
const RULE = "#e7e3dd";
const BUTTON = "#3d332c";

/* Word ignores webfonts and most of this list; Arial is what it lands on, which
   is why Arial is in here rather than a fallback nobody chose. */
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Escapes for both text and attribute contexts.
 *
 * Template copy is edited in the product by whoever owns the voice, which makes
 * it untrusted input the moment it stops being a fixture — an apostrophe in
 * "don't" is the common case and a stray `<` is the one that breaks the layout
 * silently. Quotes are escaped too so the same function is safe inside `href`.
 */
function escape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A merge field holding a bare `craig.app/s/8f2a` is a link to a human and a
 * relative path to a mail client, which resolves against nothing and does
 * nothing when tapped.
 */
function absolute(link: string) {
  const trimmed = link.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * The preheader, and then enough invisible whitespace to stop the client
 * padding it out with the first line of the body — which is how a carefully
 * written preview line ends up reading "…none of them long. Hi Nils, Welcome
 * to" in the inbox.
 */
function preheaderBlock(preheader: string) {
  const padding = "&#847;&zwnj;&nbsp;".repeat(60);
  return `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${CANVAS};">${escape(preheader)}${padding}</div>`;
}

function paragraphs(body: string) {
  return body
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map(
      (para) =>
        `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK};">${escape(para).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

/**
 * The button.
 *
 * A padded `<a>` alone is a link with a coloured background in Word — the
 * padding is dropped and the target shrinks to the text. The cell carries the
 * colour and the anchor carries the padding, so both engines produce something
 * the size of a button.
 */
function button(label: string, href: string) {
  if (!href) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px 0;"><tr><td bgcolor="${BUTTON}" style="border-radius:6px;"><a href="${escape(href)}" style="display:inline-block;padding:12px 20px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:6px;">${escape(label)}</a></td></tr></table>`;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  /**
   * The plain-text twin. Not decoration: a message with no text part scores
   * worse with every spam filter that looks, and it is what a screen reader and
   * a watch notification get.
   */
  text: string;
}

/**
 * A template plus its merge values, as something sendable.
 *
 * Same `render` as the preview, so a token that resolves one way on screen
 * cannot resolve another way in the inbox.
 */
export function renderEmail(
  template: EmailTemplate,
  values: Record<string, string> = {},
): RenderedEmail {
  const subject = render(template.subject, values);
  const preheader = render(template.preheader, values);
  const body = render(template.body, values);
  const company = render("{{company}}", values);
  const cta = template.cta ? render(template.cta, values) : "";
  const href = absolute(render("{{link}}", values));

  const footer = `Sent by Craig on behalf of ${company}. You got this because someone there added you to an onboarding, not because you signed up for anything. Reply to this and it reaches a person — ${SENDER.replyTo}.`;

  /* `role="presentation"` on every layout table, because a screen reader
     announcing "table, four rows" over a two-paragraph email is worse than the
     Outlook bug the tables are here to avoid. */
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>${escape(subject)}</title>
</head>
<body style="margin:0;padding:0;width:100%;background-color:${CANVAS};">
${preheaderBlock(preheader)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CANVAS};">
<tr>
<td align="center" style="padding:24px 12px;">
<table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:${WIDTH}px;max-width:100%;background-color:${PAPER};border-radius:8px;">
<tr>
<td style="padding:32px 32px 16px 32px;">
${paragraphs(body)}
${cta ? button(cta, href) : ""}
</td>
</tr>
<tr>
<td style="padding:16px 32px 28px 32px;border-top:1px solid ${RULE};">
<p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">${escape(footer)}</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;

  /* Hard-wrapped at nothing in particular: mail clients wrap plain text
     themselves, and pre-wrapping it is how a text part ends up ragged in the
     one place it was supposed to be readable. */
  const text = [body.trim(), cta && href ? `${cta}: ${href}` : "", "—", footer]
    .filter(Boolean)
    .join("\n\n");

  return { subject, html, text };
}
