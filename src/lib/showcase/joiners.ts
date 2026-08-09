import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/types";
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
 * Server-side, and it has to be: progress is written by the new starter and
 * read by the admin who invited them, who is somebody else entirely,
 * elsewhere. It lived in a JSON file; it lives in Supabase now, because a
 * deployment whose filesystem is discarded between invocations is a deployment
 * where somebody's half-finished onboarding evaporates mid-week.
 *
 * The steps stay a JSONB *snapshot* on the row — deliberately not normalised
 * into step rows. They are a copy taken when the invitation went out, and
 * editing the workflow afterwards must not rewrite the half somebody hasn't
 * done yet, nor lose the record of what they already did. A join table is the
 * obvious instinct here and it would silently break exactly that.
 *
 * Concurrency changed shape in the move and it is worth being precise about
 * it. The file store's double-run guard was "no `await` between read and
 * write, one process, one event loop" — an argument that was true and that a
 * second server instance would quietly demolish. Every mutation now goes
 * read → transform (in TS, where all the documented rules live) → compare-and-
 * swap, where the CAS is `replace_joiner_steps` in Postgres: the write lands
 * only if the steps are still byte-for-byte what we read, otherwise nothing
 * happens and we re-read. Two processes can race; one wins; the loser
 * re-evaluates against what the winner wrote. That is the same guarantee the
 * event-loop argument made, held somewhere that scales past one process.
 */

type JoinerRow = Tables<"joiners">;

const db = () => supabaseAdmin();

/** How a row becomes the shape everything else already speaks. */
function toJoiner(row: JoinerRow): Joiner {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    startDate: row.start_date,
    accountEmail: row.account_email,
    company: row.company,
    workflowId: row.workflow_id,
    workflowName: row.workflow_name,
    steps: row.steps as unknown as JoinerStep[],
    /* Normalised to the same `toISOString` shape the file store wrote, because
       `listJoiners` sorts these with `localeCompare` and Postgres's `+00:00`
       suffix would sort against a `Z` one day. One format, everywhere. */
    invitedAt: new Date(row.invited_at).toISOString(),
  };
}

