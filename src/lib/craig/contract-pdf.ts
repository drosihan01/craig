import "server-only";

import {
  PDFDocument,
  PageSizes,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

/**
 * The paper half of signing: hashing what somebody was shown, handing it to
 * them a page at a time, and producing the artefact at the end.
 *
 * Split from `contract-signing.ts` on purpose. That file holds the rules — whose
 * contract this is, what counts as consent, what the evidence has to say — and
 * this one holds the only work in the feature that is genuinely about PDFs. The
 * two get confused otherwise: a rule expressed as a drawing operation is a rule
 * nobody finds, and a page layout mixed in with an access check is an access
 * check nobody re-reads.
 *
 * ## Three traps live in here, and all three are silent
 *
 * **pdf.js detaches the buffer it is handed.** `documents.ts` found this the
 * expensive way: extracting a PDF's text destroyed the PDF it extracted it from,
 * because after the call the original `ArrayBuffer` was a live object with a
 * `byteLength` of 0 — nothing threw, nothing warned, and the upload stored an
 * empty file. pdf-lib is not pdf.js and does not transfer ownership, but the
 * whole of this module is handed the *same* buffer that a hash is taken over and
 * that a signed copy is derived from, and a single library swap would put that
 * bug straight back. So every entry point below copies before parsing, and the
 * copy is cheap next to what it prevents.
 *
 * **The hash must be taken before anything else touches the bytes.** Not because
 * of the above, but because the hash is the evidence: it has to be of what came
 * out of storage, not of what a parser thought it saw. `sha256` is therefore
 * called on the raw download and nowhere else.
 *
 * **A standard PDF font cannot render most of the world's names.** Helvetica is
 * WinAnsi-encoded, so `drawText` *throws* on a character outside it — a
 * Vietnamese given name or a Chinese one takes the whole signing down with a
 * stack trace about encoding. Embedding a Unicode font means shipping a TTF and
 * `@pdf-lib/fontkit` to render a certificate, which is not a trade worth making
 * here. Instead every string is passed through `renderable()`, the exact text is
 * kept in the database where the evidence actually lives, and the certificate
 * says out loud when the two differ. See `renderable`.
 */

/* --- Hashing --------------------------------------------------------------- */

/**
 * SHA-256 of exactly these bytes, lower-case hex.
 *
 * Web Crypto rather than `node:crypto`, matching `session.ts`'s reasoning: both
 * runtimes have it, and this is the one function in the feature that might one
 * day be asked to run somewhere `node:crypto` is not.
 *
 * Hex rather than base64 because these end up printed on a certificate that
 * somebody may read out or type in, and base64 is case-sensitive in a way hex
 * is not.
 */
export async function sha256(
  /* Explicitly `Uint8Array<ArrayBuffer>` rather than a bare `Uint8Array`, which
     widens to `ArrayBufferLike` and therefore includes `SharedArrayBuffer` —
     which `crypto.subtle` refuses. `session.ts`'s `decode` carries the same
     annotation for the same reason. */
  bytes: ArrayBuffer | Uint8Array<ArrayBuffer>,
): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * A hash as somebody would read it aloud: four-character groups.
 *
 * Sixty-four unbroken hex characters on a page is a thing nobody checks. Grouped
 * it is a thing somebody can compare against another copy without losing their
 * place, which is the only purpose it has on the certificate. The stored value
 * is never grouped — this is presentation, and the comparison it exists to
 * enable is done by machine against the ungrouped form.
 */
export const readableHash = (hex: string) =>
  (hex.match(/.{1,4}/g) ?? [hex]).join(" ");

/* --- Reading the source ---------------------------------------------------- */

export interface SourcePdf {
  /** How many pages a person has to get through. */
  pageCount: number;
}

/**
 * What we can tell about the document before anybody is shown it, or why we
 * cannot.
 *
 * A union rather than a throw, because every one of these outcomes is something
 * a person has to be told in a sentence rather than a stack trace, and they need
 * different sentences. An encrypted PDF is somebody's fault and fixable; a
 * corrupt one is a different fix; and both are ordinary things to find in a
 * folder of employment paperwork.
 */
export type SourceResult =
  | { ok: true; source: SourcePdf }
  | { ok: false; reason: "encrypted" | "unreadable" | "empty" };

/**
 * Open the source document far enough to count its pages.
 *
 * `ignoreEncryption` is deliberately **not** set. pdf-lib will happily load an
 * encrypted document with that flag and then produce nonsense, and a contract
 * rendered as nonsense is worse than one that refuses to open: the person would
 * sign it anyway. A password-protected contract template is a real thing to
 * upload by accident and the honest answer is to say so.
 */
export async function readSource(bytes: ArrayBuffer): Promise<SourceResult> {
  if (bytes.byteLength === 0) return { ok: false, reason: "empty" };

  let document: PDFDocument;
  try {
    document = await PDFDocument.load(copyOf(bytes));
  } catch (cause) {
    /* pdf-lib throws a named error for encryption and assorted parse errors for
       everything else. Matched on the name rather than on the message, which is
       prose and changes between versions. */
    const name = cause instanceof Error ? cause.name : "";
    if (name === "EncryptedPDFError") return { ok: false, reason: "encrypted" };
    console.error("[contract] couldn't read that PDF:", cause);
    return { ok: false, reason: "unreadable" };
  }

  const pageCount = document.getPageCount();
  if (pageCount < 1) return { ok: false, reason: "unreadable" };

  return { ok: true, source: { pageCount } };
}

/**
 * One page of the document, on its own, as a PDF.
 *
 * **This is the mechanism that makes "they read it" a fact rather than a
 * claim.** The obvious way to show somebody a contract is to hand the browser
 * the whole file and listen for a scroll event, which produces evidence of
 * exactly one thing: that a script running on the signer's own machine said
 * they had scrolled. Serving one page per request moves the record to this side
 * of the wire — the server knows which pages it extracted and sent, and when,
 * because it did the work.
 *
 * Extraction rather than rasterising. Turning a page into an image would need a
 * canvas, which means a native binary in a serverless function — the same
 * dependency `documents.ts` refused for text extraction, for the same reason.
 * `copyPages` is pure JavaScript and keeps the page as a page: selectable text,
 * real fonts, and legible on a phone, none of which a PNG of a page is.
 *
 * The cost is honest and worth stating: the source is downloaded and parsed once
 * per page request rather than once per session. For a five-page contract that
 * is five reads of a file that is nearly always under a megabyte, against the
 * alternative of a cache that would have to be invalidated by something and
 * would be the thing that eventually served the wrong document.
 */
export async function extractPage(
  bytes: ArrayBuffer,
  /** One-based, as it is spoken and as it is shown. */
  page: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const source = await PDFDocument.load(copyOf(bytes));
    const total = source.getPageCount();
    if (page < 1 || page > total) return null;

    const single = await PDFDocument.create();
    const [copied] = await single.copyPages(source, [page - 1]);
    single.addPage(copied);

    /* Named so that a browser tab, a download and a print dialog all say which
       page of what this is, rather than "untitled". */
    single.setTitle(`Page ${page} of ${total}`);
    single.setProducer(PRODUCER);

    /* Re-wrapped rather than returned straight. pdf-lib's `save` is typed
       `Uint8Array<ArrayBufferLike>`, which includes `SharedArrayBuffer` and is
       therefore refused by `crypto.subtle` and by the storage client — the same
       widening `session.ts` annotates around. One copy, at the boundary, so no
       caller has to know. */
    return new Uint8Array(await single.save());
  } catch (cause) {
    console.error(`[contract] couldn't extract page ${page}:`, cause);
    return null;
  }
}

