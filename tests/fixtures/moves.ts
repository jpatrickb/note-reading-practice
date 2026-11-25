// A TEST-ONLY item set whose answers are not letters: "How far did the melody move?" → step, skip
// or leap. It stands in for the future modes (keys, staff positions, words) so the engine, session
// and codec are proven against another answer type, and it has one item with TWO valid answers.
//
// Made up for tests; not a game mode and not in CORE_MODES.

import { createEngine } from '../../src/core/engine';
import { defineItemSet } from '../../src/core/itemset';
import type { SessionMode } from '../../src/core/session';

export type Move = 'step' | 'skip' | 'leap';
export const MOVES: readonly Move[] = ['step', 'skip', 'leap'];

export interface MoveItem {
  id: string;
  lane: 'a' | 'b';
  /** Letters moved. 1 = step, 2 = skip, 3 = a 4th (taught as a leap, but a skip is accepted), 4+ = leap. */
  gap: number;
}

/** The teaching answer for a gap. */
export const moveOf = (gap: number): Move => (gap === 1 ? 'step' : gap === 2 ? 'skip' : 'leap');

const lane = (name: 'a' | 'b', gaps: number[]): MoveItem[] =>
  gaps.map((gap, n) => ({ id: `mv:${name}:${n}:${gap}`, lane: name, gap }));

// The first three of each lane have three different answers (decisions D33, D56).
const A = lane('a', [1, 2, 4, 1, 3, 2, 5, 1]);
const B = lane('b', [2, 4, 1, 3, 2, 1]);

export const MOVE_SET = defineItemSet<MoveItem, Move>({
  id: 'moves',
  groups: { a: A, b: B },
  order: [...A, ...B].map((i) => i.id),
  groupOf: (i) => i.lane,
  answerOf: (i) => moveOf(i.gap),
  // A 4th: calling it a skip is fine too.
  isCorrect: (i, answer) => answer === moveOf(i.gap) || (i.gap === 3 && answer === 'skip'),
});

export const moveEngine = createEngine(MOVE_SET);
export const MOVE_MODE: SessionMode<Move> = { engine: moveEngine };

/** The one item with two valid answers. */
export const EITHER_ID = 'mv:a:4:3';
