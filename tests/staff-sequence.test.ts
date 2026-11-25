// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { type Clef, parseNote, spokenName, staffPosition } from '../src/core/music';
import { GLYPHS } from '../src/render/glyphs';
import { renderStaff, renderStaffSequence, yOf } from '../src/render/staff';
import fixtures from './fixtures/staff-single-note.json';

const N = (...ids: string[]) => ids.map(parseNote);
const translate = (p: Element) => {
  const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(p.getAttribute('transform') ?? '')!;
  return { x: Number(m[1]), y: Number(m[2]) };
};
const group = (svg: Element, i: number) => svg.querySelector(`g[data-index="${i}"]`)!;
const heads = (g: Element) => [...g.querySelectorAll('path.staff__note:not(.staff__accidental)')];

describe('renderStaff is unchanged', () => {
  // Fixtures were captured from renderStaff before the multi-note renderer existed.
  it.each(fixtures.map((f) => [f.id + ' ' + f.clef + ' ' + JSON.stringify(f.opts), f] as const))('%s renders byte-identically', (_n, f) => {
    expect(renderStaff(parseNote(f.id), f.clef as Clef, f.opts as never).outerHTML).toBe(f.html);
  });
});

describe('renderStaffSequence positions', () => {
  it('puts each note on its own line/space, left to right', () => {
    const ids = ['C4', 'D4', 'E4', 'G4', 'F4', 'E4'];
    const svg = renderStaffSequence(N(...ids), 'treble', { beats: Array(6).fill('quarter') });
    expect(svg.querySelectorAll('g[data-index]')).toHaveLength(6);
    let lastX = -Infinity;
    ids.forEach((id, i) => {
      const g = group(svg, i);
      expect(g.getAttribute('data-note')).toBe(id);
      const head = heads(g)[0]!;
      const t = translate(head);
      expect(t.y).toBe(yOf(staffPosition(parseNote(id), 'treble')));
      expect(t.x).toBeGreaterThan(lastX);
      lastX = t.x;
    });
  });
  it('works in the bass clef', () => {
    const svg = renderStaffSequence(N('G2', 'B2', 'D3'), 'bass', {});
    expect(svg.dataset.clef).toBe('bass');
    expect(translate(heads(group(svg, 1))[0]!).y).toBe(yOf(staffPosition(parseNote('B2'), 'bass')));
  });
  it('uses whole notes without stems by default and by value otherwise', () => {
    const svg = renderStaffSequence(N('C4', 'D4', 'E4'), 'treble', { beats: ['whole', 'half', 'quarter'] });
    expect(heads(group(svg, 0))[0]!.getAttribute('d')).toBe(GLYPHS.noteheadWhole.path);
    expect(heads(group(svg, 1))[0]!.getAttribute('d')).toBe(GLYPHS.noteheadHalf.path);
    expect(heads(group(svg, 2))[0]!.getAttribute('d')).toBe(GLYPHS.noteheadBlack.path);
    expect(svg.querySelectorAll('.staff-seq__stem')).toHaveLength(2);
    expect(group(svg, 0).querySelector('.staff-seq__stem')).toBeNull();
    const plain = renderStaffSequence(N('C4', 'D4'), 'treble');
    expect(plain.querySelector('.staff-seq__stem')).toBeNull();
    expect(plain.querySelector('g[data-value="whole"]')).not.toBeNull();
  });
});

describe('stems', () => {
  it('point up below the middle line and down from it', () => {
    const svg = renderStaffSequence(N('C4', 'B4', 'C5', 'D5'), 'treble', { beats: Array(4).fill('quarter') });
    const dirs = [0, 1, 2, 3].map((i) => group(svg, i).querySelector('.staff-seq__stem')!.getAttribute('data-stem'));
    expect(dirs).toEqual(['up', 'down', 'down', 'down']);
    const stem = group(svg, 0).querySelector('line.staff-seq__stem')!;
    expect(Number(stem.getAttribute('y2'))).toBeLessThan(Number(stem.getAttribute('y1'))); // up: ends higher
    const down = group(svg, 2).querySelector('line.staff-seq__stem')!;
    expect(Number(down.getAttribute('y2'))).toBeGreaterThan(Number(down.getAttribute('y1')));
  });
  it('sits on the right of an up-stem head and the left of a down-stem head', () => {
    const svg = renderStaffSequence(N('C4', 'B4'), 'treble', { beats: ['quarter', 'quarter'] });
    for (const i of [0, 1]) {
      const g = group(svg, i);
      const hx = translate(heads(g)[0]!).x;
      const sx = Number(g.querySelector('line.staff-seq__stem')!.getAttribute('x1'));
      const mid = hx + (GLYPHS.noteheadBlack.bounds[2] * 18) / 250 / 2;
      if (i === 0) expect(sx).toBeGreaterThan(mid);
      else expect(sx).toBeLessThan(mid);
    }
  });
});

