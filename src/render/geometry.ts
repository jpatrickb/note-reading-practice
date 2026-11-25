// Shared staff drawing constants and SVG helpers. Kept separate from staff.ts so staff.ts,
// staffSequence.ts and staffInput.ts can all import them without an import cycle.

import type { Accidental } from '../core/music';
import { GLYPHS } from './glyphs';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const SP = 18; // staff space in viewBox units
export const K = SP / 250; // font units → viewBox units
export const BOTTOM_Y = 130;
export const WIDTH = 300;
export const HEIGHT = 190;
export const NOTE_X = 185;

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
