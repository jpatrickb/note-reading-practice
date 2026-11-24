// Music primitives: natural notes, clefs, staff positions.
// v0 covers natural notes only; accidentals come later (see docs/design.md §2).

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export type Letter = (typeof LETTERS)[number];
export type Clef = 'treble' | 'bass';

export interface Note {
  letter: Letter;
  octave: number;
}

const SEMITONES = [0, 2, 4, 5, 7, 9, 11];

/** Diatonic step index: C0 = 0, D0 = 1, … C4 = 28. */
export function diatonic(n: Note): number {
  return n.octave * 7 + LETTERS.indexOf(n.letter);
}

export function fromDiatonic(d: number): Note {
  const octave = Math.floor(d / 7);
  return { letter: LETTERS[d - octave * 7]!, octave };
}

export function noteId(n: Note): string {
  return `${n.letter}${n.octave}`;
}

export function parseNote(id: string): Note {
  const m = /^([A-G])(-?\d)$/.exec(id);
  if (!m) throw new Error(`Bad note id: ${id}`);
  return { letter: m[1] as Letter, octave: Number(m[2]) };
}

export function midi(n: Note): number {
  return 12 * (n.octave + 1) + SEMITONES[LETTERS.indexOf(n.letter)]!;
}

export function frequency(n: Note): number {
  return 440 * 2 ** ((midi(n) - 69) / 12);
}

/** Letter `steps` letters away (positive = up), wrapping through the musical alphabet. */
export function shiftLetter(l: Letter, steps: number): Letter {
  return LETTERS[(((LETTERS.indexOf(l) + steps) % 7) + 7) % 7]!;
}

/** Letters walked from `from` to `to` inclusive, e.g. G→B = [G, A, B]. */
export function letterWalk(from: Note, to: Note): Letter[] {
  const a = diatonic(from);
  const b = diatonic(to);
  const dir = b >= a ? 1 : -1;
  const out: Letter[] = [];
  for (let d = a; d !== b + dir; d += dir) out.push(fromDiatonic(d).letter);
  return out;
}

/** Diatonic index of each clef's bottom staff line. */
const BOTTOM_LINE: Record<Clef, number> = {
  treble: diatonic({ letter: 'E', octave: 4 }),
  bass: diatonic({ letter: 'G', octave: 2 }),
};

/** Staff position: 0 = bottom line, 1 = first space, … 8 = top line. Negative = below. */
export function staffPosition(n: Note, clef: Clef): number {
  return diatonic(n) - BOTTOM_LINE[clef];
}

export function noteAtPosition(pos: number, clef: Clef): Note {
  return fromDiatonic(BOTTOM_LINE[clef] + pos);
}

/** Positions of ledger lines needed to draw a note at `pos`. */
export function ledgerLines(pos: number): number[] {
  const out: number[] = [];
  for (let p = -2; p >= pos; p -= 2) out.push(p);
  for (let p = 10; p <= pos; p += 2) out.push(p);
  return out;
}

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th'];

/** Kid-friendly description of where a note sits. */
export function describePosition(pos: number): string {
  if (pos >= 0 && pos <= 8) {
    return pos % 2 === 0 ? `the ${ORDINAL[pos / 2]} line` : `the ${ORDINAL[(pos - 1) / 2]} space`;
  }
  if (pos === -1) return 'the space just below the staff';
  if (pos === 9) return 'the space just above the staff';
  const count = ledgerLines(pos).length;
  const where = pos < 0 ? 'below' : 'above';
  const onLine = pos % 2 === 0;
  if (onLine) return count === 1 ? `a ledger line ${where} the staff` : `ledger line ${count} ${where} the staff`;
  return `${pos < 0 ? 'under' : 'over'} ledger line ${count} ${where} the staff`;
}

/** Note ranges practiced in v0, one per clef (low → high). */
export const RANGES: Record<Clef, { low: Note; high: Note }> = {
  treble: { low: { letter: 'C', octave: 4 }, high: { letter: 'A', octave: 5 } },
  bass: { low: { letter: 'E', octave: 2 }, high: { letter: 'C', octave: 4 } },
};

export function notesInRange(clef: Clef): Note[] {
  const { low, high } = RANGES[clef];
  const out: Note[] = [];
  for (let d = diatonic(low); d <= diatonic(high); d++) out.push(fromDiatonic(d));
  return out;
}
