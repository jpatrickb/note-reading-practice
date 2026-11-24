// Letter Math: musical-alphabet fluency with no staff (decision D5). "What comes after G?",
// "Skip up from C", "What's a 5th up from D?". The foundation of intervals and chords.
//
// It reuses the shared adaptive engine: this file only defines the items, the order they unlock
// in (one ladder, easiest first), the correct letter, and the kid-facing wording and hints.

import { createEngine } from './engine';
import { defineItemSet } from './itemset';
import { LETTERS, type Letter, type Note, diatonic, fromDiatonic, shiftLetter } from './music';
import type { SessionMode } from './session';

export type IntervalSize = 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type Rung = 'after' | 'before' | 'skipUp' | 'skipDown' | `up${IntervalSize}` | `down${IntervalSize}`;

export interface LetterItem {
  id: string;
  rung: Rung;
  start: Letter;
  /** Letters moved, signed: +1 = next letter up, -2 = skip down, +4 = a 5th up. */
  steps: number;
}

/** The single unlock lane: the whole ladder is one teaching order. */
export const LETTER_GROUP = 'letters';

/**
 * The ladder, easiest first. Hand-written so a teacher can review and edit it. Each rung lists its
 * start letters in teaching order. Rules:
 *  - Each rung covers all 7 answer letters, and the first three items (open from the start) have
 *    three different answers, so one button can't carry early play.
 *  - The wrap-around (G → A going up, A → G going down) comes right after the first three, so it's
 *    learned early but not on the very first question.
 *  - Skips follow the chain C E G B D F A, the letters of stacked thirds (chords!).
 *  - Numbered intervals start with 2nds and 3rds (new names for steps and skips), then octaves,
 *    5ths, 4ths, 6ths, 7ths. Their start letters go around the circle of fifths.
 *
 * Item ids depend on (rung, start) only, but the progress code depends on this ORDER: only append.
 */
const CIRCLE = 'CGDAEBF';
export const LADDER: { rung: Rung; starts: string }[] = [
  { rung: 'after', starts: 'CEAGDFB' }, // answers D F B A E G C
  { rung: 'before', starts: 'DGBAEFC' }, // answers C F A G D E B
  { rung: 'skipUp', starts: 'CEGBDFA' }, // answers E G B D F A C
  { rung: 'skipDown', starts: 'CAFDBGE' }, // answers A F D B G E C
  ...([2, 3, 8, 5, 4, 6, 7] as IntervalSize[]).flatMap((n) => [
    { rung: `up${n}` as Rung, starts: CIRCLE },
    { rung: `down${n}` as Rung, starts: CIRCLE },
  ]),
];

/** Signed letters moved for a rung. */
export function rungSteps(rung: Rung): number {
  if (rung === 'after') return 1;
  if (rung === 'before') return -1;
  if (rung === 'skipUp') return 2;
  if (rung === 'skipDown') return -2;
  const size = Number(rung.replace(/\D/g, ''));
  return rung.startsWith('up') ? size - 1 : -(size - 1);
}

/** Interval number for numbered rungs (2–8), or null for after/before/skips. */
export function rungSize(rung: Rung): IntervalSize | null {
  return /^(up|down)\d$/.test(rung) ? (Number(rung.slice(-1)) as IntervalSize) : null;
}

const ORDINALS: Record<IntervalSize, string> = { 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 7: '7th', 8: '8th' };
export const ordinal = (n: IntervalSize) => ORDINALS[n];
/** "a 5th", "an 8th". */
const withArticle = (n: IntervalSize) => `${n === 8 ? 'an' : 'a'} ${ORDINALS[n]}`;
const upDown = (item: LetterItem) => (item.steps > 0 ? 'up' : 'down');

/** Short title for a rung (mastery map rows). */
export function rungTitle(rung: Rung): string {
  if (rung === 'after') return 'Next letter up';
  if (rung === 'before') return 'Next letter down';
  if (rung === 'skipUp') return 'Skip up';
  if (rung === 'skipDown') return 'Skip down';
  return `${ordinal(rungSize(rung)!)} ${rung.startsWith('up') ? 'up' : 'down'}`;
}

function buildItems(): LetterItem[] {
  return LADDER.flatMap(({ rung, starts }) =>
    [...starts].map((s) => ({ id: `lm:${rung}:${s}`, rung, start: s as Letter, steps: rungSteps(rung) })),
  );
}

export function letterAnswer(item: LetterItem): Letter {
  return shiftLetter(item.start, item.steps);
}

export const LETTER_MATH = defineItemSet<LetterItem>({
  id: 'letters',
  groups: { [LETTER_GROUP]: buildItems() },
  groupOf: () => LETTER_GROUP,
  answerOf: letterAnswer,
});

export const LETTER_ITEMS = LETTER_MATH.items;
export const letterEngine = createEngine(LETTER_MATH);
export const LETTER_MATH_MODE: SessionMode = { engine: letterEngine };

export const isLetterItemId = (id: string) => id.startsWith('lm:');
export const letterItem = (id: string) => LETTER_MATH.get(id);

// ───────────────────────── wording ─────────────────────────

