import "server-only";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  ADMIN_TICK_PRESETS,
  AUTOMATION_BY_PRESET,
  JOINER_FIELD_BY_PRESET,
  type Joiner,
  type JoinerStep,
  type RunState,
  type StepActor,
  type StepRun,
} from "./contract";

/**
 * Everyone who has been given a seat, and how far through they are.
 *
 * The only part of the showcase that lives on the server, and it has to. Every
 * other piece of state belongs to one person looking at one browser; this one
 * is written by the new starter and read by the admin who invited them, who is
 * somebody else entirely, elsewhere. Progress in `localStorage` would mean the
 * person tracking it could never see it.
 *
 * Same file-on-disk approach as the accounts beside it, for the same reasons:
 * a handful of records, already serialisable, and a database would be a bigger
 * decision than the problem deserves.
 */

const STORE_KEY = "__craig_showcase_joiners__";
const FILE = join(process.cwd(), ".data", "showcase-joiners.json");

interface JoinerStore {
  /** Keyed by joiner id. */
  joiners: Map<string, Joiner>;
}

function load(): Map<string, Joiner> {
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as Joiner[];
    if (!Array.isArray(parsed)) return new Map();
    return new Map(
      parsed
        .filter(
          (j): j is Joiner =>
            typeof j?.id === "string" && Array.isArray(j?.steps),
        )
        .map((j) => [j.id, j]),
    );
  } catch {
    /* Missing is the normal first run; unreadable is a file somebody edited.
       Starting empty is what would have happened anyway. */
    return new Map();
  }
}

function save(joiners: Map<string, Joiner>) {
  try {
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify([...joiners.values()], null, 2));
  } catch {
    /* A read-only disk shouldn't turn completing a step into a 500. The answer
       is still recorded for this run, which is what happened before this file
       existed. */
  }
}

function store(): JoinerStore {
  const scope = globalThis as typeof globalThis & {
    [STORE_KEY]?: Partial<JoinerStore>;
  };
  const existing = scope[STORE_KEY];
  /* Shape-checked rather than presence-checked, for the reason the accounts
     store spells out: the slot outlives any one revision of this file. */
  if (existing?.joiners instanceof Map) return existing as JoinerStore;

  const created: JoinerStore = { joiners: load() };
  scope[STORE_KEY] = created;
  return created;
}

/**
 * Turn the workflow's blocks into the steps this person will be asked for.
 *
 * A block only becomes something they can answer if a form exists for it —
 * `JOINER_FIELD_BY_PRESET` is that list. Everything else is kept rather than
 * dropped, without a field: those steps are real work, they're just somebody
 * else's, and a person's onboarding that silently omitted half the plan would
 * misrepresent both what's happening and how far along it is.
 *
 * Three kinds now, and the order they're tested in is the order of certainty.
 * A preset that names a form the new starter fills in is theirs; failing that,
 * one on the admin's tick list is the admin's; failing that, one Craig knows
 * how to do himself is his. `Object.hasOwn` on the two plain objects rather
 * than `in`, for the reason the invite route spells out: a preset called
 * `constructor` would otherwise resolve to something off `Object.prototype` and
 * give a step an actor because of a name collision with a language feature.
 *
 * An automated step is born with a `run` rather than being given one lazily.
 * The whole double-run guard is a compare-and-set against stored state, and a
 * guard whose first read can be `undefined` is a guard with a branch in it that
 * only the very first attempt takes — which is the attempt nobody tests twice.
 *
 * The trigger is dropped, because it is not a step anybody does.
 */
export function stepsFromBlocks(
  blocks: {
    id: string;
    title: string;
    kind: string;
    preset?: string;
    due?: number;
  }[],
): JoinerStep[] {
  return blocks
    .filter((b) => b.kind !== "trigger")
    .map((b) => {
      const preset = b.preset ?? "";
      const field = Object.hasOwn(JOINER_FIELD_BY_PRESET, preset)
        ? JOINER_FIELD_BY_PRESET[preset]
        : undefined;
      const admin = ADMIN_TICK_PRESETS.has(preset);
      const automation =
        !field && !admin && Object.hasOwn(AUTOMATION_BY_PRESET, preset)
          ? AUTOMATION_BY_PRESET[preset]
          : undefined;

      const actor: StepActor | undefined = field
        ? "joiner"
        : admin
          ? "admin"
          : automation
            ? "craig"
            : undefined;

      return {
        id: b.id,
        title: b.title,
        actor,
        field,
        automation,
        run: automation ? ({ state: "waiting" } satisfies StepRun) : undefined,
        due: b.due,
      };
    });
}

