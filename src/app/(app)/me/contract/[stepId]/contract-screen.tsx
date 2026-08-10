"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  AppShell,
  BackLink,
  Badge,
  Button,
  buttonVariants,
  Callout,
  Checkbox,
  ControlRow,
  Field,
  Input,
} from "@/components/ui";
import { Check, DoneAll, Lock, Warning } from "@/components/ui/icons";
import { JoinerNav, JoinerNavRail } from "@/components/craig/joiner-nav";
import { cn } from "@/lib/cn";

/**
 * Reading a contract and signing it, as one screen with one shape.
 *
 * **The document is shown a page at a time, and that is not a design flourish.**
 * Each page is a request to this product's own server, which extracts it and
 * records that it did — so "they were shown all of it" is something the server
 * observed rather than something this component reported. A viewer that scrolled
 * one long PDF would have to *tell* the server how far somebody had got, and a
 * browser telling a server how much of a contract somebody read is not evidence
 * of anything.
 *
 * That inverts the usual relationship between this file and the route behind it.
 * Nothing here is the control: the signing route re-checks the page count, holds
 * its own copy of the consent wording, and refuses a signature that is short on
 * either. Everything below — the disabled button, the locked panel, the counter
 * — is *courtesy*, so that somebody is not allowed to fill a form in and then be
 * told no. The same argument `DetailsForm` on `/me` makes about validation, with
 * more riding on it.
 *
 * **The signing panel does not exist until the last page has been served.** Not
 * hidden with CSS, not disabled — absent. A disabled control still draws the eye
 * to the end of the job and invites somebody to look for the way round it; a
 * panel that appears when you finish reading is the shape of the act itself.
 *
 * `<iframe>` for the page rather than a JavaScript PDF renderer. Rendering PDFs
 * in the browser means `pdfjs-dist`, which is a large dependency to ship to a
 * person who will use it once — and every browser already has a PDF viewer that
 * is better than the one we would build. One page per frame sidesteps the one
 * real weakness of that approach, which is that mobile Safari renders only the
 * first page of a multi-page PDF in a frame. Here every frame has one page.
 */

export type ContractState =
  | { kind: "blocked"; message: string }
  | {
      kind: "signed";
      stepId: string;
      documentName: string;
      signedOn: string;
      pageCount: number;
    }
  | {
      kind: "reading";
      stepId: string;
      documentName: string;
      pageCount: number;
      /** The server's high-water mark, so coming back resumes. */
      pagesSeen: number;
      /** The exact wording they are agreeing to. Never composed here. */
      consent: string;
      /** Their name as their employer has it. A prefill, not a constraint. */
      signerName: string;
    };

export function ContractScreen({
  company,
  stepTitle,
  backTo,
  state,
}: {
  company: string;
  stepTitle: string;
  backTo: string;
  state: ContractState;
}) {
  return (
    <AppShell
      title="Your contract"
      navRail={<JoinerNavRail />}
      nav={
        <JoinerNav>
          <p className="px-2 text-xs leading-relaxed text-text-subtle">
            {company} asked you to sign this. If anything in it looks wrong,
            reply to the email that brought you — it reaches a person.
          </p>
        </JoinerNav>
      }
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-8">
        <div>
          <BackLink href={backTo}>Back to your tasks</BackLink>
        </div>

        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">
            {stepTitle}
          </h1>
          {state.kind !== "blocked" && (
            <p className="text-sm text-text-muted">
              {state.documentName}
              {state.kind === "reading" && (
                <>
                  {" · "}
                  {state.pageCount} page{state.pageCount === 1 ? "" : "s"}
                </>
              )}
            </p>
          )}
        </header>

        {state.kind === "blocked" && (
          <Callout tone="warning" icon={<Warning />} title="I can't show you this one">
            {state.message}
          </Callout>
        )}

        {state.kind === "signed" && <Signed state={state} />}

        {state.kind === "reading" && <Reading state={state} />}
      </div>
    </AppShell>
  );
}

/**
 * Afterwards.
 *
 * The download is the substance of this state rather than a footnote. A
 * signature the signer cannot retrieve is one only the other side holds, and
 * their copy carries the certificate — the hashes, the timestamps, the consent
 * as worded — so it is also the one check on all of this that does not require
 * trusting us.
 */
