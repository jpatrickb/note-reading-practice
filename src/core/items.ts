// Name It practice items. An item = (task, clef, note): staff → name.

import { gradeToken, parseAnswerToken } from './accidentals';
import { defineItemSet } from './itemset';
import { type Clef, type Note, answerName, noteId, parseNote } from './music';

export type Task = 'name';

export interface Item {
  id: string;
  task: Task;
  clef: Clef;
  note: Note;
}

/**
 * The order notes are introduced in, per clef. Hand-written so a teacher can review and edit it.
 *
 * Rules (decision D33):
 *  - Start from a guide note (Treble G, Bass F), then stay close to guide notes.
 *  - The first 7 notes of each clef cover all 7 letters. Repeating a letter early (e.g. three
 *    different Cs) lets a kid score by pressing one button without reading.
 *  - Octave repeats and ledger notes come after the alphabet is complete.
 */
export const TEACHING_ORDER: Record<Clef, string[]> = {
  treble: ['G4', 'C4', 'A4', 'F4', 'E4', 'B4', 'D4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'C6', 'B5', 'A3', 'B3'],
  bass: ['F3', 'G3', 'E3', 'A3', 'D3', 'C3', 'B2', 'G2', 'A2', 'C4', 'B3', 'F2', 'E2', 'D4', 'E4', 'C2', 'D2'],
};

/**
 * Sharps and flats (issue #34, owner decision on #10): taught AFTER every natural and ledger note of the clef,
 * sharps and flats ALTERNATING, so neither modifier button can carry play, and with a different letter each time
 * (F B C E G A) so one letter key cannot either (D33). Natural signs come later (#10).
 * Kept apart from TEACHING_ORDER because Place It and Note Catcher derive their notes from that list.
 */
export const ACCIDENTAL_ORDER: Record<Clef, string[]> = {
  treble: ['F#4', 'Bb4', 'C#5', 'Eb5', 'G#4', 'Ab5'],
  bass: ['F#3', 'Bb2', 'C#3', 'Eb3', 'G#2', 'Ab3'],
};

/**
 * Which answer input an item uses (issue #34). THE MODE DECIDES, per item; the kid does not choose.
 * Naturals: the letter pad. Sharps and flats go [pad, pad, keys, keys] down ACCIDENTAL_ORDER: the first
 * two are spelled (the name and the symbol come first), the next two are answered on the 12-key keyboard
 * (the key relationship), and so on. Sharps and flats alternate, so each style meets both kinds.
 * A pure function of the item, so a saved or replayed session always shows the same input.
 */
export function inputStyleOf(item: Item): 'pad' | 'keys' {
  if (!item.note.acc) return 'pad';
  const at = ACCIDENTAL_ORDER[item.clef].indexOf(noteId(item.note));
  return at >= 0 && at % 4 >= 2 ? 'keys' : 'pad';
}

/** Does this item ask for a sharp or flat? */
export const isAccidental = (i: Item) => !!i.note.acc;

/**
 * The CANONICAL order of Name It items: progress codes store one record per item by its index here.
 * APPEND-ONLY: never reorder or remove (tests/canonical-order.test.ts pins every index). It is
 * separate from TEACHING_ORDER on purpose: notes can be added to any clef, or taught in a different
 * order, by editing TEACHING_ORDER and appending the new ids here.
 */
export const CANONICAL_ORDER: readonly string[] = [
  // treble
  'name:treble:G4', 'name:treble:C4', 'name:treble:A4', 'name:treble:F4',
  'name:treble:E4', 'name:treble:B4', 'name:treble:D4', 'name:treble:C5',
  'name:treble:D5', 'name:treble:E5', 'name:treble:F5', 'name:treble:G5',
  'name:treble:A5',
  // bass
  'name:bass:F3', 'name:bass:G3', 'name:bass:E3', 'name:bass:A3',
  'name:bass:D3', 'name:bass:C3', 'name:bass:B2', 'name:bass:G2',
  'name:bass:A2', 'name:bass:C4', 'name:bass:B3', 'name:bass:F2',
  'name:bass:E2',
  // two ledger lines (#24), appended so every earlier index stays put
  'name:treble:B5', 'name:treble:C6', 'name:treble:B3', 'name:treble:A3',
  'name:bass:D4', 'name:bass:E4', 'name:bass:D2', 'name:bass:C2',
  // sharps and flats (#34)
  'name:treble:F#4', 'name:treble:Bb4', 'name:treble:C#5', 'name:treble:Eb5', 'name:treble:G#4', 'name:treble:Ab5',
  'name:bass:F#3', 'name:bass:Bb2', 'name:bass:C#3', 'name:bass:Eb3', 'name:bass:G#2', 'name:bass:Ab3',
];

function build(clef: Clef): Item[] {
  return [...TEACHING_ORDER[clef], ...ACCIDENTAL_ORDER[clef]].map((id) => ({ id: `name:${clef}:${id}`, task: 'name' as const, clef, note: parseNote(id) }));
}

/** The Name It item set: one unlock lane per clef; the answer is the note's letter. */
export const NAME_IT = defineItemSet<Item, string>({
  id: 'name',
  groups: { treble: build('treble'), bass: build('bass') },
  order: CANONICAL_ORDER,
  groupOf: (i) => i.clef,
  // The answer is the spelled name ('C', 'F#', 'Bb'). The pad and the keyboard answer with TOKENS ('pad:Db',
  // 'keys:C#'), graded by gradeToken (pad: exact spelling, an enharmonic is wrong; keys: by pitch). A bare name
  // (the plain letter pad, old callers) must equal the spelling.
  answerOf: (i) => answerName(i.note),
  isCorrect: (i, answer) => (parseAnswerToken(answer) ? gradeToken(answer, answerName(i.note)) === 'correct' : answer === answerName(i.note)),
  // Placement tests the naturals only: a kid is never placed onto sharps and flats.
  placeable: (i) => !i.note.acc,
  // No transfer between notes (each is its own fact), so first-try credit is the only shortcut:
  // let it start one answer sooner.
  pacing: { firstTryRun: 1 },
});

/** Per clef, in teaching order. */
export const ITEMS_BY_CLEF = NAME_IT.groups as Record<Clef, Item[]>;

/** Canonical item list (see CANONICAL_ORDER): the progress-code format depends on this ORDER. */
export const ITEMS = NAME_IT.items as Item[];

export function itemById(id: string): Item {
  return NAME_IT.get(id);
}