/** The question, split so the start letter can be shown big: `${lead} ${letter}${tail}`. */
export function prompt(item: LetterItem): { lead: string; letter: Letter; tail: string } {
  const size = rungSize(item.rung);
  const letter = item.start;
  if (item.rung === 'after') return { lead: 'What comes after', letter, tail: '?' };
  if (item.rung === 'before') return { lead: 'What comes before', letter, tail: '?' };
  if (item.rung === 'skipUp') return { lead: 'Skip up from', letter, tail: '. Where do you land?' };
  if (item.rung === 'skipDown') return { lead: 'Skip down from', letter, tail: '. Where do you land?' };
  return { lead: `What's ${withArticle(size!)} ${upDown(item)} from`, letter, tail: '?' };
}

/** Short name for toasts and the summary, e.g. "after G", "a 5th up from D". */
export function letterLabel(id: string): string {
  const item = letterItem(id);
  const size = rungSize(item.rung);
  if (item.rung === 'after') return `after ${item.start}`;
  if (item.rung === 'before') return `before ${item.start}`;
  if (item.rung === 'skipUp') return `skip up from ${item.start}`;
  if (item.rung === 'skipDown') return `skip down from ${item.start}`;
  return `${withArticle(size!)} ${upDown(item)} from ${item.start}`;
}

/** The answer as a sentence: "After G comes A." */
export function answerSentence(item: LetterItem): string {
  const ans = letterAnswer(item);
  if (item.rung === 'after') return `After ${item.start} comes ${ans}.`;
  if (item.rung === 'before') return `Before ${item.start} comes ${ans}.`;
  if (item.rung === 'skipUp' || item.rung === 'skipDown') {
    return `Skip ${item.steps > 0 ? 'up' : 'down'} from ${item.start} and you land on ${ans}.`;
  }
  const phrase = withArticle(rungSize(item.rung)!);
  return `${phrase[0]!.toUpperCase()}${phrase.slice(1)} ${upDown(item)} from ${item.start} is ${ans}.`;
}

export interface WalkStep {
  letter: Letter;
  /** Count label for numbered intervals (the start letter is 1). */
  n?: number;
  /** A letter jumped over by a skip. */
  skipped?: boolean;
}

export interface LetterHint {
  /** The letters walked from the start to the answer, inclusive. */
  walk: WalkStep[];
  lines: string[];
}

/** Letters walked from `start`, `steps` letters up (positive) or down, inclusive. */
export function walkLetters(start: Letter, steps: number): Letter[] {
  const dir = steps >= 0 ? 1 : -1;
  return Array.from({ length: Math.abs(steps) + 1 }, (_, i) => shiftLetter(start, i * dir));
}

/** Does this walk go past the end of the alphabet (G → A up, or A → G down)? */
function wraps(walk: Letter[], up: boolean): boolean {
  return walk.some((l, i) => i > 0 && (up ? walk[i - 1] === 'G' && l === 'A' : walk[i - 1] === 'A' && l === 'G'));
}

export function letterHint(item: LetterItem): LetterHint {
  const up = item.steps > 0;
  const letters = walkLetters(item.start, item.steps);
  const ans = letterAnswer(item);
  const wrapLine = up ? 'After G, the alphabet starts over at A.' : 'Before A, the alphabet loops back around to G.';
  const wrapped = wraps(letters, up);
  const size = rungSize(item.rung);

  if (size === null && Math.abs(item.steps) === 1) {
    return {
      walk: letters.map((letter) => ({ letter })),
      lines: [
        wrapped
          ? `The musical alphabet only goes from A to G. ${wrapLine}`
          : `Go ${up ? 'up' : 'back'} one letter in the musical alphabet: A B C D E F G.`,
      ],
    };
  }
  if (size === null) {
    const chain = up ? 'C E G B D F A' : 'A F D B G E C';
    return {
      walk: letters.map((letter, i) => ({ letter, skipped: i === 1 })),
      lines: [
        `A skip jumps over one letter: from ${item.start}, hop over ${letters[1]}, land on ${ans}.`,
        ...(wrapped ? [wrapLine] : []),
        `Skips make a chain: ${chain}.`,
      ],
    };
  }
  const counted = letters.map((l, i) => `${l}(${i + 1})`).join(' ');
  const intro: Partial<Record<IntervalSize, string>> = {
    2: 'A 2nd is the very next letter.',
    3: 'A 3rd is a skip.',
    8: 'An 8th (an octave) lands on the same letter.',
  };
  return {
    walk: letters.map((letter, i) => ({ letter, n: i + 1 })),
    lines: [
      ...(intro[size] ? [intro[size]] : []),
      `Count ${size} letters ${up ? 'up' : 'down'}, starting on ${item.start}: ${counted}.`,
      ...(wrapped ? [wrapLine] : []),
    ],
  };
}

/** Notes to play after answering: the start note, then the answer note (natural notes near middle C). */
export function letterNotes(item: LetterItem): [Note, Note] {
  const start: Note = { letter: item.start, octave: 4 };
  return [start, fromDiatonic(diatonic(start) + item.steps)];
}

/** Rungs in ladder order, each with its items by start letter A–G (for the mastery map). */
export function rungRows(): { rung: Rung; items: LetterItem[] }[] {
  const az = [...LETTERS.slice(5), ...LETTERS.slice(0, 5)]; // A B C D E F G
  return LADDER.map(({ rung }) => ({ rung, items: az.map((l) => letterItem(`lm:${rung}:${l}`)) }));
}
