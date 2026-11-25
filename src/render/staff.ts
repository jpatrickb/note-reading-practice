// Draws a single-note staff as SVG. Colors come from CSS (classes + currentColor) so themes can restyle it.

import { type Accidental, type Clef, type Note, ledgerLines, noteId, spokenName, staffPosition } from '../core/music';
import { GLYPHS } from './glyphs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SP = 18; // staff space in viewBox units
const K = SP / 250; // font units → viewBox units
const BOTTOM_Y = 130;
const WIDTH = 300;
const HEIGHT = 190;
const NOTE_X = 185;

export const yOf = (pos: number) => BOTTOM_Y - (pos * SP) / 2;

/** Drawing constants, for other staff renderers (e.g. staffInput.ts) to line up with this one. */
export const STAFF_GEOMETRY = { space: SP, bottomY: BOTTOM_Y, width: WIDTH, height: HEIGHT, noteX: NOTE_X, glyphScale: K } as const;

export function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export function glyph(name: keyof typeof GLYPHS, x: number, y: number, cls: string) {
  return el('path', { d: GLYPHS[name].path, transform: `translate(${x} ${y}) scale(${K} ${-K})`, class: cls });
}

/** Glyph drawn for each accidental (none for a natural). */
export const ACCIDENTAL_GLYPH: Record<Accidental, keyof typeof GLYPHS | null> = {
  [-2]: 'doubleFlat',
  [-1]: 'flat',
  0: null,
  1: 'sharp',
  2: 'doubleSharp',
};

export interface StaffOptions {
  /** Show the note's letter next to it (after answering). */
  label?: string;
  state?: 'idle' | 'correct' | 'wrong' | 'reveal';
}

export function renderStaff(note: Note, clef: Clef, opts: StaffOptions = {}): SVGSVGElement {
  const pos = staffPosition(note, clef);
  const svg = el('svg', {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    class: `staff staff--${opts.state ?? 'idle'}`,
    role: 'img',
    'data-note': noteId(note),
    'data-clef': clef,
    'aria-label': opts.label ? `${clef} clef, the note ${spokenName(note)}` : `${clef} clef with one note`,
  });

  for (let line = 0; line <= 8; line += 2) {
    svg.append(el('line', { x1: 10, x2: WIDTH - 10, y1: yOf(line), y2: yOf(line), class: 'staff__line' }));
  }
  svg.append(el('line', { x1: 10, x2: 10, y1: yOf(8), y2: yOf(0), class: 'staff__line' }));

  svg.append(clef === 'treble' ? glyph('gClef', 22, yOf(2), 'staff__clef') : glyph('fClef', 22, yOf(6), 'staff__clef'));

  const headW = GLYPHS.noteheadWhole.bounds[2] * K;
  for (const p of ledgerLines(pos)) {
    svg.append(
      el('line', { x1: NOTE_X - headW / 2 - 8, x2: NOTE_X + headW / 2 + 8, y1: yOf(p), y2: yOf(p), class: 'staff__ledger' }),
    );
  }
  svg.append(glyph('noteheadWhole', NOTE_X - headW / 2, yOf(pos), 'staff__note'));

  // Accidental: vertically centered on the note's line/space, left of the notehead (and clear of any
  // ledger line). Appended after the notehead so `.staff__note` still finds the head first; it shares
  // the `staff__note` class so it takes the note's theme colors and answer-state colors.
  const accGlyph = ACCIDENTAL_GLYPH[note.acc ?? 0];
  if (accGlyph) {
    const gap = ledgerLines(pos).length ? 10 : 4;
    const x = NOTE_X - headW / 2 - gap - GLYPHS[accGlyph].bounds[2] * K;
    svg.append(glyph(accGlyph, x, yOf(pos), 'staff__note staff__accidental'));
  }

  if (opts.label) {
    const t = el('text', { x: NOTE_X + headW / 2 + 14, y: yOf(pos) + 8, class: 'staff__label' });
    t.textContent = opts.label;
    svg.append(t);
  }
  return svg;
}

// Multi-note staves live in staffSequence.ts (which imports this file); re-exported here so callers have one entry point.
export { renderStaffSequence } from './staffSequence';
export type { NoteState, SequenceOptions, StaffEvent } from './staffSequence';