export function createJoiner(input: Omit<Joiner, "id" | "invitedAt">): Joiner {
  const { joiners } = store();
  const joiner: Joiner = {
    ...input,
    id: crypto.randomUUID(),
    invitedAt: new Date().toISOString(),
  };
  joiners.set(joiner.id, joiner);
  save(joiners);
  return joiner;
}

export function getJoiner(id: string): Joiner | null {
  return store().joiners.get(id) ?? null;
}

/** Everyone one account has invited, newest last. */
export function listJoiners(accountEmail: string): Joiner[] {
  const wanted = accountEmail.trim().toLowerCase();
  return [...store().joiners.values()]
    .filter((j) => j.accountEmail.trim().toLowerCase() === wanted)
    .sort((a, b) => a.invitedAt.localeCompare(b.invitedAt));
}

/**
 * Record an answer.
 *
 * Refuses a step that isn't theirs, doesn't exist, or has no field — a step
 * nobody wrote a form for cannot be completed by submitting one, and letting it
 * through would put a value on a step that never asked for anything.
 *
 * Answering twice is allowed and overwrites: correcting a typo in your own date
 * of birth is a thing people do, and there is nothing downstream that has
 * already consumed it.
 */
export function completeStep(
  joinerId: string,
  stepId: string,
  value: string,
): Joiner | null {
  const { joiners } = store();
  const joiner = joiners.get(joinerId);
  if (!joiner) return null;

  const step = joiner.steps.find((s) => s.id === stepId);
  /* Their own steps only. An admin step has no form and no value, so a
     submission naming one is either a mistake or somebody trying to complete
     work on a screen that never asked them for it. */
  if (step?.actor !== "joiner" || !step.field) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const updated: Joiner = {
    ...joiner,
    steps: joiner.steps.map((s) =>
      s.id === stepId
        ? { ...s, value: trimmed, completedAt: new Date().toISOString() }
        : s,
    ),
  };
  joiners.set(joinerId, updated);
  save(joiners);
  return updated;
}

/**
 * The admin marking their own step done.
 *
 * Separate from `completeStep` rather than a flag on it, because the two are
 * different acts by different people with different rules: one carries a value
 * the new starter typed, this one carries nothing but the fact that somebody
 * looked at it and said yes. Sharing a function would mean one set of checks
 * standing in for two, and the check that matters here is *who*.
 *
 * Untickable again, deliberately. Undoing is the rarer act and this is a
 * record of something that happened in the world — the name tag exists — so
 * unticking is offered explicitly rather than by pressing the same control
 * twice and hoping.
 */
export function tickStep(
  joinerId: string,
  stepId: string,
  done: boolean,
): Joiner | null {
  const { joiners } = store();
  const joiner = joiners.get(joinerId);
  if (!joiner) return null;

  const step = joiner.steps.find((s) => s.id === stepId);
  if (step?.actor !== "admin") return null;

  const updated: Joiner = {
    ...joiner,
    steps: joiner.steps.map((s) =>
      s.id === stepId
        ? { ...s, completedAt: done ? new Date().toISOString() : undefined }
        : s,
    ),
  };
  joiners.set(joinerId, updated);
  save(joiners);
  return updated;
}

/* --- The steps Craig runs -------------------------------------------------- */

/**
 * How long a claimed run may be silent before it is treated as abandoned.
 *
 * Nothing legitimate takes this long. The Directory call gives up after fifteen
 * seconds and the email after ten, so a run still holding the lock after ninety
 * has not been running for eighty of them — it is a process that was restarted,
 * a deploy that landed mid-flight, or a crash. That is a real state and it must
 * be visible, because the alternative is a step that says "creating the
 * account" for ever and a person whose first week quietly stopped.
 *
 * What this deliberately does *not* do is release the lock. A timeout that
 * silently re-ran the step would be a timeout that creates a second Google
 * account for the same person, on exactly the occasion when the first attempt's
 * outcome is unknown — which is the one thing this whole design is for. It only
 * makes the step *reconcilable*: something can go and ask Google what actually
 * happened, and the answer to that question is what unsticks it. See
 * `reconcileRun` in `automation.ts`.
 */
