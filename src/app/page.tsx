import { redirect } from "next/navigation";
import { SIGN_IN_PATH } from "@/lib/showcase/contract";

/**
 * The front door, which is the showcase.
 *
 * This used to be the original demo home — Ada Yildiz, a fixed company, people
 * who never existed — and it is archived at `/archive` rather than deleted,
 * because it is where a lot of the design was worked out. But it is not the
 * product: `/showcase` is the closest thing to production, and landing a
 * visitor in the archive means the first thing they see is the version with
 * nobody real in it.
 *
 * Sign-in rather than a page of our own, because sign-in already knows all
 * three answers: it sends a signed-in visitor on to their welcome, sends
 * anybody to sign-up when the showcase is empty, and otherwise asks for a
 * password. A separate landing page here would be a fourth place that has to
 * agree with those three.
 */
export default function Home() {
  redirect(SIGN_IN_PATH);
}
