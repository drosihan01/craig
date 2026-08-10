"use client";

import * as React from "react";
import { render, SENDER, type EmailTemplate } from "@/lib/email";
import { renderEmail } from "@/lib/email/html";
import type { CompanyLogo } from "@/lib/craig/contract";
import { cn } from "@/lib/cn";

/**
 * What lands in the inbox.
 *
 * Two parts, because they fail differently. The inbox row — sender, subject,
 * preheader — is the only bit most people ever read, and it's the bit template
 * editors usually don't show. The body is what you get if they open it.
 *
 * The body is not drawn here. It is the exact HTML `renderEmail` hands to the
 * provider, put in an iframe, and that is the whole point of this component
 * rather than a detail of it. It used to be the same design built a second time
 * in flexbox and Tailwind, which read better and lied: the templates were
 * white-labelled — the message comes from the company now, the footer says so,
 * and Craig is a watermark in the corner — and this screen went on printing
 * "Sent by Craig on behalf of…" long after nothing sent that. Nobody noticed,
 * because the only way to notice was to read both files on the same afternoon.
 * A preview is the screen people check *instead of* sending, so it is the one
 * screen in the product that has no business having its own opinion about what
 * the thing looks like.
 *
 * Deliberately not theme-aware: email renders on the recipient's terms, not
 * ours, and showing a dark-mode preview of something that will arrive on white
 * is a preview that lies. So it's light, always — the message carries its own
 * `color-scheme: light`, and the inbox row above it is fixed values rather than
 * tokens — inside a frame that makes clear it's a different surface to the app
 * around it.
 */

/**
 * How tall the body is before anything has been measured.
 *
 * Only ever seen for a frame, and by anyone whose JavaScript hasn't arrived:
 * the iframe still renders the message without it, it just can't be told what
 * size to be. Roughly the tallest template, because a first paint that is too
 * tall settles by shrinking a little and one that is too short shows somebody a
 * cut-off email — and a cut-off email in a preview is a bug report.
 */
const FALLBACK_HEIGHT = 620;

/**
 * The sender's first letter, for the circle beside their name.
 *
 * `Array.from` rather than `name[0]`, because indexing a string returns a UTF-16
 * code unit and a company whose name starts outside the basic plane would get
 * half a character — a replacement glyph in the one spot on this row that is
 * supposed to reassure somebody the message is from who it says. Uppercased for
 * the same reason every client does it, and only after the character is whole.
 *
 * Empty is a real possibility rather than a defensive flourish: `{{company}}`
 * can be overridden to nothing through `values`. An empty circle is a fine
 * answer to that and an exception is not.
 */
function monogram(name: string): string {
  return (Array.from(name.trim())[0] ?? "").toUpperCase();
}

export function EmailPreview({
  template,
  values,
  logo,
  className,
}: {
  template: EmailTemplate;
  /** Overrides for the merge fields; anything absent uses the example. */
  values?: Record<string, string>;
  /**
   * The account's own logo, or nothing.
   *
   * Handed in rather than fetched, for the reason the whole component exists:
   * this is a picture of what will arrive, so the letterhead on it has to be
   * the same object the sending routes pass to `renderEmail`, resolved from the
   * same account row. A component that went and looked one up itself would be a
   * second opinion about what a recipient gets, and a second opinion is exactly
   * what the iframe below was written to make impossible.
   *
   * Absent — on the design system's fixtures, for instance — draws the message
   * with no letterhead, which is what an account with no logo will genuinely
   * receive.
   */
  logo?: CompanyLogo | null;
  className?: string;
}) {
  const email = renderEmail(template, values, logo ?? null);

  /* The display name, built the way the send builds it. The routes that send
     take the company off the account rather than out of the merge values, so
     this substitutes the token to get the same answer from the data a preview
     actually has — `SENDER.name` is the shared part, and it is the part that
     decides whose name is in the inbox. */
  const from = SENDER.name(render("{{company}}", values));

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-[#f4f2ef]",
        className,
      )}
    >
      {/* The inbox row. Everything that decides whether the rest gets read. */}
      <div className="flex items-start gap-2.5 border-b border-black/8 bg-white px-4 py-3">
        {/* The company's initial, not Craig's mark.

            This used to be the Craig logo, sitting immediately to the left of
            the word "Katalis", which is the one position in a mail client that
            means "this is who wrote to you" — a supplier's badge on somebody
            else's letter, and the picture of exactly the arrangement the
            white-labelling exists to undo. Craig gets one appearance in this
            message and it is the watermark at the foot of it.

            A monogram rather than nothing, because it is also what actually
            happens: a sender with no avatar on file gets a letter in a circle
            from every client that shows one, so this is the honest placeholder
            as well as the neutral one. */}
        <span
          aria-hidden
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#efece7] text-xs font-semibold text-[#3d332c]"
        >
          {monogram(from)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-semibold text-[#1f1d1a]">
              {from}
            </span>
            <span className="shrink-0 text-2xs text-[#8a8279]">now</span>
          </div>
          {/* The address, not just the display name. It's what a suspicious
              reader checks, and what deliverability actually turns on. */}
          <span className="truncate text-2xs text-[#8a8279]">
            {SENDER.address}
          </span>
          <span className="truncate text-sm font-medium text-[#1f1d1a]">
            {email.subject}
          </span>
          <span className="truncate text-xs text-[#8a8279]">
            {email.preheader}
          </span>
        </div>
      </div>

      <Body html={email.html} subject={email.subject} />
    </div>
  );
}

