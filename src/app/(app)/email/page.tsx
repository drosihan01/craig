import { requireUser } from "@/lib/craig/current-user";
import { EmailScreen } from "./email-screen";

export const metadata = {
  title: "Mailmaker — Craig",
  /* An internal tool. Nothing about it belongs in a search index. */
  robots: { index: false, follow: false },
};

/**
 * The mailmaker, behind the same door as everything else.
 *
 * A server wrapper around a client screen, for the guard and only the guard —
 * the same shape `/me` and `/people` use. `requireUser()` has to run somewhere
 * that can redirect, and the screen itself is `"use client"` because it is a
 * live preview with form state in it.
 *
 * This lived outside the router until now, which is why it needed no guard: it
 * was served to nobody. Giving it a URL is what makes the guard necessary, and
 * doing both in one change is deliberate — a route that is reachable for even
 * one deploy before it is guarded is a route somebody can find.
 */
export default async function EmailPage() {
  await requireUser();
  return <EmailScreen />;
}
