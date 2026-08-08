import { render, SENDER, type EmailTemplate } from "./templates";

/**
 * What actually goes on the wire.
 *
 * Table-based, inline-styled, 600px, with a plain-text twin, because Outlook
 * renders through Word — which has never heard of flexbox, ignores `max-width`,
 * and drops any stylesheet that isn't inline. Anything more modern produces a
 * message that looks correct in every client we happen to check and collapses
 * into a left-aligned column in the one most of these recipients read their
 * post in. All four choices are unfashionable and all four are still what
 * works.
 *
 * This is also what `EmailPreview` shows. It used to be a second rendering of
 * the same design in flexbox and Tailwind — pleasanter to write, and it drifted
 * exactly the way a second copy always does: the templates were white-labelled
 * and the preview went on printing a footer that named Craig as the sender for
 * weeks, with nothing to catch it. A preview is the screen people check
 * *instead of* sending, so one that shows something other than what will arrive
 * is worse than no preview at all. The component now puts the string this
 * function returns into an iframe and has no email markup of its own, which
 * makes that whole class of bug impossible rather than merely unlikely.
 */

/** The one width every client agrees on. */
const WIDTH = 600;

/** The gutter either side of it, so a phone doesn't butt the card against the
    glass. */
const GUTTER = 12;

/**
 * The narrowest this message can be drawn: the card and both gutters.
 *
 * Exported for the preview, which needs to know when to offer a sideways scroll
 * rather than cut the right-hand edge off. It is a real floor rather than a
 * preference — a nested table carrying an explicit `width` cannot be squeezed
 * below it, `max-width:100%` notwithstanding, so a client narrower than this
 * pans instead of reflowing and the preview has to do the same to stay honest.
 *
 * A constant rather than a number the preview measures, because the two answers
 * a measurement can give here are the content's floor and the frame's own
 * width, and telling them apart costs more code than agreeing on the figure the
 * layout below is built from.
 */
export const MESSAGE_MIN_WIDTH = WIDTH + GUTTER * 2;

/**
 * The only place Craig is named in anything that lands in a stranger's inbox.
 *
 * These messages go out under the customer's name because that is who the
 * recipient has a relationship with — a new starter agreed to work at Katalis,
 * not to hear from a tool Katalis bought. So the body is the company's voice
 * throughout, and the supplier gets a watermark, the way Tally puts "Made with
 * Tally" under somebody else's form.
 *
 * "with" rather than "by", and the preposition is the whole argument. "Made by
 * Craig" claims the message; "Made with Craig" credits the tool and leaves the
 * message the company's. The first is a sender, the second is attribution.
 *
 * It is there at all because unattributed transactional mail is worse for
 * everyone: a recipient who wants to know what actually sent this has one word
 * to search for, and the person who bought it gets the credit they are paying
 * for. It is not a link, because a link is an invitation to click and this is a
 * signature.
 */
const MADE_WITH = "Made with Craig";

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

/**
 * The watermark: a mark and a wordmark, drawn out of nothing but a table cell.
 *
 * The real Craig mark is a seven-path stroked line drawing, and there is no way
 * to put it in an email. Every route is closed, and each is closed for a
 * different reason worth writing down so nobody reopens one:
 *
 * - **A hosted `<img>`** needs a public URL, and this project has no asset host.
 *   Inventing one is a decision about somebody's infrastructure, not a thing to
 *   quietly bake into a template.
 * - **A `data:` URI** is stripped by Gmail and several others. It looks perfect
 *   in every client anybody tests in and arrives as a broken-image icon for a
 *   large share of real recipients — worse than no mark, because a broken image
 *   in the footer of a welcome email reads as a message that was tampered with.
 * - **Inline `<svg>`** is removed outright by Outlook and Gmail.
 * - **A glyph** — some emoji face standing in for the drawing — would be a
 *   different logo, rendered differently on every platform, and on most of them
 *   a joke.
 *
 * What is left is type and a coloured box, which is what this is: a rounded
 * chip carrying the wordmark's initial, then the wordmark. Word doesn't do
 * `border-radius`, so in Outlook the chip is a square — a deliberate-looking
 * square rather than a failure, which is the only kind of degradation worth
 * accepting.
 *
 * The nested table is not decoration either. A chip and a word need to sit on
 * one line with a gap between them, and the two CSS ways to do that —
 * `display:inline-block` with padding, or a margin — are both dropped by Word.
 * Two cells and a `padding-left` are not.
 *
 * `align="right"` appears on both the cell and the table because they do
 * different jobs: the attribute on the cell aligns inline content in web
 * clients, and the attribute on the table is what floats it right in Word,
 * which ignores the first. It is the last row in the layout, so the float has
 * nothing after it to disturb.
 */
