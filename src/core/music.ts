// Music primitives: notes (with optional accidentals), clefs, staff positions.
// Natural notes keep their original ids (`C4`); accidentals add `#`/`b` (`F#4`, `Bb3`, `F##4`, `Bbb3`).

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export type Letter = (typeof LETTERS)[number];
export type Clef = 'treble' | 'bass';

/** Semitones away from the natural: -2 𝄫, -1 ♭, 0 ♮, 1 ♯, 2 𝄪. */
export type Accidental = -2 | -1 | 0 | 1 | 2;

export interface Note {
  letter: Letter;
  octave: number;
  /** Absent (or 0) = natural. Ignored by staff position; included in pitch. */
  acc?: Accidental;
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

const ACC_ID: Record<Accidental, string> = { [-2]: 'bb', [-1]: 'b', 0: '', 1: '#', 2: '##' };
const ACC_SYMBOL: Record<Accidental, string> = { [-2]: '𝄫', [-1]: '♭', 0: '', 1: '♯', 2: '𝄪' };
const ACC_SPOKEN: Record<Accidental, string> = { [-2]: ' double flat', [-1]: ' flat', 0: '', 1: ' sharp', 2: ' double sharp' };
const ID_ACC: Record<string, Accidental> = { bb: -2, b: -1, '#': 1, '##': 2 };

/** Note with the given accidental; a natural has no `acc` key, so ids and stored shapes stay as before. */
function withAcc(letter: Letter, octave: number, acc: Accidental): Note {
  return acc ? { letter, octave, acc } : { letter, octave };
}

export function noteId(n: Note): string {
  return `${n.letter}${ACC_ID[n.acc ?? 0]}${n.octave}`;
}

export function parseNote(id: string): Note {
  const m = /^([A-G])(##|#|bb|b)?(-?\d)$/.exec(id);
  if (!m) throw new Error(`Bad note id: ${id}`);
  return withAcc(m[1] as Letter, Number(m[3]), m[2] ? ID_ACC[m[2]]! : 0);
}

export function midi(n: Note): number {
  return 12 * (n.octave + 1) + SEMITONES[LETTERS.indexOf(n.letter)]! + (n.acc ?? 0);
}

/** 0–11, C = 0. */
export function pitchClass(n: Note): number {
  return ((midi(n) % 12) + 12) % 12;
}

/** Same key on the piano (same MIDI number), e.g. C♯4 and D♭4. */
export function isEnharmonic(a: Note, b: Note): boolean {
  return midi(a) === midi(b);
}

/**
 * Ways to spell a MIDI pitch: natural first, then ♯, ♭ and (with `doubles`) 𝄪, 𝄫.
 * 61 → C♯4, D♭4; 60 → C4, B♯3.
 */
export function spellings(m: number, opts: { doubles?: boolean } = {}): Note[] {
  const accs: Accidental[] = opts.doubles ? [0, 1, -1, 2, -2] : [0, 1, -1];
  const out: Note[] = [];
  for (const acc of accs) {
    const base = m - acc; // MIDI of the natural letter
    const i = SEMITONES.indexOf(((base % 12) + 12) % 12);
    if (i >= 0) out.push(withAcc(LETTERS[i]!, Math.floor(base / 12) - 1, acc));
  }
  return out;
}

/** Kid-facing name with real symbols and no octave: `F♯`, `B♭`, `C`. */
export function displayName(n: Note): string {
  return `${n.letter}${ACC_SYMBOL[n.acc ?? 0]}`;
}

/** Name for screen readers: "F sharp", "B double flat", "C". */
export function spokenName(n: Note): string {
  return `${n.letter}${ACC_SPOKEN[n.acc ?? 0]}`;
}

/** A note name without octave, as typed or answered: `'C'`, `'F#'`, `'Bb'`, `'F##'`, `'Bbb'`. */
export type AnswerName = `${Letter}${'' | '#' | 'b' | '##' | 'bb'}`;

export function answerName(n: Note): AnswerName {
  return `${n.letter}${ACC_ID[n.acc ?? 0]}` as AnswerName;
}

const SYMBOL_ASCII: Record<string, string> = { '♯': '#', '♭': 'b', '𝄪': '##', '𝄫': 'bb', '♮': '' };

/**
 * Parses an answer like `F#`, `Bb`, `c`, `F♯` or `B♭` (letter case-insensitive, ASCII or real symbols).
 * Returns null if it isn't a note name.
 */
export function parseAnswerName(s: string): { letter: Letter; acc: Accidental } | null {
  const ascii = [...s.trim()].map((ch) => SYMBOL_ASCII[ch] ?? ch).join('');
  const m = /^([A-Ga-g])(##|#|bb|b)?$/.exec(ascii);
  if (!m) return null;
  return { letter: m[1]!.toUpperCase() as Letter, acc: m[2] ? ID_ACC[m[2]]! : 0 };
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