/* --- The artefact ---------------------------------------------------------- */

/** Everything the certificate states, gathered by the caller that can prove it. */
export interface CertificateFacts {
  /** The signing record's id. The one thing tying paper back to the row. */
  signingId: string;
  documentName: string;
  documentSha256: string;
  documentBytes: number;
  pageCount: number;

  signerName: string;
  /** The address their invitation was delivered to. The identity anchor. */
  signerEmail: string;
  company: string;

  /** ISO 8601, UTC, all of them. */
  openedAt: string;
  readAt: string | null;
  signedAt: string;

  pagesSeen: number;

  openIp: string | null;
  openUserAgent: string | null;
  signIp: string | null;
  signUserAgent: string | null;

  consentText: string;
  consentedAt: string;

  typedName: string | null;
  /** PNG bytes of what they drew, when they drew something. */
  drawnSignature: Uint8Array | null;

  /** HMAC over everything above, computed by the caller and printed verbatim. */
  recordSeal: string;
}

const PRODUCER = "Craig — in-app contract signing";

/**
 * The signed document: the original, unchanged, with the evidence appended.
 *
 * **Appended rather than stamped over.** The tempting thing is to find the
 * signature line and draw on it, the way DocuSign's anchor tags do. Craig cannot
 * do that honestly: it has no idea where the signature line is, and a guess that
 * lands a name across a clause is an alteration of the contract rather than a
 * signature on it. Every page of the original arrives here byte-identical in
 * content — the only mark made on them is a footer in the margin naming the
 * signing record, which is there so that a page photocopied on its own can still
 * be traced back to this. The signature and the certificate are new pages at the
 * end, which is also where a paper contract puts them.
 *
 * **Rebuilt rather than edited.** A new document with the source's pages copied
 * in, rather than loading the source and adding to it. That drops whatever the
 * original was carrying — form fields somebody could still type into, embedded
 * JavaScript, an outline pointing at pages that have moved — none of which
 * belongs in an artefact whose whole claim is that it is fixed. It also means
 * the output's metadata is ours and says what this is.
 *
 * What this does **not** do is apply a cryptographic PDF signature (PAdES, or
 * Acrobat's blue ribbon). That needs a certificate from an authority, which is
 * a commercial relationship rather than a line of code, and it is not what makes
 * an Australian employment contract enforceable. `contract-signing.ts` records
 * that gap in full rather than leaving it to be discovered.
 */