describe('chords', () => {
  it('stacks a C-E-G snowman on consecutive lines (and the ledger line)', () => {
    const svg = renderStaffSequence([N('C4', 'E4', 'G4')], 'treble', { beats: ['quarter'] });
    const hs = heads(group(svg, 0));
    expect(hs).toHaveLength(3);
    const ys = hs.map((h) => translate(h).y);
    expect(ys).toEqual([yOf(-2), yOf(0), yOf(2)]); // ledger line, 1st line, 2nd line: 2 positions apart
    expect(new Set(hs.map((h) => translate(h).x)).size).toBe(1); // thirds share a column
    expect(group(svg, 0).getAttribute('data-note')).toBe('C4 E4 G4');
    expect(group(svg, 0).querySelectorAll('.staff-seq__stem')).toHaveLength(1);
  });
  it('stacks a snowman on spaces too (F-A-C)', () => {
    const svg = renderStaffSequence([N('F4', 'A4', 'C5')], 'treble', {});
    const ys = heads(group(svg, 0)).map((h) => translate(h).y);
    expect(ys).toEqual([yOf(1), yOf(3), yOf(5)]);
  });
  it('offsets the upper head of a second to the right (stem up)', () => {
    const svg = renderStaffSequence([N('E4', 'F4')], 'treble', { beats: ['quarter'] });
    const [lo, hi] = heads(group(svg, 0)).map((h) => translate(h));
    expect(hi!.x).toBeGreaterThan(lo!.x);
    expect(hi!.y).toBeLessThan(lo!.y);
  });
  it('offsets the lower head of a second to the left (stem down)', () => {
    const svg = renderStaffSequence([N('B4', 'C5')], 'treble', { beats: ['quarter'] });
    const [lo, hi] = heads(group(svg, 0)).map((h) => translate(h));
    expect(lo!.x).toBeLessThan(hi!.x);
  });
  it('draws accidentals left of their own heads, staggered when they would touch', () => {
    const svg = renderStaffSequence([N('C#4', 'E#4', 'G#4')], 'treble', { beats: ['quarter'] });
    const g = group(svg, 0);
    const accs = [...g.querySelectorAll('.staff__accidental')].map(translate);
    expect(accs).toHaveLength(3);
    expect(new Set(accs.map((a) => a.x)).size).toBe(3); // three columns
    const headX = translate(heads(g)[0]!).x;
    for (const a of accs) expect(a.x + GLYPHS.sharp.bounds[2] * (18 / 250)).toBeLessThan(headX);
  });
});

describe('ledger lines', () => {
  it('draws the ledger lines each note needs, shared across a chord', () => {
    const svg = renderStaffSequence(N('A3', 'C6'), 'treble', { beats: ['quarter', 'quarter'] });
    const pos = (i: number) => [...group(svg, i).querySelectorAll('line.staff__ledger')].map((l) => Number(l.getAttribute('data-pos')));
    expect(pos(0)).toEqual([-2, -4]); // A3 is on the second ledger line below
    expect(pos(1)).toEqual([10, 12]);
    const chord = renderStaffSequence([N('C4', 'D4')], 'treble', {});
    expect(chord.querySelectorAll('line.staff__ledger')).toHaveLength(1);
    const none = renderStaffSequence(N('E4', 'F5'), 'treble', {});
    expect(none.querySelectorAll('line.staff__ledger')).toHaveLength(0);
  });
  it('keeps ledger lines wider than the head on both sides', () => {
    const svg = renderStaffSequence(N('C4'), 'treble', {});
    const l = svg.querySelector('line.staff__ledger')!;
    const hx = translate(heads(group(svg, 0))[0]!).x;
    expect(Number(l.getAttribute('x1'))).toBeLessThan(hx);
    expect(Number(l.getAttribute('x2'))).toBeGreaterThan(hx + (GLYPHS.noteheadWhole.bounds[2] * 18) / 250);
  });
  it('grows the viewBox for notes far off the staff', () => {
    const h = (svg: Element) => Number(svg.getAttribute('viewBox')!.split(' ')[3]);
    const normal = renderStaffSequence(N('E4'), 'treble', {});
    const far = renderStaffSequence(N('C7', 'C1'), 'treble', {});
    expect(h(far)).toBeGreaterThan(h(normal));
  });
});

