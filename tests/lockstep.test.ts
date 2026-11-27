// Lockstep proof for issue #18: generalizing the engine's answer type changed nothing for Name It
// and Letter Math. The pre-#18 engine and session (frozen in tests/reference/) and the current ones
// play the same seeded sessions side by side, fed the same answers, and after EVERY question must
// agree on the item chosen, the outcome, the reward events, the lesson and the whole learner state.
//
// This guards a one-off refactor. If the learner model is changed on purpose, expect it to fail:
// delete this file and tests/reference/ (see the header of tests/reference/engine-pre18.ts).

import { describe, expect, it } from 'vitest';
import { diagnose } from '../src/core/diagnose';
import { STRICT_PACING, createEngine } from '../src/core/engine';
import type { ItemSet } from '../src/core/itemset';
import { NAME_IT } from '../src/core/items';
import { LETTER_GROUP, LETTER_MATH } from '../src/core/letters';
import { type SessionMode, isFinished, nextQuestion, startSession, submit, summarize } from '../src/core/session';
import { type Policy, guesser, knower, lmBeginner, nameBeginner, oneButton, honestLearner } from './sim';
import { createEngine as createOldEngine } from './reference/engine-pre18';
import * as old from './reference/session-pre18';
import { DAY, HOUR, T0, seededRng } from './helpers';

interface Setup {
  name: string;
  set: ItemSet;
  groups: string[];
  withDiagnose: boolean;
}

/**
 * Name It as it was when this proof was written: naturals and ledger notes only. The sharps and flats (#34)
 * deliberately change the learner model (they are held until the naturals are silver), which the frozen
 * pre-#18 engine cannot know; they are covered by tests/name-it-accidentals.test.ts.
 */
const NAME_IT_NATURALS = {
  ...NAME_IT,
  items: NAME_IT.items.filter((i) => !i.note.acc),
  groups: Object.fromEntries(Object.entries(NAME_IT.groups).map(([g, items]) => [g, items.filter((i) => !i.note.acc)])),
} as ItemSet;

const SETUPS: Setup[] = [
  { name: 'Name It (both clefs)', set: NAME_IT_NATURALS, groups: ['treble', 'bass'], withDiagnose: true },
  { name: 'Name It (bass)', set: NAME_IT_NATURALS, groups: ['bass'], withDiagnose: true },
  { name: 'Letter Math', set: LETTER_MATH as ItemSet, groups: [LETTER_GROUP], withDiagnose: false },
];

const POLICIES: [string, Policy][] = [
  ['knower', knower(0.95, 1500)],
  ['Name It beginner', nameBeginner],
  ['Letter Math beginner', lmBeginner],
  ['random guesser', guesser],
  ['one button', oneButton('C')],
  ['honest, says ?', honestLearner({ learnAfter: 2 })],
  ['honest, guesses', honestLearner({ learnAfter: 3, idkWhenUnknown: false })],
];

