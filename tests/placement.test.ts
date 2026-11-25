// Placement round (D12): where a kid is found, that it can't be gamed, and how it composes with the
// fast track. Simulated kids from tests/sim.ts answer real questions against the real engines.

import { describe, expect, it } from 'vitest';
import { type Engine, PARAMS, type StudentState, nameEngine, recall } from '../src/core/engine';
import { LETTER_GROUP, letterEngine } from '../src/core/letters';
import {
  MAX_ANSWERS,
  PLACEMENT_PRIOR,
  type PlacementRun,
  applyPlacement,
  canPlace,
  nextPlacementItem,
  placementResult,
  startPlacement,
  submitPlacement,
} from '../src/core/placement';
import { isFinished, nextQuestion, startSession, submit } from '../src/core/session';
import { LETTERS } from '../src/core/music';
import { HOUR, T0, seededRng } from './helpers';
import { type Policy, knower, randomGuesser } from './sim';

interface Lane {
  name: string;
  engine: Engine;
  group: string;
}
const LANES: Lane[] = [
  { name: 'Name It treble', engine: nameEngine, group: 'treble' },
  { name: 'Name It bass', engine: nameEngine, group: 'bass' },
  { name: 'Letter Math', engine: letterEngine, group: LETTER_GROUP },
];
const KS = [0, 3, 7, 10, 13];

const sayIdk: Policy<string> = { answer: () => ({ answer: null, rtMs: 3000 }), pCorrect: () => 0 };

/** Knows the first `k` items of the lane (right with chance `p`, fluent); on the rest says "?" or guesses. */
function knowsFirst(lane: Lane, k: number, p = 1, unknown: 'idk' | 'guess' = 'idk'): Policy<string> {
  const ids = lane.engine.set.groups[lane.group]!.map((i) => i.id);
  const known = knower<string>(p, 1800, LETTERS);
  const guess = randomGuesser<string>(LETTERS);
  return {
    answer(id, target, e, s, rng) {
      if (ids.indexOf(id) < k) return known.answer(id, target, e, s, rng);
      return unknown === 'idk' ? { answer: null, rtMs: 3000 } : guess.answer(id, target, e, s, rng);
    },
    pCorrect: () => p,
  };
}

/** Run a whole placement round with a simulated kid. */
function place(lane: Lane, policy: Policy<string>, seed: number, now = T0): PlacementRun {
  const rng = seededRng(seed);
  const run = startPlacement(lane.engine, lane.group);
  let t = now;
  for (;;) {
    const id = nextPlacementItem(lane.engine, run, rng);
    if (id === null) return run;
    const { answer, rtMs } = policy.answer(id, lane.engine.answerOf(id), 0, 0, rng);
    t += Math.round(rtMs);
    submitPlacement(lane.engine, run, answer, rtMs, t);
    t += 800;
  }
}

