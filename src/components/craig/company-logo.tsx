"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Callout } from "@/components/ui";
import { Delete, UploadFile, Warning } from "@/components/ui/icons";
import type { CompanyLogo } from "@/lib/craig/contract";
import { emailLogoSize } from "@/lib/email/html";

/**
 * The company's logo, from the side of the person who owns it.
 *
 * Craig's mail already goes out under the customer's name rather than his —
 * `SENDER.name` is the company and nothing else, and the argument for that is
 * written at length in `lib/email/templates.ts`: a new starter agreed to work
 * at Katalis, not to hear from a tool Katalis bought, so the message belongs to
 * the company and Craig is a watermark at the foot of it. This is the next step
 * of the same argument and not a departure from it. The name was the sentence;
 * the logo is the letterhead. Craig's own attribution stays exactly where it
 * was.
 *
 * ## Why the preview is the whole screen
 *
 * Everything a person is actually deciding here is visual, and none of it is
 * visible from a filename. Is the mark legible at the size an email draws it?
 * Does a white-on-transparent logo disappear against the paper? What arrives
 * for the large number of people whose client refuses to load remote images?
 * A row saying "logo.png · 24 KB · uploaded today" answers none of those, so
 * this draws the two things that will actually happen instead — the mark at
 * the size the email uses, and the words that stand in for it when the picture
 * is blocked, side by side on the same white the message is printed on.
 *
 * The size comes from `emailLogoSize`, the same function the email renderer
 * uses, rather than from a number typed in here that matches it today.
 *
 * ## The URL is public and this screen says so
 *
 * Not in a warning box, because it is not a warning. A mail client fetches this
 * picture with no session and no cookie, often weeks after the message was
 * sent, so a private bucket and a signed link cannot work — and what somebody
 * who guesses the address gets is the logo off the company's own home page.
 * That is a fine thing for it to be, and the only reason to say it out loud is
 * so nobody uploads something else here believing it to be private.
 */

export function CompanyLogoPanel({
  logo: initial,
  company,
}: {
  /** What the account has now, read on the server. */
  logo: CompanyLogo | null;
  /**
   * The company's name, which is also the `alt` text the email carries — so
   * this screen can show the blocked-images case truthfully instead of
   * describing it.
   */
  company: string;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  /* Seeded from the server and moved locally as soon as the request comes back,
     which is what makes the preview change under somebody's hand rather than a
     beat later. `router.refresh()` still runs, so the server stays the truth —
     this is only what is on screen in between.

     Reset during render rather than in an effect, the same way the Resources
     screen does it: syncing props into state with `useEffect` paints the stale
     value once before correcting itself, and `lastLogo` is an identity check
     against the object the server just sent rather than a comparison. */
  const [logo, setLogo] = React.useState(initial);
  const [lastLogo, setLastLogo] = React.useState(initial);
  if (lastLogo !== initial) {
    setLastLogo(initial);
    setLogo(initial);
  }

  const [busy, setBusy] = React.useState<"upload" | "remove" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setBusy("upload");

    const body = new FormData();
    body.append("file", file);

    try {
      const response = await fetch("/api/account/logo", {
        method: "POST",
        body,
      });
      const payload = (await response.json().catch(() => null)) as {
        logo?: CompanyLogo;
        error?: string;
      } | null;

      if (!response.ok || !payload?.logo) {
        /* The route's own sentence, which is the point of it having written
           one. "Export it as a PNG" and "that image is larger than 2 MB" are
           both things somebody can act on in ten seconds, and a generic "upload
           failed" here would throw all of that away. */
        throw new Error(payload?.error ?? "That didn’t upload.");
      }

      setLogo(payload.logo);
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "That didn’t upload.",
      );
    } finally {
      setBusy(null);
      /* Cleared so the same file can be picked twice — a file input keeps its
         last value, and re-choosing it otherwise fires no change event. */
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    /* Asked, because there is no undo behind it: the object is deleted from the
       bucket rather than flagged, and the sentence names the consequence that
       is genuinely surprising — mail already sent points at that address. */
    if (
      !window.confirm(
        "Remove your logo? New emails will go out without it, and the ones already sent will show a blank space where it was.",
      )
    )
      return;

    setError(null);
    setBusy("remove");

    try {
      const response = await fetch("/api/account/logo", { method: "DELETE" });
      if (!response.ok) throw new Error("That didn’t remove.");
      setLogo(null);
      router.refresh();
    } catch {
      setError("That didn’t remove. Your logo is still there — try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Callout tone="danger" icon={<Warning />} title="That didn’t work">
          {error}
        </Callout>
      )}

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
        {logo ? (
          <LogoPreview logo={logo} company={company} />
        ) : (
          <NoLogo company={company} />
        )}

        {/* One input for both buttons. A second file input for "replace" would
            be a second thing to keep in step with the accepted types. */}
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          /* The two the server will actually keep. SVG and WebP are refused on
             purpose and the route says why in a sentence — but a file picker
             that offers them and a server that turns them away is a screen
             arguing with itself, so they are not offered. */
          accept="image/png,image/jpeg"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={logo ? "secondary" : "primary"}
            onClick={() => inputRef.current?.click()}
            loading={busy === "upload"}
          >
            {busy !== "upload" && <UploadFile aria-hidden />}
            {logo ? "Replace" : "Upload a logo"}
          </Button>

          {logo && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void remove()}
              loading={busy === "remove"}
            >
              {busy !== "remove" && <Delete aria-hidden />}
              Remove
            </Button>
          )}
        </div>

        <p className="text-xs leading-relaxed text-text-subtle">
          PNG or JPEG, up to 2 MB. It is drawn about 32 pixels tall, so a few
          hundred pixels wide is plenty. Anybody with the image&apos;s address
          can open it — that is what lets a mail client draw it weeks later —
          so this is a place for the logo off your website and nothing else.
        </p>
      </div>
    </div>
  );
}

