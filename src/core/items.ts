// Name It practice items. An item = (task, clef, note): staff → name.

import { defineItemSet } from './itemset';
import { type Clef, type Note, parseNote } from './music';

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
];

function build(clef: Clef): Item[] {
  return TEACHING_ORDER[clef].map((id) => ({ id: `name:${clef}:${id}`, task: 'name' as const, clef, note: parseNote(id) }));
}

/** The Name It item set: one unlock lane per clef; the answer is the note's letter. */
export const NAME_IT = defineItemSet<Item>({
  id: 'name',
  groups: { treble: build('treble'), bass: build('bass') },
  order: CANONICAL_ORDER,
  groupOf: (i) => i.clef,
  answerOf: (i) => i.note.letter,
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