function Signed({
  state,
}: {
  state: Extract<ContractState, { kind: "signed" }>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Callout tone="success" icon={<DoneAll />} title="Signed">
        You signed this on {state.signedOn}. Your copy has a certificate at the
        back of it recording what you were shown and when — keep it somewhere
        you can find it.
      </Callout>

      <div>
        {/* A plain link to a route that checks and then redirects to a URL good
            for a minute. An `<a>` wearing the button's own classes rather than
            a `<Button>`, because `Button` renders a `<button>` and a button that
            navigates is a control screen readers announce wrongly and
            middle-click cannot open. The same pattern the workflow editor and
            the person page use. */}
        <a
          href={`/api/joiner/contract/${encodeURIComponent(state.stepId)}/signed`}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants()}
        >
          Download your signed copy
        </a>
      </div>
    </div>
  );
}

function Reading({
  state,
}: {
  state: Extract<ContractState, { kind: "reading" }>;
}) {
  const router = useRouter();

  /* Resume where the server says they got to, never further. Clamped both ends
     because `pagesSeen` is a stored number and a stored number is a thing that
     can be wrong; a viewer that opened on page 9 of a 3-page document would be
     a blank frame with no way back. */
  const [page, setPage] = React.useState(() =>
    Math.min(Math.max(state.pagesSeen || 1, 1), state.pageCount),
  );
  const [seen, setSeen] = React.useState(() =>
    Math.min(Math.max(state.pagesSeen, 1), state.pageCount),
  );

  const [typedName, setTypedName] = React.useState("");
  const [consented, setConsented] = React.useState(false);
  const [drawn, setDrawn] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [reloading, startReload] = React.useTransition();

  const busy = saving || reloading;
  const readToEnd = seen >= state.pageCount;
  const hasMark = Boolean(typedName.trim() || drawn);

  function go(to: number) {
    const next = Math.min(Math.max(to, 1), state.pageCount);
    setPage(next);
    setSeen((current) => Math.max(current, next));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !readToEnd || !hasMark || !consented) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/joiner/contract/${encodeURIComponent(state.stepId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          /* What they typed, what they drew, and that they ticked the box.
             Who they are comes from the cookie on the server — an id in here
             would be a signature anybody could forge. The consent *wording* is
             not sent either: the server writes its own copy, so a request
             cannot record somebody agreeing to something they never read. */
          body: JSON.stringify({
            typedName: typedName.trim(),
            drawnSignature: drawn,
            consented: true,
          }),
        },
      );

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? "That didn't go through. Try it once more.");
        setSaving(false);
        return;
      }

      /* Re-read from the server rather than switching this component into its
         signed state locally. What was recorded is the server's to say, and a
         screen that congratulated somebody on a signature it had not confirmed
         would be the one lie this whole feature cannot afford. */
      setSaving(false);
      startReload(() => router.refresh());
    } catch {
      /* No response at all. Said carefully: the request may well have reached
         the server, so this must not imply nothing was signed — and pressing it
         again is safe, because a second signing is refused rather than
         duplicated. */
      setError(
        "I couldn't reach the server just then. Check your connection and have another go — if the first one did land, you'll be told you've already signed.",
      );
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-label="The document">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              Page {page} of {state.pageCount}
            </span>
            {readToEnd ? (
              <Badge tone="success" size="sm">
                <Check />
                All pages shown
              </Badge>
            ) : (
              <Badge tone="neutral" size="sm">
                {state.pageCount - seen} to go
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => go(page - 1)}
              disabled={page <= 1}
            >
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => go(page + 1)}
              disabled={page >= state.pageCount}
            >
              Next page
            </Button>
          </div>
        </div>

        {/* Keyed on the page so React replaces the frame rather than mutating
            its `src`. A reused frame keeps its scroll position and, in some
            browsers, its old rendering for a beat — which on this screen would
            mean somebody looking at page two while the counter says three. */}
        <iframe
          key={page}
          src={`/api/joiner/contract/${encodeURIComponent(state.stepId)}?page=${page}`}
          title={`${state.documentName}, page ${page}`}
          className="h-[70vh] w-full rounded-lg border border-border bg-surface"
        />

        <p className="text-xs text-text-subtle">
          Can&apos;t see it?{" "}
          <a
            href={`/api/joiner/contract/${encodeURIComponent(state.stepId)}?page=${page}`}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-text"
          >
            Open page {page} in a new tab
          </a>
          .
        </p>
      </section>

      {readToEnd ? (
        <form
          onSubmit={submit}
          noValidate
          className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-5 shadow-e1"
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold tracking-[-0.01em]">
              Sign it
            </h2>
            <p className="text-sm text-text-muted">
              Type your name, draw your signature, or both.
            </p>
          </div>

          {/* Prefilled with nothing and only *suggested* in the hint. The
              name their employer typed into an invitation is not necessarily
              the name somebody signs with, and a box that arrived filled in
              would collect the employer's spelling under the signer's hand. */}
          <Field
            label="Your name, typed"
            hint={`As you'd write it — your employer has you down as ${state.signerName}.`}
          >
            <Input
              value={typedName}
              onChange={(event) => setTypedName(event.target.value)}
              autoComplete="name"
              maxLength={120}
              disabled={busy}
            />
          </Field>

          <SignaturePad value={drawn} onChange={setDrawn} disabled={busy} />

          {/* Its own recorded fact, and therefore its own control. Pressing a
              button labelled "Sign" is not consent to sign electronically —
              it is consent to sign. The two are different questions and the
              Electronic Transactions Act asks the first one separately, so it
              is asked separately here and written to the record as its own
              timestamped line. The wording shown is the wording stored. */}
          <ControlRow
            control={
              <Checkbox
                checked={consented}
                onChange={(event) => setConsented(event.target.checked)}
                disabled={busy}
              />
            }
            label={state.consent}
          />

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button
              type="submit"
              loading={busy}
              disabled={!hasMark || !consented}
            >
              Sign this contract
            </Button>
            <span className="inline-flex items-center gap-1.5 text-xs text-text-subtle">
              <Lock className="size-3.5" />
              You&apos;ll get your own copy, with a record of what you were
              shown.
            </span>
          </div>
        </form>
      ) : (
        <div className="rounded-lg border border-dashed border-border-strong px-4 py-3 text-sm text-text-muted">
          Page through to the end and the signing box will open here.
        </div>
      )}
    </div>
  );
}

