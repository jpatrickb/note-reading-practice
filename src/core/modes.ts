// The game modes whose progress lives in a progress code, each with a permanent numeric tag.
//
// TAGS ARE PERMANENT: a tag is written into every progress code, so never reuse, renumber or remove
// one. A new mode appends one line with the next unused tag (see codec.ts for the v3 format).

import { type Engine, nameEngine } from './engine';
import { letterEngine } from './letters';
import { placeEngine } from './placeIt';
import { catcherEngine } from './noteCatcher';
import { wordEngine } from './wordDecoder';

export interface CoreMode {
  /** Key of this mode's learner model in a profile. */
  id: string;
  /** Permanent section tag in progress codes (1–255). */
  tag: number;
  engine: Engine;
}

export const CORE_MODES: readonly CoreMode[] = [
  { id: 'name', tag: 1, engine: nameEngine },
  { id: 'letters', tag: 2, engine: letterEngine },
  { id: 'place', tag: 3, engine: placeEngine },
  { id: 'catch', tag: 4, engine: catcherEngine },
  { id: 'words', tag: 7, engine: wordEngine },
];

/** A registered mode by id; throws on an unknown id (for a mode file looking up its own entry). */
export function coreMode(id: string): CoreMode {
  const mode = CORE_MODES.find((m) => m.id === id);
  if (!mode) throw new Error(`Unknown mode: ${id}`);
  return mode;
}
