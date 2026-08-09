import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/types";
import {
  ADMIN_TICK_PRESETS,
  AUTOMATION_BY_PRESET,
  JOINER_FIELD_BY_PRESET,
  type Joiner,
  type JoinerField,
  type JoinerStep,
  type RunState,
  type StepActor,
  type StepAutomation,
  type StepRun,
} from "./contract";

/**
 * Everyone who has been given a seat, and how far through they are.
 *
 * Server-side, and it has to be: progress is written by the new starter and
 * read by the admin who invited them, who is somebody else entirely, elsewhere.
 *
 * The steps are rows now — one per step, in `joiner_steps` — and it is worth
 * being precise about what changed and what deliberately did not.
 *
 * **Still a snapshot.** The old JSONB blob's argument was that steps are a copy
 * taken when the invitation went out: editing the workflow afterwards must not
 * rewrite the half somebody hasn't done yet, nor lose the record of what they
 * already did. That argument was about *when the copy is taken*, not about how
 * it is stored, and it holds unchanged: these rows are created once, by
 * `createJoiner`, and nothing ever re-derives them from the workflow. A join
 * against live blocks — the thing the old comment rightly feared — still does
 * not exist.
 *
 * **What the blob actually cost** was two things the snapshot argument never
 * required. Queryability: the acceptance webhook asks "which steps in this
 * tenant are waiting on somebody to accept", and had to load every joiner and
 * parse JSON to find out; that is now one indexed read of `run_state`, a
 * *generated* column that cannot drift from the run document it summarises.
 * And write contention: every mutation — a joiner answering their own form, an
 * admin ticking a box, Craig claiming a run — serialised through one
 * whole-document compare-and-swap, so two people touching two different steps
 * of the same onboarding contended on the same write. Each step is its own row
 * with its own concurrency now.
 *
 * **Where the CAS went.** It didn't dissolve; it moved to where each rule
 * actually needed it. The claim — the one mutation whose correctness the
 * double-run guarantee rests on — is `claim_joiner_step` in Postgres: a single
 * UPDATE whose WHERE clause is the whole rule (right actor, claimable state,
 * every actionable predecessor complete), evaluated in one snapshot. Run
 * updates are a row-level version CAS, because their merge semantics live in
 * TypeScript and must stay there — see `updateRun`. A joiner's answer and an
 * admin's tick are plain conditional updates, because overwriting your own
 * previous answer is the documented behaviour, not a race to lose.
 */

type JoinerRow = Tables<"joiners">;
type StepRow = Tables<"joiner_steps">;

const db = () => supabaseAdmin();

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A step row, as the shape everything else already speaks.
 *
 * Nulls become absent fields rather than travelling: `JoinerStep` predates the
 * database and every reader tests presence (`step.field`, `step.run`), so a
 * `null` leaking through would be the one falsy value those tests weren't
 * written against.
 */
function toStep(row: StepRow): JoinerStep {
  return {
    id: row.step_id,
    title: row.title,
    actor: (row.actor as StepActor | null) ?? undefined,
    field: (row.field as JoinerField | null) ?? undefined,
    automation: (row.automation as StepAutomation | null) ?? undefined,
    run: (row.run as StepRun | null) ?? undefined,
    due: row.due ?? undefined,
    value: row.value ?? undefined,
    /* Normalised to the `toISOString` shape the run documents inside `run`
       already use, so a date written by this layer and a date written by an
       attempt compare the same way. */
    completedAt: row.completed_at
      ? new Date(row.completed_at).toISOString()
      : undefined,
  };
}

/** How a row and its steps become the shape everything else already speaks. */
function toJoiner(row: JoinerRow, steps: StepRow[]): Joiner {
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
    steps: [...steps]
      .sort((a, b) => a.position - b.position)
      .map(toStep),
    invitedAt: new Date(row.invited_at).toISOString(),
  };
}

type JoinerWithSteps = JoinerRow & { joiner_steps: StepRow[] };

