// The mastery map: a piano keyboard per clef where keys turn silver/gold as notes are mastered.

import { type StudentState, isDusty, level, recall } from '../core/engine';
import { ITEMS, type Item } from '../core/items';
import { type Clef, diatonic, displayName, noteId } from '../core/music';

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
  const all = ITEMS.filter((i) => i.clef === clef);
  const items = all.filter((i) => !i.note.acc).sort((a, b) => diatonic(a.note) - diatonic(b.note));
  const svg = el('svg', {
    viewBox: `0 0 ${items.length * W + 2} ${H + 4}`,
    class: 'keys',
    role: 'img',
    'aria-label': `${clef} clef mastery keyboard`,
  });

  const addKey = (item: Item, x: number, w: number, black: boolean) => {
    const it = state.items[item.id]!;
    const lvl = level(it);
    const dusty = isDusty(it, now);
    const g = el('g', {
      class: `key key--${lvl}${black ? ' key--black' : ''}${dusty ? ' key--dusty' : ''}`,
      'data-item': item.id,
      'data-level': lvl,
    });
    const title = el('title', {});
    title.textContent = `${noteId(item.note)}: ${lvl}${dusty ? ' (needs a polish)' : ''}`;
    g.append(title);
    g.append(el('rect', { x, y: 1, width: w, height: black ? BH : H, rx: black ? 3 : 5, class: 'key__body' }));
    if (lvl === 'learning') {
      const mh = Math.round(((black ? BH : H) - 40) * recall(it, now));
      g.append(el('rect', { x: x + 5, y: (black ? BH : H) - 8 - mh, width: w - 10, height: mh, rx: 3, class: 'key__meter' }));
    }
    if (lvl !== 'locked') {
      // A black key is a sharp OR a flat: it shows the spelling the kid is learning for it.
      const t = el('text', { x: x + w / 2, y: (black ? BH : H) - 14, class: 'key__label' });
      t.textContent = black ? displayName(item.note) : item.note.letter;
      g.append(t);
    }
    if (!black && noteId(item.note) === 'C4') g.append(el('circle', { cx: x + w / 2, cy: H - 40, r: 3.5, class: 'key__middle-c' }));
    svg.append(g);
  };
  items.forEach((item, i) => addKey(item, i * W + 1, W - 2, false));

  // Black keys: after C, D, F, G, A when another white key follows. Decorative until a sharp or flat item
  // for that key is unlocked (#34), then a real item with its own level, drawn over the white keys.
  const accidentals = new Map<number, Item>(); // the white key just below the black one
  for (const a of all.filter((i) => i.note.acc)) {
    const natural = items.findIndex((w) => w.note.letter === a.note.letter && w.note.octave === a.note.octave);
    const below = natural + (a.note.acc === -1 ? -1 : 0);
    if (below >= 0 && state.items[a.id]?.unlocked) accidentals.set(below, a);
  }
  items.forEach((item, i) => {
    if (i === items.length - 1 || item.note.letter === 'E' || item.note.letter === 'B') return;
    const a = accidentals.get(i);
    if (a) addKey(a, (i + 1) * W - BW / 2 + 1, BW, true);
    else svg.append(el('rect', { x: (i + 1) * W - BW / 2 + 1, y: 1, width: BW, height: BH, rx: 3, class: 'key__black' }));
  });
  return svg;
}

export function masteryCounts(state: StudentState): Record<'gold' | 'silver' | 'learning' | 'locked', number> {
  const counts = { gold: 0, silver: 0, learning: 0, locked: 0 };
  for (const item of ITEMS) counts[level(state.items[item.id]!)]++;
  return counts;
}
