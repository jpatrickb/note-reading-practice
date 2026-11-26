// Learning guardrails, proven for EVERY mode with the shared simulation harness (tests/sim.ts):
// guessers and button-mashers gain nothing, honest effort pays, early play is varied, and only new
// mastery is rewarded (decisions D10, D12, D14, D33, D34, D56). A new mode adds one line to CASES.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NAME_IT_MODE, type SessionMode } from '../src/core/session';
import { LETTER_GROUP, LETTER_MATH_MODE } from '../src/core/letters';
import { CATCHER_RANGE, NOTE_CATCHER_MODE } from '../src/core/noteCatcher';
import { pianoKeys } from '../src/ui/piano';
import { LETTERS } from '../src/core/music';
import { FIND_ALL_MODE } from '../src/core/findAll';
import { PLACE_IT_MODE, placeAnswerSpace } from '../src/core/placeIt';
import { PARAMS, recall } from '../src/core/engine';
import { CORE_MODES } from '../src/core/modes';
import { newStudent } from '../src/core/engine';
import { ITEMS } from '../src/core/items';
import { WORD_MODE, setNameItSource } from '../src/core/wordDecoder';
import { WORD_LISTS } from '../src/core/words';
import { MOVES, MOVE_MODE } from './fixtures/moves';
import { T0 } from './helpers';
import { type Policy, honestLearner, knower, masher, randomGuesser, sandbagger, simulate } from './sim';

interface Case {
  name: string;
  mode: SessionMode<string>;
  groups: string[];
  /** Every answer the mode's pad offers. */
  space: readonly string[];
  /**
   * Silvers a random guesser may stumble into per 600 guesses. A guess is right 1 time in
   * `space.length`, so the fewer the answers the likelier a lucky streak: 0 for 7 letters, but
   * a 3-answer mode earned 1 silver in 2 of 5 runs. (Nothing ever unlocks or reaches gold.)
   */
  luckySilver: number;
}

/**
 * Every key a kid can tap as an answer: the one keyboard, white keys C2-C6, the same for both clefs
 * (black keys are never submitted). Middle C is on it and tappable though never asked, so it is
 * part of the space a guesser or masher can hit. This is the real answer space for a kid who scrolls.
 */
const CATCHER_KEYS = pianoKeys(CATCHER_RANGE.low, CATCHER_RANGE.high).filter((k) => !k.black).map((k) => k.id);
/**
 * What a kid who never scrolls can choose among: the keys on screen at the start, centered on middle C.
 * About 7 white keys on a phone, about 21 on an iPad landscape (the answers outside it are simply
 * unreachable for them, so this is the smaller space a guesser or masher works in).
 */
const visibleAround = (n: number) => {
  const all = CATCHER_KEYS;
  const c = all.indexOf('C4');
  const from = Math.max(0, c - Math.floor(n / 2));
  return all.slice(from, from + n);
};
const CATCHER_PHONE_VIEW = visibleAround(7);
const CATCHER_IPAD_VIEW = visibleAround(21);