function watermark() {
  const chip = `font-family:${FONT};font-size:11px;font-weight:700;line-height:18px;`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right" style="margin-left:auto;">
<tr>
<td width="18" height="18" bgcolor="${MUTED}" align="center" style="width:18px;height:18px;border-radius:5px;text-align:center;vertical-align:middle;${chip}color:${PAPER};">C</td>
<td style="padding-left:6px;font-family:${FONT};font-size:11px;line-height:18px;color:${MUTED};white-space:nowrap;">Made with <span style="font-weight:600;letter-spacing:-0.01em;">Craig</span></td>
</tr>
</table>`;
}

export interface RenderedEmail {
  subject: string;
  /**
   * The line the inbox shows after the subject, already merged.
   *
   * Returned rather than left inside `html` for the preview's benefit. It is
   * buried in a hidden div in there, unreachable without parsing, and the
   * preview's inbox row has to show it — so the alternative was that row
   * calling `render` on the template again and quietly becoming a second place
   * the preheader is computed. Same string, same call, one source.
   */
  preheader: string;
  html: string;
  /**
   * The plain-text twin. Not decoration: a message with no text part scores
   * worse with every spam filter that looks, and it is what a screen reader and
   * a watch notification get.
   */
  text: string;
}

/**
 * A template plus its merge values, as something sendable — and as the thing
 * the preview shows, so a token cannot resolve one way on screen and another
 * way in the inbox.
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

  /* Attributed to the company, not to us. The recipient's question is "why has
     this arrived and can I trust it", and the answer that settles it is the name
     they recognise — naming the tool first answers a question nobody asked and
     raises the one about who has their address. */
  const footer = `Sent by ${company}. You're getting this because someone there put you into an onboarding, not because you signed up for anything. Reply to this and it reaches a person — ${SENDER.replyTo}.`;

  /* `role="presentation"` on every layout table, because a screen reader
     announcing "table, four rows" over a two-paragraph email is worse than the
     Outlook bug the tables are here to avoid.

     The watermark sits in its own row rather than in a second cell beside the
     footer text, because a two-column footer at 600px becomes two
     four-character columns at 320px — and a mark that wraps is a mark that
     reads as a mistake rather than as a signature. */
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
<td align="center" style="padding:24px ${GUTTER}px;">
<table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:${WIDTH}px;max-width:100%;background-color:${PAPER};border-radius:8px;">
<tr>
<td style="padding:32px 32px 16px 32px;">
${paragraphs(body)}
${cta ? button(cta, href) : ""}
</td>
</tr>
<tr>
<td style="padding:16px 32px 10px 32px;border-top:1px solid ${RULE};">
<p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">${escape(footer)}</p>
</td>
</tr>
<tr>
<td align="right" style="padding:0 32px 24px 32px;">
${watermark()}
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
  const text = [
    body.trim(),
    cta && href ? `${cta}: ${href}` : "",
    "—",
    footer,
    /* Last line, because plain text has no corners and no chip. The HTML part
       is what almost everybody sees; this is what the watch notification and
       the screen reader get, and the credit surviving into both is the whole
       point of building the mark out of type rather than out of an image. */
    MADE_WITH,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { subject, preheader, html, text };
}
