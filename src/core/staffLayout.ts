// Pure layout for multi-note staves (src/render/staffSequence.ts): stem direction, chord head sides,
// accidental columns and horizontal spacing. No DOM and no glyph data (the renderer passes metrics
// in), so it is unit tested and coverage-gated with the rest of src/core.

import { type Accidental, ledgerLines } from './music';

export type NoteValue = 'whole' | 'half' | 'quarter';
export type StemDir = 'up' | 'down';

/** Stem length in staff positions (half spaces): 3.5 spaces. */
export const STEM_LENGTH = 7;
/** Staff position of the middle line, where stems flip direction. */
export const MIDDLE_LINE = 4;

/** Stems point down for notes on or above the middle line; for chords, by the average of the extremes. */
export function stemDirection(positions: readonly number[]): StemDir {
  const lo = Math.min(...positions);
  const hi = Math.max(...positions);
  return (lo + hi) / 2 >= MIDDLE_LINE ? 'down' : 'up';
}

/**
 * Which heads of a chord are drawn on the far side of the stem (true) so that heads a step apart
 * don't overlap. `sorted` is low → high. With the stem up the upper head of a second moves right;
 * with the stem down the lower head moves left. Returns one flag per position.
 */
export function shiftedSide(sorted: readonly number[], stem: StemDir): boolean[] {
  const out: boolean[] = sorted.map(() => false);
  if (stem === 'up') {
    for (let i = 1; i < sorted.length; i++) out[i] = sorted[i]! - sorted[i - 1]! === 1 && !out[i - 1];
  } else {
    for (let i = sorted.length - 2; i >= 0; i--) out[i] = sorted[i + 1]! - sorted[i]! === 1 && !out[i + 1];
  }
  return out;
}

/** Where the stem runs, in staff positions: from the head it hangs on to its free end (at least to the middle line). */
export function stemSpan(sorted: readonly number[], stem: StemDir): { from: number; to: number } {
  const lo = sorted[0]!;
  const hi = sorted[sorted.length - 1]!;
  return stem === 'up'
    ? { from: lo, to: Math.max(hi + STEM_LENGTH, MIDDLE_LINE) }
    : { from: hi, to: Math.min(lo - STEM_LENGTH, MIDDLE_LINE) };
}

/** Accidentals closer than this (in positions) in the same column would touch. */
export const ACCIDENTAL_CLEARANCE = 6;

/**
 * Column for each accidental, 0 = nearest the heads. Working from the top note down, each goes in the
 * first column where it clears the accidentals already there. Returns -1 for notes without one.
 */
export function accidentalColumns(positions: readonly number[], accs: readonly Accidental[]): number[] {
  const out = positions.map(() => -1);
  const cols: number[][] = [];
  const order = positions.map((_, i) => i).sort((a, b) => positions[b]! - positions[a]!);
  for (const i of order) {
    if (!accs[i]) continue;
    let c = 0;
    while (cols[c]?.some((p) => Math.abs(p - positions[i]!) < ACCIDENTAL_CLEARANCE)) c++;
    (cols[c] ??= []).push(positions[i]!);
    out[i] = c;
  }
  return out;
}

/** Sizes (in SVG user units) the renderer takes from the glyphs and the staff drawing. */
export interface LayoutMetrics {
  headWidth: (v: NoteValue) => number;
  accWidth: (a: Accidental) => number;
  /** x where the first note's left edge may start (after the clef and key-signature slot). */
  startX: number;
  /** Space after the last note. */
  endPad: number;
  /** Smallest viewBox width. */
  minWidth: number;
  /** Widest viewBox before the staff scrolls. */
  maxWidth: number;
  /** Clear space between neighbouring events at minimum. */
  minPad: number;
  /** Extra space around a bar line. */
  barPad: number;
  /** Space between a quarter note and the next at full spread. */
  quarterGap: number;
  /** Gap between an accidental and the head (near a ledger line the gap is `ledgerAccGap`). */
  accGap: number;
  ledgerAccGap: number;
  /** Extra space between accidental columns. */
  accPad: number;
}

export interface EventInput {
  positions: readonly number[];
  accs: readonly Accidental[];
  value: NoteValue;
}

export interface HeadLayout {
  /** Index into the event's input arrays. */
  index: number;
  pos: number;
  /** Centre x of the head, relative to the event's x. */
  x: number;
  shifted: boolean;
  /** Left x of the accidental glyph (relative to the event's x), if any. */
  accX: number | null;
  ledger: number[];
}

