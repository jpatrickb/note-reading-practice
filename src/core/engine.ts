// Adaptive learner model (runs entirely in the browser).
//
// Per item we keep an Elo-style recall estimate (a logit) that decays with time, plus a
// "stability" that grows only with *spaced* successful reviews. Item selection aims for ~80%
// predicted success. Rewards come only from changes in mastery (decision D12):
//   silver = recalled reliably and fluently (speed judged against the kid's OWN baseline)
//   gold   = still silver on a later day (retention, not cramming)
//   polish = a gold/silver note that had faded is fresh again (rewards spaced review)
//
// Anti-gaming (decision D10): no speed limits or guess detection. A wrong answer moves the
// estimate more than a right one, so random guessing drives mastery DOWN.
//
// The engine is shared by every game mode. A mode supplies an ItemSet (its items, teaching order
// per unlock lane, and the correct letter for each item) and gets a bound engine from
// `createEngine(set)`. Each mode keeps its own StudentState, so speed baselines and confusions
// never mix across modes. The Name It bindings (`newStudent`, `recordAnswer`, …) are exported at
// the bottom for existing callers.

import type { ItemSet, PracticeItem } from './itemset';
import { NAME_IT } from './items';
import type { Letter } from './music';

export type Outcome = 'correct' | 'wrong' | 'idk';
export type Level = 'locked' | 'learning' | 'silver' | 'gold';

export interface ItemState {
  unlocked: boolean;
  /** Recall logit as of `last`. */
  m: number;
  /** Stability in hours: how slowly this item is forgotten. */
  s: number;
  n: number;
  c: number;
  /** Epoch ms of the last answer, 0 = never. */
  last: number;
  /** EMA of correct response times in ms, 0 = none yet. */
  rt: number;
  /** Best level reached: 0 none, 1 silver, 2 gold. Never decreases. */
  best: 0 | 1 | 2;
  /** Day index on which silver was first reached, -1 = not yet. */
  silverDay: number;
}

export interface ErrorRecord {
  itemId: string;
  answer: Letter;
  at: number;
}

export interface StudentState {
  version: 1;
  items: Record<string, ItemState>;
  /** The kid's own typical response time (ms), 0 = unknown. */
  rtBaseline: number;
  /** Confusion matrix: `${itemId}>${answer}` → count. */
  confusions: Record<string, number>;
  recentErrors: ErrorRecord[];
  /** Day indices with any practice (most recent last, trimmed). */
  practiceDays: number[];
  /** lessonId → epoch ms last shown. */
  lessonsSeen: Record<string, number>;
}

export type MasteryEvent =
  | { kind: 'unlocked'; itemId: string }
  | { kind: 'silver'; itemId: string }
  | { kind: 'gold'; itemId: string }
  | { kind: 'polished'; itemId: string };

export const PARAMS = {
  targetP: 0.8,
  initialS: 6,
  maxS: 24 * 180,
  kCorrect: 1.4,
  kWrong: 2.0,
  kIdk: 1.0,
  silverP: 0.85,
  silverMinCorrect: 3,
  fluentRatio: 1.6,
  dustyP: 0.6,
  unlockP: 0.7,
  /** Unlocked notes allowed to still be weak when a new one unlocks: 1 per this many. */
  weakAllowancePer: 8,
  initialUnlock: 3,
  defaultBaseline: 3500,
  rtCap: 20000,
  maxErrors: 20,
  maxPracticeDays: 21,
} as const;