const CASES: Case[] = [
  { name: 'Name It', mode: NAME_IT_MODE, groups: ['treble', 'bass'], space: LETTERS, luckySilver: 0 },
  { name: 'Letter Math', mode: LETTER_MATH_MODE, groups: [LETTER_GROUP], space: LETTERS, luckySilver: 0 },
  // The answer is the whole typed word, so a guess here is a whole-word guess: almost never right, which
  // is easier than what a kid's thumbs can do. The REAL coverage is the note-level suite in
  // tests/word-decoder.test.ts (a kid guessing or mashing one letter per note, "?" on every note, an honest
  // learner, a memorizer, the Name It gate). This line only proves the shared engine rules for the mode
  // (asymmetric scoring, variety, selection) with the Name It gate open (see the setNameItSource below).
  { name: 'Word Decoder', mode: WORD_MODE, groups: ['treble', 'bass'], space: [...new Set([...WORD_LISTS.treble, ...WORD_LISTS.bass])], luckySilver: 0 },
  { name: 'Place It', mode: PLACE_IT_MODE, groups: ['treble', 'bass'], space: placeAnswerSpace('treble'), luckySilver: 0 },
  { name: 'Note Catcher', mode: NOTE_CATCHER_MODE, groups: ['treble', 'bass'], space: CATCHER_KEYS, luckySilver: 0 },
  { name: 'Note Catcher (visible window, phone)', mode: NOTE_CATCHER_MODE, groups: ['treble', 'bass'], space: CATCHER_PHONE_VIEW, luckySilver: 0 },
  { name: 'Note Catcher (visible window, iPad)', mode: NOTE_CATCHER_MODE, groups: ['treble', 'bass'], space: CATCHER_IPAD_VIEW, luckySilver: 0 },
  // The engine receives the LETTER (7 answers) however many taps it took: generous to a guesser, who in truth
  // must also find every key (see tests/find-all.test.ts for the random-tapper odds).
  { name: 'Find All', mode: FIND_ALL_MODE, groups: ['keys'], space: LETTERS, luckySilver: 0 },
  { name: 'a mode with three answers', mode: MOVE_MODE, groups: ['a', 'b'], space: MOVES, luckySilver: 1 },
];
const SEEDS = [1, 2, 3, 4, 5];

// Word Decoder's gate fails closed; open it with a Name It model whose every note is silver (made up).
const allSilverName = newStudent();
for (const i of ITEMS) Object.assign(allSilverName.items[i.id]!, { unlocked: true, best: 1, n: 6, c: 6 });
beforeAll(() => setNameItSource(() => allSilverName));
afterAll(() => setNameItSource(null));

/**
 * Modes (by CORE_MODES id) that skip the suite, each with the reason. Empty is the goal: a new mode
 * adds a CASES line instead. An exemption needs a comment a reviewer will accept.
 */
const EXEMPT: Record<string, string> = {};

describe('every shipped mode is under the guardrails', () => {
  it('has a CASES entry (or a commented exemption) for each CORE_MODES mode', () => {
    for (const m of CORE_MODES) {
      const covered = CASES.some((c) => c.mode.engine === m.engine);
      expect(covered || m.id in EXEMPT, `mode "${m.id}" needs a guardrails CASES entry in tests/guardrails.test.ts`).toBe(true);
      expect(covered && m.id in EXEMPT, `mode "${m.id}" is covered, so drop its exemption`).toBe(false);
    }
    for (const id of Object.keys(EXEMPT)) expect(CORE_MODES.map((m) => m.id), `exemption for unknown mode ${id}`).toContain(id);
  });
});