describe.each(LANES)('placement: $name', (lane) => {
  const { engine, group } = lane;
  const size = engine.set.groups[group]!.length;

  it.each(KS)('a kid who knows the first %i items is placed within 2 of that', (k) => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const run = place(lane, knowsFirst(lane, k), seed);
      const r = placementResult(engine, run);
      expect(Math.abs(r.frontier - k), `seed ${seed}`).toBeLessThanOrEqual(2);
      expect(r.answered).toBeLessThanOrEqual(MAX_ANSWERS);
      expect(r.frontier).toBeLessThanOrEqual(size);
    }
  });

  it('a noisy knower (97% right) is still placed within 2 almost always, and never far above', () => {
    let near = 0;
    let n = 0;
    for (const k of KS) {
      for (let seed = 1; seed <= 40; seed++) {
        n++;
        const r = placementResult(engine, place(lane, knowsFirst(lane, k, 0.97), seed));
        if (Math.abs(r.frontier - k) <= 2) near++;
        expect(r.frontier, `k=${k} seed ${seed}`).toBeLessThanOrEqual(k + 2);
      }
    }
    expect(near / n).toBeGreaterThan(0.85);
  });

  it('a random guesser is placed in the bottom 3 items (a lucky run of ~7 guesses is rare)', () => {
    let low = 0;
    const runs = 1000;
    for (let seed = 1; seed <= runs; seed++) {
      const r = placementResult(engine, place(lane, randomGuesser<string>(LETTERS), seed));
      if (r.frontier <= 3) low++;
      expect(r.answered).toBeLessThanOrEqual(MAX_ANSWERS);
    }
    expect(low / runs).toBeGreaterThanOrEqual(0.99);
  });

  it('a kid who guesses on what they do not know is placed near what they do (rate over seeds)', () => {
    for (const k of KS) {
      let near = 0;
      const runs = 200;
      for (let seed = 1; seed <= runs; seed++) {
        const r = placementResult(engine, place(lane, knowsFirst(lane, k, 1, 'guess'), seed));
        if (Math.abs(r.frontier - k) <= 2) near++;
        expect(r.frontier, `k=${k} seed ${seed}`).toBeLessThanOrEqual(k + 6);
      }
      expect(near / runs, `k=${k}`).toBeGreaterThanOrEqual(0.85);
    }
  });

  it('a mixed kid (solid base, patchy middle, nothing above) lands in between', () => {
    const ids = engine.set.groups[group]!.map((i) => i.id);
    const base = 4;
    const patchy: Policy<string> = {
      answer: (id, target, e, s, rng) => {
        const i = ids.indexOf(id);
        const p = i < base ? 1 : i < base + 4 ? 0.5 : 0;
        return p > rng() ? knower<string>(1, 1800, LETTERS).answer(id, target, e, s, rng) : { answer: null, rtMs: 3000 };
      },
      pCorrect: () => 0.5,
    };
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = placementResult(engine, place(lane, patchy, seed));
      expect(r.frontier, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      expect(r.frontier, `seed ${seed}`).toBeLessThanOrEqual(base + 4);
    }
  });

  it('is deterministic for a seed and never repeats an item', () => {
    const a = place(lane, knowsFirst(lane, 7), 9);
    const b = place(lane, knowsFirst(lane, 7), 9);
    expect(a.answers.map((x) => x.itemId)).toEqual(b.answers.map((x) => x.itemId));
    expect(new Set(a.answers.map((x) => x.itemId)).size).toBe(a.answers.length);
  });

  describe('applying', () => {
    it('opens up to the frontier, seeds a moderate prior and records answers, with no rewards', () => {
      const run = place(lane, knowsFirst(lane, 10), 2);
      const state = engine.newStudent();
      const res = applyPlacement(engine, state, run);
      expect(res.applied).toBe(true);
      expect(res.events).toEqual([]);
      const ids = engine.set.groups[group]!.map((i) => i.id);
      ids.forEach((id, i) => {
        const it = state.items[id]!;
        expect(it.unlocked, id).toBe(i < res.open.length);
        expect(it.best, `${id} earns no medal`).toBe(0);
        expect(it.silverDay).toBe(-1);
        if (i < res.frontier) {
          expect(recall(it, T0), id).toBeGreaterThanOrEqual(PLACEMENT_PRIOR - 1e-9);
          expect(recall(it, T0), id).toBeLessThan(PARAMS.silverP);
        }
      });
      for (const a of run.answers) {
        const i = ids.indexOf(a.itemId);
        // Answers on items that stay locked are not recorded (they keep their "New note!" intro).
        expect(state.items[a.itemId]!.n, a.itemId).toBe(i < res.open.length ? 1 : 0);
      }
      expect(state.runs?.[group] ?? 0).toBe(0);
    });

    it('never produces silver, gold or polish, even for a perfect kid', () => {
      const run = place(lane, knowsFirst(lane, size), 5);
      const state = engine.newStudent();
      applyPlacement(engine, state, run);
      for (const it of Object.values(state.items)) expect(it.best).toBe(0);
    });

    it('is weak-items safe: seeded items must be answered before anything unlocks past them', () => {
      const run = place(lane, knowsFirst(lane, 10), 2);
      const state = engine.newStudent();
      const res = applyPlacement(engine, state, run);
      if (res.open.length < size) expect(engine.maybeUnlock(state, group, T0 + HOUR)).toBeNull();
    });

    it.each([4, 10])('holds back even while cruising (k=%i): answered-once seeded items are weak (D64, minSeen)', (k) => {
      const run = place(lane, knowsFirst(lane, k), 2);
      const state = engine.newStudent();
      const res = applyPlacement(engine, state, run);
      state.runs = { [group]: 4 };
      expect(res.open.length).toBeLessThan(size);
      expect(engine.maybeUnlock(state, group, T0 + HOUR)).toBeNull();
    });
  });
});

