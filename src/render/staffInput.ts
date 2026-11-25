// Interactive staff: kids answer by putting a note on a line or space (Place It, Key to Staff,
// Snowman Chords, the compose sandbox).
//
// Pointer model (one answer per tap, however long the finger stays down): pressing shows a "ghost"
// note snapped to the nearest position, sliding moves it, lifting commits it. Sliding off the staff
// or a system pointercancel drops the ghost without answering. Keyboard: ↑/↓ move the ghost, Enter
// or Space commits, Esc cancels. No sound here; modes play sounds from onAnswer.

import { type Clef, type Note, ledgerLines, noteAtPosition, noteId, staffPosition } from '../core/music';
import { place, shiftedHeads, snapPosition, spokenPosition, stepPosition, toViewBox } from '../core/staffTap';
import { GLYPHS } from './glyphs';
import { ACCIDENTAL_GLYPH, STAFF_GEOMETRY as G, el, glyph, yOf } from './staff';
import '../ui/staffInput.css';

export interface StaffInputOptions {
  clef: Clef;
  /** Lowest and highest staff positions offered (0 = bottom line, 8 = top line), incl. ledger positions. */
  lowPos: number;
  highPos: number;
  /** Notes already drawn that can't be moved (e.g. the snowman's bottom ball). */
  fixed?: Note[];
  /** How many notes the kid places before onAnswer fires (default 1). */
  maxPlaced?: number;
  /** Called once with the placed positions (low → high) when `maxPlaced` notes are placed. Input then locks until reset(). */
  onAnswer: (positions: number[]) => void;
}

export interface StaffInput {
  el: HTMLElement;
  /** Colors a note right or wrong and adds ✓/✗ (draws the note if it isn't placed). */
  mark(pos: number, kind: 'right' | 'wrong'): void;
  /** Shows the correct note(s) beside the kid's, with an optional label (e.g. "G"). */
  reveal(positions: number[], label?: string): void;
  setEnabled(enabled: boolean): void;
  /** Clears placed notes, marks, the reveal and the ghost, and re-enables input. */
  reset(): void;
  /** Positions placed so far, low → high. */
  readonly placed: readonly number[];
}

const NOTE_X = 150; // further left than renderStaff's, to leave room for a revealed answer beside the kid's note
const HEAD_W = GLYPHS.noteheadWhole.bounds[2] * G.glyphScale;
const LEDGER_OVERHANG = 8;
const REVEAL_X = NOTE_X + HEAD_W * 2.4;
/** Pointer slack (CSS px) outside the staff before a slide counts as "slid off" (cancel). */
const SLIDE_OFF_SLACK = 16;
/** Smallest height of one position band on screen (CSS px); the staff never renders smaller. */
const MIN_BAND_PX = 16;

const CLEF_GLYPH = { treble: { name: 'gClef', pos: 2 }, bass: { name: 'fClef', pos: 6 } } as const;

/** Vertical extent of the drawing in viewBox units: every offered position, the staff and the clef. */
function verticalBox(clef: Clef, low: number, high: number): { top: number; bottom: number } {
  const c = CLEF_GLYPH[clef];
  const [, gyMin, , gyMax] = GLYPHS[c.name].bounds;
  const clefTop = yOf(c.pos) - gyMax * G.glyphScale;
  const clefBottom = yOf(c.pos) - gyMin * G.glyphScale;
  const top = Math.min(yOf(Math.max(high, 8)) - G.space, clefTop - 4);
  const bottom = Math.max(yOf(Math.min(low, 0)) + G.space, clefBottom + 4);
  return { top: Math.floor(top), bottom: Math.ceil(bottom) };
}

