// A saved state with missing or malformed fields must never crash the game (issue #72): kids'
// progress can't be bricked by an older build, a partial write or a hand edit.

import { describe, expect, it } from 'vitest';
import { PARAMS, type StudentState } from '../src/core/engine';
import { CORE_MODES } from '../src/core/modes';
import { isFinished, nextQuestion, startSession, submit } from '../src/core/session';
import { type KeyValueStore, loadState, saveState, stateKey } from '../src/core/storage';
import { LESSONS } from '../src/core/diagnose';
import { LETTERS } from '../src/core/music';
import { DAY, T0, seededRng } from './helpers';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** A state with real history in every field (answers, errors, runs, confusions, lessons). */
function playedState(mode: (typeof CORE_MODES)[number]): StudentState {
  const { engine } = mode;
  const state = engine.newStudent();
  const rng = seededRng(7);
  const groups = Object.keys(engine.set.groups);
  const session = startSession(groups, 40, { engine });
  let now = T0;
  while (!isFinished(session)) {
    const q = nextQuestion(session, state, now, rng);
    // Mostly right, sometimes wrong, so errors and confusions exist.
    const right = engine.answerOf(q.itemId);
    const wrong = LETTERS.find((a) => a !== right)!;
    submit(session, state, rng() < 0.75 ? right : wrong, now + 1500);
    now += 20 * 60_000;
  }
  state.lessonsSeen[Object.keys(LESSONS)[0]!] = T0;
  expect(state.recentErrors.length).toBeGreaterThan(0);
  expect(Object.keys(state.confusions).length).toBeGreaterThan(0);
  expect(state.runs).toBeDefined();
  return state;
}

/** Start a session on `state` and answer a few questions: the thing that used to crash. */
function playAFewQuestions(mode: (typeof CORE_MODES)[number], state: StudentState) {
  const { engine } = mode;
  const session = startSession(Object.keys(engine.set.groups), 6, { engine });
  const rng = seededRng(3);
  let now = T0;
  while (!isFinished(session)) {
    const q = nextQuestion(session, state, now, rng);
    submit(session, state, rng() < 0.5 ? engine.answerOf(q.itemId) : null, now + 1200);
    now += 60_000;
  }
  expect(session.results).toHaveLength(6);
}

const TOP_LEVEL = ['version', 'items', 'rtBaseline', 'confusions', 'recentErrors', 'practiceDays', 'lessonsSeen', 'runs'] as const;

