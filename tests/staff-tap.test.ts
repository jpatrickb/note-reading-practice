import { describe, expect, it } from 'vitest';
import {
  clampPos,
  place,
  positionAt,
  shiftedHeads,
  snapPosition,
  spokenPosition,
  stepPosition,
  toViewBox,
} from '../src/core/staffTap';

const G = { bottomY: 130, space: 18 }; // as in src/render/staff.ts
const yOf = (pos: number) => G.bottomY - (pos * G.space) / 2;

describe('snapping', () => {
  it('finds the exact position of every line and space, incl. ledger positions', () => {
    for (let p = -6; p <= 14; p++) {
      expect(positionAt(yOf(p), G)).toBeCloseTo(p, 10);
      expect(snapPosition(yOf(p), -6, 14, G)).toBe(p);
    }
  });

  it('snaps to the nearest position, ties going up', () => {
    const band = G.space / 2;
    expect(snapPosition(yOf(4) + band * 0.49, -3, 11, G)).toBe(4); // just below the middle line
    expect(snapPosition(yOf(4) + band * 0.51, -3, 11, G)).toBe(3);
    expect(snapPosition(yOf(4) - band * 0.49, -3, 11, G)).toBe(4);
    expect(snapPosition(yOf(4) - band * 0.51, -3, 11, G)).toBe(5);
    expect(snapPosition(yOf(4) - band * 0.5, -3, 11, G)).toBe(5);
  });

  it('clamps to the offered range', () => {
    expect(snapPosition(yOf(20), -3, 11, G)).toBe(11);
    expect(snapPosition(yOf(-20), -3, 11, G)).toBe(-3);
    expect(snapPosition(yOf(1), 2, 6, G)).toBe(2);
    expect(clampPos(9, 0, 8)).toBe(8);
  });

  it('maps client coordinates into the viewBox, letterboxed like preserveAspectRatio meet', () => {
    const vb = { x: 0, y: 20, width: 300, height: 150 };
    // Exact fit at 2×.
    expect(toViewBox(100, 40, { left: 50, top: 0, width: 600, height: 300 }, vb)).toEqual({ x: 25, y: 40 });
    // Too wide: height limits the scale (2×) and the drawing is centered horizontally (100px each side).
    expect(toViewBox(400, 150, { left: 0, top: 0, width: 800, height: 300 }, vb)).toEqual({ x: 150, y: 95 });
    // Too tall: width limits the scale (1×) and the drawing is centered vertically (25px above).
    expect(toViewBox(0, 25, { left: 0, top: 0, width: 300, height: 200 }, vb)).toEqual({ x: 0, y: 20 });
    // A zero-size box (not laid out) falls back to 1:1 instead of dividing by zero.
    expect(toViewBox(3, 4, { left: 0, top: 0, width: 0, height: 0 }, vb)).toEqual({ x: 3, y: 24 });
  });
});

describe('keyboard steps', () => {
  it('starts on the middle line, then moves one position per press within the range', () => {
    expect(stepPosition(null, 1, -3, 11)).toBe(4);
    expect(stepPosition(null, -1, -3, 11)).toBe(4);
    expect(stepPosition(null, 1, 9, 12)).toBe(9); // middle line not offered → nearest
    expect(stepPosition(4, 1, -3, 11)).toBe(5);
    expect(stepPosition(4, -1, -3, 11)).toBe(3);
    expect(stepPosition(11, 1, -3, 11)).toBe(11);
    expect(stepPosition(-3, -1, -3, 11)).toBe(-3);
  });
});

describe('placing', () => {
  it('completes a single-note answer on the first placement', () => {
    expect(place([], 3, 1)).toEqual({ placed: [3], change: 'added', complete: true });
  });

  it('adds, removes and completes a chord, sorted low to high', () => {
    let r = place([], 6, 3);
    expect(r).toEqual({ placed: [6], change: 'added', complete: false });
    r = place(r.placed, 2, 3);
    expect(r).toEqual({ placed: [2, 6], change: 'added', complete: false });
    r = place(r.placed, 6, 3);
    expect(r).toEqual({ placed: [2], change: 'removed', complete: false });
    r = place(r.placed, 4, 3);
    r = place(r.placed, 0, 3);
    expect(r).toEqual({ placed: [0, 2, 4], change: 'added', complete: true });
  });

  it('ignores fixed notes, a full chord and re-tapping a single placed note', () => {
    expect(place([], 0, 2, [0])).toEqual({ placed: [], change: 'ignored', complete: false });
    expect(place([4, 2], 6, 2)).toEqual({ placed: [2, 4], change: 'ignored', complete: true });
    expect(place([3], 3, 1)).toEqual({ placed: [3], change: 'ignored', complete: true });
    expect(place([], 3, 2, [0])).toEqual({ placed: [3], change: 'added', complete: false });
  });
});

describe('chord heads', () => {
  it('moves the upper note of a step to the other side, as in printed music', () => {
    expect(shiftedHeads([0, 2, 4])).toEqual([false, false, false]);
    expect(shiftedHeads([0, 1])).toEqual([false, true]);
    expect(shiftedHeads([0, 1, 2])).toEqual([false, true, false]);
    expect(shiftedHeads([2, 1, 0, 3])).toEqual([false, true, false, true]);
    expect(shiftedHeads([])).toEqual([]);
  });
});

describe('spoken positions', () => {
  it('names lines, spaces and ledger positions without articles', () => {
    expect(spokenPosition(0)).toBe('1st line');
    expect(spokenPosition(2)).toBe('2nd line');
    expect(spokenPosition(7)).toBe('4th space');
    expect(spokenPosition(-1)).toBe('space just below the staff');
    expect(spokenPosition(-2)).toBe('ledger line below the staff');
    expect(spokenPosition(12)).toBe('ledger line 2 above the staff');
    expect(spokenPosition(-3)).toBe('under ledger line 1 below the staff');
  });
});
