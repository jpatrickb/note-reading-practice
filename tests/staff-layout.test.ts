import { describe, expect, it } from 'vitest';
import {
  type LayoutMetrics,
  accidentalColumns,
  layoutSequence,
  shiftedSide,
  stemDirection,
  stemSpan,
} from '../src/core/staffLayout';

const M: LayoutMetrics = {
  headWidth: (v) => (v === 'whole' ? 30 : 21),
  accWidth: (a) => (a ? 14 : 0),
  startX: 80,
  endPad: 20,
  minWidth: 200,
  maxWidth: 600,
  minPad: 12,
  barPad: 16,
  quarterGap: 40,
  accGap: 4,
  ledgerAccGap: 10,
  accPad: 2,
};
const ev = (positions: number[], value: 'whole' | 'half' | 'quarter' = 'quarter', accs: (-2 | -1 | 0 | 1 | 2)[] = positions.map(() => 0)) => ({
  positions,
  accs,
  value,
});

describe('stemDirection', () => {
  it('goes down from the middle line up, up below it', () => {
    expect(stemDirection([4])).toBe('down');
    expect(stemDirection([8])).toBe('down');
    expect(stemDirection([3])).toBe('up');
    expect(stemDirection([-2])).toBe('up');
  });
  it('uses the average of a chord’s extremes', () => {
    expect(stemDirection([0, 2, 4])).toBe('up'); // C-E-G snowman: avg 2
    expect(stemDirection([2, 4, 6])).toBe('down'); // avg 4
    expect(stemDirection([0, 8])).toBe('down');
  });
});

describe('shiftedSide', () => {
  it('stem up: the upper head of a second moves', () => {
    expect(shiftedSide([0, 1], 'up')).toEqual([false, true]);
    expect(shiftedSide([0, 1, 2], 'up')).toEqual([false, true, false]);
    expect(shiftedSide([0, 2, 4], 'up')).toEqual([false, false, false]);
  });
  it('stem down: the lower head of a second moves', () => {
    expect(shiftedSide([4, 5], 'down')).toEqual([true, false]);
    expect(shiftedSide([4, 5, 6], 'down')).toEqual([false, true, false]);
  });
});

describe('stemSpan', () => {
  it('is 3.5 spaces past the far head', () => {
    expect(stemSpan([0], 'up')).toEqual({ from: 0, to: 7 });
    expect(stemSpan([4, 6], 'down')).toEqual({ from: 6, to: -3 });
  });
  it('reaches at least the middle line', () => {
    expect(stemSpan([-8], 'up').to).toBe(4);
    expect(stemSpan([14], 'down').to).toBe(4);
  });
});

describe('accidentalColumns', () => {
  it('uses column 0 for a lone accidental and -1 for notes without one', () => {
    expect(accidentalColumns([2, 4], [0, 1])).toEqual([-1, 0]);
  });
  it('staggers accidentals that would touch, top note nearest the heads', () => {
    expect(accidentalColumns([0, 2, 4], [1, 1, 1])).toEqual([1, 2, 0]); // top, then bottom, then middle
  });
  it('reuses a column when the notes are far enough apart', () => {
    expect(accidentalColumns([0, 8], [1, -1])).toEqual([0, 0]);
  });
});

describe('layoutSequence', () => {
  it('places events left to right, past the clef', () => {
    const l = layoutSequence([ev([0]), ev([2]), ev([4])], [], M);
    expect(l.events[0]!.x).toBeGreaterThanOrEqual(M.startX);
    expect(l.events[1]!.x).toBeGreaterThan(l.events[0]!.x);
    expect(l.events[2]!.x).toBeGreaterThan(l.events[1]!.x);
    expect(l.scroll).toBe(false);
    expect(l.width).toBeGreaterThan(l.events[2]!.x);
  });
  it('gives longer notes more room', () => {
    const l = layoutSequence([ev([0], 'quarter'), ev([0], 'half'), ev([0], 'whole'), ev([0])], [], M);
    const d = (i: number) => l.events[i + 1]!.x - l.events[i]!.x;
    expect(d(1)).toBeGreaterThan(d(0));
    expect(d(2)).toBeGreaterThan(d(1));
  });
  it('puts a bar line between the two events it follows, with extra room', () => {
    const plain = layoutSequence([ev([0]), ev([0])], [], M);
    const barred = layoutSequence([ev([0]), ev([0])], [0, 5, -1], M); // out-of-range indices ignored
    expect(barred.barXs).toHaveLength(1);
    expect(barred.barXs[0]!).toBeGreaterThan(barred.events[0]!.x);
    expect(barred.barXs[0]!).toBeLessThan(barred.events[1]!.x);
    expect(plain.barXs).toEqual([]);
  });
  it('lays out stems, shifted heads and accidentals of a chord', () => {
    const e = layoutSequence([ev([0, 1, 4], 'quarter', [0, 0, -1])], [], M).events[0]!;
    expect(e.stem).toBe('up');
    expect(e.heads.map((h) => h.pos)).toEqual([0, 1, 4]);
    expect(e.heads[1]!.x).toBe(21); // second: upper head to the right
    expect(e.stemX).toBe(10.5);
    expect(e.heads[2]!.accX).toBeLessThan(-10.5);
    expect(e.heads[0]!.ledger).toEqual([]);
    expect(e.left).toBeGreaterThan(10.5);
  });
  it('keeps the input index of each head when notes arrive unsorted', () => {
    const e = layoutSequence([ev([4, 0, 2], 'whole')], [], M).events[0]!;
    expect(e.heads.map((h) => [h.pos, h.index])).toEqual([
      [0, 1],
      [2, 2],
      [4, 0],
    ]);
    expect(e.stem).toBeNull();
    expect(e.stemSpan).toBeNull();
  });
  it('lists ledger lines per head and widens the accidental gap near them', () => {
    const near = layoutSequence([ev([-2], 'quarter', [1])], [], M).events[0]!;
    const far = layoutSequence([ev([2], 'quarter', [1])], [], M).events[0]!;
    expect(near.heads[0]!.ledger).toEqual([-2]);
    expect(near.heads[0]!.accX!).toBeLessThan(far.heads[0]!.accX!);
  });
  it('compresses spacing to fit, then scrolls when it cannot', () => {
    const fits = layoutSequence(Array.from({ length: 8 }, () => ev([0])), [], M);
    expect(fits.scroll).toBe(false);
    const tight = layoutSequence(Array.from({ length: 11 }, () => ev([0], 'whole')), [], M);
    expect(tight.scroll).toBe(false);
    expect(tight.width).toBeLessThanOrEqual(M.maxWidth);
    const long = layoutSequence(Array.from({ length: 40 }, () => ev([0])), [], M);
    expect(long.scroll).toBe(true);
    expect(long.width).toBeGreaterThan(M.maxWidth);
  });
  it('handles an empty phrase', () => {
    const l = layoutSequence([], [], M);
    expect(l.events).toEqual([]);
    expect(l.width).toBe(M.minWidth);
  });
});