async function fetchJoiner(id: string): Promise<Joiner | null> {
  /* The id arrives from a signed token, but "signed" and "well-formed UUID"
     are different claims, and Postgres rejects a malformed UUID loudly. A
     token minted before the move to UUID keys — or a hand-built one — should
     read as "no such person", not as a 500. */
  if (!UUID.test(id)) return null;

  const { data, error } = await db()
    .from("joiners")
    .select("*, joiner_steps(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Reading joiner failed: ${error.message}`);
  if (!data) return null;

  const row = data as unknown as JoinerWithSteps;
  return toJoiner(row, row.joiner_steps);
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
    })
    .select()
    .single();

  if (error) throw new Error(`Creating the invitation failed: ${error.message}`);

  /* The snapshot, taken exactly once. Two inserts rather than one because the
     rows carry the joiner's id, and the gap between them is closed the same
     way the invite route closes its own: a failure writing the steps deletes
     the joiner rather than leaving somebody who exists but has nothing to do.
     If the compensating delete also fails we throw anyway — the caller reports
     the invitation as not created, and a row with no steps renders as exactly
     that rather than as somebody half-onboarded. */
  const { error: stepsError } = await db()
    .from("joiner_steps")
    .insert(
      input.steps.map((s, position) => ({
        joiner_id: row.id,
        step_id: s.id,
        position,
        title: s.title,
        actor: s.actor ?? null,
        field: s.field ?? null,
        automation: s.automation ?? null,
        due: s.due ?? null,
        value: s.value ?? null,
        completed_at: s.completedAt ?? null,
        run: (s.run ?? null) as Json,
      })),
    );
  if (stepsError) {
    await db().from("joiners").delete().eq("id", row.id);
    throw new Error(`Creating the invitation failed: ${stepsError.message}`);
  }

  return { ...toJoiner(row, []), steps: input.steps };
}

export async function getJoiner(id: string): Promise<Joiner | null> {
  return fetchJoiner(id);
}

/** Everyone one account has invited, newest last. */
export async function listJoiners(accountEmail: string): Promise<Joiner[]> {
  const { data, error } = await db()
    .from("joiners")
    .select("*, joiner_steps(*)")
    .eq("account_email", accountEmail.trim().toLowerCase())
    .order("invited_at", { ascending: true });
  if (error) throw new Error(`Listing joiners failed: ${error.message}`);
  return (data as unknown as JoinerWithSteps[]).map((row) =>
    toJoiner(row, row.joiner_steps),
  );
}

/**
 * Record an answer.
 *
 * Refuses a step that isn't theirs, doesn't exist, or has no field — a step
 * nobody wrote a form for cannot be completed by submitting one. Answering
 * twice is allowed and overwrites: correcting a typo in your own date of
 * birth is a thing people do, and there is nothing downstream that has
 * already consumed it. That is also why this needs no version check — the
 * only thing two racing submissions can disagree about is which of their own
 * answers survives, and "the later one" is the documented behaviour.
 *
 * The refusal and the write are one conditional UPDATE: the `eq`/`not`
 * filters are the old transform's checks, moved into the statement, so a step
 * that isn't theirs matches zero rows rather than being read, judged, and
 * raced against.
 */
export async function completeStep(
  joinerId: string,
  stepId: string,
  value: string,
): Promise<Joiner | null> {
  const trimmed = value.trim();
  if (!trimmed || !UUID.test(joinerId)) return null;

  const { data, error } = await db()
    .from("joiner_steps")
    .update({ value: trimmed, completed_at: new Date().toISOString() })
    .eq("joiner_id", joinerId)
    .eq("step_id", stepId)
    .eq("actor", "joiner")
    .not("field", "is", null)
    .select("joiner_id");
  if (error) throw new Error(`Writing steps failed: ${error.message}`);
  if (data.length === 0) return null;

  return fetchJoiner(joinerId);
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
  if (!UUID.test(joinerId)) return null;

  const { data, error } = await db()
    .from("joiner_steps")
    .update({ completed_at: done ? new Date().toISOString() : null })
    .eq("joiner_id", joinerId)
    .eq("step_id", stepId)
    .eq("actor", "admin")
    .select("joiner_id");
  if (error) throw new Error(`Writing steps failed: ${error.message}`);
  if (data.length === 0) return null;

  return fetchJoiner(joinerId);
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
 *
 * Also stated in SQL, inside `claim_joiner_step`, where it participates in the
 * claim's own atomicity — this copy is the one screens and pre-checks read,
 * that one is the one the guarantee rests on. Change them together.
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
 * that could run an automated step goes through here first.
 *
 * The atomicity has moved twice and each move made it stronger. It began as an
 * argument about Node's event loop — no `await` between read and write, one
 * process — which a second server instance would have demolished. It became a
 * whole-document compare-and-swap in Postgres. It is now `claim_joiner_step`:
 * one UPDATE whose WHERE clause *is* the rule — Craig's step, claimable state,
 * every actionable predecessor complete — so the read, the judgement and the
 * write are a single statement and there is no interleaving to reason about.
 * Two processes claiming at once resolve to one winner inside Postgres; the
 * loser gets zero rows back and stands down. The old backstop still stands
 * behind it — the seat address is deterministic, so Google's own `duplicate`
 * refusal catches anything that slips past.
 *
 * The snapshot checks before the call exist to *name* a refusal, not to make
 * one: the RPC refuses with an empty result, which is airtight and mute, and
 * "why won't this run" deserves better than a shrug. They are best-effort
 * readings of a moment that may have passed by the time the claim lands, which
 * is fine — the claim itself never relies on them.
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
  const joiner = await fetchJoiner(joinerId);
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

  const { data, error } = await db().rpc("claim_joiner_step", {
    p_joiner: joinerId,
    p_step: stepId,
    p_started: new Date().toISOString(),
  });
  if (error) throw new Error(`Claiming the step failed: ${error.message}`);

  const won = data?.[0];
  if (!won) {
    /* The statement refused after the snapshot allowed: somebody else claimed
       in the gap, or a predecessor came un-done. Either way the step is not
       ours, and "already-running" is what the loser of a race has always been
       told here. */
    return { ok: false, why: "already-running" };
  }

  const held = toStep(won as StepRow);
  return {
    ok: true,
    joiner: {
      ...joiner,
      steps: joiner.steps.map((s) => (s.id === stepId ? held : s)),
    },
    step: held,
  };
}