export async function stampSignedCopy(
  sourceBytes: ArrayBuffer,
  facts: CertificateFacts,
): Promise<Uint8Array<ArrayBuffer>> {
  const source = await PDFDocument.load(copyOf(sourceBytes));
  const out = await PDFDocument.create();

  const body = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);

  const pages = await out.copyPages(
    source,
    source.getPageIndices(),
  );
  for (const page of pages) out.addPage(page);

  /* One line in the margin of every original page, rotated up the left edge so
     it cannot sit on top of content whatever the layout is. It is the answer to
     the most ordinary version of a dispute: somebody produces page three, on its
     own, and there is nothing on it connecting it to a signature. */
  for (const page of out.getPages()) {
    const { height } = page.getSize();
    page.drawText(
      renderable(`Signed in Craig · ${facts.signingId}`).text,
      {
        x: 14,
        y: Math.max(24, height / 2 - 90),
        size: 6,
        font: body,
        color: rgb(0.55, 0.55, 0.58),
        rotate: degrees(90),
      },
    );
  }

  drawSignaturePage(out, facts, body, bold, await drawnImage(out, facts));
  drawCertificate(out, facts, body, bold);

  out.setTitle(`${renderable(facts.documentName).text} — signed`);
  out.setAuthor(renderable(facts.company).text);
  out.setSubject(
    `Signed electronically by ${renderable(facts.signerName).text} on ${facts.signedAt}`,
  );
  out.setProducer(PRODUCER);
  out.setCreator(PRODUCER);
  /* Both timestamps are the moment of signing rather than "now". Two runs of
     this function over the same facts should differ only where the facts do —
     otherwise the output hash is a function of the clock, and "is this the file
     we stored" stops being answerable by regenerating it. */
  const signedAt = new Date(facts.signedAt);
  out.setCreationDate(signedAt);
  out.setModificationDate(signedAt);

  /* Copied at the boundary for the reason `extractPage` gives: the hash of
     these bytes is the evidence, and `crypto.subtle` will not take the type
     pdf-lib hands back. */
  return new Uint8Array(await out.save());
}

/**
 * What they drew, embedded, or nothing.
 *
 * Failure is `null` rather than a throw, and the caller carries on. The drawn
 * mark is the *decorative* half of a signature — the typed name, the consent,
 * the audit row and the hashes are the half that means anything — so a PNG this
 * cannot decode must not be allowed to lose an otherwise complete signing. The
 * database still records that something was drawn, so the two can be compared
 * if it ever matters.
 */
async function drawnImage(out: PDFDocument, facts: CertificateFacts) {
  if (!facts.drawnSignature) return null;
  try {
    return await out.embedPng(facts.drawnSignature);
  } catch (cause) {
    console.error("[contract] couldn't embed the drawn signature:", cause);
    return null;
  }
}

