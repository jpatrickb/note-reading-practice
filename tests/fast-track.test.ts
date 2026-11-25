// Unit tests for each fast-track mechanism (PACING in engine.ts). The persona simulations that show
// the overall effect live in pacing.test.ts.

import { describe, expect, it } from 'vitest';
import { type Engine, PACING, STRICT_PACING, type StudentState, createEngine, recall } from '../src/core/engine';
import { ITEMS_BY_CLEF, NAME_IT } from '../src/core/items';
import { LETTER_GROUP, LETTER_MATH, letterEngine } from '../src/core/letters';
import { DAY, T0, seededRng } from './helpers';
import { rungIds } from './sim';

const name = createEngine(NAME_IT);
const strictName = createEngine(NAME_IT, STRICT_PACING);
const strictLetters = createEngine(LETTER_MATH, STRICT_PACING);
const [G4, C4, A4] = ITEMS_BY_CLEF.treble.map((i) => i.id);
const lane = LETTER_MATH.groups[LETTER_GROUP]!.map((i) => i.id);

function right(engine: Engine, s: StudentState, id: string, now: number, rt = 1500) {
  return engine.recordAnswer(s, id, 'correct', engine.answerOf(id), rt, now);
}
const unlockedIds = (r: ReturnType<typeof right>) => r.events.filter((e) => e.kind === 'unlocked').map((e) => e.itemId);
const isOpen = (s: StudentState, id: string) => s.items[id]!.unlocked;

/** Letter Math state where `ids` are open and answered `c` of `n` with recall ~p. */
function letters(ids: string[], p = 0.9, c = 2, n = 2): StudentState {
  const s = letterEngine.newStudent();
  for (const id of ids) Object.assign(s.items[id]!, { unlocked: true, m: Math.log(p / (1 - p)), s: 72, n, c, last: T0, rt: 1500 });
  s.rtBaseline = 1500;
  return s;
}

describe('first-try credit', () => {
  it('a fluent first answer during a run counts as known already', () => {
    const s = name.newStudent();
    right(name, s, G4!, T0); // first answer of all: no run yet, no credit
    expect(recall(s.items[G4!]!, T0)).toBeLessThan(PACING.firstTryP - 0.1);
    right(name, s, C4!, T0 + 1000); // Name It credits after 1 correct in a row
    expect(recall(s.items[C4!]!, T0 + 1000)).toBeCloseTo(PACING.firstTryP, 2);
    expect(s.items[C4!]!.s).toBe(PACING.firstTryS);
    expect(s.runs).toEqual({ treble: 2 });
  });

  it('needs a run first, so one lucky guess earns nothing extra', () => {
    const s = letterEngine.newStudent();
    right(letterEngine, s, lane[0]!, T0);
    letterEngine.recordAnswer(s, lane[1]!, 'wrong', 'C', 1500, T0 + 1000); // run resets
    expect(s.runs![LETTER_GROUP]).toBe(0);
    right(letterEngine, s, lane[2]!, T0 + 2000);
    expect(recall(s.items[lane[2]!]!, T0 + 2000)).toBeLessThan(0.7);
  });

  it('needs a fluent answer (for this kid)', () => {
    const s = name.newStudent();
    right(name, s, G4!, T0);
    right(name, s, C4!, T0 + 1000, 20_000);
    expect(recall(s.items[C4!]!, T0 + 1000)).toBeLessThan(0.7);
  });

  it('counts as solid for unlocking after one sighting (before: two each)', () => {
    const fast = name.newStudent();
    const strict = strictName.newStudent();
    const order = [G4!, C4!, A4!, G4!];
    const answers = (engine: Engine, s: StudentState) =>
      order.reduce((n, id, i) => n + unlockedIds(right(engine, s, id, T0 + i * 1000)).length, 0);
    expect(answers(name, fast)).toBe(1);
    expect(answers(strictName, strict)).toBe(0);
  });

  it('is off in the strict pacing', () => {
    const s = strictName.newStudent();
    right(strictName, s, G4!, T0);
    right(strictName, s, C4!, T0 + 1000);
    expect(recall(s.items[C4!]!, T0 + 1000)).toBeLessThan(0.7);
  });
});

