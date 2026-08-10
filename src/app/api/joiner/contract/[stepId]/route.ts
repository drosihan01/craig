import { after, NextResponse } from "next/server";

import { currentJoiner } from "@/lib/craig/current-joiner";
import { fireNextAutomatedStep } from "@/lib/craig/automation";
import { getJoiner } from "@/lib/craig/joiners";
import { rateLimit } from "@/lib/craig/rate-limit";
import {
  contractPage,
  contractStepOf,
  originOf,
  signContract,
  type ContractProblem,
} from "@/lib/craig/contract-signing";

/**
 * The new starter's contract: reading it, and signing it.
 *
 * **Nothing in either request says who is signing.** The body carries what was
 * typed and what was drawn; the person is the one the signed cookie resolves to,
 * server-side, and the step is looked up in *their own* snapshot. A `joinerId`
 * field would be a signature anybody could forge by typing somebody else's id,
 * and there is no version of that field that is safe, so it does not exist. The
 * same rule `/api/showcase/step` states, with more riding on it.
 *
 * **GET serves one page, and that is the mechanism rather than an optimisation.**
 * Handing the browser the whole PDF and listening for a scroll event produces
 * evidence of one thing: that a script on the signer's machine said they had
 * scrolled. Serving page `n` means this server extracted page `n` and sent it,
 * which is a fact it can record about itself. `contract-signing.ts` sets out why
 * the resulting claim is deliberately the modest one.
 *
 * **POST is the one write in this product that must never overwrite.** It is
 * refused four ways over: here, by the unique index on (joiner, step), by the
 * `upsert: false` upload onto a deterministic path, and by the database trigger
 * that rejects any update to a signed row.
 */

/** Block ids are generated, so this is a sanity bound rather than a rule. */
const MAX_ID = 64;

const noStore = { "Cache-Control": "no-store" };

/* Every sentence here can end up in front of somebody on their first week, so
   every sentence here is written for them. Nothing about cookies or columns. */
const refuse = (error: string, status: number) =>
  NextResponse.json({ ok: false, error }, { status, headers: noStore });

/**
 * What a problem sounds like to the person who cannot act on it.
 *
 * Three of these are the employer's to fix and one is nobody's, and none of them
 * is this person's fault — so each says what is wrong without naming a bucket, a
 * content type or a row, and each points at the only thing they can actually do,
 * which is tell whoever invited them. The alternative — one generic apology —
 * would leave an admin with "it doesn't work" and no way to find out that they
 * uploaded a Word document.
 */