/**
 * Somewhere to draw a signature, with a mouse or a finger.
 *
 * Pointer events rather than mouse plus touch, because they are the same
 * gesture and two code paths for one gesture is two places for the coordinate
 * arithmetic to be subtly different — which on a signature pad shows up as a
 * line that lags the finger on exactly one kind of device.
 *
 * The backing store is sized to the device pixel ratio and the context scaled to
 * match, so the stroke is not the soft doubled line that a CSS-scaled canvas
 * produces. It matters more here than on an ordinary canvas: this image is
 * embedded in a legal document and then printed.
 *
 * `toDataURL` only when they lift the pointer, not on every move. The string is
 * a few tens of kilobytes and rebuilding it per frame would make a slow phone
 * feel like a broken one.
 */
function SignaturePad({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled: boolean;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const drawing = React.useRef(false);
  const [empty, setEmpty] = React.useState(true);

  /* Sized once the element is on the page, because the width comes from the
     layout. Re-sizing on every resize event would clear the drawing — a canvas
     loses its contents when its width or height attribute is written — so this
     deliberately does not follow the viewport. Somebody who rotates their phone
     mid-signature redraws; somebody whose signature vanished as they turned
     the phone would rightly give up on the whole product. */
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 2;
    context.lineCap = "round";
    context.lineJoin = "round";
    /* A real colour rather than `currentColor`. This is going into a PDF on
       white paper, and a signature that inherited a dark theme's near-white
       ink would embed as an invisible mark. */
    context.strokeStyle = "#111114";
  }, []);

  function positionOf(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const box = canvas.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;

    /* Capture, so a stroke that leaves the canvas mid-flourish keeps arriving
       here instead of being dropped the moment the pointer crosses the edge. */
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;

    const { x, y } = positionOf(event);
    context.beginPath();
    context.moveTo(x, y);
    /* A dot, so a full stop or a single tap is a mark rather than nothing. */
    context.lineTo(x, y);
    context.stroke();
    setEmpty(false);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;

    const { x, y } = positionOf(event);
    context.lineTo(x, y);
    context.stroke();
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;

    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
    onChange(null);
  }

  return (
    <Field
      label="Your signature, drawn (optional)"
      hint="Use a finger, a stylus or the mouse."
    >
      <div className="flex flex-col gap-2">
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          className={cn(
            "h-40 w-full rounded-md border border-dashed border-border-strong bg-surface",
            /* Without this the browser claims the gesture for scrolling and a
               signature drawn on a phone is a scrolled page with one dot on
               it. */
            "touch-none",
            disabled ? "opacity-60" : "cursor-crosshair",
          )}
        />
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clear}
            disabled={disabled || empty}
          >
            Clear
          </Button>
          {value && (
            <span className="text-xs text-text-subtle">
              This is what will appear on the document.
            </span>
          )}
        </div>
      </div>
    </Field>
  );
}