export function createStaffInput(opts: StaffInputOptions): StaffInput {
  const { clef, lowPos: low, highPos: high, onAnswer } = opts;
  if (low > high) throw new Error(`lowPos ${low} is above highPos ${high}`);
  const max = Math.max(1, opts.maxPlaced ?? 1);
  const fixed = (opts.fixed ?? []).map((n) => ({ note: n, pos: staffPosition(n, clef) }));
  const fixedPos = fixed.map((f) => f.pos);

  let placed: number[] = [];
  let ghost: number | null = null;
  let enabled = true;
  let activePointer: number | null = null;
  const marks = new Map<number, 'right' | 'wrong'>();
  let revealed: { positions: number[]; label?: string } | null = null;

  // ----- DOM -----
  const { top, bottom } = verticalBox(clef, low, high);
  const vb = { x: 0, y: top, width: G.width, height: bottom - top };

  const root = document.createElement('div');
  root.className = 'staff-input';
  root.tabIndex = 0;
  root.dataset.clef = clef;
  root.setAttribute('role', 'slider');
  root.setAttribute('aria-orientation', 'vertical');
  root.setAttribute('aria-valuemin', String(low));
  root.setAttribute('aria-valuemax', String(high));
  const already = fixed.length
    ? ` Already on it: ${fixed.map((f) => `a note on the ${spokenPosition(f.pos)}`).join(', ')}.`
    : '';
  const how = max > 1 ? `Place ${max} notes.` : 'Place a note.';
  root.setAttribute(
    'aria-label',
    `${clef === 'treble' ? 'Treble' : 'Bass'} clef staff.${already} ${how} Choose a line or space with the up and down arrows, then press Enter.`,
  );

  const svg = el('svg', {
    viewBox: `${vb.x} ${vb.y} ${vb.width} ${vb.height}`,
    class: 'staff staff-input__svg',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  // Never let the staff get so small that one position band is under MIN_BAND_PX tall.
  svg.style.setProperty('--staff-input-min-h', `${Math.ceil((vb.height * MIN_BAND_PX) / (G.space / 2))}px`);

  for (let line = 0; line <= 8; line += 2) {
    svg.append(el('line', { x1: 10, x2: G.width - 10, y1: yOf(line), y2: yOf(line), class: 'staff__line' }));
  }
  svg.append(el('line', { x1: 10, x2: 10, y1: yOf(8), y2: yOf(0), class: 'staff__line' }));
  const c = CLEF_GLYPH[clef];
  svg.append(glyph(c.name, 22, yOf(c.pos), 'staff__clef'));

  const highlight = el('rect', { x: 10, width: G.width - 20, height: G.space / 2, class: 'staff-input__band', visibility: 'hidden' });
  const notes = el('g', { class: 'staff-input__notes' });
  const ghostLayer = el('g', { class: 'staff-input__ghost-layer' });
  const hits = el('g', { class: 'staff-input__hits' });
  svg.append(highlight, notes, ghostLayer, hits);

  // One transparent hit band per position spanning the whole width (so e2e can tap an exact
  // position). The outermost bands reach the drawing's edges. Snapping, not the band, decides.
  for (let p = low; p <= high; p++) {
    const y1 = p === high ? vb.y : yOf(p) - G.space / 4;
    const y2 = p === low ? vb.y + vb.height : yOf(p) + G.space / 4;
    hits.append(
      el('rect', {
        x: 0,
        y: y1,
        width: G.width,
        height: y2 - y1,
        class: 'staff-input__hit',
        fill: 'transparent',
        'pointer-events': 'all',
        'data-pos': p,
        'data-note': noteId(noteAtPosition(p, clef)),
      }),
    );
  }

  const status = document.createElement('div');
  status.className = 'staff-input__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  root.append(svg, status);

  // ----- drawing -----
  function head(x: number, pos: number, cls: string) {
    const g = el('g', { class: 'staff-input__head', 'data-pos': pos });
    for (const p of ledgerLines(pos)) {
      g.append(
        el('line', {
          x1: x - HEAD_W / 2 - LEDGER_OVERHANG,
          x2: x + HEAD_W / 2 + LEDGER_OVERHANG,
          y1: yOf(p),
          y2: yOf(p),
          class: 'staff__ledger',
        }),
      );
    }
    g.append(glyph('noteheadWhole', x - HEAD_W / 2, yOf(pos), cls));
    return g;
  }

  function render() {
    notes.replaceChildren();
    const chord = [...new Set([...fixedPos, ...placed])].sort((a, b) => a - b);
    const shift = shiftedHeads(chord);
    const xOf = (pos: number) => NOTE_X + (shift[chord.indexOf(pos)] ? HEAD_W : 0);

    for (const f of fixed) {
      const x = xOf(f.pos);
      const g = head(x, f.pos, 'staff__note staff-input__fixed');
      g.dataset.fixed = '';
      const acc = ACCIDENTAL_GLYPH[f.note.acc ?? 0];
      if (acc) {
        const gap = ledgerLines(f.pos).length ? 10 : 4;
        g.append(glyph(acc, x - HEAD_W / 2 - gap - GLYPHS[acc].bounds[2] * G.glyphScale, yOf(f.pos), 'staff__note staff-input__fixed'));
      }
      notes.append(g);
    }

    const markedOnly = [...marks.keys()].filter((p) => !placed.includes(p) && !fixedPos.includes(p));
    for (const p of [...placed, ...markedOnly]) {
      const kind = marks.get(p);
      const x = placed.includes(p) ? xOf(p) : NOTE_X;
      const g = head(x, p, `staff__note staff-input__placed${kind ? ` staff-input__placed--${kind}` : ''}`);
      g.dataset.placed = '';
      if (kind) {
        g.dataset.mark = kind;
        const t = el('text', {
          x: NOTE_X - HEAD_W / 2 - LEDGER_OVERHANG - 6,
          y: yOf(p) + 8,
          'text-anchor': 'end',
          class: `staff-input__mark staff-input__mark--${kind}`,
        });
        t.textContent = kind === 'right' ? '✓' : '✗';
        g.append(t);
      }
      notes.append(g);
    }

    if (revealed) {
      const rp = [...revealed.positions].sort((a, b) => a - b);
      const rs = shiftedHeads(rp);
      rp.forEach((p, i) => {
        const g = head(REVEAL_X + (rs[i] ? HEAD_W : 0), p, 'staff-input__reveal');
        g.dataset.reveal = '';
        notes.append(g);
      });
      if (revealed.label && rp.length) {
        const t = el('text', {
          x: REVEAL_X + HEAD_W / 2 + (rs.some(Boolean) ? HEAD_W : 0) + 10,
          y: yOf(rp[rp.length - 1]!) + 8,
          class: 'staff__label staff-input__reveal-label',
        });
        t.textContent = revealed.label;
        notes.append(t);
      }
    }
    root.dataset.placed = placed.join(',');
  }

  function setGhost(pos: number | null) {
    if (pos === ghost) return;
    ghost = pos;
    ghostLayer.replaceChildren();
    if (pos === null) {
      highlight.setAttribute('visibility', 'hidden');
      delete root.dataset.ghost;
      root.removeAttribute('aria-valuenow');
      root.setAttribute('aria-valuetext', 'no note chosen');
      return;
    }
    highlight.setAttribute('y', String(yOf(pos) - G.space / 4));
    highlight.setAttribute('visibility', 'visible');
    ghostLayer.append(head(NOTE_X, pos, 'staff-input__ghost'));
    root.dataset.ghost = String(pos);
    root.setAttribute('aria-valuenow', String(pos));
    root.setAttribute('aria-valuetext', spokenPosition(pos));
  }

  function say(text: string) {
    status.textContent = text;
  }

  function commit(pos: number) {
    const r = place(placed, pos, max, fixedPos);
    if (r.change === 'ignored') {
      say(fixedPos.includes(pos) ? `There's already a note on the ${spokenPosition(pos)}.` : '');
      return;
    }
    placed = r.placed;
    render();
    say(`${r.change === 'added' ? 'Placed on' : 'Removed from'} the ${spokenPosition(pos)}.`);
    if (r.complete) {
      setEnabled(false);
      onAnswer([...placed]);
    }
  }

  // ----- pointer -----
  function track(e: PointerEvent) {
    const box = root.getBoundingClientRect();
    const off =
      e.clientX < box.left - SLIDE_OFF_SLACK ||
      e.clientX > box.left + box.width + SLIDE_OFF_SLACK ||
      e.clientY < box.top - SLIDE_OFF_SLACK ||
      e.clientY > box.top + box.height + SLIDE_OFF_SLACK;
    if (off) return setGhost(null);
    const { y } = toViewBox(e.clientX, e.clientY, svg.getBoundingClientRect(), vb);
    setGhost(snapPosition(y, low, high, G));
  }

  function endPointer() {
    if (activePointer === null) return;
    const id = activePointer;
    activePointer = null;
    try {
      if (root.hasPointerCapture?.(id)) root.releasePointerCapture(id);
    } catch {
      // The pointer is already gone.
    }
  }

  root.addEventListener('pointerdown', (e) => {
    // One finger at a time; primary mouse button only.
    if (!enabled || activePointer !== null || e.button !== 0) return;
    e.preventDefault();
    activePointer = e.pointerId;
    try {
      root.setPointerCapture?.(e.pointerId);
    } catch {
      // Not capturable (synthetic event); move/up still reach us while over the staff.
    }
    track(e);
  });
  root.addEventListener('pointermove', (e) => {
    if (e.pointerId === activePointer) track(e);
  });
  root.addEventListener('pointerup', (e) => {
    if (e.pointerId !== activePointer) return;
    track(e);
    const pos = ghost;
    endPointer();
    setGhost(null);
    if (pos === null) say('No note placed.');
    else commit(pos);
  });
  const cancelPointer = (e: PointerEvent) => {
    if (e.pointerId !== activePointer) return;
    endPointer();
    setGhost(null);
  };
  root.addEventListener('pointercancel', cancelPointer);
  root.addEventListener('lostpointercapture', cancelPointer);
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  // ----- keyboard -----
  root.addEventListener('keydown', (e) => {
    if (!enabled || activePointer !== null) return;
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        setGhost(stepPosition(ghost, 1, low, high));
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        setGhost(stepPosition(ghost, -1, low, high));
        break;
      case 'Enter':
      case ' ':
        // A held key auto-repeats; only the first press may answer.
        if (!e.repeat && ghost !== null) {
          const pos = ghost;
          setGhost(null);
          commit(pos);
        }
        break;
      case 'Escape':
        if (ghost === null) return; // let Esc reach the page (e.g. to leave the screen)
        setGhost(null);
        say('Cancelled.');
        break;
      default:
        return;
    }
    e.preventDefault();
  });
  root.addEventListener('blur', () => {
    if (activePointer === null) setGhost(null);
  });

  // ----- API -----
  function setEnabled(on: boolean) {
    enabled = on;
    root.setAttribute('aria-disabled', String(!on));
    if (!on) {
      endPointer();
      setGhost(null);
    }
  }

  root.setAttribute('aria-valuetext', 'no note chosen');
  setEnabled(true);
  render();

  return {
    el: root,
    get placed() {
      return placed;
    },
    mark(pos, kind) {
      marks.set(pos, kind);
      render();
      say(`The note on the ${spokenPosition(pos)} is ${kind === 'right' ? 'right' : 'not right'}.`);
    },
    reveal(positions, label) {
      revealed = { positions: [...positions], ...(label !== undefined ? { label } : {}) };
      render();
      const where = positions.map((p) => `the ${spokenPosition(p)}`).join(' and ');
      say(`${label ? `${label} goes` : 'It goes'} on ${where}.`);
    },
    setEnabled,
    reset() {
      placed = [];
      marks.clear();
      revealed = null;
      say('');
      setEnabled(true);
      render();
    },
  };
}
