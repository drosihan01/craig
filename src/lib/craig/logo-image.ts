/**
 * What a company just uploaded, decided by reading the file rather than by
 * believing anybody about it.
 *
 * ## Why the bytes and not the `Content-Type`
 *
 * The declared type on a multipart part is whatever the browser guessed from
 * the extension, and the extension is whatever the person typed. Neither is
 * evidence. The one that matters here is the *reverse* of the usual worry: the
 * bucket this file ends up in is public-read and served over `https://` from an
 * origin, so a file that says `image/png` and is in fact an HTML document or an
 * SVG with a `<script>` in it would be a stored cross-site script with a
 * permanent address. Reading the first bytes is what makes the stored type a
 * fact. It costs a few array accesses and it is the difference between a filter
 * and a check.
 *
 * Supabase Storage is told the sniffed type too, so the `Content-Type` the
 * bucket serves comes from the file's own header and never from the request.
 *
 * ## Why the dimensions come out at the same time
 *
 * Because they are three fields further into the same header, and because the
 * email needs them. An `<img>` in an email has to carry an explicit size —
 * Outlook renders through Word, which scales an unsized image by the machine's
 * DPI setting — and the only honest way to pick one is to know the picture's
 * own. Measuring here means it is measured once, at upload, by the same pass
 * that decides whether the file is an image at all; the alternative is decoding
 * the picture in a browser and trusting a number that arrived in a form field.
 *
 * ## What is deliberately not accepted
 *
 * **SVG.** It is an XML document, it may contain `<script>` and external
 * references, and this bucket is public and served from a URL we hand out — so
 * an accepted SVG is a script we host on somebody's behalf, addressable for
 * ever. The `<img>` element would not execute it, but nothing stops a person
 * opening the URL directly, and "safe in the one context we happened to think
 * of" is not a property worth relying on. Sanitising SVG properly is a library
 * and a standing obligation to keep up with the bypasses. It is also moot:
 * almost no mail client renders SVG, so an accepted one would be a broken logo
 * in the very place this feature exists for.
 *
 * **WebP.** No security argument at all — it is refused because it does not
 * work where it has to. Outlook on Windows draws through Word's engine, which
 * has never rendered WebP, so a WebP logo arrives as a broken image for a large
 * share of the people these emails are written for. Accepting it would mean the
 * upload screen says yes and the inbox says no, which is the worst place to put
 * a disagreement.
 *
 * **GIF.** Nobody's logo is a GIF, and an animated one in a header is a
 * decision this product should not make silently on a company's behalf.
 *
 * Each of those gets its own sentence back rather than one generic refusal,
 * because "export it as a PNG" is advice somebody can act on in ten seconds and
 * "unsupported file type" is not.
 */

/** The two types that are stored, and the extension each one is saved under. */
export type LogoContentType = "image/png" | "image/jpeg";

export interface SniffedLogo {
  /** The type the file actually is, which is what the bucket is told. */
  contentType: LogoContentType;
  /** Without the dot. Only ever `png` or `jpg`. */
  extension: "png" | "jpg";
  /** Pixels, from the file's own header. */
  width: number;
  height: number;
}

export type SniffResult =
  | { ok: true; image: SniffedLogo }
  /** Safe to show a customer, and specific enough to act on. */
  | { ok: false; message: string };

const refuse = (message: string): SniffResult => ({ ok: false, message });

