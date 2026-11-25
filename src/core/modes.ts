// The game modes whose progress lives in a progress code, each with a permanent numeric tag.
//
// TAGS ARE PERMANENT: a tag is written into every progress code, so never reuse, renumber or remove
// one. A new mode appends one line with the next unused tag (see codec.ts for the v3 format).

import { type Engine, nameEngine } from './engine';
import { letterEngine } from './letters';

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
];
