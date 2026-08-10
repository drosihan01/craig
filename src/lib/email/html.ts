import type { CompanyLogo } from "@/lib/craig/contract";
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
 * How wide the card gets, at most.
 *
 * It used to be how wide the card *was*: a nested table carrying an explicit
 * `width="600"` and `width:600px`, which no client will squeeze below —
 * `max-width:100%` notwithstanding. So the message did not reflow on a phone,
 * it panned, and the first thing a new starter saw was a letter they had to
 * drag sideways to read. On an invitation that is most of the audience.
 *
 * Now the card is `width:100%` with this as a ceiling, which is the ordinary
 * way a responsive email is built — and Outlook, which renders through Word
 * and honours neither percentage widths nor `max-width`, gets a fixed table of
 * exactly this width through the conditional comment above it. Two layouts,
 * one figure, and the clients that can reflow do.
 */
export const MESSAGE_MAX_WIDTH = WIDTH;

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

/* --- The company's logo ---------------------------------------------------- */

/**
 * How tall the logo is drawn, in the ordinary case.
 *
 * Small on purpose. This is a letterhead, not a billboard: the message is a
 * short note from an employer to somebody who has just agreed to work for them,
 * and a mark big enough to be the first thing you see turns it into marketing.
 * Thirty-two pixels is roughly the height of the sender's avatar in the inbox
 * row above it, which is the size a reader has already been told this company
 * is.
 */
const LOGO_HEIGHT = 32;

/**
 * And how wide it is allowed to get before the height gives way.
 *
 * A wordmark can easily be ten times as wide as it is tall — at 32px tall, one
 * of those is 320px, which is more than half the width of the card and reads as
 * a banner. Past this, the width is pinned and the height comes down instead,
 * so a very wide mark ends up smaller rather than wider. Both dimensions stay
 * in the picture's own ratio either way; nothing is ever stretched.
 */
const LOGO_MAX_WIDTH = 180;

/**
 * The size to draw a logo at, from the size it actually is.
 *
 * `null` for anything that cannot be measured into a rectangle — a zero, a
 * negative, a `NaN` that got past the upload. The caller draws no logo at all
 * in that case, which is the state every account is in anyway, rather than
 * emitting an `<img>` with `width="NaN"`.
 *
 * Exported because the Settings screen promises to show the logo "at the size
 * it will appear in the email", and the only way to keep a promise like that is
 * for both screens to ask the same function. The alternative is two copies of
 * this arithmetic that agree until somebody changes one of them, which is the
 * exact failure the email preview's iframe was built to end.
 */
export function emailLogoSize(
  logo: CompanyLogo,
): { width: number; height: number } | null {
  const ratio = logo.width / logo.height;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;

  let height = LOGO_HEIGHT;
  let width = Math.round(height * ratio);

  if (width > LOGO_MAX_WIDTH) {
    width = LOGO_MAX_WIDTH;
    height = Math.round(width / ratio);
  }

  width = Math.max(1, width);
  height = Math.max(1, height);
  return { width, height };
}

