import { requireUser } from "@/lib/craig/current-user";
import { listDocuments } from "@/lib/craig/documents";
import { ResourcesScreen, type ResourceRow } from "./resources-screen";

export const metadata = {
  title: "Resources — Craig",
};

/**
 * The company's documents, and who may read them.
 *
 * `requireUser()` for the reason every page in `(app)` has one: the proxy is a
 * matcher that only ever sees a cookie, and this is the check that knows whether
 * the account behind it still exists.
 *
 * The list is read here and handed down flattened, matching `/people`. What the
 * screen needs is a name, a size in words, one switch, and the two raw values it
 * puts the list in order by; the storage path is the server's business and never
 * travels — a path is the one field on this row that would tell a browser
 * something about how the bucket is laid out.
 *
 * The session travels too, and only so the shell can draw the account cell at
 * the foot of the nav. That is the same trip `people/page.tsx` makes for the
 * same reason: `AppShell` is a client component, so the one piece of the frame
 * that knows who is signed in has to be handed across the boundary rather than
 * read on the far side of it. Nothing else about `user` reaches the browser —
 * the documents were already filtered to this account by the query above, which
 * is where that check belongs.
 */
export default async function ResourcesPage() {
  const user = await requireUser();
  const documents = await listDocuments(user.email);

  /* Two of these travel twice, formatted and raw. The reason is on
     `ResourceRow`: the words are what the row draws, and neither set of words
     can be put in order. */
  const rows: ResourceRow[] = documents.map((document) => ({
    id: document.id,
    name: document.name,
    kind: KINDS[document.contentType] ?? "File",
    contentType: document.contentType,
    size: readableSize(document.sizeBytes),
    shared: document.visibility === "shared",
    uploadedOn: readableDay(document.uploadedAt),
    sizeBytes: document.sizeBytes,
    uploadedAt: document.uploadedAt,
  }));

  return <ResourcesScreen user={user} rows={rows} />;
}

/**
 * The same two lookups `/me` does, and deliberately a second copy.
 *
 * They are not shared because they are not the same decision: this list is read
 * by somebody administering documents, and the joiner's is read by somebody in
 * their first week. The words are identical today and the reason to change one
 * will not be a reason to change the other — a shared helper here would make
 * the next wording change on one screen silently rewrite the other.
 */
const KINDS: Record<string, string> = {
  "application/pdf": "PDF",
  "text/plain": "Text",
  "text/markdown": "Text",
  "application/msword": "Word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "Word",
  "application/rtf": "Word",
  "image/png": "Image",
  "image/jpeg": "Image",
};

function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * A timestamp as the day it happened.
 *
 * Formatted on the server for the reason every date in this product is: an ISO
 * instant formatted during render is formatted twice, in two timezones, and
 * either side of midnight those are different days.
 */
function readableDay(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}
