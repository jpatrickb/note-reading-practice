// Draws a single-note staff as SVG. Colors come from CSS (classes + currentColor) so themes can restyle it.

import { type Clef, type Note, ledgerLines, noteId, spokenName, staffPosition } from '../core/music';
import { ACCIDENTAL_GLYPH, K, NOTE_X, WIDTH, HEIGHT, el, glyph, yOf } from './geometry';
import { GLYPHS } from './glyphs';

// Existing exports, now defined in geometry.ts.
export { ACCIDENTAL_GLYPH, STAFF_GEOMETRY, el, glyph, yOf } from './geometry';

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
