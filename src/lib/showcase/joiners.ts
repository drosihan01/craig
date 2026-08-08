import "server-only";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  ADMIN_TICK_PRESETS,
  JOINER_FIELD_BY_PRESET,
  type Joiner,
  type JoinerStep,
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
      const field = b.preset ? JOINER_FIELD_BY_PRESET[b.preset] : undefined;
      const admin = b.preset ? ADMIN_TICK_PRESETS.has(b.preset) : false;
      return {
        id: b.id,
        title: b.title,
        actor: field
          ? ("joiner" as const)
          : admin
            ? ("admin" as const)
            : undefined,
        field,
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
     that can never reach the end. */
  const actionable = joiner.steps.filter((s) => s.actor);
  const actionableDone = actionable.filter((s) => s.completedAt);

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
    },
  };
}