const A4 = PageSizes.A4;
const MARGIN = 56;

/** The page a person would recognise as the signature page. */
function drawSignaturePage(
  out: PDFDocument,
  facts: CertificateFacts,
  body: PDFFont,
  bold: PDFFont,
  drawn: Awaited<ReturnType<PDFDocument["embedPng"]>> | null,
) {
  const page = out.addPage([A4[0], A4[1]]);
  const width = A4[0];
  let y = A4[1] - MARGIN;

  y = heading(page, "Signed electronically", bold, y);
  y -= 6;
  y = paragraph(
    page,
    `${facts.documentName}`,
    body,
    11,
    y,
    width - MARGIN * 2,
    rgb(0.35, 0.35, 0.4),
  );

  y -= 28;

  /* A ruled box, because that is what a signature block looks like and this
     page is read by people rather than by us. Its height is fixed whether or
     not anything was drawn in it, so a typed-only signing does not produce a
     page with a different shape that reads as a different kind of document. */
  const boxHeight = 128;
  page.drawRectangle({
    x: MARGIN,
    y: y - boxHeight,
    width: width - MARGIN * 2,
    height: boxHeight,
    borderColor: rgb(0.8, 0.8, 0.84),
    borderWidth: 1,
  });

  if (drawn) {
    /* Scaled to fit rather than to fill, and never enlarged. A signature drawn
       small on a phone blown up to the width of the box is a different-looking
       mark from the one they made. */
    const maxWidth = width - MARGIN * 2 - 40;
    const maxHeight = 64;
    const scale = Math.min(
      maxWidth / drawn.width,
      maxHeight / drawn.height,
      1,
    );
    page.drawImage(drawn, {
      x: MARGIN + 20,
      y: y - 24 - drawn.height * scale,
      width: drawn.width * scale,
      height: drawn.height * scale,
    });
  }

  if (facts.typedName) {
    const typed = renderable(facts.typedName);
    page.drawText(typed.text, {
      x: MARGIN + 20,
      y: y - boxHeight + 46,
      size: 20,
      font: bold,
      color: rgb(0.1, 0.1, 0.12),
    });
  }

  page.drawLine({
    start: { x: MARGIN + 20, y: y - boxHeight + 36 },
    end: { x: width - MARGIN - 20, y: y - boxHeight + 36 },
    thickness: 0.75,
    color: rgb(0.8, 0.8, 0.84),
  });

  page.drawText(
    renderable(`${facts.signerName} · ${facts.signerEmail}`).text,
    {
      x: MARGIN + 20,
      y: y - boxHeight + 20,
      size: 9,
      font: body,
      color: rgb(0.4, 0.4, 0.45),
    },
  );

  y -= boxHeight + 28;

  /* The consent, in full, on the page a person actually looks at — not only in
     the certificate behind it. Somebody handed this document in a dispute
     should be able to read what was agreed to without being pointed at an
     appendix. */
  y = label(page, "What they agreed to", bold, y);
  y = paragraph(
    page,
    `"${facts.consentText}"`,
    body,
    10,
    y,
    width - MARGIN * 2,
    rgb(0.25, 0.25, 0.3),
  );

  y -= 18;
  y = label(page, "When", bold, y);
  y = paragraph(
    page,
    `Agreed and signed at ${facts.signedAt} (UTC).`,
    body,
    10,
    y,
    width - MARGIN * 2,
    rgb(0.25, 0.25, 0.3),
  );

  footer(
    page,
    body,
    `Signing record ${facts.signingId} · certificate of completion overleaf`,
  );
}

/**
 * The page somebody would hand a lawyer.
 *
 * Everything on it is a fact this server observed, and it is laid out as
 * label-and-value rows rather than prose because it is read by somebody looking
 * for one line. What is deliberately *not* here is any claim about what the
 * signing means — no "legally binding", no citation, no reassurance. This
 * product does not get to grade its own evidence; it gets to record what
 * happened, precisely, and let whoever is arguing about it do the rest.
 */
