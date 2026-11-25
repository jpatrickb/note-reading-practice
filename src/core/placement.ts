// Placement round (decision D12: placement replaces the difficulty menu).
//
// A short check-in (at most MAX_ANSWERS questions, about a minute) that finds roughly where a kid
// is on one unlock lane's teaching order, so a kid who already reads notes starts there instead of
// grinding through the basics. Pure logic for any engine/lane: no UI, no clock, no timers. The
// caller injects the RNG and the time.
//
// SEARCH (binary search over the lane's teaching order). The bracket is [lo, hi): items before
// `lo` are known, items from `hi` on are not. Each round asks the item at the midpoint, and if it
// is right, one more item just below it (a different answer than the last question). Two right at
// a level move up (lo = mid + 1): one lucky guess can't over-place (1 in 7 per answer, 1 in 49 for
// a level). A wrong answer or "?" moves down at once (hi = the item missed). It stops when the
// bracket is <= STOP_BRACKET items wide, or at MAX_ANSWERS. Finally, a kid placed above
// VERIFY_ABOVE gets three spot checks below the frontier; a miss there means the earlier
// passes were luck, so the claim resets to the bottom and the search continues in what is left.
//
// APPLY. `applyPlacement` opens items up to the frontier (plus the next one to learn), seeds
// recall for those below it at PLACEMENT_PRIOR (< silverP, so not mastered), and records the
// answers as ordinary answers through `engine.recordPlacementAnswer`. It emits NO reward events
// and the mastery levels stay as they were: medals still need the kid's own correct answers in
// play (D12, D27).
//
// COMPOSING WITH FAST PACING (D60-D66). Placement chooses where the normal engine starts; it is
// not evidence the fast track may count again. Placement answers don't touch the lane's run of
// correct answers, don't earn first-try credit and don't unlock anything. Seeded items are unseen
// (n = 0) at a prior below the unlock bar, so they are "weak" under D64 until the kid has
// answered them: the engine must still verify them (need-weighted, D34), and first-try credit,
// cruising and transfer then verify them in a session or two. A kid placed too high is corrected
// by the same rule; a kid placed too low (a sandbagger) climbs out quickly on the fast track.

import type { Engine, Outcome, Rng, StudentState } from './engine';
import { PARAMS } from './engine';

export const MAX_ANSWERS = 15;
/** Correct answers needed at one level to move up. */
export const CORRECT_PER_LEVEL = 2;
/** Stop when the bracket is this many items or fewer. */
export const STOP_BRACKET = 2;
/** Spot-check a placement above this many known items... */
export const VERIFY_ABOVE = 3;
/** ...with this many correct answers on items spread below the frontier. */
export const VERIFY_CHECKS = 3;
/** Recall seeded for items below the frontier: moderate, below silverP (0.85). */
export const PLACEMENT_PRIOR = 0.75;
/** Stability (hours) seeded with the prior. */
export const PLACEMENT_STABILITY = 24;

export interface PlacementAnswer {
  itemId: string;
  outcome: Outcome;
  /** The answer given (null = "?"). */
  answer: string | null;
  rtMs: number;
  at: number;
}

export interface PlacementRun {
  group: string;
  /** The lane's item ids in teaching order. */
  ids: string[];
  /** Items before `lo` are known. */
  lo: number;
  /** Items from `hi` on are not known. */
  hi: number;
  answers: PlacementAnswer[];
  /** Item asked and not yet answered. */
  pending: string | null;
  /** Correct answers so far at the current level (the level's midpoint is `level`). */
  passes: number;
  level: number | null;
  /** Spot checks passed (-1 = not started; only above VERIFY_ABOVE). */
  verified: number;
  done: boolean;
}

