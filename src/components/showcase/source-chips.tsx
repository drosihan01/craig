"use client";

import * as React from "react";

/**
 * Where an answer came from, under the answer.
 *
 * This is a fix wearing a decoration's clothes. Left to itself the model writes
 * its citations into the sentence — a bracketed markdown link mid-paragraph,
 * next to a rule that says no links and no bracketed sources — and it keeps
 * doing it when told not to, because that behaviour belongs to the provider's
 * post-search generation rather than to anything a prompt can reach. The route
 * takes them out of the text and sends them separately; this is where they
 * land. The prose reads as prose, and the page is still one click away.
 *
 * A host and a favicon, not a title. The title of a search result is written to
 * be clicked on and is usually a sentence; the host is what somebody actually
 * checks — whether this came from a government site or a vendor's blog is the
 * whole question, and it is answered by four words and a little round icon.
 */

export interface Source {
  url: string;
  title: string;
}

export function SourceChips({ sources }: { sources?: Source[] }) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
      {sources.map((s) => (
        <Chip key={s.url} source={s} />
      ))}
    </div>
  );
}

function Chip({ source }: { source: Source }) {
  /* The favicon service is a third party that can be blocked, slow or simply
     not have the icon. A broken image in a circle is worse than no image, so
     the letter takes over — same size, same circle, nothing moves. */
  const [iconFailed, setIconFailed] = React.useState(false);
  const host = hostOf(source.url);

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      title={source.title || host}
      className="flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-sunken py-0.5 pl-0.5 pr-2.5 text-xs text-text-muted transition-colors hover:border-border-strong hover:text-text"
    >
      <span className="flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface text-2xs font-semibold uppercase leading-none text-text-subtle">
        {iconFailed ? (
          host.charAt(0)
        ) : (
          /* A plain img: the domain is somebody else's and next/image would
             need it in a config nobody can keep current. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
            alt=""
            width={16}
            height={16}
            loading="lazy"
            className="size-full object-cover"
            onError={() => setIconFailed(true)}
          />
        )}
      </span>
      <span className="truncate">{host}</span>
    </a>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