describe.each(CORE_MODES.map((m) => [m.id, m] as const))('normalize (%s)', (_id, mode) => {
  const { engine } = mode;

  it('leaves a full, healthy state exactly as it was', () => {
    const state = playedState(mode);
    const before = clone(state);
    expect(engine.normalize(state)).toEqual(before);
    // And through storage: save, load, same state.
    const store = memoryStore();
    saveState(store, state, engine);
    expect(loadState(store, engine)).toEqual(before);
  });

  it('leaves a fresh learner unchanged', () => {
    const fresh = engine.newStudent();
    expect(engine.normalize(clone(fresh))).toEqual(fresh);
  });

  it.each(TOP_LEVEL)('back-fills a state that lacks "%s", and it still plays', (field) => {
    const state = clone(playedState(mode)) as unknown as Record<string, unknown>;
    const had = clone(state[field]);
    delete state[field];
    const fixed = engine.normalize(state as unknown as StudentState);
    // `runs` is optional (older saves lack it); every other field comes back, as a fresh learner has it.
    if (field !== 'runs') expect(fixed[field]).toEqual(field === 'items' ? expect.any(Object) : engine.newStudent()[field]);
    else expect(fixed.runs).toBeUndefined();
    expect(had).toBeDefined();
    playAFewQuestions(mode, fixed);
  });

  it('back-fills the fresh defaults for everything missing, keeping what is present', () => {
    const minimal = { version: 1, items: {} } as unknown as StudentState;
    expect(engine.normalize(minimal)).toEqual(engine.newStudent());
    playAFewQuestions(mode, minimal);

    const some = { version: 1, items: {}, rtBaseline: 1234, practiceDays: [20000, 20001] } as unknown as StudentState;
    const fixed = engine.normalize(some);
    expect(fixed.rtBaseline).toBe(1234);
    expect(fixed.practiceDays).toEqual([20000, 20001]);
    expect(fixed.items).toEqual(engine.newStudent().items);
  });

  it.each(Object.keys(engine.newStudent().items[engine.set.items[0]!.id]!))('back-fills a missing item field "%s" without touching the others', (field) => {
    const state = clone(playedState(mode));
    const id = engine.set.items.find((i) => state.items[i.id]!.n > 0)!.id;
    const item = state.items[id] as unknown as Record<string, unknown>;
    const others = clone(item);
    delete item[field];
    delete others[field];
    const fixed = engine.normalize(state).items[id] as unknown as Record<string, unknown>;
    expect(fixed[field]).toEqual((engine.newStudent().items[id] as unknown as Record<string, unknown>)[field]);
    // c can never exceed n, so a lost n also takes c to 0.
    for (const k of Object.keys(others)) if (!(field === 'n' && k === 'c')) expect(fixed[k], k).toEqual(others[k]);
    playAFewQuestions(mode, state);
  });

  it('survives wrong types in every field', () => {
    const state = clone(playedState(mode)) as unknown as Record<string, unknown>;
    state.practiceDays = null;
    state.recentErrors = 'oops';
    state.confusions = [1, 2];
    state.lessonsSeen = 7;
    state.runs = 'x';
    state.rtBaseline = 'fast';
    const first = engine.set.items[0]!.id;
    const second = engine.set.items[1]!.id;
    const third = engine.set.items[2]!.id;
    const items = state.items as Record<string, unknown>;
    items[first] = null;
    items[second] = 'locked';
    items[third] = { ...(items[third] as object), m: 'high', unlocked: 1, best: 7, n: NaN, last: null, silverDay: undefined };

    const fixed = engine.normalize(state as unknown as StudentState);
    const fresh = engine.newStudent();
    expect(fixed.practiceDays).toEqual([]);
    expect(fixed.recentErrors).toEqual([]);
    expect(fixed.confusions).toEqual({});
    expect(fixed.lessonsSeen).toEqual({});
    expect(fixed.runs).toEqual({});
    expect(fixed.rtBaseline).toBe(0);
    expect(fixed.items[first]).toEqual(fresh.items[first]);
    expect(fixed.items[second]).toEqual(fresh.items[second]);
    expect(fixed.items[third]).toMatchObject({ m: fresh.items[third]!.m, unlocked: fresh.items[third]!.unlocked, best: 2, n: 0, c: 0, last: 0, silverDay: -1 });
    playAFewQuestions(mode, fixed);
  });

  it('drops malformed entries inside arrays and records, keeping the good ones', () => {
    const state = clone(playedState(mode));
    const good = state.recentErrors[0]!;
    const goodConfusion = Object.keys(state.confusions)[0]!;
    (state.recentErrors as unknown[]).push(null, 'x', { itemId: 3 }, { itemId: 'no-such-item', answer: 'A', at: 1 }, { itemId: good.itemId, answer: 'A' });
    (state.practiceDays as unknown[]).push('monday', null, NaN);
    (state.confusions as Record<string, unknown>).bad = 'many';
    const goodDays = state.practiceDays.filter((d) => typeof d === 'number' && Number.isFinite(d));
    const fixed = engine.normalize(state);
    expect(fixed.recentErrors).toContainEqual(good);
    expect(fixed.recentErrors.every((e) => typeof e.at === 'number' && typeof e.answer === 'string')).toBe(true);
    expect(fixed.recentErrors.some((e) => e.itemId === 'no-such-item')).toBe(false);
    expect(fixed.practiceDays).toEqual(goodDays);
    expect(fixed.confusions.bad).toBeUndefined();
    expect(fixed.confusions[goodConfusion]).toBeGreaterThan(0);
  });

  it('keeps items the item set no longer has (a newer build wrote them) and unknown extra fields', () => {
    const state = clone(playedState(mode)) as unknown as Record<string, unknown>;
    (state.items as Record<string, unknown>)['future:item'] = { unlocked: true };
    state.futureField = { a: 1 };
    const fixed = engine.normalize(state as unknown as StudentState) as unknown as Record<string, unknown>;
    expect((fixed.items as Record<string, unknown>)['future:item']).toEqual({ unlocked: true });
    expect(fixed.futureField).toEqual({ a: 1 });
  });

  // Numbers that are the right type but out of range are clamped, never dropped: corrupted data
  // must not take away a medal or poison the model.
  describe('clamps out-of-range numbers', () => {
    const id = engine.set.items[0]!.id;
    const fixItem = (patch: Record<string, unknown>) => {
      const state = clone(engine.newStudent());
      Object.assign(state.items[id]!, patch);
      return engine.normalize(state).items[id]!;
    };

    it('best: 3 is gold, a negative is none, and a half rounds', () => {
      expect(fixItem({ best: 3 }).best).toBe(2);
      expect(fixItem({ best: 99 }).best).toBe(2);
      expect(fixItem({ best: -1 }).best).toBe(0);
      expect(fixItem({ best: 1.4 }).best).toBe(1);
    });
    it('m stays within [-6, 6]', () => {
      expect(fixItem({ m: 50 }).m).toBe(6);
      expect(fixItem({ m: -50 }).m).toBe(-6);
      expect(fixItem({ m: 2.5 }).m).toBe(2.5);
    });
    it('s stays within [1, maxS]', () => {
      expect(fixItem({ s: 0 }).s).toBe(1);
      expect(fixItem({ s: -4 }).s).toBe(1);
      expect(fixItem({ s: 1e12 }).s).toBe(PARAMS.maxS);
      expect(fixItem({ s: 72 }).s).toBe(72);
    });
    it('n is never negative', () => {
      expect(fixItem({ n: -3, c: 0 }).n).toBe(0);
    });
    it('c is within [0, n]', () => {
      expect(fixItem({ n: 5, c: 9 }).c).toBe(5);
      expect(fixItem({ n: 5, c: -2 }).c).toBe(0);
      expect(fixItem({ n: 5, c: 4 }).c).toBe(4);
    });
    it('rt is never negative', () => {
      expect(fixItem({ rt: -800 }).rt).toBe(0);
      expect(fixItem({ rt: 1400 }).rt).toBe(1400);
    });
    it('last is never negative nor more than a year ahead', () => {
      expect(fixItem({ last: -5 }).last).toBe(0);
      expect(fixItem({ last: Date.now() + 1000 * DAY }).last).toBeLessThanOrEqual(Date.now() + 367 * DAY);
      expect(fixItem({ last: T0 }).last).toBe(T0);
    });
    it('silverDay is never below -1', () => {
      expect(fixItem({ silverDay: -40 }).silverDay).toBe(-1);
    });
    it('practiceDays and recentErrors are cut to their maximums, keeping the most recent', () => {
      const state = clone(engine.newStudent());
      state.practiceDays = Array.from({ length: 60 }, (_, i) => 20000 + i);
      state.recentErrors = Array.from({ length: 70 }, (_, i) => ({ itemId: id, answer: 'A', at: i }));
      const fixed = engine.normalize(state);
      expect(fixed.practiceDays).toHaveLength(PARAMS.maxPracticeDays);
      expect(fixed.practiceDays.at(-1)).toBe(20059);
      expect(fixed.recentErrors).toHaveLength(PARAMS.maxErrors);
      expect(fixed.recentErrors.at(-1)!.at).toBe(69);
    });
  });
});