async function fetchRow(id: string): Promise<JoinerRow | null> {
  /* The id arrives from a signed token, but "signed" and "well-formed UUID"
     are different claims, and Postgres rejects a malformed UUID loudly. A
     token minted before the move to UUID keys — or a hand-built one — should
     read as "no such person", not as a 500. */
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }
  const { data, error } = await db()
    .from("joiners")
    .select()
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Reading joiner failed: ${error.message}`);
  return data;
}

/**
 * The compare-and-swap every step mutation goes through.
 *
 * `expected` is the steps array exactly as the row read came back — jsonb
 * equality in Postgres is structural, so a JS round trip is safe. `true`
 * means the write landed; `false` means somebody else wrote first and the
 * caller should re-read and re-decide.
 */
async function casSteps(
  id: string,
  expected: Json,
  next: JoinerStep[],
): Promise<boolean> {
  const { data, error } = await db().rpc("replace_joiner_steps", {
    p_id: id,
    p_expected: expected,
    p_next: next as unknown as Json,
  });
  if (error) throw new Error(`Writing steps failed: ${error.message}`);
  return data === true;
}

/**
 * Read → transform → CAS, with the retry the CAS makes necessary.
 *
 * The transform returns the new steps, or `null` to refuse — and it is re-run
 * from fresh state on every attempt, so a refusal that becomes true after a
 * race (the step got completed under us) is decided on what is actually
 * written, not on what we first saw. Three attempts is not tuning: two
 * concurrent writers resolve in two, and a store contended harder than that
 * has a caller in a loop somewhere that should fail rather than spin.
 */
async function mutateSteps(
  joinerId: string,
  transform: (joiner: Joiner) => JoinerStep[] | null,
): Promise<Joiner | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await fetchRow(joinerId);
    if (!row) return null;

    const joiner = toJoiner(row);
    const next = transform(joiner);
    if (!next) return null;

    if (await casSteps(row.id, row.steps, next)) {
      return { ...joiner, steps: next };
    }
  }
  return null;
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
 * `constructor` would otherwise resolve to something off `Object.prototype`
 * and give a step an actor because of a name collision with a language
 * feature.
 *
 * An automated step is born with a `run` rather than being given one lazily.
 * The whole double-run guard is a compare-and-set against stored state, and a
 * guard whose first read can be `undefined` is a guard with a branch in it
 * that only the very first attempt takes — which is the attempt nobody tests
 * twice.
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

export async function createJoiner(
  input: Omit<Joiner, "id" | "invitedAt">,
): Promise<Joiner> {
  /* The account's row id, from the same email the caller holds. The invite
     route has already established the account exists; a miss here means it
     vanished between that check and this insert, which is a fault worth a
     loud sentence rather than a row that belongs to nobody. */
  const { data: account, error: accountError } = await db()
    .from("accounts")
    .select("id")
    .eq("email", input.accountEmail.trim().toLowerCase())
    .maybeSingle();
  if (accountError) {
    throw new Error(`Looking up the inviting account failed: ${accountError.message}`);
  }
  if (!account) {
    throw new Error(
      "The inviting account no longer exists, so the invitation was not created.",
    );
  }

  const { data: row, error } = await db()
    .from("joiners")
    .insert({
      account_id: account.id,
      account_email: input.accountEmail,
      email: input.email,
      name: input.name,
      role: input.role,
      start_date: input.startDate,
      company: input.company,
      workflow_id: input.workflowId,
      workflow_name: input.workflowName,
      steps: input.steps as unknown as Json,
    })
    .select()
    .single();

  if (error) throw new Error(`Creating the invitation failed: ${error.message}`);
  return toJoiner(row);
}

export async function getJoiner(id: string): Promise<Joiner | null> {
  const row = await fetchRow(id);
  return row ? toJoiner(row) : null;
}

/** Everyone one account has invited, newest last. */
export async function listJoiners(accountEmail: string): Promise<Joiner[]> {
  const { data, error } = await db()
    .from("joiners")
    .select()
    .eq("account_email", accountEmail.trim().toLowerCase())
    .order("invited_at", { ascending: true });
  if (error) throw new Error(`Listing joiners failed: ${error.message}`);
  return data.map(toJoiner);
}

/**
 * Record an answer.
 *
 * Refuses a step that isn't theirs, doesn't exist, or has no field — a step
 * nobody wrote a form for cannot be completed by submitting one. Answering
 * twice is allowed and overwrites: correcting a typo in your own date of
 * birth is a thing people do, and there is nothing downstream that has
 * already consumed it.
 */
export async function completeStep(
  joinerId: string,
  stepId: string,
  value: string,
): Promise<Joiner | null> {
  const trimmed = value.trim();
  if (!trimmed) return null;

  return mutateSteps(joinerId, (joiner) => {
    const step = joiner.steps.find((s) => s.id === stepId);
    /* Their own steps only. An admin step has no form and no value, so a
       submission naming one is either a mistake or somebody trying to complete
       work on a screen that never asked them for it. */
    if (step?.actor !== "joiner" || !step.field) return null;

    return joiner.steps.map((s) =>
      s.id === stepId
        ? { ...s, value: trimmed, completedAt: new Date().toISOString() }
        : s,
    );
  });
}

/**
 * The admin marking their own step done.
 *
 * Separate from `completeStep` rather than a flag on it, because the two are
 * different acts by different people with different rules: one carries a value
 * the new starter typed, this one carries nothing but the fact that somebody
 * looked at it and said yes. Sharing a function would mean one set of checks
 * standing in for two, and the check that matters here is *who*.
 */
export async function tickStep(
  joinerId: string,
  stepId: string,
  done: boolean,
): Promise<Joiner | null> {
  return mutateSteps(joinerId, (joiner) => {
    const step = joiner.steps.find((s) => s.id === stepId);
    if (step?.actor !== "admin") return null;

    return joiner.steps.map((s) =>
      s.id === stepId
        ? { ...s, completedAt: done ? new Date().toISOString() : undefined }
        : s,
    );
  });
}

/* --- The steps Craig runs -------------------------------------------------- */

/**
 * How long a claimed run may be silent before it is treated as abandoned.
 *
 * Nothing legitimate takes this long. The Directory call gives up after
 * fifteen seconds and the email after ten, so a run still holding the lock
 * after ninety has not been running for eighty of them — it is a process that
 * was restarted, a deploy that landed mid-flight, or a crash.
 *
 * What this deliberately does *not* do is release the lock. A timeout that
 * silently re-ran the step would be a timeout that creates a second Google
 * account for the same person, on exactly the occasion when the first
 * attempt's outcome is unknown. It only makes the step *reconcilable* — see
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
 * The rule that makes "it runs when the step before it completes" true
 * without anybody having to keep a pointer to where the workflow has got to.
 *
 * Steps with no actor are skipped, and that is load-bearing. They are real
 * work that neither of these screens completes, so they never get a
 * `completedAt` — and a due test that required them would put an automated
 * step behind a condition that can never become true.
 */
export function isStepDue(joiner: Joiner, stepId: string): boolean {
  const index = joiner.steps.findIndex((s) => s.id === stepId);
  if (index < 0) return false;

  return joiner.steps
    .slice(0, index)
    .every((s) => !s.actor || Boolean(s.completedAt));
}

/**
 * The automated step that a just-completed step has unblocked, if there is
 * one.
 *
 * The immediately following step, and only that one. Scanning ahead for the
 * next automated step anywhere in the list would run something four steps
 * early the moment somebody put a form between them. Being strictly adjacent
 * means the workflow's order is the order things happen in, which is what the
 * person who dragged the blocks into that order was expressing.
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
 * Take the step, so that nobody else can — the one guarantee this feature
 * rests on.
 *
 * **Never creates two Google accounts, and this function is why.** Every path
 * that could run an automated step goes through here first, and here is a
 * compare-and-set against what is written down rather than a check on what
 * the caller believes.
 *
 * The atomicity used to be an argument about Node's event loop — no `await`
 * between read and write, one process — which held for one process and was
 * stated, at the time, to stop holding for two. It is now the database's:
 * the claim lands only if the steps are still exactly what this process read,
 * so two processes claiming at once resolve to one winner and one loser, and
 * the loser re-reads, sees `running`, and stands down. The old backstop still
 * stands behind it — the seat address is deterministic, so Google's own
 * `duplicate` refusal catches anything that slips past.
 *
 * Claimable from `waiting` and from `failed`, and from nothing else. `failed`
 * is a state a run can be retried out of because of an invariant
 * `automation.ts` upholds: it is only ever left there when no seat of ours
 * exists at that address. A run that created a seat and then failed to email
 * the password is `awaiting` with an `emailProblem` — conflating those would
 * make "try again" mean "make them a second mailbox".
 */
export async function claimAutomatedStep(
  joinerId: string,
  stepId: string,
): Promise<ClaimResult> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await fetchRow(joinerId);
    if (!row) return { ok: false, why: "no-such-person" };

    const joiner = toJoiner(row);
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
       currently in flight is a screen contradicting itself, and `seatEmail`
       is the one field that outlives an attempt — it is how a lost run is
       found again. */
    const claimed: StepRun = {
      state: "running",
      startedAt: new Date().toISOString(),
      seatEmail: step.run?.seatEmail,
      seatCreatedAt: step.run?.seatCreatedAt,
    };

    const held: JoinerStep = { ...step, run: claimed };
    const next = joiner.steps.map((s) => (s.id === stepId ? held : s));

    if (await casSteps(row.id, row.steps, next)) {
      return { ok: true, joiner: { ...joiner, steps: next }, step: held };
    }
    /* Lost the race. Loop: the re-read sees what the winner wrote — usually
       `running`, which the state check above turns into the honest refusal. */
  }
  return { ok: false, why: "already-running" };
}

/**
 * Write what a run found out.
 *
 * A merge rather than a replacement, because most of what a run learns is
 * additive and the fields it doesn't mention are ones it has no opinion
 * about — a check for acceptance knows nothing about `seatCreatedAt` and
 * should not be able to erase it by not saying so.
 *
 * The one thing this does beyond merging is keep `state: "done"` and the
 * step's own `completedAt` in step with each other, in both directions. Every
 * count on both screens reads `completedAt` and none of them know what a run
 * is; a run that reached `done` without setting it would be a finished step
 * that reported itself outstanding for ever.
 */
export async function updateRun(
  joinerId: string,
  stepId: string,
  patch: Partial<StepRun> & { state: RunState },
): Promise<Joiner | null> {
  return mutateSteps(joinerId, (joiner) => {
    const step = joiner.steps.find((s) => s.id === stepId);
    if (!step || step.actor !== "craig") return null;

    const run: StepRun = { ...step.run, ...patch };
    const done = run.state === "done";

    return joiner.steps.map((s) =>
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
    );
  });
}

/**
 * Take somebody's seat away.
 *
 * Their answers go with them, which is the point: a seat you removed that
 * left a date of birth on the server is a deletion that didn't delete
 * anything. The invitation is not recalled, because it can't be — it is
 * already in their inbox, and the link in it is what stops working.
 */
export async function deleteJoiner(id: string): Promise<boolean> {
  const { data, error } = await db()
    .from("joiners")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`Removing the seat failed: ${error.message}`);
  return data.length > 0;
}

/** Cleared by the sandbox reset, along with the accounts. */
export async function clearJoiners(): Promise<void> {
  const { error } = await db()
    .from("joiners")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw new Error(`Clearing joiners failed: ${error.message}`);
}

/**
 * How far through they are, derived rather than stored.
 *
 * A stored count is a count that can disagree with the steps it counts, and
 * it will, on the turn somebody answers one. Only steps with a field are
 * counted as outstanding — the rest can't be finished from this side, so
 * including them would mean nobody ever reaches the end of their own
 * onboarding.
 */
export function progressOf(joiner: Joiner) {
  const theirs = joiner.steps.filter((s) => s.actor === "joiner");
  const done = theirs.filter((s) => s.completedAt);

  /* Everything anybody can actually finish, which is what the admin's view
     counts. Steps waiting on neither side are excluded from both totals — a
     denominator containing work this showcase can't complete is a progress
     bar that can never reach the end.

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
   * Added when Craig got steps of his own, and the reason is a bug it
   * prevents rather than a nicety. The admin's screen used to work out its
   * own share by subtraction — everything actionable, minus the new
   * starter's — which was exactly right while there were two kinds of step
   * and quietly wrong the moment there were three. Counting each actor rather
   * than inferring one from the others means adding a fourth kind can't
   * repeat that.
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
