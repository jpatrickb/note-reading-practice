// The mastery map: a piano keyboard per clef where keys turn silver/gold as notes are mastered.

import { type StudentState, isDusty, level, recall } from '../core/engine';
import { ITEMS } from '../core/items';
import { type Clef, diatonic, noteId } from '../core/music';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 40;
const H = 150;
const BW = 24;
const BH = 92;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export function renderMasteryKeyboard(state: StudentState, clef: Clef, now: number): SVGSVGElement {
  const items = ITEMS.filter((i) => i.clef === clef).sort((a, b) => diatonic(a.note) - diatonic(b.note));
  const svg = el('svg', {
    viewBox: `0 0 ${items.length * W + 2} ${H + 4}`,
    class: 'keys',
    role: 'img',
    'aria-label': `${clef} clef mastery keyboard`,
  });

  items.forEach((item, i) => {
    const it = state.items[item.id]!;
    const lvl = level(it);
    const dusty = isDusty(it, now);
    const g = el('g', {
      class: `key key--${lvl}${dusty ? ' key--dusty' : ''}`,
      'data-item': item.id,
      'data-level': lvl,
    });
    const title = el('title', {});
    title.textContent = `${noteId(item.note)}: ${lvl}${dusty ? ' (needs a polish)' : ''}`;
    g.append(title);
    g.append(el('rect', { x: i * W + 1, y: 1, width: W - 2, height: H, rx: 5, class: 'key__body' }));
    if (lvl === 'learning') {
      const h = Math.round((H - 40) * recall(it, now));
      g.append(el('rect', { x: i * W + 6, y: H - 8 - h, width: W - 12, height: h, rx: 3, class: 'key__meter' }));
    }
    if (lvl !== 'locked') {
      const t = el('text', { x: i * W + W / 2, y: H - 14, class: 'key__label' });
      t.textContent = item.note.letter;
      g.append(t);
    }
    if (noteId(item.note) === 'C4') g.append(el('circle', { cx: i * W + W / 2, cy: H - 40, r: 3.5, class: 'key__middle-c' }));
    svg.append(g);
  });

  // Black keys (decorative): after C, D, F, G, A when another white key follows.
  items.forEach((item, i) => {
    if (i === items.length - 1 || item.note.letter === 'E' || item.note.letter === 'B') return;
    svg.append(el('rect', { x: (i + 1) * W - BW / 2 + 1, y: 1, width: BW, height: BH, rx: 3, class: 'key__black' }));
  });
  return svg;
}

export function masteryCounts(state: StudentState): Record<'gold' | 'silver' | 'learning' | 'locked', number> {
  const counts = { gold: 0, silver: 0, learning: 0, locked: 0 };
  for (const item of ITEMS) counts[level(state.items[item.id]!)]++;
  return counts;
}