describe('placement: edge cases', () => {
  const lane = LANES[0]!;
  const { engine, group } = lane;

  it('does nothing without answers', () => {
    const state = engine.newStudent();
    const before = structuredClone(state);
    const res = applyPlacement(engine, state, startPlacement(engine, group));
    expect(res.applied).toBe(false);
    expect(state).toEqual(before);
  });

  it('refuses a lane with progress, leaving the state untouched', () => {
    const state = engine.newStudent();
    const first = engine.set.groups[group]![0]!.id;
    engine.recordAnswer(state, first, 'correct', 'G', 1500, T0);
    expect(canPlace(engine, state, group)).toBe(false);
    const before = structuredClone(state);
    const res = applyPlacement(engine, state, place(lane, knowsFirst(lane, 10), 1));
    expect(res.applied).toBe(false);
    expect(state).toEqual(before);
  });

  it('refuses a lane that was already opened beyond the start', () => {
    const state = engine.newStudent();
    state.items[engine.set.groups[group]![5]!.id]!.unlocked = true;
    expect(canPlace(engine, state, group)).toBe(false);
  });

  it('refuses a second placement of the same lane', () => {
    const state = engine.newStudent();
    expect(applyPlacement(engine, state, place(lane, knowsFirst(lane, 7), 1)).applied).toBe(true);
    const before = structuredClone(state);
    expect(applyPlacement(engine, state, place(lane, knowsFirst(lane, 10), 2)).applied).toBe(false);
    expect(state).toEqual(before);
  });

  it('the engine hook is for first sightings only: a second call on an item throws', () => {
    const state = engine.newStudent();
    const id = engine.set.groups[group]![0]!.id;
    engine.recordPlacementAnswer(state, id, 'correct', 'G', 1500, T0);
    expect(() => engine.recordPlacementAnswer(state, id, 'correct', 'G', 1500, T0 + 1)).toThrow(/placement only/);
  });

  it('an unknown lane cannot be placed', () => {
    expect(canPlace(engine, engine.newStudent(), 'nope')).toBe(false);
    expect(() => startPlacement(engine, 'nope')).toThrow();
  });

  it('all correct places at the top of the lane; all "?" at the start', () => {
    const top = placementResult(engine, place(lane, knowsFirst(lane, 13), 1));
    expect(top.frontier).toBeGreaterThanOrEqual(11);
    const none = placementResult(engine, place(lane, sayIdk, 1));
    expect(none.frontier).toBe(0);
    expect(none.open).toHaveLength(PARAMS.initialUnlock);
    expect(none.answered).toBeLessThanOrEqual(5);
  });

  it('a placement of "?" leaves the lane open exactly as for a fresh kid', () => {
    const state = engine.newStudent();
    applyPlacement(engine, state, place(lane, sayIdk, 1));
    const fresh = engine.newStudent();
    for (const id of Object.keys(fresh.items)) expect(state.items[id]!.unlocked).toBe(fresh.items[id]!.unlocked);
  });

  it('a failed spot check resets a lucky claim', () => {
    // Right on the first two questions (a lucky first level), "?" after that.
    const rng = seededRng(1);
    const run = startPlacement(engine, group);
    let t = T0;
    let step = 0;
    for (;;) {
      const id = nextPlacementItem(engine, run, rng);
      if (!id) break;
      submitPlacement(engine, run, step++ < 2 ? engine.answerOf(id) : null, 1500, (t += 2000));
    }
    expect(placementResult(engine, run).frontier).toBeLessThanOrEqual(3);
  });

  it('asking again before answering gives the same item; answering with none pending throws', () => {
    const run = startPlacement(engine, group);
    const rng = seededRng(1);
    const a = nextPlacementItem(engine, run, rng);
    expect(nextPlacementItem(engine, run, rng)).toBe(a);
    submitPlacement(engine, run, null, 1000, T0);
    expect(() => submitPlacement(engine, run, null, 1000, T0)).toThrow();
  });
});