/**
 * Write what a run found out.
 *
 * A merge rather than a replacement, because most of what a run learns is
 * additive and the fields it doesn't mention are ones it has no opinion
 * about — a check for acceptance knows nothing about `seatCreatedAt` and
 * should not be able to erase it by not saying so.
 *
 * The merge lives here, in TypeScript, and that is a decision rather than an
 * omission from the SQL: a patch key set to `undefined` means *clear this
 * field* — object spread keeps the key, serialisation drops it — and
 * `automation.ts` leans on that everywhere it retires a stale message. A jsonb
 * `||` cannot say "remove", so moving the merge into the database would have
 * quietly changed what every existing patch means.
 *
 * What the database contributes is the version: read at N, merge, write back
 * only if still N, retry on a miss. The whole-document CAS this store used to
 * run every mutation through, shrunk to the one mutation that actually merges
 * and the one row it merges into. Two racing updates serialise; the loser
 * re-reads and re-merges against what the winner wrote.
 *
 * The one thing this does beyond merging is keep `state: "done"` and the
 * step's own `completedAt` in step with each other, in both directions. Every
 * count on both screens reads `completedAt` and none of them know what a run
 * is; a run that reached `done` without setting it would be a finished step
 * that reported itself outstanding for ever. `completed_at` is written
 * explicitly on both branches, because in an UPDATE an absent column means
 * "leave it alone" — the old blob write got the clearing for free from JSON
 * serialisation, and this is where that behaviour has to be said out loud.
 */
export async function updateRun(
  joinerId: string,
  stepId: string,
  patch: Partial<StepRun> & { state: RunState },
): Promise<Joiner | null> {
  if (!UUID.test(joinerId)) return null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: row, error } = await db()
      .from("joiner_steps")
      .select("actor, run, completed_at, version")
      .eq("joiner_id", joinerId)
      .eq("step_id", stepId)
      .maybeSingle();
    if (error) throw new Error(`Reading the step failed: ${error.message}`);
    if (!row || row.actor !== "craig") return null;

    const run: StepRun = { ...(row.run as StepRun | null), ...patch };
    const done = run.state === "done";

    const { data: written, error: writeError } = await db()
      .from("joiner_steps")
      .update({
        run: JSON.parse(JSON.stringify(run)) as Json,
        /* Kept, not re-stamped, when it is already there. This is the record
           of when the person accepted their seat, and a poll that ran again
           would otherwise move that date forward every minute. */
        completed_at: done
          ? (row.completed_at ??
            run.endedAt ??
            new Date().toISOString())
          : null,
        version: row.version + 1,
      })
      .eq("joiner_id", joinerId)
      .eq("step_id", stepId)
      .eq("version", row.version)
      .select("joiner_id");
    if (writeError) {
      throw new Error(`Writing steps failed: ${writeError.message}`);
    }

    if (written.length > 0) return fetchJoiner(joinerId);
    /* Lost the race. Loop: the re-read merges against what the winner wrote. */
  }
  return null;
}

/**
 * Take somebody's seat away.
 *
 * Their answers go with them — the step rows cascade with the joiner — which
 * is the point: a seat you removed that left a date of birth on the server is
 * a deletion that didn't delete anything. The invitation is not recalled,
 * because it can't be — it is already in their inbox, and the link in it is
 * what stops working.
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
