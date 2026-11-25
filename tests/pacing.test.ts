// Pacing simulations (the fast track, see PACING in engine.ts). Simulated kids play real 20-question
// sessions, one a day; each claim is checked on 10 seeds and compared with the original strict
// pacing (STRICT_PACING), which unlocked one item at a time and needed each seen twice.

import { describe, expect, it } from 'vitest';
import { ITEMS_BY_CLEF } from '../src/core/items';
import { LETTER_GROUP, LETTER_MATH_MODE } from '../src/core/letters';
import { LETTERS } from '../src/core/music';
import { NAME_IT_MODE, type SessionMode } from '../src/core/session';
import {
  type Persona,
  STRICT_LETTERS,
  STRICT_NAME_IT,
  type SimResult,
  allOpen,
  firstOpen,
  guesser,
  knower,
  lmBeginner,
  lmMixed,
  nameBeginner,
  oneButton,
  openAfter,
  overallSuccess,
  rungIds,
  simulate,
  successRate,
  total,
} from './sim';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const letters = (mode: SessionMode, persona: Persona, sessions: number) =>
  SEEDS.map((seed) => simulate({ mode, groups: [LETTER_GROUP], persona, sessions, seed }));
const treble = (mode: SessionMode, persona: Persona, sessions: number) =>
  SEEDS.map((seed) => simulate({ mode, groups: ['treble'], persona, sessions, seed }));
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const nextLetter = [...rungIds('after'), ...rungIds('before')];
const trebleIds = ITEMS_BY_CLEF.treble.map((i) => i.id);
const worstSession = (r: SimResult) => Math.min(...r.sessions.slice(1).map(successRate));
const maxStruggling = (r: SimResult) => Math.max(...r.sessions.map((s) => s.maxStruggling));

describe('pacing: a kid who already knows it flies', () => {
  const fast = letters(LETTER_MATH_MODE, knower(), 6);
  const strict = letters(STRICT_LETTERS, knower(), 12);

  it('Letter Math: next letter up/down and skips (28 items) open in the first session, slips aside', () => {
    const next = fast.map((r) => allOpen(r, nextLetter));
    const throughSkips = fast.map((r) => allOpen(r, [...nextLetter, ...rungIds('skipUp'), ...rungIds('skipDown')]));
    // A clean first session opens all 28. A 97% kid sometimes slips early (a miss rightly pauses
    // the fast track), and then it runs into the next session or two.
    expect(median(next), next.join(',')).toBe(1);
    expect(Math.max(...next), next.join(',')).toBeLessThanOrEqual(2);
    expect(throughSkips.filter((s) => s === 1).length, throughSkips.join(',')).toBeGreaterThanOrEqual(4);
    expect(Math.max(...throughSkips), throughSkips.join(',')).toBeLessThanOrEqual(3);
    // Before: 8+ sessions just for next letter up and down.
    expect(median(strict.map((r) => allOpen(r, nextLetter)))).toBeGreaterThanOrEqual(8);
  });

  it('Letter Math: reaches the numbered intervals within 3–4 sessions', () => {
    const sessions = fast.map((r) => firstOpen(r, rungIds('up2')));
    expect(Math.max(...sessions), sessions.join(',')).toBeLessThanOrEqual(4);
    expect(median(sessions)).toBeLessThanOrEqual(3);
    // Before: not within 12 sessions.
    expect(strict.every((r) => firstOpen(r, rungIds('up2')) === Infinity)).toBe(true);
  });

  it('a good first session still earns silver (regression: the fast track spread it too thin)', () => {
    for (const [i, r] of fast.entries()) expect(r.sessions[0]!.silver, `seed ${SEEDS[i]}`).toBeGreaterThan(0);
    const ni = treble(NAME_IT_MODE, knower(0.97, 1200), 1);
    for (const [i, r] of ni.entries()) expect(r.sessions[0]!.silver, `seed ${SEEDS[i]}`).toBeGreaterThan(0);
  });

  it('Name It: all 13 treble notes open within 2 sessions', () => {
    const sessions = treble(NAME_IT_MODE, knower(0.97, 1200), 3).map((r) => allOpen(r, trebleIds));
    expect(Math.max(...sessions), sessions.join(',')).toBeLessThanOrEqual(2);
    const before = treble(STRICT_NAME_IT, knower(0.97, 1200), 4).map((r) => allOpen(r, trebleIds));
    expect(before.every((s) => s > 4)).toBe(true);
  });
});

