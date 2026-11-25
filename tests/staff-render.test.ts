// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { type Clef, parseNote, staffPosition } from '../src/core/music';
import { GLYPHS } from '../src/render/glyphs';
import { renderStaff, yOf } from '../src/render/staff';

const SCALE = 18 / 250; // staff space / font units per staff space, as in staff.ts

/** translate(x y) of a glyph path. */
function translate(p: Element): { x: number; y: number } {
  const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(p.getAttribute('transform') ?? '')!;
  return { x: Number(m[1]), y: Number(m[2]) };
}

function draw(id: string, clef: Clef, label?: string) {
  const svg = renderStaff(parseNote(id), clef, label ? { label } : {});
  const head = svg.querySelector('path.staff__note')!;
  const acc = svg.querySelector('path.staff__accidental');
  return { svg, head, acc };
}

describe('renderStaff accidentals', () => {
  it.each([
    ['F#4', 'treble', 'sharp'],
    ['Bb3', 'bass', 'flat'],
    ['F##4', 'treble', 'doubleSharp'],
    ['Bbb3', 'bass', 'doubleFlat'],
    ['C#4', 'treble', 'sharp'], // on a ledger line
  ] as const)('draws %s with a %s left of the notehead, on the same line/space', (id, clef, glyph) => {
    const { head, acc } = draw(id, clef);
    expect(acc).not.toBeNull();
    expect(acc!.tagName).toBe('path');
    expect(acc!.getAttribute('d')).toBe(GLYPHS[glyph].path);
    const a = translate(acc!);
    const h = translate(head);
    expect(a.x + GLYPHS[glyph].bounds[2] * SCALE).toBeLessThan(h.x); // right edge left of the head
    expect(a.y).toBe(h.y);
    expect(a.y).toBe(yOf(staffPosition(parseNote(id), clef)));
  });

  it('keeps the accidental clear of ledger lines', () => {
    const { svg, acc } = draw('C#4', 'treble');
    const ledger = svg.querySelector('line.staff__ledger')!;
    expect(translate(acc!).x + GLYPHS.sharp.bounds[2] * SCALE).toBeLessThan(Number(ledger.getAttribute('x1')));
  });

  it('draws no accidental for naturals', () => {
    for (const id of ['F4', 'B3', 'C4']) expect(draw(id, 'treble').acc).toBeNull();
    expect(draw('B3', 'bass').svg.querySelectorAll('path.staff__note')).toHaveLength(1);
  });

  it('draws the notehead and ledger lines exactly where the natural has them', () => {
    const sharp = draw('C#4', 'treble').svg;
    const natural = draw('C4', 'treble').svg;
    expect(sharp.querySelector('path.staff__note')!.getAttribute('transform')).toBe(
      natural.querySelector('path.staff__note')!.getAttribute('transform'),
    );
    const ledgers = (s: SVGSVGElement) => [...s.querySelectorAll('.staff__ledger')].map((l) => l.outerHTML);
    expect(ledgers(sharp)).toEqual(ledgers(natural));
  });

  it('uses the new id in data-note and the spoken name in aria-label', () => {
    expect(draw('F#4', 'treble').svg.dataset.note).toBe('F#4');
    expect(draw('Bb3', 'bass').svg.dataset.note).toBe('Bb3');
    expect(draw('F#4', 'treble', 'F♯').svg.getAttribute('aria-label')).toBe('treble clef, the note F sharp');
    expect(draw('Bbb3', 'bass', 'B𝄫').svg.getAttribute('aria-label')).toBe('bass clef, the note B double flat');
    // While the question shows (no label yet) the answer is not given away.
    expect(draw('F#4', 'treble').svg.getAttribute('aria-label')).toBe('treble clef with one note');
  });

  it('leaves naturals as before', () => {
    const { svg } = draw('G4', 'treble', 'G');
    expect(svg.dataset.note).toBe('G4');
    expect(svg.getAttribute('aria-label')).toBe('treble clef, the note G');
    expect(svg.querySelector('.staff__label')!.textContent).toBe('G');
    expect(svg.querySelectorAll('path')).toHaveLength(2); // clef + notehead
  });
});