/**
 * The logo, and everything that has to be true of it in an inbox.
 *
 * ## It is a remote image, and it has to be
 *
 * `data:` URIs are stripped by Gmail and refused by several others, and inline
 * `<svg>` is removed outright by Gmail and Outlook — the same three closed
 * doors documented on `watermark()` below, which is why Craig's own mark is
 * built out of type rather than out of a picture. A customer's logo cannot be:
 * it is *their* drawing, and there is no typographic substitute for it. So this
 * is the one image in the message, it is fetched over `https://` from a public
 * bucket, and the bucket is public precisely so this fetch can happen with no
 * session, no cookie and no expiry. `lib/craig/accounts.ts` argues that at
 * length.
 *
 * ## Which means it will sometimes not arrive
 *
 * A large share of clients block remote images by default, and a corporate
 * gateway will do it regardless of what the reader prefers. So the blocked case
 * is not an edge case, it is a normal way for this email to be read, and it is
 * designed for rather than degraded into:
 *
 * - **The `alt` is the company's name**, not "Logo" and not empty. Blocked, the
 *   header reads as the company's name in the company's position — which is
 *   what a letterhead is for. "Logo" would be a caption for a thing that isn't
 *   there.
 * - **The type styles are on the `<img>` itself.** Every major client renders
 *   alt text in the image element's own font, size and colour, so a mark that
 *   fails to load is replaced by something set in the message's own type rather
 *   than by the browser's default blue-underlined 16px serif.
 * - **Only the width is fixed.** The height is deliberately left to the client.
 *   A `height` attribute makes the box exactly as tall as the picture, and a
 *   client that has blocked the picture then clips the alt text to that box —
 *   so the fallback for a company with a name longer than about seven
 *   characters is a truncated word. Without it the text takes the room it
 *   needs. The width still pins the layout, which is the half that matters:
 *   Outlook's Word engine scales an image with *no* dimensions by the machine's
 *   DPI setting, and one dimension is enough to stop that — it takes the other
 *   from the file, at the ratio `logoSize` has already used.
 * - **Nothing collapses.** The logo is its own table row with its own padding,
 *   so with no image and no alt text rendered at all the header is simply
 *   shorter. There is no empty box, no border and no reserved space where a
 *   picture would have been — the accounts with no logo take exactly the
 *   layout this email had before any of this existed.
 *
 * `border="0"` and the three `outline`/`text-decoration` declarations are the
 * old defences against a client drawing a link border round an image, which
 * some still do; `display:block` kills the descender gap under it that a
 * baseline-aligned image leaves in a table cell.
 */
function logoBlock(logo: CompanyLogo, company: string): string {
  /* Ours, from our own bucket — but it is a string that ends up inside an
     `src`, and the honest place to check that is here rather than in the
     confidence that nothing upstream will ever change. Anything that is not an
     https URL draws nothing at all. */
  if (!/^https:\/\//i.test(logo.url)) return "";

  const size = emailLogoSize(logo);
  if (!size) return "";

  /* The company's name, and it is already sanitised on the way out of the
     account store — escaped again here because this is an attribute and the
     rule in this file is that nothing reaches markup unescaped. An empty
     company gives an empty alt, which is a client drawing nothing rather than
     drawing the word "undefined" where a letterhead goes. */
  const alt = escape(company.trim());

  const style = [
    "display:block",
    `width:${size.width}px`,
    "max-width:100%",
    "height:auto",
    "border:0",
    "outline:none",
    "text-decoration:none",
    `font-family:${FONT}`,
    "font-size:15px",
    "font-weight:600",
    "line-height:1.3",
    `color:${INK}`,
  ].join(";");

  return `<tr>
<td style="padding:28px 32px 0 32px;">
<img src="${escape(logo.url)}" width="${size.width}" alt="${alt}" border="0" style="${style};">
</td>
</tr>`;
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
 *
 * The logo is a third argument rather than a merge field, and that is a
 * deliberate line. A merge field is a piece of *copy* — somebody writes
 * `{{first_name}}` into a sentence in the mailmaker and it resolves to a word.
 * A logo is not a word: it has a size, a fallback, a position in the layout and
 * a set of rules about what happens when a client refuses to fetch it, none of
 * which a template author should have to know or be able to get wrong. So the
 * templates stay text and the letterhead is decided here.
 *
 * Optional, and absent means the message this product has sent for its whole
 * life until now. Every caller that has a logo to pass has an account in hand;
 * a caller that does not passes nothing and gets the old email exactly.
 */
export function renderEmail(
  template: EmailTemplate,
  values: Record<string, string> = {},
  logo: CompanyLogo | null = null,
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

  /* The letterhead, or nothing at all. `logoBlock` returns an empty string for
     an account with no logo and for a logo it cannot size, so the card simply
     has one row fewer — there is no reserved space, no placeholder and no
     branch further down. */
  const letterhead = logo ? logoBlock(logo, company) : "";

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
<!--[if mso]><table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${WIDTH}px;background-color:${PAPER};border-radius:8px;">
${letterhead}
<tr>
<td style="padding:${letterhead ? "20px" : "32px"} 32px 16px 32px;">
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
<!--[if mso]></td></tr></table><![endif]-->
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