function drawCertificate(
  out: PDFDocument,
  facts: CertificateFacts,
  body: PDFFont,
  bold: PDFFont,
) {
  const width = A4[0];
  const usable = width - MARGIN * 2;

  let page = out.addPage([A4[0], A4[1]]);
  let y = A4[1] - MARGIN;

  y = heading(page, "Certificate of completion", bold, y);
  y -= 4;
  y = paragraph(
    page,
    "Produced by Craig at the moment of signing. Every value below was recorded by the server that served the document.",
    body,
    9,
    y,
    usable,
    rgb(0.45, 0.45, 0.5),
  );
  y -= 16;

  const typed = facts.typedName ? renderable(facts.typedName) : null;

  const rows: [string, string][] = [
    ["Signing record", facts.signingId],
    ["Document", facts.documentName],
    ["Document SHA-256", readableHash(facts.documentSha256)],
    ["Document size", `${facts.documentBytes} bytes, ${facts.pageCount} page(s)`],
    ["Signer", facts.signerName],
    ["Invitation delivered to", facts.signerEmail],
    ["Employer", facts.company],
    /* Stated rather than omitted. The contract block has a "Who countersigns"
       field, so somebody reading this certificate has every reason to expect a
       second signature and the honest answer is that there isn't one: Craig
       captures the new starter's signature and no other. Leaving the line out
       would let the absence read as an oversight in the record rather than a
       limit of the product. */
    [
      "Countersignature",
      "Not part of this record. Craig's in-app signing captures one signer.",
    ],
    [
      "How the signer was identified",
      "A per-person HMAC-signed link, issued by this server and delivered only to the address above. Possession of that link is what resolved this session; no identifier in any request named the signer.",
    ],
    ["Opened", facts.openedAt],
    [
      "Pages served to the signer",
      `${facts.pagesSeen} of ${facts.pageCount}${
        facts.readAt ? `, last at ${facts.readAt}` : ""
      }`,
    ],
    ["Signed", facts.signedAt],
    ["Consent recorded", facts.consentedAt],
    ["Consent wording", facts.consentText],
    ["Typed name", typed ? typed.text : "Not typed"],
    ["Drawn signature", facts.drawnSignature ? "Yes" : "No"],
    ["IP when opened", facts.openIp ?? "Not recorded"],
    ["Device when opened", facts.openUserAgent ?? "Not recorded"],
    ["IP when signed", facts.signIp ?? "Not recorded"],
    ["Device when signed", facts.signUserAgent ?? "Not recorded"],
    ["Record seal (HMAC-SHA256)", readableHash(facts.recordSeal)],
  ];

  /* Said only when it is true, and it has to be said when it is: the name on
     the signature page has been rendered without characters this font cannot
     encode, and the exact string somebody typed is in the record. Silently
     printing a mangled name on a signature page would be the worst kind of
     small lie. */
  if (typed?.lossy) {
    rows.push([
      "Note on the typed name",
      "Some characters cannot be drawn by this document's font and were replaced. The exact text as typed is held in the signing record and is covered by the seal above.",
    ]);
  }

  const labelWidth = 150;
  for (const [name, value] of rows) {
    const lines = wrap(renderable(value).text, body, 9, usable - labelWidth - 12);
    const blockHeight = Math.max(lines.length * 12, 12) + 8;

    if (y - blockHeight < MARGIN + 30) {
      footer(page, body, `Signing record ${facts.signingId}`);
      page = out.addPage([A4[0], A4[1]]);
      y = A4[1] - MARGIN;
    }

    page.drawText(renderable(name).text, {
      x: MARGIN,
      y: y - 9,
      size: 8,
      font: bold,
      color: rgb(0.45, 0.45, 0.5),
    });

    let lineY = y - 9;
    for (const line of lines) {
      page.drawText(line, {
        x: MARGIN + labelWidth,
        y: lineY,
        size: 9,
        font: body,
        color: rgb(0.1, 0.1, 0.12),
      });
      lineY -= 12;
    }

    y -= blockHeight;
  }

  y -= 10;
  y = label(page, "What this certificate does not claim", bold, y);
  paragraph(
    page,
    "There is no timestamp from a trusted third party on this document and no certificate from a public authority inside it. The seal above is an HMAC held by this server: it proves the record has not been altered by anybody without that key, and it proves nothing against whoever holds it. What is independently checkable by anybody is the document hash — recompute it over the original file and it either matches this page or it does not.",
    body,
    9,
    y,
    usable,
    rgb(0.35, 0.35, 0.4),
  );

  footer(page, body, `Signing record ${facts.signingId}`);
}