describe('pacing: a true beginner keeps a comfortable pace', () => {
  const fast = letters(LETTER_MATH_MODE, lmBeginner, 12);
  const strict = letters(STRICT_LETTERS, lmBeginner, 12);

  // Bounds are what this engine measures (strict: struggling 3, worst session 0.70). At ~82% success a
  // 20-question session has a spread of about ±9%, so the worst of ~110 sessions lands near 0.6
  // from chance alone; a bound much above that would test the dice, not the pacing.
  it('Letter Math: ~80% success, no rough sessions, never many items they can’t answer yet', () => {
    for (const [i, r] of fast.entries()) {
      expect(overallSuccess(r), `seed ${SEEDS[i]}`).toBeGreaterThan(0.78);
      expect(overallSuccess(r), `seed ${SEEDS[i]}`).toBeLessThan(0.88);
      expect(worstSession(r), `seed ${SEEDS[i]}`).toBeGreaterThanOrEqual(0.6);
      expect(maxStruggling(r), `seed ${SEEDS[i]}`).toBeLessThanOrEqual(6);
    }
    expect(median(fast.map(maxStruggling))).toBeLessThanOrEqual(4);
  });

  it('Letter Math: still makes more progress than before', () => {
    const now = fast.map((r) => openAfter(r, 12));
    const before = strict.map((r) => openAfter(r, 12));
    expect(median(now)).toBeGreaterThan(median(before));
    // ...but doesn't race ahead to intervals.
    expect(fast.every((r) => firstOpen(r, rungIds('up2')) === Infinity)).toBe(true);
  });

  it('Name It: comfortable too', () => {
    const fastNi = treble(NAME_IT_MODE, nameBeginner, 10);
    for (const r of fastNi) {
      expect(overallSuccess(r)).toBeGreaterThan(0.75);
      expect(overallSuccess(r)).toBeLessThan(0.86);
      expect(worstSession(r)).toBeGreaterThanOrEqual(0.55);
      expect(maxStruggling(r)).toBeLessThanOrEqual(5);
    }
    const before = treble(STRICT_NAME_IT, nameBeginner, 10);
    expect(median(fastNi.map((r) => openAfter(r, 10)))).toBeGreaterThanOrEqual(median(before.map((r) => openAfter(r, 10))));
  });
});

describe('pacing: knows next letter and skips, not intervals', () => {
  const runs = letters(LETTER_MATH_MODE, lmMixed, 12);
  const knowerRuns = letters(LETTER_MATH_MODE, knower(), 12);

  it('zooms through the early rungs', () => {
    const early = [...nextLetter, ...rungIds('skipUp'), ...rungIds('skipDown')];
    const sessions = runs.map((r) => allOpen(r, early));
    expect(Math.max(...sessions), sessions.join(',')).toBeLessThanOrEqual(3);
    expect(runs.every((r) => firstOpen(r, rungIds('up2')) <= 3)).toBe(true);
  });

  it('then slows to a learning pace at intervals', () => {
    for (const r of runs) {
      const reached = firstOpen(r, rungIds('up2'));
      const after = r.sessions.slice(reached);
      const success = after.reduce((a, s) => a + s.correct, 0) / after.reduce((a, s) => a + s.total, 0);
      expect(success).toBeGreaterThan(0.75);
      expect(success).toBeLessThan(0.97);
      expect(maxStruggling(r)).toBeLessThanOrEqual(10);
    }
    // Far behind the kid who knows intervals too.
    expect(median(runs.map((r) => openAfter(r, 12)))).toBeLessThan(median(knowerRuns.map((r) => openAfter(r, 12))) - 25);
  });
});

describe('pacing: guessing gains nothing', () => {
  const play = (persona: Persona, seeds: number[]) => {
    const [fast, strict] = (['fast', 'strict'] as const).map((engine) => {
      let unlocked = 0;
      let mastered = 0;
      let maxSilver = 0;
      for (const seed of seeds) {
        for (const [mode, groups] of [
          [engine === 'fast' ? LETTER_MATH_MODE : STRICT_LETTERS, [LETTER_GROUP]],
          [engine === 'fast' ? NAME_IT_MODE : STRICT_NAME_IT, ['treble', 'bass']],
        ] as const) {
          const r = simulate({ mode, groups: [...groups], persona, sessions: 30, seed });
          unlocked += total(r, 'unlocked');
          mastered += total(r, 'silver') + total(r, 'gold');
          maxSilver = Math.max(maxSilver, total(r, 'silver'));
        }
      }
      return { unlocked, mastered, maxSilver };
    });
    return { fast: fast!, strict: strict! };
  };

  // A guesser never unlocks anything. Lucky silvers aren't impossible: over 2,000 runs of 600
  // guesses (both modes, 1.2M guesses) the fast track gives 10 silver and 0 gold, against 2 silver for
  // the strict pacing: about 1 per 120,000 guesses. These 40 seeds (48,000 guesses) expect about 0.4,
  // so allowing up to 3 more than strict fails by chance less than 1 time in 1,000.
  it('a random guesser unlocks nothing, and lucky silvers stay rare', { timeout: 30_000 }, () => {
    const { fast, strict } = play(guesser, Array.from({ length: 40 }, (_, i) => i));
    expect(fast.unlocked).toBe(0);
    expect(strict.unlocked).toBe(0);
    expect(fast.mastered).toBeLessThanOrEqual(strict.mastered + 3);
  });

  it('pressing one button unlocks nothing; at most the starter it happens to answer shines', { timeout: 30_000 }, () => {
    for (const button of LETTERS) {
      const { fast, strict } = play(oneButton(button), [1, 2, 3]);
      expect(fast.unlocked, button).toBe(0);
      expect(fast.unlocked, button).toBeLessThanOrEqual(strict.unlocked);
      expect(fast.mastered, button).toBeLessThanOrEqual(strict.mastered);
      // Name It plays both clefs: one starter per clef can match the button.
      expect(fast.maxSilver, button).toBeLessThanOrEqual(2);
    }
  });
});
