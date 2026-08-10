import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { currentJoiner, requireJoiner } from "@/lib/craig/current-joiner";
import { CONTRACT_CONSENT, JOINER_HOME } from "@/lib/craig/contract";
import {
  contractStepOf,
  openContract,
  originOf,
  type ContractProblem,
} from "@/lib/craig/contract-signing";
import { ContractScreen } from "./contract-screen";

/**
 * The room where somebody reads and signs their contract.
 *
 * **Opening this page is what starts the record.** `openContract` writes the
 * signing row the first time, with the moment, the address and the device on
 * it, and hashes the exact bytes that are about to be served. That is why the
 * work is here in the page rather than behind a button: `opened_at` should mean
 * the first time this document was put in front of this person, and a
 * button-press would mean the first time they got round to pressing something.
 *
 * It is also why this page is deliberately *not* cached and never static. It has
 * a side effect and it reads a cookie, so `headers()` alone would force it
 * dynamic — but the reason is worth stating rather than relying on a call to a
 * dynamic API staying where it is.
 *
 * Everything that could stop somebody signing is resolved here, on the server,
 * before a single control is drawn. Somebody whose employer attached a Word
 * document should be told that on arrival, not after reading four pages.
 */

export async function generateMetadata(): Promise<Metadata> {
  /* `currentJoiner` rather than `requireJoiner`: this runs before the page and
     must not redirect from inside a title. The lookup is `cache`d for the
     render, so this and the page below share one read of the cookie. */
  const joiner = await currentJoiner();

  return {
    title: joiner ? `Your contract — ${joiner.company}` : "Your contract",
    /* Somebody's employment contract, reachable by a long-lived link in their
       email. Nothing about it belongs in a search index. */
    robots: { index: false, follow: false },
  };
}

/**
 * What each problem sounds like on this screen.
 *
 * Written for the person reading it, who cannot fix any of them: no bucket, no
 * content type, no row id, and no suggestion that they have done something
 * wrong. Each one names the one thing they can do, which is tell whoever
 * invited them — and names it specifically enough that the admin will know what
 * to change.
 */
function problemText(problem: ContractProblem, company: string) {
  switch (problem) {
    case "no-document":
      return `There's no contract attached to this step yet, so there's nothing for you to read. Nothing here is waiting on you — ${company} has to attach the document first.`;
    case "not-a-pdf":
      return `The file on this step isn't a PDF, so I can't show it to you here. Tell whoever invited you and they can upload it again as one.`;
    case "encrypted":
      return `That contract is password-protected, so I can't open it to show you. ${company} will need to upload a copy without the password.`;
    case "changed":
      return `Something about that document has changed since you started reading it. I've stopped rather than let you sign a version you haven't seen — tell whoever invited you.`;
    default:
      return `I can't open that contract. Tell whoever invited you — there's nothing you can do about this one from here.`;
  }
}

export default async function JoinerContractPage(
  props: PageProps<"/me/contract/[stepId]">,
) {
  const joiner = await requireJoiner();
  const { stepId } = await props.params;

  /* Their own snapshot decides. A step id from somebody else's workflow is not
     in this list, so there is no reachable address that opens another person's
     contract — and a step of theirs that is not a contract step is a 404 rather
     than a screen with nothing on it. */
  const step = contractStepOf(joiner, stepId);
  if (!step) notFound();

  const origin = originOf(await headers());
  const opened = await openContract(joiner, step, origin);

  if (!opened.ok) {
    return (
      <ContractScreen
        company={joiner.company}
        stepTitle={step.title}
        backTo={JOINER_HOME}
        state={{ kind: "blocked", message: problemText(opened.problem, joiner.company) }}
      />
    );
  }

  const { signing } = opened;

  return (
    <ContractScreen
      company={joiner.company}
      stepTitle={step.title}
      backTo={JOINER_HOME}
      state={
        signing.signed_at
          ? {
              kind: "signed",
              stepId: step.id,
              documentName: signing.document_name,
              /* Words, on the server, for the reason every date on `/me` is:
                 formatted during render it is formatted twice in two timezones,
                 which React calls a hydration mismatch and a person reads as
                 the wrong day on their own contract. */
              signedOn: readableDay(signing.signed_at),
              pageCount: signing.page_count,
            }
          : {
              kind: "reading",
              stepId: step.id,
              documentName: signing.document_name,
              pageCount: signing.page_count,
              /* Where they got to last time, so somebody coming back to a long
                 contract does not start at page one again. It is the server's
                 own high-water mark — the same number the signing route checks
                 — so the screen cannot be talked into a further-on position
                 than the record supports. */
              pagesSeen: signing.pages_seen,
              consent: CONTRACT_CONSENT,
              signerName: joiner.name,
            }
      }
    />
  );
}

/**
 * A timestamp as the day it happened: "7 August".
 *
 * The same rule `/me` follows, including the absence of a time of day — with
 * one difference worth naming. The *record* holds the instant to the
 * millisecond and the certificate prints it in full, because that is evidence.
 * This is the sentence on somebody's screen, and "you signed this at 21:47" is
 * a level of watchfulness nobody asked for on their own contract.
 */
function readableDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
