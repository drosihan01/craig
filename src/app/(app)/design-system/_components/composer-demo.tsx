"use client";

import * as React from "react";
import { Button, PromptBar } from "@/components/ui";
import { Draw } from "@/components/ui/icons";

/* --- Sizes ----------------------------------------------------------------- */

export function ComposerSizeDemo() {
  const [sent, setSent] = React.useState<string[]>([]);

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex flex-col gap-1.5">
          <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
            lg — page level
          </p>
          <PromptBar
            onSubmit={(text) => setSent((prev) => [text, ...prev].slice(0, 3))}
            placeholder="Ask Craig anything — a policy, a step, who's waiting on what…"
            footnote="Craig knows your workflows, your people and whatever you've uploaded."
          />
        </div>

        {/* Deliberately in a 19rem column — sm exists for a side panel, and
            judging it at full page width is judging it somewhere it never
            appears. */}
        <div className="flex flex-col gap-1.5">
          <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
            sm — inside a panel
          </p>
          <PromptBar
            size="sm"
            onSubmit={(text) => setSent((prev) => [text, ...prev].slice(0, 3))}
            placeholder="Ask about this block…"
            dictation={false}
          />
        </div>
      </div>

      {sent.length > 0 && (
        <ul className="flex flex-col gap-1">
          {sent.map((s, i) => (
            <li key={`${s}-${i}`} className="text-sm text-text-subtle">
              sent: <span className="text-text">{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --- Controlled ------------------------------------------------------------ */

const SCRIPT =
  "We're nine people in a regulated lab. Everything's in a Google Doc I wrote the week we incorporated.";

/* Same shape as typeDraft in @/lib/v3/store — a fixed number of frames over a
   fixed duration, so a long line and a short one take the same time. */
export function ControlledComposerDemo() {
  const [value, setValue] = React.useState("");
  const [sent, setSent] = React.useState<string | null>(null);
  const timer = React.useRef<number | null>(null);

  const stop = React.useCallback(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  }, []);

  React.useEffect(() => stop, [stop]);

  function type() {
    stop();
    setSent(null);
    const frames = 34;
    const step = Math.ceil(SCRIPT.length / frames);
    let i = 0;
    setValue("");
    timer.current = window.setInterval(() => {
      i += step;
      if (i >= SCRIPT.length) {
        setValue(SCRIPT);
        stop();
        return;
      }
      setValue(SCRIPT.slice(0, i));
    }, 1600 / frames);
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={type}>
          <Draw />
          Type into it
        </Button>
        <span className="text-sm text-text-subtle">
          The caller owns the text. Interrupt it — click in and keep typing.
        </span>
      </div>

      <PromptBar
        value={value}
        onValueChange={(v) => {
          stop();
          setValue(v);
        }}
        onSubmit={(text) => {
          setSent(text);
          setValue("");
        }}
        placeholder="Tell Craig about your company…"
        footnote="Attach whatever you already have — however out of date it is."
      />

      {sent && (
        <p className="text-sm text-text-subtle">
          sent: <span className="text-text">{sent}</span>
        </p>
      )}
    </div>
  );
}

/* --- The height floor ------------------------------------------------------ */

export function ComposerFloorDemo() {
  return (
    <div className="grid w-full gap-5 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          A placeholder that wraps
        </p>
        <PromptBar
          size="sm"
          onSubmit={() => {}}
          dictation={false}
          placeholder="Ask Craig anything — a policy, a step, who's waiting on what, or which of your documents actually says so…"
        />
        <p className="text-xs leading-relaxed text-text-subtle">
          Type one character. The box holds its resting height instead of
          snapping to a single line.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          A short one, for comparison
        </p>
        <PromptBar
          size="sm"
          onSubmit={() => {}}
          dictation={false}
          placeholder="Ask about this block…"
        />
        <p className="text-xs leading-relaxed text-text-subtle">
          One line at rest, so one line is the floor. The rule is the resting
          height, not a magic number.
        </p>
      </div>
    </div>
  );
}
