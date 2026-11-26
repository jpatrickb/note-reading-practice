// Note Catcher: a note on the staff, tap its exact key on the piano (staff → keyboard location).
//
// Items are (clef, note), the same notes and teaching order as Name It but with their own learner
// model (D55). The answer is the exact key's note id ('G4'), so octave
// matters (black keys are never submitted: the UI just says to try again): the right letter in the wrong octave is a wrong answer, with its own kind explanation.

import { createEngine } from './engine';
import { TEACHING_ORDER } from './items';
import { defineItemSet } from './itemset';
import { type Clef, type Note, diatonic, noteId, parseNote } from './music';
import type { SessionMode } from './session';
import type { StudentState } from './engine';

/** How many recent errors the octave lesson looks at, and the quiet time after showing it. */
const WINDOW = 8;
const COOLDOWN_MS = 30 * 60_000;

export interface CatchItem {
  id: string;
  clef: Clef;
  note: Note;
}

/**
 * The CANONICAL order: progress codes store one record per item by its index here. APPEND-ONLY
 * (tests/canonical-order.test.ts pins it). Same notes as Name It, treble then bass.
 */
export const CANONICAL_ORDER: readonly string[] = [
  // treble
  'catch:treble:G4', 'catch:treble:C4', 'catch:treble:A4', 'catch:treble:F4',
  'catch:treble:E4', 'catch:treble:B4', 'catch:treble:D4', 'catch:treble:C5',
  'catch:treble:D5', 'catch:treble:E5', 'catch:treble:F5', 'catch:treble:G5',
  'catch:treble:A5', 'catch:treble:C6', 'catch:treble:B5', 'catch:treble:A3',
  'catch:treble:B3',
  // bass
  'catch:bass:F3', 'catch:bass:G3', 'catch:bass:E3', 'catch:bass:A3',
  'catch:bass:D3', 'catch:bass:C3', 'catch:bass:B2', 'catch:bass:G2',
  'catch:bass:A2', 'catch:bass:C4', 'catch:bass:B3', 'catch:bass:F2',
  'catch:bass:E2', 'catch:bass:D4', 'catch:bass:E4', 'catch:bass:C2',
  'catch:bass:D2',
];

/** Middle C: the anchor the keyboard always marks, so it is never asked (the marked key would be a free answer). */
export const MIDDLE_C = 'C4';
const isMiddleC = (n: string) => n === MIDDLE_C;

const build = (clef: Clef): CatchItem[] =>
  TEACHING_ORDER[clef].filter((n) => !isMiddleC(n)).map((n) => ({ id: `catch:${clef}:${n}`, clef, note: parseNote(n) }));

/** The C4 items, retired: they keep their canonical index (saved codes still decode) but are never asked. */
const retiredC4: CatchItem[] = (['treble', 'bass'] as Clef[]).map((clef) => ({ id: `catch:${clef}:${MIDDLE_C}`, clef, note: parseNote(MIDDLE_C) }));

export const NOTE_CATCHER = defineItemSet<CatchItem, string>({
  id: 'catch',
  groups: { treble: build('treble'), bass: build('bass') },
  retired: retiredC4,
  order: CANONICAL_ORDER,
  groupOf: (i) => i.clef,
  // The exact key: 'G4'. Octave matters.
  answerOf: (i) => noteId(i.note),
  // First-try credit after 1 right answer in a row (PARAMS' default is 2), the same as Name It: each
  // note is its own fact, and with ~28 keys a guesser is very unlikely to string one together.
  pacing: { firstTryRun: 1 },
});

export const catcherEngine = createEngine(NOTE_CATCHER);
export const catchItem = (id: string) => NOTE_CATCHER.get(id);

/**
 * The ONE keyboard both clefs share: the lowest bass note to the highest treble note, white key to
 * white key. A clef changes only the staff, never the keys, so treble and bass read as one piano.
 */
export const CATCHER_RANGE = { low: 'C2', high: 'C6' } as const;

// ───────────────────────── wrong answers ─────────────────────────

export type Miss =
  /** The right letter in another octave; `octaves` is signed (+1 = one octave too high). */
  | { kind: 'octave'; octaves: number }
  /** A black key (a note that is not on the staff here). */
  | { kind: 'black' }
  | { kind: 'other'; note: Note };

/** Why an answer is wrong. */
export function classifyMiss(item: { note: Note }, answer: string): Miss {
  const note = parseNote(answer);
  if (note.acc) return { kind: 'black' };
  if (note.letter === item.note.letter) return { kind: 'octave', octaves: note.octave - item.note.octave };
  return { kind: 'other', note };
}

/** Where to find a key, counted from middle C: "just above middle C", "4 white keys below middle C". */
export function whereIs(note: Note): string {
  const d = diatonic(note) - diatonic({ letter: 'C', octave: 4 });
  if (d === 0) return 'middle C';
  const n = Math.abs(d);
  return `${n} white key${n > 1 ? 's' : ''} ${d > 0 ? 'above' : 'below'} middle C`;
}

const COUNT = ['', 'one', 'two', 'three', 'four'];

/** The kid-facing reason a wrong answer was wrong, e.g. "That's the right letter, but one octave too high." */
export function missText(item: CatchItem, answer: string): string {
  const miss = classifyMiss(item, answer);
  const letter = item.note.letter;
  const spot = `This ${letter} is ${whereIs(item.note)}.`;
  if (miss.kind === 'octave') {
    const n = Math.abs(miss.octaves);
    return `That's the right letter, but ${COUNT[n] ?? n} octave${n > 1 ? 's' : ''} too ${miss.octaves > 0 ? 'high' : 'low'}. ${spot}`;
  }
  if (miss.kind === 'black') return `That's a black key. This note is a white key: ${letter}. ${spot}`;
  return `That's ${miss.note.letter}. This note is ${letter}. ${spot}`;
}

// ───────────────────────── diagnose ─────────────────────────

/** Right letter, wrong octave, ≥ 3 of the last 8 errors: suggest finding middle C first. */
export function diagnoseCatcher(state: StudentState, now: number): string | null {
  const errors = state.recentErrors.slice(-WINDOW).filter((e) => e.itemId.startsWith('catch:'));
  const octaveMisses = errors.filter((e) => classifyMiss(catchItem(e.itemId), e.answer).kind === 'octave');
  if (octaveMisses.length < 3) return null;
  const seen = state.lessonsSeen.octave ?? 0;
  if (now - seen < COOLDOWN_MS) return null;
  state.lessonsSeen.octave = now;
  return 'octave';
}

/** Note Catcher's own mini-lessons (Name It's live in diagnose.ts). */
export const CATCHER_LESSONS = {
  octave: {
    title: 'Right letter, different key!',
    body: [
      'You found the right letter, but in a different octave. The piano repeats the same letters again and again.',
      'Find middle C first: it sits just left of the two black keys in the middle of the piano, and on its own little line on the staff.',
      'Then count up or down from middle C, one white key at a time, until you reach your note.',
    ],
  },
} as const;

export const NOTE_CATCHER_MODE: SessionMode<string> = { engine: catcherEngine, diagnose: diagnoseCatcher, lessons: CATCHER_LESSONS };

/** Shown (not scored) when a black key is tapped: no staff note here is a black key, so just try again. */
export const BLACK_KEY_TIP = "That's a black key. This note is a white key. Try again!";
