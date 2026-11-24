// Feedback hints: position + mnemonic + landmark ("guide note").
// The teacher uses Faber + mnemonics; landmarks are added alongside (decision D15).

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
  ],
  bass: [
    { note: parseNote('C4'), name: 'Middle C', why: 'on its own little line above the bass staff' },
    { note: parseNote('F3'), name: 'Bass F', why: "the line between the bass clef's two dots" },
    { note: parseNote('C3'), name: 'Bass C', why: 'the 2nd space' },
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

  const { landmark, distance } = nearestLandmark(note, clef);
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

/** Teaching order for a clef: guide notes first, then outward by distance from the nearest guide note. */
export function introductionOrder(notes: Note[], clef: Clef): Note[] {
  const landmarkOrder = LANDMARKS[clef].map((l) => noteId(l.note));
  return [...notes].sort((a, b) => {
    const la = landmarkOrder.indexOf(noteId(a));
    const lb = landmarkOrder.indexOf(noteId(b));
    if (la !== -1 || lb !== -1) return (la === -1 ? 99 : la) - (lb === -1 ? 99 : lb);
    const da = Math.abs(nearestLandmark(a, clef).distance);
    const db = Math.abs(nearestLandmark(b, clef).distance);
    if (da !== db) return da - db;
    // Prefer notes inside the staff, then lower notes, for a stable order.
    const inA = staffPosition(a, clef) >= 0 && staffPosition(a, clef) <= 8 ? 0 : 1;
    const inB = staffPosition(b, clef) >= 0 && staffPosition(b, clef) <= 8 ? 0 : 1;
    return inA - inB || diatonic(a) - diatonic(b);
  });
}