describe('cursor, states and labels', () => {
  it('marks the cursor event', () => {
    const svg = renderStaffSequence(N('C4', 'D4', 'E4'), 'treble', { cursor: 1 });
    expect(svg.dataset.cursor).toBe('1');
    expect(svg.querySelectorAll('.staff-seq__group--cursor')).toHaveLength(1);
    expect(group(svg, 1).classList.contains('staff-seq__group--cursor')).toBe(true);
    expect(group(svg, 1).getAttribute('aria-current')).toBe('true');
    expect(group(svg, 1).querySelector('rect.staff-seq__cursor')).not.toBeNull();
    expect(group(svg, 0).querySelector('rect')).toBeNull();
    expect(renderStaffSequence(N('C4'), 'treble').dataset.cursor).toBeUndefined();
  });
  it('applies per-event states', () => {
    const svg = renderStaffSequence(N('C4', 'D4', 'E4', 'F4'), 'treble', { states: ['right', 'wrong', 'reveal'] });
    expect([0, 1, 2, 3].map((i) => [...group(svg, i).classList].find((c) => /--(idle|right|wrong|reveal)$/.test(c)))).toEqual([
      'staff-seq__group--right',
      'staff-seq__group--wrong',
      'staff-seq__group--reveal',
      'staff-seq__group--idle',
    ]);
  });
  it('draws labels under notes where given, and reserves the row', () => {
    const withLabels = renderStaffSequence(N('C4', 'D4', 'E4'), 'treble', { labels: ['C', undefined, 'E'] });
    expect([...withLabels.querySelectorAll('text.staff-seq__label')].map((t) => t.textContent)).toEqual(['C', 'E']);
    expect(group(withLabels, 1).querySelector('text')).toBeNull();
    const t = withLabels.querySelector('text')!;
    expect(Number(t.getAttribute('y'))).toBeGreaterThan(yOf(-2));
    expect(renderStaffSequence(N('C4'), 'treble').querySelector('text')).toBeNull();
  });
  it('never puts note names in aria-labels before answering', () => {
    const svg = renderStaffSequence([N('C4', 'E4', 'G4'), parseNote('F#4')], 'treble', { states: ['idle', undefined] });
    const labels = [svg, ...svg.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label'));
    expect(labels).toEqual(['treble clef with 2 notes', 'note 1 of 2', 'note 2 of 2']);
    expect(svg.textContent).toBe(''); // no visible text either
    expect(group(svg, 0).getAttribute('data-note')).toBe('C4 E4 G4'); // e2e hook, not text
  });
  it('lists the notes once answered', () => {
    const svg = renderStaffSequence([N('C4', 'E4', 'G4'), parseNote('F#4')], 'treble', { states: ['right', 'reveal'] });
    expect(group(svg, 0).getAttribute('aria-label')).toBe(N('C4', 'E4', 'G4').map(spokenName).join(', '));
    expect(group(svg, 1).getAttribute('aria-label')).toBe(spokenName(parseNote('F#4')));
    expect(group(svg, 1).getAttribute('aria-label')).toMatch(/sharp/);
  });
});

describe('bars, key slot, width', () => {
  it('draws bar lines after the given events', () => {
    const svg = renderStaffSequence(N('C4', 'D4', 'E4', 'F4'), 'treble', { bars: [1] });
    const bars = svg.querySelectorAll('line.staff-seq__bar');
    expect(bars).toHaveLength(1);
    const x = Number(bars[0]!.getAttribute('x1'));
    expect(x).toBeGreaterThan(translate(heads(group(svg, 1))[0]!).x);
    expect(x).toBeLessThan(translate(heads(group(svg, 2))[0]!).x);
  });
  it('reserves a key-signature slot and shifts the notes right', () => {
    const base = renderStaffSequence(N('C4'), 'treble', {});
    const slot = renderStaffSequence(N('C4'), 'treble', { keySignatureSlot: 3 });
    const s = slot.querySelector('.staff-seq__key-slot')!;
    expect(s.getAttribute('data-count')).toBe('3');
    expect(base.querySelector('.staff-seq__key-slot')).toBeNull();
    expect(translate(heads(group(slot, 0))[0]!).x).toBeGreaterThan(translate(heads(group(base, 0))[0]!).x + 30);
    expect(Number(s.getAttribute('data-x')) + Number(s.getAttribute('data-width'))).toBeLessThan(translate(heads(group(slot, 0))[0]!).x);
  });
  it('sizes the viewBox from the content, up to a max, then scrolls', () => {
    const w = (svg: Element) => Number(svg.getAttribute('viewBox')!.split(' ')[2]);
    const short = renderStaffSequence(N('C4', 'D4'), 'treble', {});
    const mid = renderStaffSequence(N('C4', 'D4', 'E4', 'F4', 'G4', 'A4'), 'treble', { beats: Array(6).fill('quarter') });
    expect(w(mid)).toBeGreaterThan(w(short));
    expect(mid.hasAttribute('data-scroll')).toBe(false);
    const long = renderStaffSequence(Array.from({ length: 40 }, () => parseNote('C4')), 'treble', { beats: Array(40).fill('quarter'), maxWidth: 500 });
    expect(long.hasAttribute('data-scroll')).toBe(true);
    expect(long.style.getPropertyValue('--staff-seq-w')).toBe(`${Math.round(w(long))}px`);
    expect(w(long)).toBeGreaterThan(500);
    const capped = renderStaffSequence(Array.from({ length: 6 }, () => parseNote('C4')), 'treble', { maxWidth: 420 });
    expect(w(capped)).toBeLessThanOrEqual(420);
  });
  it('renders an empty phrase and a single note', () => {
    expect(renderStaffSequence([], 'treble').querySelectorAll('g[data-index]')).toHaveLength(0);
    expect(renderStaffSequence(N('C4'), 'bass').getAttribute('aria-label')).toBe('bass clef with 1 note');
  });
});