function sentenceFor(problem: ContractProblem | "no-such-page"): string {
  switch (problem) {
    case "no-document":
      return "There's no contract attached to this step yet. Nothing here is waiting on you — whoever set this up needs to attach the document first.";
    case "not-a-pdf":
      return "The file attached to this step isn't a PDF, so I can't show it to you here. Tell whoever invited you and they can upload it again.";
    case "encrypted":
      return "That contract is password-protected, so I can't open it to show you. Whoever invited you will need to upload a copy without the password.";
    case "changed":
      return "Something about that document has changed since you started reading it, so I've stopped rather than let you sign a version you haven't seen. Tell whoever invited you.";
    case "no-such-page":
      return "That page isn't part of this document.";
    default:
      return "I can't open that contract. Tell whoever invited you — there's nothing you can do about this one from here.";
  }
}

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/joiner/contract/[stepId]">,
) {
  const joiner = await currentJoiner();
  if (!joiner) {
    return refuse(
      "This page has stopped recognising you. Open the link from your email again, or ask whoever invited you for a new one.",
      401,
    );
  }

  const { stepId } = await params;
  const step = contractStepOf(joiner, stepId.slice(0, MAX_ID));
  if (!step) return refuse("That one isn't yours to sign.", 404);

  const page = Number(new URL(request.url).searchParams.get("page") ?? "1");

  const result = await contractPage(
    joiner,
    step,
    page,
    originOf(request.headers),
  );
  if (!result.ok) {
    return refuse(
      sentenceFor(result.problem),
      result.problem === "no-such-page" ? 404 : 409,
    );
  }

  /* The bytes, not a redirect. `/api/joiner/documents/[id]` hands back a signed
     storage URL and is right to — it is serving a file that exists. This page
     does not exist until it is made, and it is made *because* somebody asked
     for it, which is the entire point: a redirect would move the delivery off
     this server and take the record of it with it.

     `inline` so the browser renders it in place rather than downloading a page
     at a time, and `no-store` so a back button re-asks rather than replaying a
     cached page and leaving the record short. */
  return new Response(new Uint8Array(result.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="page-${result.page}.pdf"`,
      "Cache-Control": "no-store",
      /* Nothing on this response is meant to be framed by anybody else's site,
         and a contract in a hidden iframe on a page somebody controls is the
         beginning of a clickjacked signature. */
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/joiner/contract/[stepId]">,
) {
  const joiner = await currentJoiner();
  if (!joiner) {
    return refuse(
      "This page has stopped recognising you. Open the link from your email again, or ask whoever invited you for a new one.",
      401,
    );
  }

  /* Keyed to the person rather than the address, for the reason the step route
     gives: two new starters behind one office router are two people. Not
     against the model budget — nothing here reaches OpenAI, and signing a
     contract must never be able to switch the chat off for everybody.

     Applied to signing and not to the page reads above it. This is one act per
     step per lifetime; the reads are however many pages the document has, and a
     limiter that stopped somebody reaching the end of their own contract would
     break the feature rather than protect anything. */
  const limit = await rateLimit(`contract-sign:${joiner.id}`, { spend: false });
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: limit.message },
      {
        status: 429,
        headers: limit.retryAfter
          ? { ...noStore, "Retry-After": String(limit.retryAfter) }
          : noStore,
      },
    );
  }

  const { stepId } = await params;
  const step = contractStepOf(joiner, stepId.slice(0, MAX_ID));
  if (!step) return refuse("That one isn't yours to sign.", 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse("That didn't arrive in one piece. Try it again.", 400);
  }

  const input = (body ?? {}) as Record<string, unknown>;

  const result = await signContract(
    joiner,
    step,
    {
      typedName: typeof input.typedName === "string" ? input.typedName : "",
      drawnSignature:
        typeof input.drawnSignature === "string" ? input.drawnSignature : null,
      /* Strictly `true`. A truthy string would mean a client could consent by
         accident, and consent by accident is not consent. The *wording* is
         never taken from the request at all — the server writes its own copy. */
      consented: input.consented === true,
    },
    originOf(request.headers),
  );

  if (!result.ok) {
    switch (result.problem) {
      case "already-signed":
        /* 409 rather than 200. Somebody double-clicking should be told their
           contract is already signed, not quietly handed a second one — and the
           screen turns this into the download rather than into a red box. */
        return refuse(
          "You've already signed this one. Reload the page and you'll find your copy on it.",
          409,
        );
      case "unread":
        return refuse(
          "There's still some of the document you haven't been shown. Page through to the end and the signing box will open.",
          400,
        );
      case "no-consent":
        return refuse(
          "Tick the box to say you're happy to sign this electronically, and then it'll go through.",
          400,
        );
      case "no-mark":
        return refuse(
          "Type your name or draw your signature — I need one of the two.",
          400,
        );
      case "storage":
        /* Carefully worded. Nothing was recorded — the row is only closed after
           the file lands — so this must say "try again" and must not imply
           either that they have signed or that they cannot. */
        return refuse(
          "I couldn't file your signed copy just then, so I haven't recorded the signature at all. Nothing's lost — have another go in a moment.",
          503,
        );
      default:
        return refuse(sentenceFor(result.problem), 409);
    }
  }

  /* The workflow moving, on the record as it is *after* the signature landed.
     Signing a contract can be what unblocks Craig's own next step — a Workspace
     account that waits for the paperwork is the ordinary shape of this — and the
     claim is taken synchronously here so a double submit finds it already
     claimed. Only the slow half is deferred, for the reason the step route
     gives: nobody should hold a connection open while somebody else's API
     creates a mailbox. */
  const settled = await getJoiner(joiner.id);
  if (settled) await fireNextAutomatedStep(settled, step.id, after);

  /* Deliberately not the signing record. It holds an IP address, a user agent
     and two seals, and none of that is a thing to hand a browser — the screen
     needs to know it worked and where its copy is, and it re-reads the page for
     the rest. */
  return NextResponse.json(
    { ok: true, signedAt: result.signing.signed_at },
    { headers: noStore },
  );
}
