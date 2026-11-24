// Draws a single-note staff as SVG. Colors come from CSS (classes + currentColor) so themes can restyle it.

import { type Clef, type Note, ledgerLines, noteId, staffPosition } from '../core/music';
import { GLYPHS } from './glyphs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SP = 18; // staff space in viewBox units
const K = SP / 250; // font units → viewBox units
const BOTTOM_Y = 130;
const WIDTH = 300;
const HEIGHT = 190;
const NOTE_X = 185;

export const yOf = (pos: number) => BOTTOM_Y - (pos * SP) / 2;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function glyph(name: keyof typeof GLYPHS, x: number, y: number, cls: string) {
  return el('path', { d: GLYPHS[name].path, transform: `translate(${x} ${y}) scale(${K} ${-K})`, class: cls });
}

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
    'aria-label': opts.label ? `${clef} clef, the note ${opts.label}` : `${clef} clef with one note`,
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

  if (opts.label) {
    const t = el('text', { x: NOTE_X + headW / 2 + 14, y: yOf(pos) + 8, class: 'staff__label' });
    t.textContent = opts.label;
    svg.append(t);
  }
  return svg;
}