export const INTERRUPTED_AFTER_MS = 90_000;

export const runStateOf = (step: JoinerStep): RunState =>
  step.run?.state ?? "waiting";

/**
 * A run that claimed the step and never came back.
 *
 * Read on the server only, and that is a rule rather than an accident: this is
 * a fact about the current time, and a component that worked it out while
 * rendering would work it out twice — once on the server and once in the
 * browser, a beat later — which React reports as a hydration mismatch and a
 * person reads as a status that changes when they blink.
 */
export function isRunInterrupted(step: JoinerStep, now = Date.now()): boolean {
  if (runStateOf(step) !== "running") return false;
  const started = step.run?.startedAt ? Date.parse(step.run.startedAt) : NaN;
  /* A `running` with no readable start is already wrong, and treating it as
     interrupted is the safe reading: it sends somebody to ask Google what
     happened rather than leaving the step spinning on a lock nothing can
     explain. */
  if (!Number.isFinite(started)) return true;
  return now - started > INTERRUPTED_AFTER_MS;
}

/**
 * Whether everything ahead of this step has actually been finished.
 *
 * The rule that makes "it runs when the step before it completes" true without
 * anybody having to keep a pointer to where the workflow has got to. A pointer
 * is a second copy of the progress, and the first thing a second copy does is
 * disagree with the steps it was derived from — the same argument `progressOf`
 * makes about counts.
 *
 * Steps with no actor are skipped, and that is load-bearing. They are real work
 * that neither of these screens completes, so they never get a `completedAt` —
 * and a due test that required them would put an automated step behind a
 * condition that can never become true. The workflow would deadlock on a step
 * nobody was ever going to tick, silently, and the symptom would be an account
 * that just never got created.
 */
export function isStepDue(joiner: Joiner, stepId: string): boolean {
  const index = joiner.steps.findIndex((s) => s.id === stepId);
  if (index < 0) return false;

  return joiner.steps
    .slice(0, index)
    .every((s) => !s.actor || Boolean(s.completedAt));
}

/**
 * The automated step that a just-completed step has unblocked, if there is one.
 *
 * The immediately following step, and only that one. Scanning ahead for the
 * next automated step anywhere in the list would run something four steps early
 * the moment somebody put a form between them — an account created a fortnight
 * before it was planned to be, which is not a thing you can un-create. Being
 * strictly adjacent means the workflow's order is the order things happen in,
 * which is what the person who dragged the blocks into that order was
 * expressing.
 *
 * `isStepDue` still gates it, because adjacency alone is not enough: an admin
 * can tick step four before the new starter has answered step two, and the
 * account should not be created in the middle of a plan that hasn't got there.
 */
export function nextAutomatedStep(
  joiner: Joiner,
  afterStepId: string,
): JoinerStep | null {
  const index = joiner.steps.findIndex((s) => s.id === afterStepId);
  if (index < 0) return null;

  const next = joiner.steps[index + 1];
  if (!next || next.actor !== "craig" || !next.automation) return null;
  if (runStateOf(next) !== "waiting") return null;
  if (!isStepDue(joiner, next.id)) return null;

  return next;
}

export type ClaimRefusal =
  | "no-such-person"
  | "not-automated"
  | "not-due"
  /** Somebody else has it, or it is already past the point of being run. */
  | "already-running";

export type ClaimResult =
  | { ok: true; joiner: Joiner; step: JoinerStep }
  | { ok: false; why: ClaimRefusal };

