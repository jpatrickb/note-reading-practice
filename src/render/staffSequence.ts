// Draws a phrase on a staff as SVG: a sequence of notes and chords (stacked Notes), with optional
// note values and stems, bar lines, a reading cursor, answer states and letter labels. Same Bravura
// glyphs and geometry as renderStaff (staff.ts); layout math lives in src/core/staffLayout.ts.
//
// Long phrases: spacing compresses first; if it still doesn't fit `maxWidth`, the SVG keeps a
// readable minimum size (`data-scroll`, CSS min-width) and the caller wraps it in an
// `overflow-x: auto` container (we scroll rather than wrap, so the cursor and note indexes stay on one line).

import { type Accidental, type Clef, type Note, noteId, spokenName, staffPosition } from '../core/music';
import { type LayoutMetrics, type NoteValue, layoutSequence } from '../core/staffLayout';
import '../ui/staffSequence.css';
import { GLYPHS } from './glyphs';
import { ACCIDENTAL_GLYPH, STAFF_GEOMETRY, el, glyph, yOf } from './staff';

/** One thing to read: a single note, or a chord (notes stacked on the same beat). */
export type StaffEvent = Note | readonly Note[];
export type NoteState = 'idle' | 'right' | 'wrong' | 'reveal';

export interface SequenceOptions {
  /** Note value per event. Omitted: every event is a whole note (no stems), like the single-note staff. */
  beats?: readonly NoteValue[];
  /** Draw a bar line after each of these event indices. */
  bars?: readonly number[];
  /** Reserve room after the clef for this many key-signature accidentals (filled in later by #50): see `.staff-seq__key-slot`. */
  keySignatureSlot?: number;
  /** Index of the event being read: highlighted. */
  cursor?: number;
  /** Answer state per event (default idle). Only answered events expose their note names in `aria-label`. */
  states?: readonly (NoteState | undefined)[];
  /** Text under each event (e.g. letters once answered). Pass undefined for events that shouldn't show one. */
  labels?: readonly (string | undefined)[];
  /** Widest viewBox before the staff scrolls. Default 760. */
  maxWidth?: number;
}

const KEY_ACC_WIDTH = 13;
const CLEF_X = 22;
const HEAD_GLYPH: Record<NoteValue, 'noteheadWhole' | 'noteheadHalf' | 'noteheadBlack'> = {
  whole: 'noteheadWhole',
  half: 'noteheadHalf',
  quarter: 'noteheadBlack',
};
const STEM_WIDTH = 2.2;
const LEDGER_OVERHANG = 8;

const toNotes = (e: StaffEvent): readonly Note[] => ('letter' in e ? [e] : e);
const answered = (s: NoteState | undefined) => s !== undefined && s !== 'idle';