/** ASCII only, and only ever used on bytes already checked to be in range. */
function ascii(view: Uint8Array, at: number, length: number): string {
  let out = "";
  for (let i = at; i < at + length && i < view.length; i += 1) {
    out += String.fromCharCode(view[i]);
  }
  return out;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * PNG says its own size in the first chunk, and the standard requires that
 * chunk to be first — so this is a fixed-offset read rather than a walk.
 *
 * The `IHDR` check is not ceremony. The eight-byte signature is what makes it a
 * PNG; the chunk type is what makes bytes 16–23 the width and the height rather
 * than whatever a hand-built file put there. Both dimensions are big-endian
 * 32-bit, which is why they are assembled by hand: a `DataView` would do it,
 * and this is four lines with nothing to get wrong about byte order.
 */
function png(view: Uint8Array): SniffResult {
  if (view.length < 24) {
    return refuse("That PNG is truncated — it stops before it says how big it is. Try exporting it again.");
  }

  if (ascii(view, 12, 4) !== "IHDR") {
    return refuse("That file starts like a PNG and isn't one. Export the logo again from wherever it came from.");
  }

  const read = (at: number) =>
    ((view[at] << 24) | (view[at + 1] << 16) | (view[at + 2] << 8) | view[at + 3]) >>> 0;

  return sized("image/png", "png", read(16), read(20));
}

/**
 * Every marker that carries a frame header, and therefore a size.
 *
 * A JPEG's dimensions live in its "start of frame" segment, and there are
 * thirteen of those because there are thirteen encodings — baseline, extended,
 * progressive, lossless, arithmetic-coded variants of each. Photoshop writes
 * `C0`, phone cameras write `C2`, and a logo saved by something unusual can
 * legitimately be any of them. The three gaps in the run (`C4`, `C8`, `CC`) are
 * not frame headers at all — they are the Huffman table, a reserved extension
 * and the arithmetic-coding table — and reading a width out of one of those
 * would produce a plausible number from unrelated bytes, which is the failure
 * that never announces itself.
 */
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/**
 * JPEG has to be walked, because the frame header sits after however much
 * metadata the exporter felt like writing — a colour profile and an EXIF block
 * are routinely tens of kilobytes.
 *
 * The loop is the standard segment walk and its two edge cases are both real
 * files rather than theory: a run of `FF` padding bytes between segments is
 * legal, and the standalone markers (`D0`–`D7`, `01`) have no length field, so
 * skipping two bytes plus "the length" would read a length out of the next
 * marker and desynchronise the walk. Anything it cannot make sense of ends the
 * loop and is refused, rather than being guessed at.
 */
function jpeg(view: Uint8Array): SniffResult {
  let at = 2;

  while (at + 1 < view.length) {
    if (view[at] !== 0xff) {
      return refuse("That JPEG doesn't read as one — the file looks damaged. Try exporting it again.");
    }

    /* Fill bytes. `FF FF FF C0` is a legal way to write `FF C0`. */
    let marker = view[at + 1];
    while (marker === 0xff && at + 2 < view.length) {
      at += 1;
      marker = view[at + 1];
    }

    /* No payload, no length field. `D9` is end-of-image and `DA` is the start
       of the compressed data, past which there is no header left to find. */
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;

    if (at + 3 >= view.length) break;
    const length = (view[at + 2] << 8) | view[at + 3];
    if (length < 2) break;

    if (SOF_MARKERS.has(marker)) {
      /* Inside the segment: one byte of sample precision, then height, then
         width, both big-endian 16-bit. Height first, which is the wrong way
         round from every other format and is exactly the sort of thing that
         gets silently transposed. */
      if (at + 9 > view.length) break;
      const height = (view[at + 5] << 8) | view[at + 6];
      const width = (view[at + 7] << 8) | view[at + 8];
      return sized("image/jpeg", "jpg", width, height);
    }

    at += 2 + length;
  }

  return refuse("That JPEG doesn't say how big it is, so there's no way to size it in an email. Try exporting it again, or send a PNG.");
}

/** The last gate, shared by both formats: a picture with no area is not one. */
function sized(
  contentType: LogoContentType,
  extension: "png" | "jpg",
  width: number,
  height: number,
): SniffResult {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return refuse("That image says it has no width or height, so it can't be drawn. Try exporting it again.");
  }
  return { ok: true, image: { contentType, extension, width, height } };
}

/**
 * What this file is, or why it isn't going anywhere.
 *
 * Ordered by how the formats identify themselves, and the two accepted ones
 * come first so that the common path is two comparisons. Everything after them
 * exists only to turn "no" into a sentence worth reading.
 */
export function sniffLogo(bytes: ArrayBuffer): SniffResult {
  const view = new Uint8Array(bytes);

  if (view.length < 12) {
    return refuse("That file is too small to be an image.");
  }

  if (PNG_SIGNATURE.every((byte, index) => view[index] === byte)) {
    return png(view);
  }

  if (view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff) {
    return jpeg(view);
  }

  /* RIFF containers name their own payload four bytes in. */
  if (ascii(view, 0, 4) === "RIFF" && ascii(view, 8, 4) === "WEBP") {
    return refuse("WebP won't work here. Outlook draws email through Word, which has never rendered WebP, so the logo would arrive broken for a lot of the people this is sent to. Export it as a PNG.");
  }

  if (ascii(view, 0, 3) === "GIF") {
    return refuse("Craig doesn't take GIFs for a logo — an animation in the header of a welcome email isn't a decision to make on your behalf. Export it as a PNG or a JPEG.");
  }

  /* SVG is text, and its first non-space characters are either the XML
     declaration or the root element — but a file exported by a Windows tool
     usually opens with a UTF-8 byte-order mark and a newline before either.
     `ascii` maps bytes one-for-one, so the BOM arrives here as its three raw
     bytes rather than as U+FEFF; stripping those and then the whitespace is
     what stops a perfectly ordinary SVG walking straight past this check. */
  const head = ascii(view, 0, Math.min(view.length, 256))
    .replace(/^\u00ef\u00bb\u00bf/, "")
    .trimStart()
    .toLowerCase();
  if (head.startsWith("<?xml") || head.startsWith("<svg")) {
    return refuse("Craig doesn't take SVG logos. An SVG is a document that can carry script, and this one would be served from a public address of ours — and most mail clients don't draw SVG anyway, so it would come out blank. Export it as a PNG, ideally about 400 pixels wide.");
  }

  return refuse("That isn't a PNG or a JPEG. Those are the two that every mail client can draw — export your logo as one of them and try again.");
}