const HOUR = 3_600_000;

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const logit = (p: number) => {
  const q = Math.min(0.999, Math.max(0.001, p));
  return Math.log(q / (1 - q));
};
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Local calendar day index (days since epoch in the device's timezone). */
export function dayIndex(now: number): number {
  return Math.floor((now - new Date(now).getTimezoneOffset() * 60_000) / 86_400_000);
}

function freshItem(): ItemState {
  return { unlocked: false, m: 0, s: PARAMS.initialS, n: 0, c: 0, last: 0, rt: 0, best: 0, silverDay: -1 };
}

export function recall(it: ItemState, now: number): number {
  if (it.last === 0) return sigmoid(it.m);
  const elapsedH = Math.max(0, now - it.last) / HOUR;
  return sigmoid(it.m - Math.log2(1 + elapsedH / it.s));
}

function baseline(state: StudentState): number {
  return state.rtBaseline || PARAMS.defaultBaseline;
}

/** 1 for a fluent answer; slower than the kid's own norm counts a bit less (never below 0.6). */
export function fluency(rtMs: number, baselineMs: number): number {
  const ratio = rtMs / baselineMs;
  if (ratio <= PARAMS.fluentRatio) return 1;
  return Math.max(0.6, 1 - (ratio - PARAMS.fluentRatio) * 0.15);
}

function meetsSilver(it: ItemState, state: StudentState): boolean {
  return (
    sigmoid(it.m) >= PARAMS.silverP &&
    it.c >= PARAMS.silverMinCorrect &&
    it.rt > 0 &&
    it.rt <= PARAMS.fluentRatio * baseline(state)
  );
}

export function level(it: ItemState): Level {
  if (!it.unlocked) return 'locked';
  return it.best === 2 ? 'gold' : it.best === 1 ? 'silver' : 'learning';
}

/** A mastered note that has faded and could use a polish. */
export function isDusty(it: ItemState, now: number): boolean {
  return it.best > 0 && recall(it, now) < PARAMS.dustyP;
}

export interface AnswerResult {
  correct: boolean;
  events: MasteryEvent[];
}

/** Update one item's learner model for an answer and return any reward events (no unlocking). */
function applyAnswer(
  state: StudentState,
  itemId: string,
  outcome: Outcome,
  answer: Letter | null,
  rtMs: number,
  now: number,
): MasteryEvent[] {
  const it = state.items[itemId];
  if (!it) throw new Error(`Unknown item: ${itemId}`);
  const events: MasteryEvent[] = [];
  const wasDusty = isDusty(it, now);
  const p = recall(it, now);
  const rt = Math.min(Math.max(rtMs, 0), PARAMS.rtCap);
  const elapsedH = it.last === 0 ? 0 : Math.max(0, now - it.last) / HOUR;
  const today = dayIndex(now);

  if (outcome === 'correct') {
    const y = fluency(rt, baseline(state));
    it.m = clamp(logit(p) + PARAMS.kCorrect * (y - p), -6, 6);
    // Stability grows in proportion to how spaced the review was: cramming barely helps.
    it.s = Math.min(PARAMS.maxS, it.s * (1 + 1.2 * Math.min(1, elapsedH / it.s)));
    it.c++;
    it.rt = it.rt === 0 ? rt : it.rt * 0.7 + rt * 0.3;
    state.rtBaseline = state.rtBaseline === 0 ? rt : state.rtBaseline * 0.9 + rt * 0.1;
  } else {
    const k = outcome === 'wrong' ? PARAMS.kWrong : PARAMS.kIdk;
    it.m = clamp(logit(p) - k * p, -6, 6);
    it.s = Math.max(2, it.s * (outcome === 'wrong' ? 0.6 : 0.8));
    if (outcome === 'wrong' && answer) {
      const key = `${itemId}>${answer}`;
      state.confusions[key] = (state.confusions[key] ?? 0) + 1;
      state.recentErrors.push({ itemId, answer, at: now });
      if (state.recentErrors.length > PARAMS.maxErrors) state.recentErrors.shift();
    }
  }
  it.n++;
  it.last = now;
  if (state.practiceDays.at(-1) !== today) {
    state.practiceDays.push(today);
    if (state.practiceDays.length > PARAMS.maxPracticeDays) state.practiceDays.shift();
  }

  if (outcome === 'correct' && meetsSilver(it, state)) {
    if (it.best === 0) {
      it.best = 1;
      it.silverDay = today;
      events.push({ kind: 'silver', itemId });
    } else if (it.best === 1 && today > it.silverDay) {
      it.best = 2;
      events.push({ kind: 'gold', itemId });
    }
  }
  if (wasDusty && !isDusty(it, now) && !events.some((e) => e.kind === 'gold')) {
    events.push({ kind: 'polished', itemId });
  }
  return events;
}

export type Rng = () => number;

export interface RecentAnswer {
  itemId: string;
  correct: boolean;
}

/** The adaptive engine bound to one mode's item set. */
export interface Engine<I extends PracticeItem = PracticeItem> {
  readonly set: ItemSet<I>;
  /** A brand-new learner: the first few items of each lane are open. */
  newStudent(): StudentState;
  /** Fill in any items missing from an older saved state. */
  normalize(state: StudentState): StudentState;
  /** The letter that answers an item. */
  answerOf(itemId: string): Letter;
  recordAnswer(
    state: StudentState,
    itemId: string,
    outcome: Outcome,
    answer: Letter | null,
    rtMs: number,
    now: number,
  ): AnswerResult;
  maybeUnlock(state: StudentState, group: string, now: number): string | null;
  selectItem(
    state: StudentState,
    groups: readonly string[],
    now: number,
    rng: Rng,
    recent?: RecentAnswer[],
    mode?: 'normal' | 'finish',
  ): string;
}

export function createEngine<I extends PracticeItem>(set: ItemSet<I>): Engine<I> {
  const initialUnlock = set.initialUnlock ?? PARAMS.initialUnlock;
  const answerOf = (itemId: string) => set.answerOf(set.get(itemId));

  function newStudent(): StudentState {
    const items: Record<string, ItemState> = {};
    for (const item of set.items) items[item.id] = freshItem();
    for (const lane of Object.values(set.groups)) {
      for (const item of lane.slice(0, initialUnlock)) items[item.id]!.unlocked = true;
    }
    return { version: 1, items, rtBaseline: 0, confusions: {}, recentErrors: [], practiceDays: [], lessonsSeen: {} };
  }

  function normalize(state: StudentState): StudentState {
    const fresh = newStudent();
    for (const item of set.items) state.items[item.id] ??= fresh.items[item.id]!;
    return state;
  }

  /**
   * Unlock the next item in a lane once the items already open are solid: each seen at least twice
   * with recall >= unlockP. Larger sets may carry 1 weak item per `weakAllowancePer`, so one
   * stubborn item can't block progress forever, but weak items never pile up (decision D34).
   */
  function maybeUnlock(state: StudentState, group: string, now: number): string | null {
    const items = set.groups[group] ?? [];
    const open = items.filter((i) => state.items[i.id]!.unlocked);
    const next = items.find((i) => !state.items[i.id]!.unlocked);
    if (!next) return null;
    const weak = open.filter((i) => {
      const it = state.items[i.id]!;
      return it.n < 2 || recall(it, now) < PARAMS.unlockP;
    });
    if (weak.length > Math.floor(open.length / PARAMS.weakAllowancePer)) return null;
    state.items[next.id]!.unlocked = true;
    return next.id;
  }

  function recordAnswer(
    state: StudentState,
    itemId: string,
    outcome: Outcome,
    answer: Letter | null,
    rtMs: number,
    now: number,
  ): AnswerResult {
    const events = applyAnswer(state, itemId, outcome, answer, rtMs, now);
    const unlocked = maybeUnlock(state, set.groupOf(set.get(itemId)), now);
    if (unlocked) events.push({ kind: 'unlocked', itemId: unlocked });
    return { correct: outcome === 'correct', events };
  }

  /**
   * Choose the next item (decision D34).
   *
   * 'normal': weight each item by how much it NEEDS practice (1 - recall), with a floor so known
   * items still come back for review, and a bonus for brand-new and faded items. Weak items are
   * never abandoned. A controller keeps the kid's actual success near the target: on a rough patch
   * it leans on items they know; when they're cruising it leans on harder ones. Repeating the
   * previous answer letter is discouraged so one button can't carry a streak. With several lanes
   * (e.g. both clefs), attention is split by lane first (weaker lane gets more), so a lane with
   * fewer unlocked items isn't crowded out.
   *
   * 'finish': easy wins so the session ends on a success (peak-end rule).
   */
  function selectItem(
    state: StudentState,
    groups: readonly string[],
    now: number,
    rng: Rng,
    recent: RecentAnswer[] = [],
    mode: 'normal' | 'finish' = 'normal',
  ): string {
    let candidates = set.items.filter((i) => groups.includes(set.groupOf(i)) && state.items[i.id]!.unlocked);
    if (candidates.length === 0) throw new Error('No unlocked items for these groups');
    const avoid = recent.slice(-2).map((r) => r.itemId);
    if (candidates.length > avoid.length + 1) candidates = candidates.filter((i) => !avoid.includes(i.id));

    const window = recent.slice(-6);
    const accuracy = window.length >= 3 ? window.filter((r) => r.correct).length / window.length : PARAMS.targetP;
    const prevLetter = recent.length ? answerOf(recent.at(-1)!.itemId) : null;

    const scored = candidates.map((i) => {
      const it = state.items[i.id]!;
      const p = recall(it, now);
      let w: number;
      if (mode === 'finish') {
        w = p ** 4 + 0.01;
      } else {
        w = 0.12 + (1 - p);
        if (it.n === 0) w += 0.5;
        if (isDusty(it, now)) w += 0.3;
        if (accuracy < PARAMS.targetP - 0.15) w *= 0.2 + p;
        else if (accuracy > PARAMS.targetP + 0.1) w *= 0.2 + (1 - p);
      }
      if (set.answerOf(i) === prevLetter) w *= 0.15;
      return { id: i.id, group: set.groupOf(i), p, w };
    });

    // With several lanes, split attention by lane first so the lane with more unlocked items
    // doesn't crowd out the other; the weaker lane gets the bigger share.
    if (mode === 'normal' && groups.length > 1) {
      for (const group of groups) {
        const mine = scored.filter((x) => x.group === group);
        if (mine.length === 0) continue;
        const sum = mine.reduce((a, x) => a + x.w, 0);
        const need = mine.reduce((a, x) => a + (1 - x.p), 0) / mine.length;
        for (const x of mine) x.w = (x.w / sum) * (0.3 + need);
      }
    }
    const total = scored.reduce((a, b) => a + b.w, 0);
    let r = rng() * total;
    for (const s of scored) {
      r -= s.w;
      if (r <= 0) return s.id;
    }
    return scored.at(-1)!.id;
  }

  return { set, newStudent, normalize, answerOf, recordAnswer, maybeUnlock, selectItem };
}

/** Days practiced in the current Monday-start week, across one or more modes' learner models. */
export function daysThisWeek(states: StudentState | readonly StudentState[], now: number): number {
  const today = dayIndex(now);
  // Day 0 (1970-01-01) was a Thursday; shift so weeks start on Monday.
  const weekStart = today - ((today + 3) % 7);
  const days = new Set((Array.isArray(states) ? states : [states]).flatMap((s: StudentState) => s.practiceDays));
  return [...days].filter((d) => d >= weekStart && d <= today).length;
}

export const WEEKLY_GOAL = 4;

// ───────────── Name It bindings (the original mode; kept for existing callers) ─────────────

export const nameEngine = createEngine(NAME_IT);
export const { newStudent, normalize, recordAnswer, maybeUnlock, selectItem } = nameEngine;