export interface EventLayout {
  /** x of the normal head column's centre. */
  x: number;
  value: NoteValue;
  stem: StemDir | null;
  /** Stem x (relative to the event's x) and span in positions (null for whole notes). */
  stemX: number | null;
  stemSpan: { from: number; to: number } | null;
  heads: HeadLayout[];
  /** Extent from the event's left/right edge to x. */
  left: number;
  right: number;
}

export interface SequenceLayout {
  events: EventLayout[];
  /** x of each bar line, after the event index given in `bars`. */
  barXs: number[];
  width: number;
  /** True when even compressed spacing doesn't fit `maxWidth`: the staff scrolls. */
  scroll: boolean;
}

/** How much longer a note lasts relative to a quarter, for proportional spacing. */
const NOMINAL: Record<NoteValue, number> = { quarter: 1, half: 1.4, whole: 1.8 };

function layoutEvent(e: EventInput, m: LayoutMetrics): EventLayout {
  const order = e.positions.map((_, i) => i).sort((a, b) => e.positions[a]! - e.positions[b]!);
  const sorted = order.map((i) => e.positions[i]!);
  const hw = m.headWidth(e.value);
  const stemmed = e.value !== 'whole';
  const stem = stemmed ? stemDirection(sorted) : null;
  const sh = shiftedSide(sorted, stem ?? 'up');
  const dx = (k: number) => (sh[k] ? (stem === 'down' ? -hw : hw) : 0);
  const cols = accidentalColumns(
    order.map((i) => e.positions[i]!),
    order.map((i) => e.accs[i] ?? 0),
  );

  const leftEdge = Math.min(...sorted.map((_, k) => dx(k) - hw / 2));
  const hasLedger = sorted.some((p) => ledgerLines(p).length > 0);
  const gap = hasLedger ? m.ledgerAccGap : m.accGap;
  const colCount = Math.max(-1, ...cols) + 1;
  const colW: number[] = Array.from({ length: colCount }, () => 0);
  order.forEach((i, k) => {
    if (cols[k]! >= 0) colW[cols[k]!] = Math.max(colW[cols[k]!]!, m.accWidth(e.accs[i] ?? 0));
  });
  const colRight: number[] = [];
  let edge = leftEdge - gap;
  for (let c = 0; c < colCount; c++) {
    colRight.push(edge);
    edge -= colW[c]! + m.accPad;
  }
  const accLeft = colCount ? edge + m.accPad : leftEdge;

  const heads: HeadLayout[] = sorted.map((pos, k) => ({
    index: order[k]!,
    pos,
    x: dx(k),
    shifted: sh[k]!,
    accX: cols[k]! >= 0 ? colRight[cols[k]!]! - m.accWidth(e.accs[order[k]!] ?? 0) : null,
    ledger: ledgerLines(pos),
  }));
  const span = stem ? stemSpan(sorted, stem) : null;
  return {
    x: 0,
    value: e.value,
    stem,
    stemX: stem ? (stem === 'up' ? hw / 2 : -hw / 2) : null,
    stemSpan: span,
    heads,
    left: -Math.min(leftEdge, accLeft),
    right: Math.max(...sorted.map((_, k) => dx(k) + hw / 2)),
  };
}

/**
 * Horizontal layout of a phrase. Spacing follows note values and shrinks (down to the minimum clear
 * space) to fit `maxWidth`; if it still doesn't fit, it stays readable and `scroll` is set.
 * `bars` lists event indices that a bar line follows.
 */
export function layoutSequence(events: readonly EventInput[], bars: readonly number[], m: LayoutMetrics): SequenceLayout {
  const proto = events.map((e) => layoutEvent(e, m));
  const barSet = new Set(bars.filter((b) => b >= 0 && b < events.length - 1));

  const place = (spread: number) => {
    const laid = proto.map((e) => ({ ...e, heads: e.heads.map((h) => ({ ...h })) }));
    const barXs: number[] = [];
    let x = m.startX + (laid[0]?.left ?? 0);
    laid.forEach((e, i) => {
      e.x = x;
      const next = laid[i + 1];
      if (!next) return;
      const bar = barSet.has(i);
      const clear = e.right + next.left + m.minPad + (bar ? m.barPad : 0);
      const advance = Math.max(clear, NOMINAL[e.value] * m.quarterGap * spread);
      if (bar) barXs.push(x + e.right + (advance - e.right - next.left) / 2);
      x += advance;
    });
    const last = laid[laid.length - 1];
    const width = Math.max(m.minWidth, last ? last.x + last.right + m.endPad : 0);
    return { events: laid, barXs, width };
  };

  for (let step = 10; step >= 0; step--) {
    const r = place(step / 10);
    if (r.width <= m.maxWidth) return { ...r, scroll: false };
  }
  return { ...place(0.7), scroll: true };
}
