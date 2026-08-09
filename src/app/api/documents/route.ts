import { currentUser } from "@/lib/craig/current-user";
import {
  listDocuments,
  uploadDocument,
  type StoredDocument,
} from "@/lib/craig/documents";

/**
 * The employer's documents: what they have, and putting one there.
 *
 * `currentUser` rather than `currentJoiner`, and there is no joiner path on this
 * route at all. A new starter reads documents through their own door
 * (`/api/joiner/documents/[id]`), which can only ever resolve something their
 * employer has shared — see `documents.ts` for why the two are separate
 * functions rather than one with a flag.
 *
 * Uploads arrive as `multipart/form-data` rather than JSON. A base64 body would
 * cost a third of the size again in transit and would have to be held in memory
 * twice to decode; `FormData` is what a file input produces and what the
 * platform parses without help.
 */

/** What the bucket accepts. Checked here too, so the error is a sentence rather
    than a storage API's rejection surfacing three layers up. */
const ACCEPTED = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/rtf",
  "image/png",
  "image/jpeg",
]);

/** The same 25 MB the bucket is configured with. Two places, one number —
    checked here so an oversized file is refused before it is read into memory,
    and enforced there so this one being wrong is not the only thing standing
    between a bucket and a 2 GB upload. */
const MAX_BYTES = 25 * 1024 * 1024;

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const session = await currentUser();
  if (!session)
    return Response.json(
      { error: "Not signed in." },
      { status: 401, headers: noStore },
    );

  const documents = await listDocuments(session.email);
  return Response.json({ documents }, { headers: noStore });
}

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
      { error: "That file is larger than 25 MB." },
      { status: 413, headers: noStore },
    );

  /* The browser's word for what it is, which is a claim rather than a fact —
     the bucket checks it again, and neither of them opens the file. Worth being
     honest that this is a filter and not a scanner. */
  const contentType = file.type || "application/octet-stream";
  if (!ACCEPTED.has(contentType))
    return Response.json(
      { error: `Craig can’t take ${contentType || "that kind of file"} yet.` },
      { status: 415, headers: noStore },
    );

  /* The name is stored and shown, never used to build a path. `File.name` from
     a browser is already stripped of directories, but the storage path is built
     from uuids regardless — see `documents.ts`. Trimmed and capped so a
     thousand-character filename cannot make a listing unreadable. */
  const name = file.name.trim().slice(0, 200) || "Untitled";

  let document: StoredDocument;
  try {
    document = await uploadDocument(session.email, {
      name,
      contentType,
      bytes: await file.arrayBuffer(),
    });
  } catch (error) {
    console.error("Document upload failed", error);
    return Response.json(
      { error: "That didn’t save. Try again?" },
      { status: 500, headers: noStore },
    );
  }

  return Response.json({ document }, { status: 201, headers: noStore });
}