/**
 * The message itself, in an iframe, because it is a whole document.
 *
 * `renderEmail` returns a `<!doctype html>` with its own `<body>`, its own
 * background and its own font stack, and there is no way to drop that into a
 * React tree — but an iframe is exactly a place for a document, and inside one
 * the email's inline styles are also safely quarantined from the app's. That
 * cuts both ways and both ways are wanted: Tailwind's preflight can't reach in
 * and reset the tables the way Word won't, and the email's `font-family` on
 * every paragraph can't leak out.
 *
 * `sandbox` without `allow-scripts` is a second belt on top of the escaping in
 * `html.ts`. Template copy is edited inside the product, so it is untrusted the
 * moment it stops being a fixture, and this is the one place in the app that
 * renders it as markup rather than as text. `allow-same-origin` is there and is
 * not a hole: it is what lets the height below be read, and script execution —
 * the thing that would make it one — stays off. It also means the call to
 * action doesn't navigate, which is right. Somebody checking their copy should
 * not be able to fall out of the app by clicking a button in a picture of an
 * email.
 */
function Body({ html, subject }: { html: string; subject: string }) {
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  /* The last width the frame was measured at, so a resize that isn't one is
     ignored. See the observer below. */
  const widthRef = React.useRef(0);
  const [height, setHeight] = React.useState(FALLBACK_HEIGHT);

  /**
   * An iframe has no intrinsic height, so it gets told one.
   *
   * Measured off the document's `body` rather than off `documentElement`. The
   * latter's `scrollHeight` is the larger of the content and the viewport, so
   * once the frame is taller than the email it starts reporting its own height
   * back — the number never comes down again, and a template edit that removes
   * a paragraph leaves a strip of empty canvas that nothing will reclaim. The
   * body is shrink-to-fit, so it answers the question actually being asked.
   */
  const measure = React.useCallback(() => {
    const body = frameRef.current?.contentDocument?.body;
    if (!body) return;

    const next = Math.ceil(body.getBoundingClientRect().height);
    if (next > 0) setHeight(next);
  }, []);

  /**
   * Re-measure when the frame gets narrower or wider, and only then.
   *
   * The email wraps, so its height is a function of its width: the same message
   * is several lines taller in a split editor pane than it is on the preview
   * tab, and a height measured once at load would clip it the moment the aside
   * opens. `onLoad` can't see that happen — the document doesn't reload — so
   * something has to watch the box.
   *
   * The width check is what stops it being a loop. Setting the height resizes
   * the very element being observed, which delivers another entry, which would
   * measure and set again; comparing the width first means a change this
   * component caused is recognised as one and dropped, rather than relying on
   * the numbers happening to converge.
   */
  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width === widthRef.current) return;

      widthRef.current = width;
      measure();
    });

    observer.observe(frame);
    return () => observer.disconnect();
  }, [measure]);

  /* No sideways scroll any more, and no floor under the frame. The message
     used to be a table with an explicit 600px width, which no client will
     squeeze — so the preview had to pan to stay honest about what a phone
     would do. The card is `width:100%` with a max now, so it reflows here for
     the same reason it reflows in a real inbox, and a preview that still
     forced a horizontal scrollbar would be lying in the opposite direction. */
  return (
    <div>
      <iframe
        ref={frameRef}
        /* Named for the reader of a screen reader, who otherwise gets "frame"
           and no idea what is in it. The subject is what the email calls
           itself. */
        title={`Email preview: ${subject}`}
        srcDoc={html}
        onLoad={measure}
        sandbox="allow-same-origin"
        /* Deprecated, and still the only thing that reliably stops a scrollbar
           appearing inside a frame that is a pixel short of its content. The
           frame is sized to fit both ways, so any bar it grew would be a
           second, inner scroll region — a thing no inbox has. */
        scrolling="no"
        className="block w-full border-0"
        style={{ height }}
      />
    </div>
  );
}