/** Can this lane be placed? Only a fresh lane can: nothing answered, nothing opened beyond the start. */
export function canPlace(engine: Engine, state: StudentState, group: string): boolean {
  const lane = engine.set.groups[group];
  if (!lane || lane.length === 0) return false;
  const initial = engine.set.initialUnlock ?? PARAMS.initialUnlock;
  return lane.every((item, i) => {
    const it = state.items[item.id];
    return !!it && it.n === 0 && it.unlocked === i < initial;
  });
}

export function startPlacement(engine: Engine, group: string): PlacementRun {
  const lane = engine.set.groups[group];
  if (!lane) throw new Error(`Unknown group: ${group}`);
  const run: PlacementRun = {
    group,
    ids: lane.map((i) => i.id),
    lo: 0,
    hi: lane.length,
    answers: [],
    pending: null,
    passes: 0,
    level: null,
    verified: -1,
    done: false,
  };
  settle(run);
  return run;
}

const asked = (run: PlacementRun, idx: number) => run.answers.some((a) => a.itemId === run.ids[idx]);

/** Closest unasked index to `want` inside [from, to), preferring a different answer than `avoid`. */
function nearest(run: PlacementRun, engine: Engine, want: number, from: number, to: number, avoid: string | null): number | null {
  const cands: number[] = [];
  for (let d = 0; d < to - from; d++) {
    for (const i of d === 0 ? [want] : [want - d, want + d]) if (i >= from && i < to && !asked(run, i)) cands.push(i);
  }
  return cands.find((i) => engine.answerOf(run.ids[i]!) !== avoid) ?? cands[0] ?? null;
}

function lastAnswerKey(run: PlacementRun, engine: Engine): string | null {
  const last = run.answers.at(-1);
  return last ? engine.answerOf(last.itemId) : null;
}

/** Spot checks still needed: VERIFY_CHECKS, or fewer if few unasked items lie below the frontier. */
function checksNeeded(run: PlacementRun): number {
  if (run.lo <= VERIFY_ABOVE) return 0;
  let free = 0;
  for (let i = 0; i < run.lo; i++) if (!asked(run, i)) free++;
  return Math.min(VERIFY_CHECKS, Math.max(0, run.verified) + free);
}

/**
 * Still searching? Not once the bracket is narrow, or once only the spot checks of a high claim
 * still fit in the budget.
 */
function searching(run: PlacementRun): boolean {
  const reserve = run.verified < checksNeeded(run) && run.answers.length >= MAX_ANSWERS - checksNeeded(run);
  return run.hi - run.lo > STOP_BRACKET && !reserve;
}

/** Decide whether the search is over (the bracket is narrow, the budget is spent, or no item is left to ask). */
function settle(run: PlacementRun): void {
  // Nothing left to check a high claim with: it is not trusted.
  if (!searching(run) && run.lo > VERIFY_ABOVE && run.verified <= 0 && checksNeeded(run) === 0) run.lo = VERIFY_ABOVE;
  if (!searching(run) && run.verified >= checksNeeded(run)) run.done = true;
  if (run.answers.length >= MAX_ANSWERS && run.pending === null) {
    // Out of questions with a high claim still unchecked: don't trust it.
    if (run.lo > VERIFY_ABOVE && run.verified < checksNeeded(run)) run.lo = VERIFY_ABOVE;
    run.done = true;
  }
}

/**
 * The next item to ask, or null when placement is over. Calling it again before answering returns
 * the same item.
 */
