// Feedback hints: position + mnemonic + landmark ("guide note").
// The teacher uses Faber + mnemonics; landmarks are added alongside (decision D15).

import { TEACHING_ORDER } from './items';
import {
  type Clef,
  type Note,
  describePosition,
  diatonic,
  letterWalk,
  noteId,
  parseNote,
  staffPosition,
} from './music';

export interface Landmark {
  note: Note;
  name: string;
  why: string;
}

export const LANDMARKS: Record<Clef, Landmark[]> = {
  treble: [
    { note: parseNote('C4'), name: 'Middle C', why: 'on its own little line below the treble staff' },
    { note: parseNote('G4'), name: 'Treble G', why: 'the line the treble clef curls around' },
    { note: parseNote('C5'), name: 'Treble C', why: 'the 3rd space' },
    { note: parseNote('C6'), name: 'High C', why: 'two ledger lines above the treble staff' },
  ],
  bass: [
    { note: parseNote('C4'), name: 'Middle C', why: 'on its own little line above the bass staff' },
    { note: parseNote('F3'), name: 'Bass F', why: "the line between the bass clef's two dots" },
    { note: parseNote('C3'), name: 'Bass C', why: 'the 2nd space' },
    { note: parseNote('C2'), name: 'Low C', why: 'two ledger lines below the bass staff' },
  ],
};

const MNEMONICS: Record<Clef, { lines: string; spaces: string }> = {
  treble: { lines: 'Every Good Boy Does Fine', spaces: 'F-A-C-E spells FACE' },
  bass: { lines: 'Good Boys Do Fine Always', spaces: 'All Cows Eat Grass' },
};

export interface Hint {
  position: string;
  mnemonic?: string;
  landmark: string;
}

export function nearestLandmark(note: Note, clef: Clef): { landmark: Landmark; distance: number } {
  let best: { landmark: Landmark; distance: number } | undefined;
  for (const landmark of LANDMARKS[clef]) {
    const distance = diatonic(note) - diatonic(landmark.note);
    if (!best || Math.abs(distance) < Math.abs(best.distance)) best = { landmark, distance };
  }
  return best!;
}

export function isLandmark(note: Note, clef: Clef): boolean {
  return nearestLandmark(note, clef).distance === 0;
}

/**
 * The guide note a hint counts from: the nearest one among those taught at or before this note in
 * the teaching order, so a hint never points at a guide note the kid has not met. A note outside the
 * lane (not taught) may use any.
 */
export function anchorFor(note: Note, clef: Clef): { landmark: Landmark; distance: number } {
  const order = TEACHING_ORDER[clef];
  const at = order.indexOf(noteId(note));
  if (at < 0) return nearestLandmark(note, clef);
  const known = LANDMARKS[clef].filter((l) => order.indexOf(noteId(l.note)) <= at);
  let best: { landmark: Landmark; distance: number } | undefined;
  for (const landmark of known) {
    const distance = diatonic(note) - diatonic(landmark.note);
    if (!best || Math.abs(distance) < Math.abs(best.distance)) best = { landmark, distance };
  }
  return best ?? nearestLandmark(note, clef);
}

export function hintFor(note: Note, clef: Clef): Hint {
  const pos = staffPosition(note, clef);
  const position = `This note is on ${describePosition(pos)}.`;

  let mnemonic: string | undefined;
  if (pos >= 0 && pos <= 8) {
    const onLine = pos % 2 === 0;
    const idx = onLine ? pos / 2 : (pos - 1) / 2;
    const phrase = onLine ? MNEMONICS[clef].lines : MNEMONICS[clef].spaces;
    const kind = onLine ? 'Lines' : 'Spaces';
    mnemonic = `${kind}, bottom to top: ${phrase}. Number ${idx + 1} is ${note.letter}.`;
  }

  const { landmark, distance } = anchorFor(note, clef);
  let landmarkText: string;
  if (distance === 0) {
    landmarkText = `This is a guide note: ${landmark.name}, ${landmark.why}.`;
  } else {
    const walk = letterWalk(landmark.note, note).join(' → ');
    const dir = distance > 0 ? 'up' : 'down';
    landmarkText = `Count ${dir} from ${landmark.name} (${landmark.why}): ${walk}.`;
  }

  return { position, mnemonic, landmark: landmarkText };
}
