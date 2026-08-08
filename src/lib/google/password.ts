import "server-only";

/**
 * The temporary password a new starter is handed with their seat.
 *
 * It exists for one journey: it goes into a welcome email, somebody types it
 * once, and Google immediately makes them replace it because
 * `createUser` sets `changePasswordAtNextLogin`. That single constraint —
 * *a human retypes this exactly once, from an email, possibly on a phone* —
 * decides everything below.
 *
 * There is no `console` call in this file and there must never be one. The
 * value returned here is the only copy that will ever exist; Google's API
 * documents `password` as write-only and never returns it in a response
 * body. A `console.log` here would put a working credential for somebody's
 * work account into a log aggregator, permanently, and the person it belongs
 * to would never know.
 */

/**
 * The alphabet, with the confusable characters removed.
 *
 * No `O`/`0`, no `l`/`1`/`I`. Somebody is reading this off a screen and
 * typing it into a login box that will tell them nothing more useful than
 * "wrong password", and a capital I next to a lowercase l is a support
 * conversation. Removing six characters costs about half a bit each and buys
 * a password that can be read aloud down a phone line.
 *
 * The symbol set is small and deliberately boring: no quotes, no backslash,
 * no backtick, no space. Not because Google minds — it accepts them — but
 * because this string is going to be pasted into a terminal, a chat window
 * and an email by people who are debugging something else, and every one of
 * those has an opinion about a backslash.
 */
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!#$%*+-=?@^_";
const ALPHABET = LOWER + UPPER + DIGITS + SYMBOLS;

/**
 * Twenty characters.
 *
 * Google's own floor is eight and its ceiling is a hundred, but the floor is
 * not the constraint that matters: an administrator can raise the tenant's
 * minimum length, and can switch on a strength requirement that rejects
 * anything predictable. A generator that sat on the API's minimum would work
 * against a default tenant and fail against a hardened one — with a `400
 * invalid` that says nothing about length — and it would fail on the day
 * somebody tightened the policy, long after this code was written and
 * forgotten. Twenty characters from this alphabet is about 122 bits and
 * clears any policy Google lets an administrator set, while still being
 * something a person can retype once without hating us.
 */
const LENGTH = 20;

/**
 * A uniform index into `ALPHABET`, by rejection sampling.
 *
 * The obvious `bytes[i] % ALPHABET.length` is biased: 256 is not a multiple
 * of the alphabet size, so the first few characters come up slightly more
 * often than the rest. On one password that is invisible and on a million it
 * is a measurable weakness, and the honest fix is four lines — draw a byte,
 * throw it away if it falls in the short tail, draw again.
 *
 * The loop terminates with probability 1 and in practice after about one
 * extra draw in twenty; there is no unbounded work here in any realistic
 * sense. Bytes are drawn in blocks rather than one at a time because
 * `crypto.getRandomValues` is a syscall-shaped thing and a password needs a
 * couple of dozen of them.
 */
function randomIndex(limit: number, pool: () => number): number {
  const ceiling = 256 - (256 % limit);
  for (;;) {
    const byte = pool();
    if (byte < ceiling) return byte % limit;
  }
}

/** Refills in blocks of 64, which covers a whole password and its shuffle. */
function bytePool(): () => number {
  let buffer = new Uint8Array(0);
  let next = 0;
  return () => {
    if (next >= buffer.length) {
      buffer = crypto.getRandomValues(new Uint8Array(64));
      next = 0;
    }
    return buffer[next++];
  };
}

/**
 * A temporary password for a brand new Workspace account.
 *
 * One character is taken from each of the four classes before the rest are
 * filled in at random, then the whole thing is shuffled. The guarantee is
 * not about entropy — a purely random draw from the combined alphabet is
 * fractionally stronger — it is about determinism against a *policy*. A
 * tenant with "require a number and a symbol" switched on will reject a
 * password that happened not to contain one, and at twenty characters that
 * happens rarely enough to be a bug nobody can reproduce: a seat that fails
 * to be created for one new starter in a few hundred, on their first
 * morning, with a `400` that blames the request. Guaranteeing the classes
 * costs almost nothing and removes the whole class of failure.
 *
 * The shuffle is Fisher-Yates over the same unbiased source. Without it the
 * first four characters would always be lower, upper, digit, symbol in that
 * order, which is a pattern in every password this function has ever issued.
 */
export function temporaryPassword(): string {
  const pool = bytePool();
  const pick = (set: string) => set[randomIndex(set.length, pool)];

  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < LENGTH) chars.push(pick(ALPHABET));

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, pool);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}
