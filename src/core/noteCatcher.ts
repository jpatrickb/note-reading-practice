// Note Catcher: a note on the staff, tap its exact key on the piano (staff → keyboard location).
//
// Items are (clef, note), the same notes and teaching order as Name It but with their own learner
// model (D55). The answer is the exact key's note id ('G4', or 'C#4' for a black key), so octave
// matters: the right letter in the wrong octave is a wrong answer, with its own kind explanation.

import { COOLDOWN_MS, type LessonId, WINDOW } from './diagnose';
import { createEngine } from './engine';
import { TEACHING_ORDER } from './items';
import { defineItemSet } from './itemset';
import { type Clef, type Note, diatonic, fromDiatonic, noteId, parseNote } from './music';
import type { SessionMode } from './session';
import type { StudentState } from './engine';

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

const build = (clef: Clef): CatchItem[] =>
  TEACHING_ORDER[clef].map((n) => ({ id: `catch:${clef}:${n}`, clef, note: parseNote(n) }));

export const NOTE_CATCHER = defineItemSet<CatchItem, string>({
  id: 'catch',
  groups: { treble: build('treble'), bass: build('bass') },
  order: CANONICAL_ORDER,
  groupOf: (i) => i.clef,
  // The exact key: 'G4'. Octave matters.
  answerOf: (i) => noteId(i.note),
  // Same pacing as Name It: each note is its own fact.
  pacing: { firstTryRun: 1 },
});

export const catcherEngine = createEngine(NOTE_CATCHER);
export const catchItem = (id: string) => NOTE_CATCHER.get(id);

/** What the piano shows for each clef: every note a lane teaches, white key to white key. */
export const CATCHER_RANGE: Record<Clef, { low: string; high: string }> = {
  treble: { low: 'A3', high: 'C6' },
  bass: { low: 'C2', high: 'E4' },
};

/** The smallest key range worth showing: an octave, so the keys can still be told apart by pattern. */
export const MIN_WHITE_KEYS = 7;

/**
 * The white keys to show when the screen is too narrow for the clef's whole range at ≥ 44px a key:
 * `size` white keys (≥ 7) inside the range, always containing `target`, at a random offset so the
 * window's position gives little away. `rand` is in [0, 1). Returns white-key note ids.
 */
export function keyWindow(range: { low: string; high: string }, target: Note, size: number, rand: number): { low: string; high: string } {
  const lo = diatonic(parseNote(range.low));
  const hi = diatonic(parseNote(range.high));
  const total = hi - lo + 1;
  const n = Math.max(MIN_WHITE_KEYS, Math.min(size, total));
  if (n >= total) return range;
  const t = diatonic(target);
  const first = Math.max(lo, t - n + 1);
  const last = Math.min(t, hi - n + 1);
  const start = first + Math.floor(rand * (last - first + 1));
  return { low: noteId(fromDiatonic(start)), high: noteId(fromDiatonic(start + n - 1)) };
}

// ───────────────────────── wrong answers ─────────────────────────

export type Miss =
  /** The right letter in another octave; `octaves` is signed (+1 = one octave too high). */
  | { kind: 'octave'; octaves: number }
  /** A black key (a note that is not on the staff here). */
  | { kind: 'black' }
  | { kind: 'other'; note: Note };

/** Why an answer is wrong. */
export function classifyMiss(item: CatchItem, answer: string): Miss {
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
export function diagnoseCatcher(state: StudentState, now: number): LessonId | null {
  const errors = state.recentErrors.slice(-WINDOW).filter((e) => e.itemId.startsWith('catch:'));
  const octaveMisses = errors.filter((e) => classifyMiss(catchItem(e.itemId), e.answer).kind === 'octave');
  if (octaveMisses.length < 3) return null;
  const seen = state.lessonsSeen.octave ?? 0;
  if (now - seen < COOLDOWN_MS) return null;
  state.lessonsSeen.octave = now;
  return 'octave';
}

export const NOTE_CATCHER_MODE: SessionMode<string> = { engine: catcherEngine, diagnose: diagnoseCatcher };