describe('placement and the normal engine after it', () => {
  /** Play `n` daily normal sessions of one lane for a kid. */
  function play(lane: Lane, state: StudentState, policy: Policy<string>, sessions: number, seed: number, start: number, length = 20) {
    const rng = seededRng(seed);
    let now = start;
    const events: string[] = [];
    const picks = new Map<string, number>();
    for (let n = 0; n < sessions; n++) {
      const s = startSession([lane.group], length, { engine: lane.engine });
      while (!isFinished(s)) {
        const q = nextQuestion(s, state, now, rng);
        picks.set(q.itemId, (picks.get(q.itemId) ?? 0) + 1);
        const { answer, rtMs } = policy.answer(q.itemId, lane.engine.answerOf(q.itemId), 0, 0, rng);
        now += Math.round(rtMs);
        for (const e of submit(s, state, answer, now).events) events.push(e.kind);
        now += 800;
      }
      now += 24 * HOUR;
    }
    return { state, events, picks };
  }
  const openCount = (lane: Lane, state: StudentState) =>
    lane.engine.set.groups[lane.group]!.filter((i) => state.items[i.id]!.unlocked).length;
  const DAY2 = T0 + 24 * HOUR;

  it.each(LANES)('$name: a sandbagger ("?" throughout placement) reaches their true level in 3 sessions', (lane) => {
    for (const k of [7, 10, 13]) {
      const state = lane.engine.newStudent();
      expect(applyPlacement(lane.engine, state, place(lane, sayIdk, 1)).frontier).toBe(0);
      const after = play(lane, state, knowsFirst(lane, k), 3, 11, DAY2);
      expect(openCount(lane, after.state), `k=${k}`).toBeGreaterThanOrEqual(k);
    }
  });

  it.each(LANES)('$name: a sandbagger ends within 2 items of an honestly placed kid', (lane) => {
    const kid = knowsFirst(lane, 10);
    const sand = lane.engine.newStudent();
    applyPlacement(lane.engine, sand, place(lane, sayIdk, 1));
    const honest = lane.engine.newStudent();
    applyPlacement(lane.engine, honest, place(lane, kid, 1));
    const a = play(lane, sand, kid, 4, 3, DAY2);
    const b = play(lane, honest, kid, 4, 3, DAY2);
    expect(openCount(lane, a.state)).toBeGreaterThanOrEqual(openCount(lane, b.state) - 2);
  });

  it.each(LANES)('$name: guessers get no inflated start (rate) and earn no rewards afterwards', (lane) => {
    let low = 0;
    const runs = 300;
    for (let seed = 1; seed <= runs; seed++) {
      const state = lane.engine.newStudent();
      applyPlacement(lane.engine, state, place(lane, randomGuesser<string>(LETTERS), seed));
      if (openCount(lane, state) <= PARAMS.initialUnlock + 1) low++;
    }
    expect(low / runs).toBeGreaterThanOrEqual(0.99);
    for (const seed of [1, 2, 3]) {
      const state = lane.engine.newStudent();
      applyPlacement(lane.engine, state, place(lane, randomGuesser<string>(LETTERS), seed));
      const after = play(lane, state, randomGuesser<string>(LETTERS), 10, seed, DAY2);
      expect(after.events.filter((e) => e !== 'polished')).toEqual([]);
    }
  });

  it.each(LANES)('$name: a placed knower earns medals only by playing, then the fast track verifies the rest', (lane) => {
    const kid = knowsFirst(lane, 10);
    const state = lane.engine.newStudent();
    applyPlacement(lane.engine, state, place(lane, kid, 2));
    expect(Object.values(state.items).filter((i) => i.best > 0)).toHaveLength(0);
    const after = play(lane, state, kid, 3, 5, DAY2);
    expect(after.events).toContain('silver');
    expect(openCount(lane, after.state)).toBeGreaterThanOrEqual(10);
  });

  it('an over-placed kid keeps being asked the seeded items they cannot do (D34)', () => {
    const lane = LANES[0]!;
    // Placed as if they knew 10, but really know 4.
    const state = lane.engine.newStudent();
    applyPlacement(lane.engine, state, place(lane, knowsFirst(lane, 10), 2));
    const after = play(lane, state, knowsFirst(lane, 4), 2, 7, DAY2);
    const ids = lane.engine.set.groups[lane.group]!.map((i) => i.id);
    const seededAsked = ids.slice(4, 10).filter((id) => (after.picks.get(id) ?? 0) > 0).length;
    expect(seededAsked).toBeGreaterThanOrEqual(5);
    // ...and nothing beyond the open set unlocks while they struggle.
    expect(openCount(lane, after.state)).toBeLessThanOrEqual(12);
  });
});
