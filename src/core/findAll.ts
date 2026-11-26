// Find All: "Find all the Gs!" The kid taps every white key with that letter name on the ONE keyboard
// Note Catcher uses (C2 to C6, middle C marked), so the whole piano is one mental map.
//
// One item per letter; the answer is the letter. The kid makes several taps per question, but that is
// the input's business (src/ui/findAll.ts): the engine sees ONE answer, the letter when every key was
// found, or the letter of the first wrong key (which feeds the confusion matrix). Black keys are not
// part of this mode (they are not letters; they wait for the sharps/flats mode) and never score.

import { createEngine } from './engine';
import { defineItemSet } from './itemset';
import type { Letter } from './music';
import { CATCHER_RANGE } from './noteCatcher';
import type { SessionMode } from './session';

export interface FindItem {
  id: string;
  letter: Letter;
}

/** Teaching order: the anchors first (C, F: the black-key groups), their neighbors next. First three answers differ. */
const TEACHING: readonly Letter[] = ['C', 'F', 'E', 'B', 'D', 'G', 'A'];

/** The CANONICAL order (progress codes); APPEND-ONLY, pinned by tests/canonical-order.test.ts. */
export const CANONICAL_ORDER: readonly string[] = TEACHING.map((l) => `find:${l}`);

export const FIND_LANE = 'keys';

/** Every white key on the shared keyboard (C2 to C6), as note ids, low to high. */
const WHITES: readonly string[] = (() => {
  const out: string[] = [];
  for (let o = Number(CATCHER_RANGE.low.slice(1)); o <= Number(CATCHER_RANGE.high.slice(1)); o++) {
    for (const l of 'CDEFGAB') out.push(`${l}${o}`);
  }
  return out.slice(0, out.indexOf(CATCHER_RANGE.high) + 1);
})();

/** The keys to find for a letter, low to high: "G2", "G3", "G4", "G5". */
export const targetsOf = (letter: Letter): string[] => WHITES.filter((k) => k[0] === letter);

export const FIND_ALL = defineItemSet<FindItem, string>({
  id: 'find',
  groups: { [FIND_LANE]: TEACHING.map((letter) => ({ id: `find:${letter}`, letter })) },
  order: CANONICAL_ORDER,
  groupOf: () => FIND_LANE,
  answerOf: (i) => i.letter,
  // A question takes as many taps as it has keys: the speed baseline is per key, so C (five keys) is not "slow".
  rtUnits: (i) => targetsOf(i.letter).length,
  pacing: { firstTryRun: 1 },
});

export const findEngine = createEngine(FIND_ALL);
export const findItem = (id: string) => FIND_ALL.get(id);

/**
 * The one answer the engine receives for a finished question: the item's letter when every key was
 * found, otherwise the letter of the first wrong key (never the item's own, so it grades wrong).
 */
export const answerFor = (item: FindItem, wrongKey: string | null): string => (wrongKey === null ? item.letter : wrongKey[0]!);

/** "Find all the Gs!" */
export const promptText = (item: FindItem) => `Find all the ${item.letter}s!`;

/** The black-key landmark that places each letter, using only guide letters taught before it. */
const LANDMARK: Record<Letter, string> = {
  C: 'C is just to the left of each group of two black keys.',
  F: 'F is just to the left of each group of three black keys.',
  E: 'E is just to the right of each group of two black keys.',
  B: 'B is just to the right of each group of three black keys.',
  D: 'D is in the middle of each group of two black keys, just right of C.',
  G: 'G sits inside each group of three black keys, between the first and second black key, just right of F.',
  A: 'A sits inside each group of three black keys, between the second and third black key, just right of G.',
};
export const landmarkFor = (letter: Letter) => LANDMARK[letter];

export const FIND_ALL_MODE: SessionMode<string> = { engine: findEngine };