/** Play `sessions` sessions with both implementations; throws on the first difference. */
function lockstep(setup: Setup, strict: boolean, policy: Policy, seed: number, sessions: number, gapHours: number): number {
  const mode: SessionMode = { engine: strict ? createEngine(setup.set, STRICT_PACING) : createEngine(setup.set), diagnose: setup.withDiagnose ? diagnose : undefined };
  const oldMode: old.SessionMode = {
    engine: strict ? createOldEngine(setup.set, STRICT_PACING) : createOldEngine(setup.set),
    diagnose: setup.withDiagnose ? diagnose : undefined,
  };
  const state = mode.engine.newStudent();
  const oldState = oldMode.engine.newStudent();
  expect(state).toEqual(oldState);

  const rng = seededRng(seed);
  const oldRng = seededRng(seed);
  const kidRng = seededRng(seed + 1000);
  const seen = new Map<string, number>();
  let now = T0;
  let questions = 0;
  for (let n = 0; n < sessions; n++) {
    const session = startSession(setup.groups, 20, mode);
    const oldSession = old.startSession(setup.groups, 20, oldMode);
    while (!isFinished(session)) {
      expect(old.isFinished(oldSession)).toBe(false);
      const q = nextQuestion(session, state, now, rng);
      const oldQ = old.nextQuestion(oldSession, oldState, now, oldRng);
      expect(q, `question ${questions}`).toEqual(oldQ);

      const target = mode.engine.answerOf(q.itemId);
      expect(oldMode.engine.answerOf(q.itemId)).toBe(target);
      const { answer, rtMs } = policy.answer(q.itemId, target, seen.get(q.itemId) ?? 0, 0, kidRng);
      seen.set(q.itemId, (seen.get(q.itemId) ?? 0) + 1);
      now += Math.round(rtMs);

      const res = submit(session, state, answer, now);
      const oldRes = old.submit(oldSession, oldState, answer, now);
      expect(res, `result of question ${questions}`).toEqual(oldRes);
      expect(state, `state after question ${questions}`).toEqual(oldState);
      now += res.outcome === 'correct' ? 800 : 4000;
      questions++;
    }
    expect(old.isFinished(oldSession)).toBe(true);
    expect(session.results).toEqual(oldSession.results);
    expect(session.events).toEqual(oldSession.events);
    expect(summarize(session)).toEqual(old.summarize(oldSession));
    now += gapHours * HOUR;
  }
  // Both drew the same number of random numbers.
  expect(rng()).toBe(oldRng());
  return questions;
}

describe('lockstep: the generalized engine is identical to the pre-#18 one', () => {
  for (const setup of SETUPS) {
    describe(setup.name, () => {
      for (const [policyName, policy] of POLICIES) {
        it(`${policyName}: same picks, events and state, daily and in bursts`, { timeout: 30_000 }, () => {
          let questions = 0;
          for (const seed of [1, 2, 3]) {
            questions += lockstep(setup, false, policy, seed, 6, 24);
            // Bursts a few hours apart: forgetting, polish events and the not-yet-gold paths.
            questions += lockstep(setup, false, policy, seed + 10, 4, 3);
          }
          expect(questions).toBe(3 * (6 + 4) * 20);
        });
      }

      it('the original strict pacing too', { timeout: 30_000 }, () => {
        lockstep(setup, true, knower(0.9, 1500), 4, 6, 24);
        lockstep(setup, true, nameBeginner, 5, 6, 24);
      });
    });
  }

  it('direct engine calls agree: new learners, normalize, unlocking and wrong answers', () => {
    for (const set of [NAME_IT as ItemSet, LETTER_MATH as ItemSet]) {
      const engine = createEngine(set);
      const oldEngine = createOldEngine(set);
      const a = engine.newStudent();
      const b = oldEngine.newStudent();
      const lane = Object.keys(set.groups)[0]!;
      const first = set.groups[lane]![0]!.id;
      for (const [outcome, answer] of [['wrong', 'B'], ['idk', null], ['correct', engine.answerOf(first)], ['correct', engine.answerOf(first)], ['correct', engine.answerOf(first)]] as const) {
        const r1 = engine.recordAnswer(a, first, outcome, answer, 1200, T0 + DAY);
        const r2 = oldEngine.recordAnswer(b, first, outcome, answer, 1200, T0 + DAY);
        expect(r1).toEqual(r2);
      }
      expect(a).toEqual(b);
      delete a.items[set.items.at(-1)!.id];
      delete b.items[set.items.at(-1)!.id];
      expect(engine.normalize(a)).toEqual(oldEngine.normalize(b));
      expect(engine.maybeUnlock(a, lane, T0)).toEqual(oldEngine.maybeUnlock(b, lane, T0));
      expect(engine.maybeUnlock(a, 'nope', T0)).toBeNull();
      expect(a).toEqual(b);
    }
  });
});
