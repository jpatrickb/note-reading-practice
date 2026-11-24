// Practice items. An item = (task, clef, note). v0 only has the "name" task (staff → name).

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

/** Per clef, in teaching order. */
export const ITEMS_BY_CLEF: Record<Clef, Item[]> = { treble: build('treble'), bass: build('bass') };

/**
 * Canonical item list. The progress-code format depends on this ORDER:
 * only ever APPEND new items, and bump the codec version if that's impossible.
 */
export const ITEMS: Item[] = [...ITEMS_BY_CLEF.treble, ...ITEMS_BY_CLEF.bass];

const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

export function itemById(id: string): Item {
  const item = BY_ID.get(id);
  if (!item) throw new Error(`Unknown item: ${id}`);
  return item;
}

