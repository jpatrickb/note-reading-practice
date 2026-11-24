// Practice items. An item = (task, clef, note). v0 only has the "name" task (staff → name).

import { introductionOrder } from './hints';
import { type Clef, type Note, noteId, notesInRange } from './music';

export type Task = 'name';

export interface Item {
  id: string;
  task: Task;
  clef: Clef;
  note: Note;
}

function build(clef: Clef): Item[] {
  return introductionOrder(notesInRange(clef), clef).map((note) => ({
    id: `name:${clef}:${noteId(note)}`,
    task: 'name' as const,
    clef,
    note,
  }));
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