/**
 * Take the step, so that nobody else can — the one guarantee this feature rests
 * on.
 *
 * **Never creates two Google accounts, and this function is why.** Every path
 * that could run an automated step — the new starter answering the step before
 * it, an admin ticking theirs, an admin pressing the button on the person's
 * page, all of those twice from two tabs, plus a browser that retried a request
 * whose response it never saw — goes through here first, and here is a
 * compare-and-set against what is written down rather than a check on what the
 * caller believes.
 *
 * The atomicity is real and it is worth being precise about *why*, because it
 * is a property of this code rather than of the language. There is no `await`
 * between reading `runStateOf` and writing `running`. Node runs one turn of the
 * event loop to completion, so no other request can be interleaved across those
 * lines; a second caller either runs entirely before this one, sees `waiting`,
 * and wins, or runs entirely after, sees `running`, and stands down. The
 * network call happens later and outside the claim, which is what keeps the
 * window closed — a guard that read the state, called Google, and wrote the
 * result afterwards would be open for the whole of the round trip, which is
 * precisely how long a double-submit takes.
 *
 * That argument holds for one process and stops holding for two. This store is
 * a Map behind a JSON file, so a second instance would have its own copy and
 * both would win the claim. The honest fix at that point is not a better lock
 * here: it is that the seat address is deterministic, so Google's own
 * `duplicate` refusal is the real backstop — the second creation fails with
 * `already-exists` rather than succeeding. Stated rather than relied on, since
 * the deployment this runs on is one process.
 *
 * Claimable from `waiting` and from `failed`, and from nothing else. `failed`
 * is a state a run can be retried out of because of an invariant
 * `automation.ts` upholds: it is only ever left there when no seat of ours
 * exists at that address. A run that created a seat and then failed to email
 * the password is `awaiting` with an `emailProblem`, because the account is
 * fine and only the message wasn't; conflating those would make "try again"
 * mean "make them a second mailbox".
 *
 * The one honest exception is a request that never got an answer, where
 * "nothing was created" is a belief rather than a fact — and the backstop there
 * is not this function. The seat's address is derived from the person's name
 * and the customer's domain rather than generated, so a second creation asks
 * Google for an address that already exists and comes back `already-exists`
 * instead of succeeding. That is what actually makes a retry safe; the state
 * machine here only makes it unnecessary.
 */
export function claimAutomatedStep(
  joinerId: string,
  stepId: string,
): ClaimResult {
  const { joiners } = store();
  const joiner = joiners.get(joinerId);
  if (!joiner) return { ok: false, why: "no-such-person" };

  const step = joiner.steps.find((s) => s.id === stepId);
  if (!step || step.actor !== "craig" || !step.automation) {
    return { ok: false, why: "not-automated" };
  }

  const state = runStateOf(step);
  if (state !== "waiting" && state !== "failed") {
    return { ok: false, why: "already-running" };
  }

  if (!isStepDue(joiner, stepId)) return { ok: false, why: "not-due" };

  /* Everything the previous attempt learned is dropped except what it made.
     A stale "Google Workspace isn't connected" sitting under a run that is
     currently in flight is a screen contradicting itself, and `seatEmail` is
     the one field that outlives an attempt — it is how a lost run is found
     again. */
  const claimed: StepRun = {
    state: "running",
    startedAt: new Date().toISOString(),
    seatEmail: step.run?.seatEmail,
    seatCreatedAt: step.run?.seatCreatedAt,
  };

  const held: JoinerStep = { ...step, run: claimed };
  const updated: Joiner = {
    ...joiner,
    steps: joiner.steps.map((s) => (s.id === stepId ? held : s)),
  };
  joiners.set(joinerId, updated);
  save(joiners);

  return { ok: true, joiner: updated, step: held };
}

/**
 * Write what a run found out.
 *
 * A merge rather than a replacement, because most of what a run learns is
 * additive and the fields it doesn't mention are ones it has no opinion about —
 * a check for acceptance knows nothing about `seatCreatedAt` and should not be
 * able to erase it by not saying so.
 *
 * The one thing this does beyond merging is keep `state: "done"` and the step's
 * own `completedAt` in step with each other, in both directions. That pairing
 * is the whole reason this is a function rather than three call sites doing
 * their own spread: `progressOf`, the progress bar, the People list, the new
 * starter's "that's everything" panel and the admin's lead line all read
 * `completedAt` and none of them know what a run is. A run that reached `done`
 * without setting it would be a finished step that every count on both screens
 * reported as outstanding — and the two would disagree for ever, because
 * nothing ever revisits a run that has finished.
 */
