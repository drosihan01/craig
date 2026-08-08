import { AFTER_SIGN_IN } from "./contract";

/**
 * Where to send someone after they get in.
 *
 * `?next=` comes from a query string, which is to say from anyone who can get
 * someone to click a link. Only a same-origin absolute path survives: `//host`
 * and `/\host` are both protocol-relative URLs that browsers will happily leave
 * the site for, and an auth page that redirects off-origin on success is a
 * phishing page with our name on it.
 *
 * Shared by sign-in and sign-up because both of them end in a redirect the user
 * didn't choose, and a check that only one of two doors performs is a check
 * that will be missed at exactly the wrong door.
 */
export function safeNext(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !value.startsWith("/")) return AFTER_SIGN_IN;
  if (value.startsWith("//") || value.startsWith("/\\")) return AFTER_SIGN_IN;
  return value;
}
