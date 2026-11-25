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
  treble: ['G4', 'C4', 'A4', 'F4', 'E4', 'B4', 'D4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5'],
  bass: ['F3', 'G3', 'E3', 'A3', 'D3', 'C3', 'B2', 'G2', 'A2', 'C4', 'B3', 'F2', 'E2'],
};

function build(clef: Clef): Item[] {
  return TEACHING_ORDER[clef].map((id) => ({ id: `name:${clef}:${id}`, task: 'name' as const, clef, note: parseNote(id) }));
}

/** The Name It item set: one unlock lane per clef; the answer is the note's letter. */
export const NAME_IT = defineItemSet<Item>({
  id: 'name',
  groups: { treble: build('treble'), bass: build('bass') },
  groupOf: (i) => i.clef,
  answerOf: (i) => i.note.letter,
  // No transfer between notes (each is its own fact), so first-try credit is the only shortcut:
  // let it start one answer sooner.
  pacing: { firstTryRun: 1 },
});

/** Per clef, in teaching order. */
export const ITEMS_BY_CLEF = NAME_IT.groups as Record<Clef, Item[]>;

/**
 * Canonical item list (treble, then bass). The progress-code format depends on this ORDER:
 * only ever APPEND new items, and bump the codec version if that's impossible.
 */
export const ITEMS = NAME_IT.items as Item[];

export function itemById(id: string): Item {
  return NAME_IT.get(id);
}