describe.each(CASES)('guardrails: $name', ({ mode, groups, space, luckySilver }) => {
  const run = (policy: Policy<string>, sessions: number, seed: number) =>
    simulate({ mode, groups, policy, sessions, seed });

  it('a random guesser unlocks nothing, earns no gold and ends below where they started (D10)', () => {
    for (const seed of SEEDS) {
      const r = run(randomGuesser(space), 30, seed);
      expect(r.unlocked, `seed ${seed}`).toBe(0);
      expect(r.silver, `seed ${seed}`).toBeLessThanOrEqual(luckySilver);
      expect(r.gold, `seed ${seed}`).toBe(0);
      // Negative expected progress: the mean recall of the open items falls below the 50% they start at.
      expect(r.meanRecall, `seed ${seed}`).toBeLessThan(0.5);
    }
  });

  it('a button-masher unlocks nothing; at most the starters that happen to match shine', () => {
    for (const button of space) {
      for (const seed of SEEDS) {
        const r = run(masher(button, space.length), 10, seed);
        expect(r.unlocked, `${button} seed ${seed}`).toBe(0);
        // One starter per lane can have that very answer, and is then answered right every time:
        // that one item may legitimately shine (silver, then gold on a later day). Nothing else.
        expect(r.silver, `${button} seed ${seed}`).toBeLessThanOrEqual(groups.length);
        expect(r.gold, `${button} seed ${seed}`).toBeLessThanOrEqual(groups.length);
        const right = r.outcomes.filter((o) => o === 'correct').length;
        expect(right / r.outcomes.length, `${button} seed ${seed}`).toBeLessThan(0.5);
      }
    }
  });

  it('an honest learner who says "?" until they know earns real progress', () => {
    for (const seed of SEEDS) {
      const r = run(honestLearner({ learnAfter: 2, answerSpace: space }), 10, seed);
      expect(r.silver, `seed ${seed}`).toBeGreaterThanOrEqual(3);
      expect(r.unlocked, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      expect(r.meanRecall, `seed ${seed}`).toBeGreaterThan(0.7);
    }
  });

  it('scoring is asymmetric: a uniform guess loses recall on average, "?" costs less than a miss (D10, D11)', () => {
    const { engine } = mode;
    const id = engine.set.items[0]!.id;
    const after = (answer: string | null) => {
      const state = engine.newStudent();
      engine.recordAnswer(state, id, engine.grade(id, answer), answer, 1500, T0);
      return recall(state.items[id]!, T0);
    };
    const start = recall(engine.newStudent().items[id]!, T0);
    const guessing = space.reduce((a, answer) => a + after(answer), 0) / space.length;
    expect(guessing).toBeLessThan(start);
    const wrong = space.find((a) => !engine.isCorrect(id, a))!;
    expect(after(null)).toBeGreaterThan(after(wrong));
    expect(after(engine.answerOf(id)) - start).toBeLessThan(start - after(wrong));
  });

  it('padding the speed baseline with slow answers does not earn faster than playing at speed', () => {
    const earned = (policy: () => Policy<string>) =>
      SEEDS.reduce((a, seed) => {
        const r = run(policy(), 6, seed);
        return a + r.silver + r.gold + r.unlocked;
      }, 0);
    expect(earned(() => sandbagger<string>())).toBeLessThanOrEqual(earned(() => knower(1, 900, space)));
  });

  it('early play is varied: the open items answer differently, and repeats are rare (D33, D56)', () => {
    const { set } = mode.engine;
    for (const lane of Object.values(set.groups)) {
      const open = set.initialUnlock ?? PARAMS.initialUnlock;
      const first = lane.slice(0, open).map((i) => set.answerOf(i));
      expect(new Set(first).size, `${first.join(',')}`).toBe(Math.min(open, space.length));
    }
    for (const seed of SEEDS) {
      const r = run(honestLearner({ learnAfter: 0, answerSpace: space }), 6, seed);
      const answers = r.picks.map((id) => mode.engine.answerOf(id));
      const repeats = answers.filter((a, i) => i > 0 && a === answers[i - 1]).length;
      // By chance alone a repeat would come up 1 time in `space.length`.
      expect(repeats / answers.length, `seed ${seed}`).toBeLessThan(0.6 / space.length);
    }
  });

  it('every question is chosen by engine.selectItem (weak items are never abandoned, D34)', () => {
    let calls = 0;
    const engine = mode.engine;
    const spied: SessionMode<string> = {
      ...mode,
      engine: { ...engine, selectItem: (...args: Parameters<typeof engine.selectItem>) => (calls++, engine.selectItem(...args)) },
    };
    const r = simulate({ mode: spied, groups, policy: honestLearner({ learnAfter: 1, answerSpace: space }), sessions: 3, seed: 1 });
    expect(calls).toBe(r.picks.length);
    expect(calls).toBe(60);
  });
});

describe('guardrails: only new mastery is rewarded (D12, D14)', () => {
  it('replaying mastered material earns nothing: no unlocks, silver, gold or polish events', () => {
    // A whole small mode, all of it known: once everything is gold, more practice is worth nothing.
    const r = simulate({ mode: MOVE_MODE, groups: ['a', 'b'], policy: honestLearner({ learnAfter: 0, answerSpace: MOVES }), sessions: 40, seed: 9 });
    const earned = (from: number) => r.sessions.slice(from).reduce((a, s) => a + s.silver + s.gold + s.unlocked, 0);
    expect(earned(0), 'something was earned at first').toBeGreaterThan(14);
    expect(earned(15), 'nothing after session 15').toBe(0);
    expect(r.gold).toBeGreaterThan(0);
  });
});
