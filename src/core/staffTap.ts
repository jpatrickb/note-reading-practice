// Pure logic behind the tap-a-line-or-space staff (src/render/staffInput.ts): pointer y → snapped
// staff position, keyboard steps, multi-note placement and the spoken position. No DOM, so it's unit
// tested and coverage-gated with the rest of src/core.

import { describePosition } from './music';

/** Where staff positions sit in SVG user units: position 0 (bottom line) is at `bottomY`, one staff space is `space`. */
export interface StaffGeometry {
  bottomY: number;
  space: number;
}

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Converts a client (screen) point to SVG user units for an `<svg>` drawn with the default
 * `preserveAspectRatio="xMidYMid meet"`: scaled uniformly to fit, centered on the other axis.
 */
export function toViewBox(clientX: number, clientY: number, rect: Rect, vb: ViewBox): { x: number; y: number } {
  if (!rect.width || !rect.height) return { x: vb.x + clientX - rect.left, y: vb.y + clientY - rect.top }; // not laid out
  const scale = Math.min(rect.width / vb.width, rect.height / vb.height);
  const offX = (rect.width - vb.width * scale) / 2;
  const offY = (rect.height - vb.height * scale) / 2;
  return { x: vb.x + (clientX - rect.left - offX) / scale, y: vb.y + (clientY - rect.top - offY) / scale };
}

/** Exact (fractional) staff position at user-unit y. */
export function positionAt(y: number, g: StaffGeometry): number {
  return ((g.bottomY - y) * 2) / g.space;
}

/** Nearest offered position to user-unit y, clamped to [low, high]. Ties go up (toward the higher position). */
export function snapPosition(y: number, low: number, high: number, g: StaffGeometry): number {
  return clampPos(Math.floor(positionAt(y, g) + 0.5), low, high);
}

export function clampPos(pos: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, pos));
}

/**
 * Keyboard step from the current ghost position. With no ghost yet, the first press shows the
 * ghost on the middle line (or the nearest offered position) without moving it.
 */
export function stepPosition(current: number | null, delta: number, low: number, high: number): number {
  if (current === null) return clampPos(4, low, high);
  return clampPos(current + delta, low, high);
}

export interface PlaceResult {
  placed: number[];
  change: 'added' | 'removed' | 'ignored';
  /** True when `max` notes are now placed: the answer is in. */
  complete: boolean;
}

/**
 * Commits a position. Tapping a placed note removes it (when more than one note may be placed),
 * a fixed note's position is ignored, and anything else is added until `max` notes are placed.
 * The returned list is sorted low → high.
 */
export function place(placed: readonly number[], pos: number, max: number, fixed: readonly number[] = []): PlaceResult {
  const sorted = (xs: readonly number[]) => [...xs].sort((a, b) => a - b);
  if (fixed.includes(pos) || placed.length >= max) return { placed: sorted(placed), change: 'ignored', complete: placed.length >= max };
  if (placed.includes(pos)) return { placed: sorted(placed.filter((p) => p !== pos)), change: 'removed', complete: false };
  const next = sorted([...placed, pos]);
  return { placed: next, change: 'added', complete: next.length >= max };
}

/**
 * Which of the (sorted) chord positions are drawn to the right of the stem side, as in printed
 * music: when two notes are a step apart, the upper one moves right so the heads don't overlap.
 */
export function shiftedHeads(positions: readonly number[]): boolean[] {
  const sorted = [...positions].sort((a, b) => a - b);
  const out: boolean[] = [];
  sorted.forEach((p, i) => {
    out.push(i > 0 && p - sorted[i - 1]! === 1 && !out[i - 1]);
  });
  return out;
}

/** Spoken name of a position for screen readers: "2nd line", "space just below the staff". */
export function spokenPosition(pos: number): string {
  return describePosition(pos).replace(/^(the|a) /, '');
}