describe('transfer within a rung', () => {
  it('a new item starts as well-known as the siblings the kid aced', () => {
    const s = letters(rungIds('after').slice(0, 3));
    s.runs = { [LETTER_GROUP]: 0 };
    const next = letterEngine.maybeUnlock(s, LETTER_GROUP, T0);
    expect(next).toBe('lm:after:G');
    expect(recall(s.items[next!]!, T0)).toBeGreaterThan(0.7);
  });

  it('a new rung starts fresh (no transfer from other rungs)', () => {
    const s = letters(rungIds('after'));
    expect(letterEngine.maybeUnlock(s, LETTER_GROUP, T0)).toBe('lm:before:D');
    expect(recall(s.items['lm:before:D']!, T0)).toBeCloseTo(0.5, 5);
  });

  it('siblings the kid had to drill predict less than ones known cold', () => {
    const cold = letters(rungIds('after').slice(0, 3), 0.9, 2, 2);
    const drilled = letters(rungIds('after').slice(0, 3), 0.9, 4, 7);
    letterEngine.maybeUnlock(cold, LETTER_GROUP, T0);
    letterEngine.maybeUnlock(drilled, LETTER_GROUP, T0);
    expect(recall(drilled.items['lm:after:G']!, T0)).toBeLessThan(0.7);
    expect(recall(cold.items['lm:after:G']!, T0)).toBeGreaterThan(recall(drilled.items['lm:after:G']!, T0));
  });

  it('only ever raises the starting estimate', () => {
    const s = letters(rungIds('after').slice(0, 3), 0.2, 0, 3);
    // Weak siblings block unlocking anyway; force it to inspect the prior.
    s.items['lm:after:C']!.m = 3;
    s.items['lm:after:E']!.m = 3;
    s.items['lm:after:A']!.m = 3;
    letterEngine.maybeUnlock(s, LETTER_GROUP, T0);
    expect(s.items['lm:after:G']!.m).toBe(0);
  });

  it('is off in the strict pacing', () => {
    const s = letters(rungIds('after').slice(0, 3));
    s.items['lm:after:C']!.n = 3; // strict needs 2+ sightings; these have 2
    strictLetters.maybeUnlock(s, LETTER_GROUP, T0);
    expect(s.items['lm:after:G']!.m).toBe(0);
  });
});

describe('cruising: a rung opens at once ("test out by performance")', () => {
  it('on a run, items the model already expects the kid to know don’t hold up unlocking', () => {
    const s = letters(rungIds('after').slice(0, 3));
    s.runs = { [LETTER_GROUP]: PACING.cruiseRun };
    const r = right(letterEngine, s, 'lm:after:C', T0 + 1000);
    expect(unlockedIds(r)).toEqual(['lm:after:G', 'lm:after:D', 'lm:after:F']); // capped per answer
    const r2 = right(letterEngine, s, 'lm:after:E', T0 + 2000);
    // The rest of the rung, then the first items of the next rung (1 unproven item allowed per 8
    // open), which start fresh and so stop it.
    expect(unlockedIds(r2)).toEqual(['lm:after:B', 'lm:before:D', 'lm:before:G']);
    expect(isOpen(s, 'lm:before:B')).toBe(false);
    expect(letterEngine.maybeUnlock(s, LETTER_GROUP, T0 + 3000)).toBeNull();
  });

  it('one miss ends the run and pauses it', () => {
    const s = letters(rungIds('after').slice(0, 3));
    s.runs = { [LETTER_GROUP]: PACING.cruiseRun };
    right(letterEngine, s, 'lm:after:C', T0 + 1000);
    letterEngine.recordAnswer(s, 'lm:after:E', 'idk', null, 1500, T0 + 2000);
    expect(isOpen(s, 'lm:after:B')).toBe(false);
    // Three items opened but unseen now count as not-yet-solid.
    expect(letterEngine.maybeUnlock(s, LETTER_GROUP, T0 + 3000)).toBeNull();
  });

  it('asks the items holding up the next unlock first', () => {
    // Just after a cascade: three aced items, four the model vouches for, two brand-new.
    const s = letters(rungIds('after').slice(0, 3));
    for (const id of rungIds('after').slice(3)) Object.assign(s.items[id]!, { unlocked: true, m: Math.log(3) });
    for (const id of ['lm:before:D', 'lm:before:G']) s.items[id]!.unlocked = true;
    const recent = Array.from({ length: 6 }, () => ({ itemId: 'lm:after:C', correct: true }));
    const share = (engine: Engine) => {
      const rng = seededRng(3);
      const picks = Array.from({ length: 400 }, () => engine.selectItem(s, [LETTER_GROUP], T0, rng, recent));
      return picks.filter((p) => p.startsWith('lm:before:')).length / 400;
    };
    expect(share(letterEngine)).toBeGreaterThan(0.8);
    expect(share(strictLetters)).toBeLessThan(0.6);
  });
});

