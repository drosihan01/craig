import { currentUser } from "@/lib/craig/current-user";
import { removeAccountLogo, saveAccountLogo } from "@/lib/craig/accounts";
import { sniffLogo } from "@/lib/craig/logo-image";

/**
 * The company's logo: putting one on the account, and taking it off.
 *
 * Two methods and no `GET`. The only screen that needs to know whether there is
 * a logo is Settings, which is server-rendered and reads the account directly —
 * and the picture itself already has a URL that anybody can fetch, which is the
 * entire point of the feature. A read endpoint here would be a third way to ask
 * a question that already has two answers.
 *
 * `currentUser` and nothing else. A logo is a fact about an employer's account,
 * so there is no joiner path on this route and no id in it: whose logo is being
 * changed comes from the session and can come from nowhere else. That is why
 * there is no `[id]` segment — an account id in a URL is a thing somebody can
 * edit, and the only correct answer to "change *that* account's logo" is a
 * question nobody can ask.
 *
 * Uploads arrive as `multipart/form-data`, the same as `/api/documents`: it is
 * what a file input produces and what the platform parses without help, and a
 * base64 body would cost a third again in transit to be decoded back.
 */

/**
 * Two megabytes, and the bucket is configured with the same number.
 *
 * Generous for what this is. A logo drawn to be shown at 32 pixels tall does
 * not need to be big — a 400px-wide PNG is typically well under 50 KB, and 2 MB
 * is room for somebody to upload the print-resolution version without being
 * told off. It is checked here so an oversized file is refused before it is read
 * into memory, and enforced on the bucket so this number being wrong is not the
 * only thing standing between a public bucket and a 2 GB upload.
 */
const MAX_BYTES = 2 * 1024 * 1024;

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const session = await currentUser();
  if (!session)
    return Response.json(
      { error: "Not signed in." },
      { status: 401, headers: noStore },
    );

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: "Expected a file upload." },
      { status: 400, headers: noStore },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File))
    return Response.json(
      { error: "No file in that upload." },
      { status: 400, headers: noStore },
    );

  if (file.size === 0)
    return Response.json(
      { error: "That file is empty." },
      { status: 400, headers: noStore },
    );

  if (file.size > MAX_BYTES)
    return Response.json(
      {
        error:
          "That image is larger than 2 MB. A logo is drawn about 32 pixels tall in an email, so a version a few hundred pixels wide is plenty.",
      },
      { status: 413, headers: noStore },
    );

  /* Read once, then decided by its own first bytes.
   *
   * Note what is *not* consulted: `file.type` and `file.name`. The declared type
   * is the browser's guess from the extension and the extension is whatever
   * somebody typed, and neither is worth anything here — this file is about to
   * be served from a public URL of ours, so what it actually is has to be a
   * fact rather than a claim. `sniffLogo` reads the header, and what it returns
   * is what the bucket is told to serve it as.
   *
   * The extension is not used to build the path either. See `accounts.ts`: the
   * object name is two uuids and the extension the sniffer chose, so a filename
   * of `../../evil.png` or somebody's email address never becomes part of a URL
   * we publish. */
  const bytes = await file.arrayBuffer();
  const sniffed = sniffLogo(bytes);

  if (!sniffed.ok)
    return Response.json(
      { error: sniffed.message },
      /* 415 rather than 400: the request was well-formed and the thing inside
         it is the problem, which is the distinction between "you asked wrong"
         and "we don't take that". */
      { status: 415, headers: noStore },
    );

  const saved = await saveAccountLogo(session.email, {
    image: sniffed.image,
    bytes,
  });

  if (!saved.ok)
    return Response.json(
      { error: saved.message },
      { status: 500, headers: noStore },
    );

  /* The resolved logo back, so the screen can draw the new one without a round
     trip — and the *resolved* one rather than the path, because the URL is
     assembled in exactly one place and a second assembly in the browser would
     be a second thing to get wrong. */
  return Response.json({ logo: saved.account.logo }, { status: 201, headers: noStore });
}

/**
 * Take it off — out of the account and out of the bucket.
 *
 * Worth being plain about what this cannot undo: mail that has already gone out
 * points at the object by URL, so removing it turns the letterhead on those
 * messages into a broken image rather than into nothing. That is the price of
 * the URL being public and reachable without a session, which is the same
 * property that makes it work at all. The alternative — leaving the object
 * where it is — would mean a company that cannot actually withdraw its own
 * mark, which is worse.
 */
export async function DELETE() {
  const session = await currentUser();
  if (!session)
    return Response.json(
      { error: "Not signed in." },
      { status: 401, headers: noStore },
    );

  const removed = await removeAccountLogo(session.email);

  if (!removed.ok)
    return Response.json(
      { error: removed.message },
      { status: 500, headers: noStore },
    );

  return Response.json({ logo: null }, { headers: noStore });
}