/* --- Small drawing helpers -------------------------------------------------- */

function heading(page: PDFPage, text: string, font: PDFFont, y: number) {
  page.drawText(renderable(text).text, {
    x: MARGIN,
    y: y - 20,
    size: 20,
    font,
    color: rgb(0.06, 0.06, 0.08),
  });
  return y - 32;
}

function label(page: PDFPage, text: string, font: PDFFont, y: number) {
  page.drawText(renderable(text).text.toUpperCase(), {
    x: MARGIN,
    y: y - 8,
    size: 8,
    font,
    color: rgb(0.45, 0.45, 0.5),
  });
  return y - 20;
}

function paragraph(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  y: number,
  width: number,
  color: ReturnType<typeof rgb>,
) {
  const lines = wrap(renderable(text).text, font, size, width);
  let cursor = y;
  for (const line of lines) {
    page.drawText(line, { x: MARGIN, y: cursor - size, size, font, color });
    cursor -= size + 4;
  }
  return cursor;
}

function footer(page: PDFPage, font: PDFFont, text: string) {
  page.drawText(renderable(text).text, {
    x: MARGIN,
    y: 32,
    size: 7,
    font,
    color: rgb(0.6, 0.6, 0.64),
  });
}

/**
 * Break a string to a width, measuring rather than counting characters.
 *
 * `widthOfTextAtSize` is the font's own metrics, which is the only thing that
 * knows an "i" is not an "m". A character count would overflow the page on a
 * hash and waste half of it on prose.
 *
 * Long unbroken runs — a hash, a user agent — are cut mid-token rather than
 * allowed to run off the page, because on this document a truncated user agent
 * is a worse outcome than an ugly line break.
 */
function wrap(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
): string[] {
  const lines: string[] = [];
  let line = "";

  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
      continue;
    }

    if (line) lines.push(line);

    if (font.widthOfTextAtSize(word, size) <= width) {
      line = word;
      continue;
    }

    let chunk = "";
    for (const character of word) {
      if (font.widthOfTextAtSize(chunk + character, size) > width) {
        lines.push(chunk);
        chunk = character;
      } else {
        chunk += character;
      }
    }
    line = chunk;
  }

  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

/**
 * A string a standard PDF font can actually draw, and whether anything was lost.
 *
 * `drawText` throws on any character outside WinAnsi, so this is not a
 * nicety — without it, a name with a Vietnamese diacritic in it takes down the
 * whole signing, after the money shot, with an exception about encoding.
 *
 * The curly quotes and dashes are mapped rather than replaced because they are
 * everywhere in copy written by people and their ASCII equivalents read
 * identically at nine point. Everything else becomes a question mark and sets
 * `lossy`, which the certificate says out loud. The exact text always survives
 * in the database, under the seal — this is a rendering, and the record is the
 * record.
 */
export function renderable(value: string): { text: string; lossy: boolean } {
  let lossy = false;

  const mapped = value
    .replace(/[‘’‚‹›]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    /* Control characters would be drawn as whatever the font has at that code
       point, which is nothing useful and occasionally a box. */
    .replace(/\p{Cc}/gu, " ");

  const text = [...mapped]
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      /* WinAnsi is a superset of Latin-1's printable range with a handful of
         extras in 0x80-0x9F that are not worth enumerating: printable ASCII
         plus Latin-1 covers every name this can render and nothing it cannot. */
      if (code === 0x20 || (code >= 0x21 && code <= 0x7e)) return character;
      if (code >= 0xa1 && code <= 0xff) return character;
      lossy = true;
      return "?";
    })
    .join("");

  return { text, lossy };
}

/**
 * A copy of a buffer, for handing to a parser.
 *
 * `slice(0)` rather than a `Uint8Array` view: a view shares the buffer, which is
 * exactly what the detaching bug needed to do its damage. This costs one
 * allocation per parse and removes a whole class of bug that reports itself as a
 * zero-byte file with no error anywhere. See this module's header.
 */
const copyOf = (bytes: ArrayBuffer) => new Uint8Array(bytes.slice(0));