/**
 * The two ways this logo will be seen, drawn at the size it will be seen at.
 *
 * On white, both of them, because the email is printed on white and a
 * white-on-transparent mark that looks perfect against this product's surface
 * disappears entirely in an inbox. Showing it on the app's own background would
 * be a preview that flatters.
 */
function LogoPreview({
  logo,
  company,
}: {
  logo: CompanyLogo;
  company: string;
}) {
  /* Exactly what the email will emit — same function, same numbers. `null`
     means a logo that cannot be sized, which the renderer also draws as
     nothing, so the two agree even in the case neither expects. */
  const size = emailLogoSize(logo);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <PaperBox label="In the email">
          {size ? (
            /* A plain `img`, and `next/image` would be wrong here rather than
               merely unnecessary. It would re-encode this picture and serve it
               from an optimiser — so what this box showed would be a different
               file at a different address to the one a recipient's mail client
               fetches, on the one screen whose whole job is to show what a
               recipient gets. The bytes and the URL are the subject. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo.url}
              alt={company}
              width={size.width}
              height={size.height}
              style={{ width: size.width, height: size.height }}
              className="block"
            />
          ) : (
            <span className="text-xs text-text-subtle">
              This image can&apos;t be sized, so no logo will be sent.
            </span>
          )}
        </PaperBox>

        {/* Not a description of the fallback — the fallback. A great many
            clients block remote images by default and a corporate gateway will
            do it whatever the reader prefers, so this is a normal way for the
            message to be read rather than an edge case, and it is the reason
            the `alt` is the company's name instead of the word "Logo". */}
        <PaperBox label="If images are blocked">
          <CompanyType company={company} />
        </PaperBox>
      </div>

      <p className="text-xs text-text-subtle">
        {logo.width} × {logo.height} pixels, drawn at{" "}
        {size ? `${size.width} × ${size.height}` : "no size"}.
      </p>
    </div>
  );
}

/**
 * The company's name, set the way the email sets it.
 *
 * The email's `alt` is this string and nothing else, so this is a rendering of
 * the fallback rather than a picture of one. Fixed colour and size rather than
 * theme tokens, because the message is printed on white on the recipient's
 * terms and a preview that followed this app's dark mode would be showing
 * something nobody will ever receive — the same rule `EmailPreview` follows.
 *
 * An account with no company name is possible (the column is sanitised on the
 * way in, and sanitising can empty it), and it renders as the note rather than
 * as a blank box, because a blank box here would read as this screen failing.
 */
function CompanyType({ company }: { company: string }) {
  const name = company.trim();

  if (!name) {
    return (
      <span className="text-xs text-text-subtle">
        This account has no company name, so there is nothing to show in place
        of the picture.
      </span>
    );
  }

  return (
    <span
      className="block font-semibold text-[#33302b]"
      style={{ fontSize: 15, lineHeight: 1.3 }}
    >
      {name}
    </span>
  );
}

/** One white card with a caption, so the two states above are the same object
    seen twice rather than two different boxes. */
function PaperBox({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
        {label}
      </span>
      <div className="flex min-h-16 items-center rounded-lg border border-border bg-white px-4 py-3">
        {children}
      </div>
    </div>
  );
}

/**
 * No logo, said as what happens rather than as an absence.
 *
 * An empty dashed box saying "no logo" would be true and would teach nobody
 * anything. What somebody needs to know before they decide whether to bother is
 * what their mail looks like today — which is the company's name in type at the
 * top of a plain white card, and is perfectly respectable. So that is what this
 * shows: the same paper, the same words, and the honest sentence that a logo
 * replaces them.
 */
function NoLogo({ company }: { company: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          In the email today
        </span>
        <div className="flex min-h-16 items-center rounded-lg border border-dashed border-border bg-white px-4 py-3">
          <CompanyType company={company} />
        </div>
      </div>
      <p className="text-sm leading-relaxed text-text-muted">
        Your emails already go out in your name rather than Craig&apos;s. Add a
        logo and it sits at the top of every one of them.
      </p>
    </div>
  );
}