export function renderStaffSequence(
  events: readonly StaffEvent[],
  clef: Clef,
  opts: SequenceOptions = {},
): SVGSVGElement {
  // Read at call time, not import time: staff.ts re-exports this module, so it may not be initialised yet.
  const { space: SP, glyphScale: K, height: HEIGHT } = STAFF_GEOMETRY;
  const groups = events.map(toNotes);
  const keyW = opts.keySignatureSlot ? opts.keySignatureSlot * KEY_ACC_WIDTH + 6 : 0;
  const metrics: LayoutMetrics = {
    headWidth: (v) => GLYPHS[HEAD_GLYPH[v]].bounds[2] * K,
    accWidth: (a: Accidental) => {
      const g = ACCIDENTAL_GLYPH[a];
      return g ? GLYPHS[g].bounds[2] * K : 0;
    },
    startX: CLEF_X + GLYPHS.gClef.bounds[2] * K + keyW + 14,
    endPad: 22,
    minWidth: 220,
    maxWidth: opts.maxWidth ?? 760,
    minPad: 14,
    barPad: 16,
    quarterGap: 44,
    accGap: 4,
    ledgerAccGap: 10,
    accPad: 2,
  };
  const layout = layoutSequence(
    groups.map((notes, i) => ({
      positions: notes.map((n) => staffPosition(n, clef)),
      accs: notes.map((n) => n.acc ?? 0),
      value: opts.beats?.[i] ?? 'whole',
    })),
    opts.bars ?? [],
    metrics,
  );

  // Vertical extent: the usual 190 tall, grown for extreme ledger lines, stems and the label row.
  let minY: number = 0;
  let maxY: number = HEIGHT;
  for (const e of layout.events) {
    for (const h of e.heads) {
      minY = Math.min(minY, yOf(h.pos) - SP);
      maxY = Math.max(maxY, yOf(h.pos) + SP);
    }
    if (e.stemSpan) {
      minY = Math.min(minY, yOf(Math.max(e.stemSpan.from, e.stemSpan.to)) - 4);
      maxY = Math.max(maxY, yOf(Math.min(e.stemSpan.from, e.stemSpan.to)) + 4);
    }
  }
  const labelY = Math.max(HEIGHT - 14, maxY - SP + 30);
  if (opts.labels) maxY = Math.max(maxY, labelY + 12);

  const w = layout.width;
  const svg = el('svg', {
    viewBox: `0 ${minY} ${w} ${maxY - minY}`,
    class: 'staff staff--seq',
    role: 'group',
    'data-clef': clef,
    'data-count': events.length,
    'aria-label': `${clef} clef with ${events.length} ${events.length === 1 ? 'note' : 'notes'}`,
  });
  if (layout.scroll) {
    svg.dataset.scroll = '';
    svg.style.setProperty('--staff-seq-w', `${Math.round(w)}px`);
  }
  if (opts.cursor !== undefined) svg.dataset.cursor = String(opts.cursor);

  for (let line = 0; line <= 8; line += 2) {
    svg.append(el('line', { x1: 10, x2: w - 10, y1: yOf(line), y2: yOf(line), class: 'staff__line' }));
  }
  svg.append(el('line', { x1: 10, x2: 10, y1: yOf(8), y2: yOf(0), class: 'staff__line' }));
  for (const x of layout.barXs) svg.append(el('line', { x1: x, x2: x, y1: yOf(8), y2: yOf(0), class: 'staff__line staff-seq__bar' }));
  svg.append(clef === 'treble' ? glyph('gClef', CLEF_X, yOf(2), 'staff__clef') : glyph('fClef', CLEF_X, yOf(6), 'staff__clef'));
  if (opts.keySignatureSlot) {
    const x = CLEF_X + GLYPHS.gClef.bounds[2] * K + 6;
    svg.append(
      el('g', { class: 'staff-seq__key-slot', 'data-count': opts.keySignatureSlot, 'data-x': Math.round(x), 'data-width': keyW - 6 }),
    );
  }

  layout.events.forEach((ev, i) => {
    const notes = groups[i]!;
    const state = opts.states?.[i] ?? 'idle';
    const done = answered(state);
    const names = notes.map(spokenName).join(', ');
    const g = el('g', {
      class: `staff-seq__group staff-seq__group--${state}${opts.cursor === i ? ' staff-seq__group--cursor' : ''}`,
      role: 'img',
      'data-index': i,
      'data-note': notes.map(noteId).join(' '),
      'data-value': ev.value,
      // Note names only once answered: the DOM text must never give the answer away.
      'aria-label': done ? names : `note ${i + 1} of ${events.length}`,
    });
    if (opts.cursor === i) {
      g.setAttribute('aria-current', 'true');
      g.append(
        el('rect', {
          x: ev.x - ev.left - 6,
          y: yOf(8) - 18,
          width: ev.left + ev.right + 12,
          height: yOf(0) - yOf(8) + 36,
          rx: 8,
          class: 'staff-seq__cursor',
        }),
      );
    }

    // Ledger lines: one line per position across every head that needs it.
    const ledgers = new Map<number, [number, number]>();
    for (const h of ev.heads) {
      const hw = metrics.headWidth(ev.value);
      const x1 = ev.x + h.x - hw / 2 - LEDGER_OVERHANG;
      const x2 = ev.x + h.x + hw / 2 + LEDGER_OVERHANG;
      for (const p of h.ledger) {
        const cur = ledgers.get(p);
        ledgers.set(p, cur ? [Math.min(cur[0], x1), Math.max(cur[1], x2)] : [x1, x2]);
      }
    }
    for (const [p, [x1, x2]] of ledgers) {
      g.append(el('line', { x1, x2, y1: yOf(p), y2: yOf(p), class: 'staff__ledger', 'data-pos': p }));
    }

    if (ev.stem && ev.stemSpan && ev.stemX !== null) {
      const dir = ev.stem === 'up' ? -1 : 1; // attach just above (up) or below (down) the head's centre
      const x = ev.x + ev.stemX + (ev.stem === 'up' ? -STEM_WIDTH / 2 : STEM_WIDTH / 2);
      g.append(
        el('line', {
          x1: x,
          x2: x,
          y1: yOf(ev.stemSpan.from) + dir * 3,
          y2: yOf(ev.stemSpan.to),
          class: 'staff-seq__stem',
          'data-stem': ev.stem,
        }),
      );
    }

    const hw = metrics.headWidth(ev.value);
    for (const h of ev.heads) {
      const head = glyph(HEAD_GLYPH[ev.value], ev.x + h.x - hw / 2, yOf(h.pos), 'staff__note');
      head.dataset.note = noteId(notes[h.index]!);
      head.dataset.pos = String(h.pos);
      g.append(head);
      const acc = ACCIDENTAL_GLYPH[notes[h.index]!.acc ?? 0];
      if (acc && h.accX !== null) g.append(glyph(acc, ev.x + h.accX, yOf(h.pos), 'staff__note staff__accidental'));
    }

    const label = opts.labels?.[i];
    if (label) {
      const t = el('text', { x: ev.x, y: labelY, 'text-anchor': 'middle', class: 'staff__label staff-seq__label' });
      t.textContent = label;
      g.append(t);
    }
    svg.append(g);
  });
  return svg;
}
