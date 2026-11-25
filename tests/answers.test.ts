// The engine, session and codec with an answer type that isn't a letter (tests/fixtures/moves.ts:
// "step" | "skip" | "leap"), including an item with two valid answers.

import { describe, expect, it } from 'vitest';
import { decodeProfile, encodeProfile } from '../src/core/codec';
import { level } from '../src/core/engine';
import { defineItemSet } from '../src/core/itemset';
import type { CoreMode } from '../src/core/modes';
import { isFinished, nextQuestion, startSession, submit, summarize } from '../src/core/session';
import { EITHER_ID, MOVES, MOVE_MODE, MOVE_SET, type Move, moveEngine, moveOf } from './fixtures/moves';
import { DAY, T0, seededRng } from './helpers';

describe('item sets with another answer type', () => {
  it('answerOf gives the teaching answer; isCorrect defaults to equality', () => {
    expect(moveEngine.answerOf('mv:a:0:1')).toBe('step');
    expect(moveEngine.isCorrect('mv:a:0:1', 'step')).toBe(true);
    expect(moveEngine.isCorrect('mv:a:0:1', 'skip')).toBe(false);
    const plain = defineItemSet<{ id: string }, 'yes' | 'no'>({
      id: 'plain',
      groups: { g: [{ id: 'p1' }] },
      groupOf: () => 'g',
      answerOf: () => 'yes',
    });
    expect(plain.isCorrect).toBeUndefined();
  });

  it('isCorrect lets several answers be right', () => {
    expect(moveEngine.answerOf(EITHER_ID)).toBe('leap');
    expect(moveEngine.isCorrect(EITHER_ID, 'leap')).toBe(true);
    expect(moveEngine.isCorrect(EITHER_ID, 'skip')).toBe(true);
    expect(moveEngine.isCorrect(EITHER_ID, 'step')).toBe(false);
    // Only that item: a skip is not a leap anywhere else.
    expect(moveEngine.isCorrect('mv:a:2:4', 'skip')).toBe(false);
  });

  it('the first items open in each lane have different answers', () => {
    for (const items of Object.values(MOVE_SET.groups)) {
      const first = items.slice(0, 3).map((i) => MOVE_SET.answerOf(i));
      expect(new Set(first).size).toBe(3);
    }
  });

  it('is typed: only the mode’s own answers can be submitted', () => {
    const session = startSession(['a'], 1, MOVE_MODE);
    const state = moveEngine.newStudent();
    session.current = { itemId: 'mv:a:0:1', shownAt: T0 };
    // @ts-expect-error 'C' is a letter, not a Move
    expect(() => submit(session, state, 'C', T0 + 1)).not.toThrow();
  });
});

describe('a session over string answers, end to end', () => {
  it('scores, records confusions and reports mastery the same way', () => {
    const state = moveEngine.newStudent();
    const session = startSession(['a', 'b'], 12, MOVE_MODE);
    const rng = seededRng(21);
    let now = T0;
    let wrongKey: string | null = null;
    while (!isFinished(session)) {
      const q = nextQuestion(session, state, now, rng);
      const target = moveEngine.answerOf(q.itemId);
      const n = session.results.length;
      // "?" first, a clear miss second, then right answers (a skip for the either-or item).
      const answer: Move | null = n === 0 ? null : n === 1 ? MOVES.find((m) => !moveEngine.isCorrect(q.itemId, m))! : target;
      if (n === 1) wrongKey = `${q.itemId}>${answer}`;
      now += 1500;
      const res = submit(session, state, answer, now);
      expect(res.outcome).toBe(n === 0 ? 'idk' : n === 1 ? 'wrong' : 'correct');
      expect(res.lesson).toBeNull();
      now += 800;
    }
    const sum = summarize(session);
    expect(sum).toMatchObject({ total: 12, correct: 10, idk: 1 });
    // Confusion keys keep the `${itemId}>${answer}` format whatever the answer type.
    expect(state.confusions[wrongKey!]).toBe(1);
    expect(state.recentErrors).toHaveLength(1);
    expect(typeof state.recentErrors[0]!.answer).toBe('string');
  });

  it('accepts either valid answer, and a wrong one still costs more than "?"', () => {
    for (const [answer, outcome] of [['leap', 'correct'], ['skip', 'correct'], ['step', 'wrong'], [null, 'idk']] as const) {
      const state = moveEngine.newStudent();
      const session = startSession(['a'], 5, MOVE_MODE);
      session.current = { itemId: EITHER_ID, shownAt: T0 };
      expect(submit(session, state, answer, T0 + 1000).outcome).toBe(outcome);
    }
  });

  it('discourages the same answer twice in a row (answer keys, not letters)', () => {
    const state = moveEngine.newStudent();
    for (const id of Object.keys(state.items)) state.items[id]!.unlocked = true;
    const rng = seededRng(22);
    const prev = [{ itemId: 'mv:a:0:1', correct: true }]; // answered "step"
    const picks = Array.from({ length: 400 }, () => moveEngine.selectItem(state, ['a', 'b'], T0, rng, prev));
    const steps = picks.filter((p) => moveEngine.answerOf(p) === 'step').length;
    // 3 of 14 items are steps (and the repeat of the item itself is avoided): a fair share is ~20%.
    expect(steps / 400).toBeLessThan(0.12);
  });

  it('plays across days to silver and gold like any mode', () => {
    const state = moveEngine.newStudent();
    const rng = seededRng(23);
    let now = T0;
    for (let day = 0; day < 4; day++) {
      const session = startSession(['a', 'b'], 20, MOVE_MODE);
      while (!isFinished(session)) {
        const q = nextQuestion(session, state, now, rng);
        now += 1200;
        submit(session, state, moveEngine.answerOf(q.itemId), now);
        now += 600;
      }
      now += DAY;
    }
    const levels = MOVE_SET.items.map((i) => level(state.items[i.id]!));
    expect(levels).toContain('gold');
    expect(levels.filter((l) => l === 'locked').length).toBeLessThan(MOVE_SET.items.length - 6);
  });

  it('saves and loads in a progress code like any mode', () => {
    const mode: CoreMode = { id: 'moves', tag: 90, engine: moveEngine };
    const state = moveEngine.newStudent();
    const rng = seededRng(24);
    let now = T0;
    const session = startSession(['a', 'b'], 20, MOVE_MODE);
    while (!isFinished(session)) {
      const q = nextQuestion(session, state, now, rng);
      now += 1000;
      submit(session, state, moveEngine.answerOf(q.itemId), now);
    }
    const code = encodeProfile({ moves: state }, now, [mode]);
    const back = decodeProfile(code, now, [mode]).moves!;
    for (const i of MOVE_SET.items) {
      const was = state.items[i.id]!;
      expect([i.id, back.items[i.id]!.unlocked, back.items[i.id]!.best, back.items[i.id]!.n]).toEqual([
        i.id,
        was.unlocked,
        was.best,
        Math.min(15, was.n),
      ]);
    }
  });
});

describe('the answer type is only a label', () => {
  it('moveOf covers every gap', () => {
    expect([1, 2, 3, 4, 7].map(moveOf)).toEqual(['step', 'skip', 'leap', 'leap', 'leap']);
  });
});
