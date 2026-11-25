// Place It: the reverse of Name It (name → staff). "Put a G on the staff": tap the right line or
// space. The answer is a staff POSITION (0 = bottom line), so the right letter in the wrong octave
// is simply a different position, and counts as wrong.
//
// Same notes and teaching order as Name It (guide notes first, per clef, D33), so a hint never
// points at a guide note the kid has not met (src/core/hints.ts). Its own canonical order keeps
// progress-code indices stable whatever happens to Name It.

import { createEngine } from './engine';
import { defineItemSet } from './itemset';
import { type Clef, type Note, describePosition, noteAtPosition, parseNote, staffPosition } from './music';
import type { SessionMode } from './session';

export interface PlaceItem {
  id: string;
  clef: Clef;
  note: Note;
  /** Where the note sits on the staff (0 = bottom line, one step per line or space). */
  pos: number;
}

/**
 * The CANONICAL order of Place It items (progress-code order). APPEND-ONLY: never reorder or remove
 * (tests/canonical-order.test.ts pins every index). The teaching order is below.
 */
export const CANONICAL_ORDER: readonly string[] = [
  'place:treble:G4', 'place:treble:C4', 'place:treble:A4', 'place:treble:F4',
  'place:treble:E4', 'place:treble:B4', 'place:treble:D4', 'place:treble:C5',
  'place:treble:D5', 'place:treble:E5', 'place:treble:F5', 'place:treble:G5',
  'place:bass:F3', 'place:bass:G3', 'place:bass:E3', 'place:bass:A3',
  'place:bass:D3', 'place:bass:C3', 'place:bass:B2', 'place:bass:G2',
  'place:bass:A2', 'place:bass:C4', 'place:bass:B3', 'place:bass:F2',
];

/**
 * Teaching order per clef: Name It's first 12 per clef (guide notes first, all 7 letters among the
 * first 7). The rest of Name It's range stays out for now: every item costs about 6 characters of
 * progress code, and 34 would push a fully played profile over the 1,200-character budget (and the QR
 * code past version 22). They can be appended later, once the code gets smaller.
 */
export const TEACHING_ORDER: Record<Clef, string[]> = {
  treble: ['G4', 'C4', 'A4', 'F4', 'E4', 'B4', 'D4', 'C5', 'D5', 'E5', 'F5', 'G5'],
  bass: ['F3', 'G3', 'E3', 'A3', 'D3', 'C3', 'B2', 'G2', 'A2', 'C4', 'B3', 'F2'],
};

function build(clef: Clef): PlaceItem[] {
  return TEACHING_ORDER[clef].map((n) => {
    const note = parseNote(n);
    return { id: `place:${clef}:${n}`, clef, note, pos: staffPosition(note, clef) };
  });
}

/** The answer is the staff position as a string ("2" = the 2nd line of the treble staff, a G). */
export const PLACE_IT = defineItemSet<PlaceItem, string>({
  id: 'place',
  groups: { treble: build('treble'), bass: build('bass') },
  order: CANONICAL_ORDER,
  groupOf: (i) => i.clef,
  answerOf: (i) => String(i.pos),
  // Like Name It: each note is its own fact, so first-try credit is the only shortcut.
  pacing: { firstTryRun: 1 },
});

export const placeEngine = createEngine(PLACE_IT);
export const PLACE_IT_MODE: SessionMode<string> = { engine: placeEngine };

export const placeItem = (id: string): PlaceItem => PLACE_IT.get(id);

/**
 * Lowest and highest positions the staff offers for a clef: the whole range of the clef's items, so
 * the offered range never reveals which notes are open yet.
 */
export function placeRange(clef: Clef): { low: number; high: number } {
  const ps = PLACE_IT.groups[clef]!.map((i) => i.pos);
  return { low: Math.min(...ps), high: Math.max(...ps) };
}

/** Every position either clef offers, as answer strings (what a guesser could tap). */
export function placeAnswerSpace(): string[] {
  const all = new Set<number>();
  for (const clef of ['treble', 'bass'] as const) {
    const { low, high } = placeRange(clef);
    for (let p = low; p <= high; p++) all.add(p);
  }
  return [...all].sort((a, b) => a - b).map(String);
}

// ───────────────────────── wording ─────────────────────────

/**
 * Which one, when the clef has several of this letter ("the lower G")? '' when it is the only one.
 * Counted over the clef's whole item list, so the words never change as more notes open.
 */
export function whichOne(item: PlaceItem): string {
  const same = PLACE_IT.groups[item.clef]!.filter((i) => i.note.letter === item.note.letter).sort((a, b) => a.pos - b.pos);
  if (same.length < 2) return '';
  const at = same.findIndex((i) => i.id === item.id);
  return (same.length === 2 ? ['lower', 'higher'] : ['lowest', 'middle', 'highest'])[at] ?? '';
}

/** The question, split so the letter can be shown big: "Put the lower [G] on the treble staff." */
export function placePrompt(item: PlaceItem): { lead: string; letter: string; tail: string } {
  const which = whichOne(item);
  return { lead: `Put ${which ? `the ${which}` : 'a'}`, letter: item.note.letter, tail: `on the ${item.clef} staff.` };
}

export function placeLabel(id: string): string {
  const item = placeItem(id);
  return `${item.note.letter} (${item.clef} clef)`;
}

const COUNTS = ['', 'an octave', 'two octaves', 'three octaves'];

/** Kind words for a wrong placement: the right letter in another octave, or another letter. */
export function wrongPlacement(item: PlaceItem, answerPos: number): string {
  const spot = noteAtPosition(answerPos, item.clef);
  const diff = answerPos - item.pos;
  if (spot.letter === item.note.letter && diff !== 0 && diff % 7 === 0) {
    const n = Math.abs(diff) / 7;
    return `That's a ${item.note.letter}, but the one ${COUNTS[n] ?? `${n} octaves`} ${diff > 0 ? 'lower' : 'higher'}. Close!`;
  }
  return `That spot is ${'AEF'.includes(spot.letter) ? 'an' : 'a'} ${spot.letter}, not ${item.note.letter}.`;
}

/** Where the right note goes, as words: "the 2nd line". */
export const whereItGoes = (item: PlaceItem): string => describePosition(item.pos);