export function nextPlacementItem(engine: Engine, run: PlacementRun, rng: Rng): string | null {
  if (run.pending) return run.pending;
  settle(run);
  if (run.done) return null;
  const avoid = lastAnswerKey(run, engine);
  let idx: number | null;
  if (!searching(run)) {
    // Search finished; spot-check the claim at spread-out items below the frontier.
    const want = Math.floor(run.lo * [0.2, 0.5, 0.8][Math.max(0, run.verified)]!);
    idx = nearest(run, engine, want, 0, run.lo, avoid);
    run.level = null;
  } else if (run.level !== null && run.passes > 0) {
    // Second answer at the level: just below the midpoint, rng picks among the nearest.
    const lower = run.level;
    const pool = [lower - 1, lower - 2].filter((i) => i >= run.lo && !asked(run, i));
    const pick = pool.length ? pool[Math.floor(rng() * pool.length)]! : null;
    idx = pick !== null && engine.answerOf(run.ids[pick]!) === avoid && pool.length > 1 ? pool.find((i) => i !== pick)! : pick;
    idx ??= nearest(run, engine, lower, run.lo, run.hi, avoid);
  } else {
    idx = nearest(run, engine, Math.floor((run.lo + run.hi) / 2), run.lo, run.hi, avoid);
    run.level = idx;
    run.passes = 0;
  }
  if (idx === null) {
    run.done = true;
    return null;
  }
  run.pending = run.ids[idx]!;
  return run.pending;
}

/** Record the answer to the pending item (`answer` null = "?"; `outcome` comes from `engine.grade`). */
export function submitPlacement(
  engine: Engine,
  run: PlacementRun,
  answer: string | null,
  rtMs: number,
  now: number,
): Outcome {
  const itemId = run.pending;
  if (!itemId) throw new Error('No pending placement question');
  const outcome = engine.grade(itemId, answer);
  const wasSearching = searching(run);
  run.answers.push({ itemId, outcome, answer, rtMs, at: now });
  run.pending = null;
  const idx = run.ids.indexOf(itemId);
  if (wasSearching) {
    if (outcome === 'correct') {
      run.passes++;
      if (run.passes >= CORRECT_PER_LEVEL) {
        run.lo = Math.max(run.lo, run.level! + 1);
        run.passes = 0;
        run.level = null;
      }
    } else {
      run.hi = idx;
      run.passes = 0;
      run.level = null;
    }
  } else {
    // A spot check below the frontier.
    if (outcome === 'correct') run.verified = Math.max(run.verified, 0) + 1;
    else {
      run.lo = 0;
      run.hi = Math.min(run.hi, idx);
      run.verified = -1;
    }
  }
  settle(run);
  return outcome;
}

export interface PlacementResult {
  /** Items known from the start of the lane (the placement). 0 = start at the beginning. */
  frontier: number;
  /** Item ids the engine opens (frontier + the next one, at least the lane's initial unlock). */
  open: string[];
  answered: number;
}

export function placementResult(engine: Engine, run: PlacementRun): PlacementResult {
  const initial = engine.set.initialUnlock ?? PARAMS.initialUnlock;
  const frontier = run.lo;
  const count = Math.min(run.ids.length, Math.max(initial, frontier + 1));
  return { frontier, open: run.ids.slice(0, count), answered: run.answers.length };
}

export interface PlacementApplied extends PlacementResult {
  applied: boolean;
  /** Always empty: placement never earns silver, gold or polish. */
  events: never[];
}

/**
 * Apply a finished (or abandoned) placement to a fresh lane. Does nothing for a lane that already
 * has progress (see `canPlace`) or a run with no answers.
 */
export function applyPlacement(engine: Engine, state: StudentState, run: PlacementRun): PlacementApplied {
  const result = placementResult(engine, run);
  if (run.answers.length === 0 || !canPlace(engine, state, run.group)) {
    return { ...result, applied: false, events: [] };
  }
  for (const a of run.answers) engine.recordPlacementAnswer(state, a.itemId, a.outcome, a.answer, a.rtMs, a.at);
  const prior = Math.log(PLACEMENT_PRIOR / (1 - PLACEMENT_PRIOR));
  run.ids.forEach((id, i) => {
    const it = state.items[id]!;
    if (i < result.open.length) it.unlocked = true;
    if (i < result.frontier) {
      it.m = Math.max(it.m, prior);
      it.s = Math.max(it.s, PLACEMENT_STABILITY);
    }
  });
  return { ...result, applied: true, events: [] };
}
