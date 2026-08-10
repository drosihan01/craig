import { NextResponse } from "next/server";
import { currentUser } from "@/lib/craig/current-user";
import { exportAccount } from "@/lib/craig/export";

/**
 * Download everything this account holds.
 *
 * A `GET` that a link can point at, because the browser's own download is
 * better than anything built here: it streams, it survives a slow response,
 * and it puts the file where that person already keeps files.
 *
 * The account comes from the session and there is no parameter to name a
 * different one — the only export this route can produce is of whoever is
 * asking. That is the whole access check, and it is the one that cannot be
 * got wrong by a caller.
 *
 * `no-store`, because a file listing every joiner on a company is exactly the
 * response no cache should be keeping a copy of.
 */
export async function GET() {
  const session = await currentUser();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "You're not signed in." },
      { status: 401 },
    );
  }

  const data = await exportAccount(session.email);
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "There's no account on that address." },
      { status: 404 },
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const company = (session.name || "craig")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${company || "craig"}-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