export function updateRun(
  joinerId: string,
  stepId: string,
  patch: Partial<StepRun> & { state: RunState },
): Joiner | null {
  const { joiners } = store();
  const joiner = joiners.get(joinerId);
  if (!joiner) return null;

  const step = joiner.steps.find((s) => s.id === stepId);
  if (!step || step.actor !== "craig") return null;

  const run: StepRun = { ...step.run, ...patch };
  const done = run.state === "done";

  const updated: Joiner = {
    ...joiner,
    steps: joiner.steps.map((s) =>
      s.id === stepId
        ? {
            ...s,
            run,
            /* Kept, not re-stamped, when it is already there. This is the
               record of when the person accepted their seat, and a poll that
               ran again would otherwise move that date forward every minute. */
            completedAt: done
              ? (s.completedAt ?? run.endedAt ?? new Date().toISOString())
              : undefined,
          }
        : s,
    ),
  };

  joiners.set(joinerId, updated);
  save(joiners);
  return updated;
}

/**
 * Take somebody's seat away.
 *
 * Their answers go with them, which is the point: a seat you removed that left
 * a date of birth on the server is a deletion that didn't delete anything.
 *
 * The invitation is not recalled, because it can't be — it is already in their
 * inbox and the link in it is what stops working. The screen that offers this
 * has to say so, or "remove" reads as a promise nobody can keep.
 */
export function deleteJoiner(id: string): boolean {
  const { joiners } = store();
  if (!joiners.delete(id)) return false;
  save(joiners);
  return true;
}

/** Cleared by the sandbox reset, along with the accounts. */
export function clearJoiners(): void {
  store().joiners.clear();
  try {
    rmSync(FILE, { force: true });
  } catch {}
}

/**
 * How far through they are, derived rather than stored.
 *
 * A stored count is a count that can disagree with the steps it counts, and it
 * will, on the turn somebody answers one. Only steps with a field are counted
 * as outstanding — the rest can't be finished from this side, so including them
 * would mean nobody ever reaches the end of their own onboarding.
 */
export function progressOf(joiner: Joiner) {
  const theirs = joiner.steps.filter((s) => s.actor === "joiner");
  const done = theirs.filter((s) => s.completedAt);

  /* Everything anybody can actually finish, which is what the admin's view
     counts. Steps waiting on neither side are excluded from both totals — a
     denominator containing work this showcase can't complete is a progress bar
     that can never reach the end.

     Craig's own steps are in here, and belong in here. An automated step is
     work that gets finished, by somebody who happens not to be a person, and
     leaving it out would mean an onboarding whose only remaining step was
     Craig's reported itself complete while the new starter still had no email
     address. */
  const actionable = joiner.steps.filter((s) => s.actor);
  const actionableDone = actionable.filter((s) => s.completedAt);

  /**
   * The same count, split by whose it is.
   *
   * Added when Craig got steps of his own, and the reason is a bug it prevents
   * rather than a nicety. The admin's screen used to work out its own share by
   * subtraction — everything actionable, minus the new starter's — which was
   * exactly right while there were two kinds of step and quietly wrong the
   * moment there were three: it would have reported every account Craig was
   * still creating as work sitting on the admin's desk, in amber, with nothing
   * they could do about it. Counting each actor rather than inferring one from
   * the others means adding a fourth kind can't repeat that.
   */
  const by = (who: StepActor) => {
    const steps = joiner.steps.filter((s) => s.actor === who);
    return {
      done: steps.filter((s) => s.completedAt).length,
      total: steps.length,
    };
  };

  return {
    done: done.length,
    total: theirs.length,
    /** The next thing they'd be asked for, or null when there's nothing left. */
    next: theirs.find((s) => !s.completedAt) ?? null,
    finished: theirs.length > 0 && done.length === theirs.length,
    /** Both sides together: how far the onboarding itself has got. */
    overall: {
      done: actionableDone.length,
      total: actionable.length,
      finished:
        actionable.length > 0 && actionableDone.length === actionable.length,
      /** Whoever the whole thing is waiting on next. */
      next: actionable.find((s) => !s.completedAt) ?? null,
      /** Per actor, so nobody has to derive one share from the other two. */
      joiner: by("joiner"),
      admin: by("admin"),
      craig: by("craig"),
    },
  };
}