describe('weak items still block (decision D34)', () => {
  it('never more than maxWeak weak items, even in a big set', () => {
    const open = lane.slice(0, 24);
    const s = letters(open);
    for (const id of open.slice(0, 3)) s.items[id]!.m = -1; // 3 weak; 24/8 would allow 3
    expect(letterEngine.maybeUnlock(s, LETTER_GROUP, T0)).toBeNull();
    expect(strictLetters.maybeUnlock(s, LETTER_GROUP, T0)).toBe(lane[24]);
  });

  it('fading with time only blocks once an item needs a polish', () => {
    const s = letters(lane.slice(0, 3));
    const later = T0 + 5.5 * DAY; // recall ~0.67: faded, but not dusty
    for (const id of lane.slice(0, 3)) {
      expect(recall(s.items[id]!, later)).toBeGreaterThan(0.6);
      expect(recall(s.items[id]!, later)).toBeLessThan(0.7);
    }
    expect(letterEngine.maybeUnlock(s, LETTER_GROUP, later)).toBe(lane[3]);
    const strict = letters(lane.slice(0, 3));
    expect(strictLetters.maybeUnlock(strict, LETTER_GROUP, later)).toBeNull();
    expect(letterEngine.maybeUnlock(letters(lane.slice(0, 3)), LETTER_GROUP, T0 + 10 * DAY)).toBeNull();
  });
});

describe('remembering after a break', () => {
  it('a correct answer after a break never counts for less than with no break', () => {
    const fast = letters(['lm:after:C'], 0.9);
    const strict = letters(['lm:after:C'], 0.9);
    right(letterEngine, fast, 'lm:after:C', T0 + 5 * DAY);
    right(strictLetters, strict, 'lm:after:C', T0 + 5 * DAY);
    expect(recall(fast.items['lm:after:C']!, T0 + 5 * DAY)).toBeGreaterThan(0.9);
    expect(recall(strict.items['lm:after:C']!, T0 + 5 * DAY)).toBeLessThan(0.85);
    // Stability still grows from the spaced review either way.
    expect(fast.items['lm:after:C']!.s).toBeGreaterThan(72);
  });

  it('a miss after a break still counts the forgetting', () => {
    const s = letters(['lm:after:C'], 0.9);
    const now = letters(['lm:after:C'], 0.9);
    letterEngine.recordAnswer(s, 'lm:after:C', 'wrong', 'E', 1500, T0 + 5 * DAY);
    letterEngine.recordAnswer(now, 'lm:after:C', 'wrong', 'E', 1500, T0);
    expect(recall(s.items['lm:after:C']!, T0 + 5 * DAY)).toBeLessThan(0.4);
    expect(recall(s.items['lm:after:C']!, T0 + 5 * DAY)).toBeLessThan(recall(now.items['lm:after:C']!, T0));
  });
});

describe('silver for an item never missed (amends D27)', () => {
  /** Name It state where C4 was answered once, correctly and fluently, recall ~0.9, on a run. */
  function onceRight(engine: Engine, run = 2): StudentState {
    const s = engine.newStudent();
    Object.assign(s.items[C4!]!, { m: Math.log(9), n: 1, c: 1, last: T0, rt: 1500 });
    s.rtBaseline = 1500;
    s.runs = { treble: run };
    return s;
  }

  it('two fluent correct answers with no miss earn silver once the model is confident', () => {
    const s = name.newStudent();
    right(name, s, G4!, T0);
    right(name, s, C4!, T0 + 1000); // first-try credit: recall 0.9
    const r = right(name, s, C4!, T0 + 60_000);
    expect(s.items[C4!]!.c).toBe(2);
    expect(r.events).toContainEqual({ kind: 'silver', itemId: C4 });
  });

  it('only during a run of 3 correct answers (counting this one); otherwise three', () => {
    const s = onceRight(name, 1); // this answer makes a run of 2
    expect(right(name, s, C4!, T0 + 60_000).events).toEqual([]);
    expect(right(name, s, C4!, T0 + 120_000).events).toContainEqual({ kind: 'silver', itemId: C4 });
    expect(s.items[C4!]!.c).toBe(3);
  });

  it('after a miss it still takes three correct answers', () => {
    const s = onceRight(name);
    name.recordAnswer(s, C4!, 'wrong', 'D', 1500, T0 + 1000);
    const events = [1, 2].flatMap((k) => right(name, s, C4!, T0 + k * 60_000).events);
    expect(s.items[C4!]!.c).toBe(3);
    expect(events.filter((e) => e.kind === 'silver')).toHaveLength(0);
  });

  it('two correct answers are not enough while the estimate is still low', () => {
    const s = name.newStudent();
    right(name, s, G4!, T0); // no credit on the very first answer: recall 0.67
    right(name, s, G4!, T0 + 60_000); // ~0.76 < silverP
    expect(s.items[G4!]!.best).toBe(0);
  });

  it('the strict pacing keeps three', () => {
    const fast = onceRight(name);
    const strict = onceRight(strictName);
    expect(right(name, fast, C4!, T0 + 60_000).events).toContainEqual({ kind: 'silver', itemId: C4 });
    expect(right(strictName, strict, C4!, T0 + 60_000).events).toEqual([]);
  });
});