describe.each(CORE_MODES.map((m) => [m.id, m] as const))('loadState (%s)', (_id, mode) => {
  const { engine } = mode;
  const key = stateKey(engine);

  it('loads a minimal {version:1, items:{}} save and plays', () => {
    const store = memoryStore();
    store.setItem(key, JSON.stringify({ version: 1, items: {} }));
    const state = loadState(store, engine);
    expect(state).toEqual(engine.newStudent());
    playAFewQuestions(mode, state);
  });

  it('treats a save with items but no version as a partial write of version 1', () => {
    const store = memoryStore();
    const partial = engine.newStudent();
    partial.items[engine.set.items[0]!.id]!.n = 9;
    store.setItem(key, JSON.stringify({ items: partial.items }));
    expect(loadState(store, engine).items[engine.set.items[0]!.id]!.n).toBe(9);
  });

  it.each([
    ['not JSON', '{oops'],
    ['null', 'null'],
    ['a number', '12'],
    ['a list', '[]'],
    ['a different version', JSON.stringify({ version: 2, items: {} })],
    ['no items at all', JSON.stringify({ version: 1 })],
  ])('starts fresh from a save that is %s', (_name, raw) => {
    const store = memoryStore();
    store.setItem(key, raw);
    const state = loadState(store, engine);
    // Fresh, or repaired to fresh: either way it plays.
    expect(state.items).toEqual(engine.newStudent().items);
    playAFewQuestions(mode, state);
  });
});
