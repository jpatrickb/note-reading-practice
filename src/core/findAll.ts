// Find All: "Find all the Gs!" The kid taps every white key with that letter name on the ONE keyboard
// Note Catcher uses (C2 to C6, middle C marked), so the whole piano is one mental map.
//
// One item per letter; the answer is the letter. The kid makes several taps per question, but that is
// the input's business (src/ui/findAll.ts): the engine sees ONE answer, the letter when every key was
// found, or the letter of the first wrong key (which feeds the confusion matrix). Black keys are not
// part of this mode (they are not letters; they wait for the sharps/flats mode) and never score.

import { type StudentState, createEngine, level } from './engine';
import { defineItemSet } from './itemset';
import type { Letter } from './music';
import { CATCHER_RANGE } from './noteCatcher';
import type { SessionMode } from './session';

/** Stage 1 ('near'): only the keys in the two octaves around middle C count. Stage 2 ('far'): the whole keyboard. */
export type Span = 'near' | 'far';

export interface FindItem {
  id: string;
  letter: Letter;
  span: Span;
}

/**
 * The stage-1 zone: C3 to B4, 14 white keys, 7 on each side of middle C's octave line (C4 is the first
 * key of the upper octave). Why this and not C3-C5: every letter then has exactly 2 keys (an even,
 * learnable pair: "one in each octave"), the zone is symmetric around the anchor the kid already knows,
 * and it ends on a B so no letter gets a lone third key at the edge.
 */
export const NEAR_ZONE = { low: 'C3', high: 'B4' } as const;

/** Teaching order: the anchors first (C, F: the black-key groups), their neighbors next. First three answers differ. */
const TEACHING: readonly Letter[] = ['C', 'F', 'E', 'B', 'D', 'G', 'A'];

export const NEAR_LANE = 'near';
export const FAR_LANE = 'keys';
/** Kept for callers that mean the whole-keyboard lane. */
export const FIND_LANE = FAR_LANE;

/**
 * The CANONICAL order (progress codes); APPEND-ONLY, pinned by tests/find-all.test.ts. The seven
 * whole-keyboard items came first; the gentle two-octave stage was appended after them.
 */
export const CANONICAL_ORDER: readonly string[] = [...TEACHING.map((l) => `find:${l}`), ...TEACHING.map((l) => `find:2oct:${l}`)];

/** Every white key on the shared keyboard (C2 to C6), as note ids, low to high. */
const WHITES: readonly string[] = (() => {
  const out: string[] = [];
  for (let o = Number(CATCHER_RANGE.low.slice(1)); o <= Number(CATCHER_RANGE.high.slice(1)); o++) {
    for (const l of 'CDEFGAB') out.push(`${l}${o}`);
  }
  return out.slice(0, out.indexOf(CATCHER_RANGE.high) + 1);
})();

const inZone = (k: string) => WHITES.indexOf(k) >= WHITES.indexOf(NEAR_ZONE.low) && WHITES.indexOf(k) <= WHITES.indexOf(NEAR_ZONE.high);

/** Is this white key inside the stage-1 zone? */
export const isNearKey = inZone;

/** The keys to find for a letter, low to high: whole keyboard ("G2".."G5") or just the zone ("G3", "G4"). */
export const targetsOf = (letter: Letter, span: Span = 'far'): string[] =>
  WHITES.filter((k) => k[0] === letter && (span === 'far' || inZone(k)));

export const FIND_ALL = defineItemSet<FindItem, string>({
  id: 'find',
  groups: {
    [NEAR_LANE]: TEACHING.map((letter) => ({ id: `find:2oct:${letter}`, letter, span: 'near' as const })),
    [FAR_LANE]: TEACHING.map((letter) => ({ id: `find:${letter}`, letter, span: 'far' as const })),
  },
  order: CANONICAL_ORDER,
  groupOf: (i) => (i.span === 'near' ? NEAR_LANE : FAR_LANE),
  answerOf: (i) => i.letter,
  // A question takes as many taps as it has keys: the speed baseline is per key, so C (five keys) is not "slow".
  rtUnits: (i) => targetsOf(i.letter, i.span).length,
  pacing: { firstTryRun: 1 },
});

/**
 * Which lanes a session practices: the gentle two-octave stage until every one of its letters is silver
 * or better, then both (the near letters stay in rotation, so they keep getting polished).
 */
export function findGroups(state: StudentState | undefined): string[] {
  const done = !!state && (FIND_ALL.groups[NEAR_LANE] ?? []).every((i) => ['silver', 'gold'].includes(level(state.items[i.id]!)));
  return done ? [NEAR_LANE, FAR_LANE] : [NEAR_LANE];
}

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
