// Key to Staff: a key lights up on the piano; write that note on the staff (keyboard → staff).
//
// CLEF CHOICE: the clef is the lane the kid chose. Items are (clef, note); a clef's items only use
// the notes that clef's staff holds comfortably (the same 12 per clef as Place It). The shared
// middle-register keys (C4 and its neighbours) therefore appear in whichever lane the kid picked,
// and the staff shown always matches that lane. The kid never has to decide which clef to write in.
//
// The answer is the note id the placed position stands for ('G4'), so the right letter in another
// octave is a different answer: wrong, with its own kind words. The octave classification is Note
// Catcher's own `classifyMiss` (one helper, two modes).

import { createEngine } from './engine';
import { defineItemSet } from './itemset';
import { type Clef, type Note, noteAtPosition, noteId, parseNote } from './music';
import { classifyMiss, whereIs } from './noteCatcher';
import { TEACHING_ORDER as PLACE_ORDER, article, placeRange } from './placeIt';
import type { SessionMode } from './session';

export { CATCHER_RANGE as KEY_TO_STAFF_KEYBOARD } from './noteCatcher';

export interface KeyItem {
  id: string;
  clef: Clef;
  note: Note;
}

/** The CANONICAL order (progress-code order). APPEND-ONLY; pinned by tests/canonical-order.test.ts. */
export const CANONICAL_ORDER: readonly string[] = [
  'k2s:treble:G4', 'k2s:treble:C4', 'k2s:treble:A4', 'k2s:treble:F4',
  'k2s:treble:E4', 'k2s:treble:B4', 'k2s:treble:D4', 'k2s:treble:C5',
  'k2s:treble:D5', 'k2s:treble:E5', 'k2s:treble:F5', 'k2s:treble:G5',
  'k2s:bass:F3', 'k2s:bass:G3', 'k2s:bass:E3', 'k2s:bass:A3',
  'k2s:bass:D3', 'k2s:bass:C3', 'k2s:bass:B2', 'k2s:bass:G2',
  'k2s:bass:A2', 'k2s:bass:C4', 'k2s:bass:B3', 'k2s:bass:F2',
];

const build = (clef: Clef): KeyItem[] => PLACE_ORDER[clef].map((n) => ({ id: `k2s:${clef}:${n}`, clef, note: parseNote(n) }));

/** The answer is the note the placed position stands for in the item's clef: 'G4'. */
export const KEY_TO_STAFF = defineItemSet<KeyItem, string>({
  id: 'k2s',
  groups: { treble: build('treble'), bass: build('bass') },
  order: CANONICAL_ORDER,
  groupOf: (i) => i.clef,
  answerOf: (i) => noteId(i.note),
  // Like Name It: each note is its own fact, so first-try credit is the only shortcut.
  pacing: { firstTryRun: 1 },
});

export const keyToStaffEngine = createEngine(KEY_TO_STAFF);
export const KEY_TO_STAFF_MODE: SessionMode<string> = { engine: keyToStaffEngine };
export const keyItem = (id: string): KeyItem => KEY_TO_STAFF.get(id);

/** The answer a tapped staff position means, as a note id in this clef. */
export const answerAt = (pos: number, clef: Clef): string => noteId(noteAtPosition(pos, clef));

/** Every answer one clef's staff offers: what a kid sees (12 per clef). */
export function keyAnswerSpace(clef: Clef = 'treble'): string[] {
  const { low, high } = placeRange(clef);
  return Array.from({ length: high - low + 1 }, (_, i) => answerAt(low + i, clef));
}

export function keyLabel(id: string): string {
  const item = keyItem(id);
  return `${noteId(item.note)} key (${item.clef} clef)`;
}

const COUNT = ['', 'one', 'two', 'three', 'four'];

/** Kind words for a wrong placement: the right letter in another octave, or another letter. */
export function wrongKeyPlacement(item: KeyItem, answer: string): string {
  const miss = classifyMiss(item, answer);
  const letter = item.note.letter;
  const spot = `The lit key is ${article(letter)} ${letter}, ${whereIs(item.note)}.`;
  if (miss.kind === 'octave') {
    const n = Math.abs(miss.octaves);
    return `That's the right letter, but ${COUNT[n] ?? n} octave${n > 1 ? 's' : ''} too ${miss.octaves > 0 ? 'high' : 'low'}. ${spot}`;
  }
  const other = miss.kind === 'other' ? miss.note.letter : '?';
  return `That spot is ${article(other)} ${other}. ${spot}`;
}
