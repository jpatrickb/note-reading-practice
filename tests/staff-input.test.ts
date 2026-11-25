// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Clef, LETTERS, noteAtPosition, noteId, parseNote } from '../src/core/music';
import { MIN, THEMES, type ThemeColors, contrast, parseHex } from '../src/core/themes';
import { yOf } from '../src/render/staff';
import { type StaffInput, type StaffInputOptions, createStaffInput } from '../src/render/staffInput';

// Lay the staff out at a realistic iPad size: 2 CSS px per viewBox unit (each position band = 18px).
const SCALE = 2;
let staff: StaffInput;
let onAnswer: ReturnType<typeof vi.fn<(p: number[]) => void>>;
let vbTop = 0;

function mount(opts: Partial<StaffInputOptions> = {}) {
  onAnswer = vi.fn<(p: number[]) => void>();
  staff = createStaffInput({ clef: 'treble', lowPos: -3, highPos: 11, onAnswer, ...opts });
  document.body.append(staff.el);
  const [, y, w, h] = staff.el.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number) as [number, number, number, number];
  vbTop = y;
  const rect = { left: 0, top: 0, width: w * SCALE, height: h * SCALE, right: w * SCALE, bottom: h * SCALE, x: 0, y: 0 };
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ ...rect, toJSON: () => rect } as DOMRect);
  return staff;
}

/** Client y of the center of a staff position (fractional positions land between them). */
const clientY = (pos: number) => (yOf(pos) - vbTop) * SCALE;

type Ptr = { type?: string; id?: number; x?: number; button?: number };
function pointer(kind: string, pos: number | { y: number }, { type = 'touch', id = 1, x = 300, button = 0 }: Ptr = {}) {
  const y = typeof pos === 'number' ? clientY(pos) : pos.y;
  staff.el.dispatchEvent(
    new PointerEvent(kind, { bubbles: true, cancelable: true, pointerId: id, pointerType: type, clientX: x, clientY: y, button, isPrimary: id === 1 }),
  );
}
const tap = (pos: number, p: Ptr = {}) => {
  pointer('pointerdown', pos, p);
  pointer('pointerup', pos, p);
};
const key = (k: string, repeat = false) =>
  staff.el.dispatchEvent(new KeyboardEvent('keydown', { key: k, repeat, bubbles: true, cancelable: true }));
const ghost = () => (staff.el.dataset.ghost === undefined ? null : Number(staff.el.dataset.ghost));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('pointer y → snapped position', () => {
  it.each(['treble', 'bass'] as const)('%s: every offered position, incl. ledger positions', (clef: Clef) => {
    for (let p = -3; p <= 11; p++) {
      mount({ clef });
      tap(p);
      expect(onAnswer, `${clef} ${p}`).toHaveBeenCalledExactlyOnceWith([p]);
      document.body.innerHTML = '';
      vi.restoreAllMocks();
    }
  });

  it('snaps an off-center finger to the nearest position and clamps beyond the range', () => {
    mount();
    pointer('pointerdown', 4.4);
    expect(ghost()).toBe(4);
    pointer('pointermove', 4.6);
    expect(ghost()).toBe(5);
    pointer('pointermove', 3.4);
    expect(ghost()).toBe(3);
    pointer('pointermove', { y: 1 }); // top edge of the drawing: above the highest offered position
    expect(ghost()).toBe(11);
    pointer('pointermove', { y: clientY(-5) }); // below the lowest
    expect(ghost()).toBe(-3);
  });

  it('labels each hit band with its position and note for both clefs', () => {
    mount({ clef: 'bass', lowPos: -4, highPos: 12 });
    const bands = [...staff.el.querySelectorAll<SVGRectElement>('.staff-input__hit')];
    expect(bands.map((b) => Number(b.dataset.pos))).toEqual(Array.from({ length: 17 }, (_, i) => -4 + i));
    const byPos = (p: number) => bands.find((b) => b.dataset.pos === String(p))!.dataset.note;
    expect(byPos(0)).toBe('G2');
    expect(byPos(-2)).toBe('E2');
    expect(byPos(10)).toBe('C4'); // middle C: first ledger line above the bass staff
    expect(byPos(12)).toBe('E4');
    for (const b of bands) {
      expect(Number(b.getAttribute('width'))).toBe(300); // full staff width
      expect(b.dataset.note).toBe(noteId(noteAtPosition(Number(b.dataset.pos), 'bass')));
    }
    // Middle C in treble is the first ledger line below.
    mount({ clef: 'treble' });
    expect(staff.el.querySelector('[data-note="C4"]')!.getAttribute('data-pos')).toBe('-2');
  });

  it('keeps every band at least 16px tall via a minimum rendered height', () => {
    mount();
    const svg = staff.el.querySelector('svg')!;
    const vbH = Number(svg.getAttribute('viewBox')!.split(' ')[3]);
    const minH = parseFloat(svg.style.getPropertyValue('--staff-input-min-h'));
    expect((minH / vbH) * 9).toBeGreaterThanOrEqual(16); // 9 viewBox units per position band
  });

  it('rejects an inverted range', () => {
    expect(() => createStaffInput({ clef: 'treble', lowPos: 5, highPos: 2, onAnswer: () => {} })).toThrow(/above/);
  });
});

describe('press, slide, lift', () => {
  it('shows a ghost with ledger lines on press and commits only on lift', () => {
    mount();
    pointer('pointerdown', -2);
    expect(ghost()).toBe(-2);
    const g = staff.el.querySelector('.staff-input__ghost-layer')!;
    expect(g.querySelector('.staff-input__ghost')).not.toBeNull();
    expect(g.querySelectorAll('.staff__ledger')).toHaveLength(1);
    expect(staff.el.querySelector('.staff-input__band')!.getAttribute('visibility')).toBe('visible');
    expect(onAnswer).not.toHaveBeenCalled();
    pointer('pointerup', -2);
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith([-2]);
    expect(ghost()).toBeNull();
    expect(staff.placed).toEqual([-2]);
    expect(staff.el.querySelector('[data-placed] .staff-input__placed')).not.toBeNull();
  });

  it('two ledger lines for a note above the second ledger line', () => {
    mount({ highPos: 13 });
    pointer('pointerdown', 13);
    expect(staff.el.querySelectorAll('.staff-input__ghost-layer .staff__ledger')).toHaveLength(2);
  });

  it('sliding changes the target; the lift position wins', () => {
    mount();
    pointer('pointerdown', 2);
    pointer('pointermove', 3);
    pointer('pointermove', 5);
    expect(ghost()).toBe(5);
    pointer('pointerup', 6);
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith([6]);
  });

  it.each(['touch', 'mouse'])('a 2-second %s hold with jitter gives exactly one answer', (type) => {
    mount();
    pointer('pointerdown', 4, { type });
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(100);
      pointer('pointermove', 4 + (i % 2 ? 0.1 : -0.1), { type });
    }
    expect(onAnswer).not.toHaveBeenCalled();
    pointer('pointerup', 4, { type });
    staff.el.dispatchEvent(new MouseEvent('click', { bubbles: true })); // the click that follows a tap
    vi.advanceTimersByTime(2000);
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith([4]);
    // Input locks after the answer: further taps do nothing until reset().
    tap(6, { type });
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(staff.el.getAttribute('aria-disabled')).toBe('true');
  });

  it('pointercancel and lost capture cancel without answering', () => {
    mount();
    pointer('pointerdown', 3);
    pointer('pointercancel', 3);
    expect(ghost()).toBeNull();
    pointer('pointerup', 3); // a stray up after cancel
    pointer('pointerdown', 5);
    pointer('lostpointercapture', 5);
    expect(ghost()).toBeNull();
    pointer('pointerup', 5);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('sliding off the staff cancels; sliding back brings the ghost back', () => {
    mount();
    pointer('pointerdown', 3);
    pointer('pointermove', 3, { x: -100 });
    expect(ghost()).toBeNull();
    pointer('pointermove', 3);
    expect(ghost()).toBe(3);
    pointer('pointermove', { y: -200 });
    pointer('pointerup', { y: -200 });
    expect(onAnswer).not.toHaveBeenCalled();
    expect(staff.el.querySelector('.staff-input__status')!.textContent).toBe('No note placed.');
    tap(3); // still enabled
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith([3]);
  });

  it('ignores a second finger, other mouse buttons and events while disabled', () => {
    mount();
    pointer('pointerdown', 2, { id: 1 });
    pointer('pointerdown', 7, { id: 2 });
    pointer('pointermove', 7, { id: 2 });
    expect(ghost()).toBe(2);
    pointer('pointerup', 7, { id: 2 });
    expect(onAnswer).not.toHaveBeenCalled();
    pointer('pointerup', 2, { id: 1 });
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith([2]);

    mount();
    tap(4, { type: 'mouse', button: 2 });
    expect(onAnswer).not.toHaveBeenCalled();
    staff.setEnabled(false);
    tap(4);
    key('ArrowUp');
    key('Enter');
    expect(onAnswer).not.toHaveBeenCalled();
    staff.setEnabled(true);
    tap(4);
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith([4]);
  });

  it('disabling mid-press drops the ghost and the lift does nothing', () => {
    mount();
    pointer('pointerdown', 4);
    staff.setEnabled(false);
    expect(ghost()).toBeNull();
    pointer('pointerup', 4);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('blocks the long-press context menu', () => {
    mount();
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    staff.el.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});

describe('several notes (chords)', () => {
  it('adds and removes notes; onAnswer fires once when maxPlaced are placed', () => {
    mount({ maxPlaced: 3 });
    tap(0);
    tap(2);
    expect(staff.placed).toEqual([0, 2]);
    tap(2); // tapping a placed note removes it
    expect(staff.placed).toEqual([0]);
    expect(staff.el.querySelector('.staff-input__status')!.textContent).toBe('Removed from the 2nd line.');
    tap(6);
    expect(onAnswer).not.toHaveBeenCalled();
    tap(4);
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith([0, 4, 6]);
    expect(staff.el.dataset.placed).toBe('0,4,6');
    tap(8);
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it('draws fixed notes, which can be neither removed nor counted', () => {
    mount({ maxPlaced: 2, fixed: [parseNote('C4'), parseNote('F#4')] });
    expect(staff.el.querySelectorAll('[data-fixed]')).toHaveLength(2);
    expect(staff.el.querySelector('[data-fixed] .staff__ledger')).not.toBeNull(); // C4's ledger line
    expect(staff.el.querySelectorAll('.staff-input__fixed')).toHaveLength(3); // 2 heads + the sharp
    tap(-2);
    expect(staff.placed).toEqual([]);
    expect(staff.el.querySelector('.staff-input__status')!.textContent).toBe("There's already a note on the ledger line below the staff.");
    tap(0);
    tap(2);
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith([0, 2]);
  });

  it('puts the upper note of a step on the other side of the stem', () => {
    mount({ maxPlaced: 3 });
    tap(3);
    tap(4);
    const x = (p: number) =>
      Number(/translate\(([-\d.]+)/.exec(staff.el.querySelector(`[data-placed][data-pos="${p}"] path`)!.getAttribute('transform')!)![1]);
    expect(x(4)).toBeGreaterThan(x(3) + 20);
  });
});

describe('keyboard', () => {
  it('↑/↓ move the ghost from the middle line, Enter commits', () => {
    mount();
    key('ArrowUp');
    expect(ghost()).toBe(4);
    key('ArrowUp');
    key('ArrowRight');
    expect(ghost()).toBe(6);
    key('ArrowDown');
    key('ArrowLeft');
    key('ArrowDown');
    expect(ghost()).toBe(3);
    expect(onAnswer).not.toHaveBeenCalled();
    key('Enter');
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith([3]);
  });

  it('stops at the ends of the range', () => {
    mount({ lowPos: 3, highPos: 5 });
    for (let i = 0; i < 5; i++) key('ArrowUp');
    expect(ghost()).toBe(5);
    for (let i = 0; i < 5; i++) key('ArrowDown');
    expect(ghost()).toBe(3);
  });

  it('Esc cancels the ghost; Enter with no ghost does nothing', () => {
    mount();
    key('ArrowDown');
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    staff.el.dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    expect(ghost()).toBeNull();
    key('Enter');
    expect(onAnswer).not.toHaveBeenCalled();
    // With no ghost, Esc is left for the page.
    const esc2 = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    staff.el.dispatchEvent(esc2);
    expect(esc2.defaultPrevented).toBe(false);
  });

  it('a held Enter (auto-repeat) answers once; Space also commits', () => {
    mount({ maxPlaced: 2 });
    key('ArrowUp');
    key('Enter');
    key('Enter', true);
    key('Enter', true);
    expect(staff.placed).toEqual([4]);
    key('ArrowUp'); // new ghost starts at the middle line again
    key('ArrowUp');
    key(' ');
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith([4, 5]);
  });

  it('leaves other keys alone and drops the ghost on blur', () => {
    mount();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    staff.el.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    key('ArrowUp');
    staff.el.dispatchEvent(new FocusEvent('blur'));
    expect(ghost()).toBeNull();
  });

  it('ignores keys while a finger is down', () => {
    mount();
    pointer('pointerdown', 2);
    key('ArrowUp');
    key('Enter');
    expect(ghost()).toBe(2);
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe('marks, reveal, reset', () => {
  it('marks notes right/wrong with a symbol, not color alone', () => {
    mount({ maxPlaced: 2 });
    tap(2);
    tap(5);
    staff.mark(2, 'right');
    staff.mark(5, 'wrong');
    staff.mark(7, 'wrong'); // not placed: drawn so the mode can point at it
    expect(staff.el.querySelector('[data-pos="2"][data-mark="right"] .staff-input__placed--right')).not.toBeNull();
    expect(staff.el.querySelector('[data-pos="2"] .staff-input__mark--right')!.textContent).toBe('✓');
    expect(staff.el.querySelector('[data-pos="5"] .staff-input__mark--wrong')!.textContent).toBe('✗');
    expect(staff.el.querySelector('[data-pos="7"][data-mark="wrong"]')).not.toBeNull();
    expect(staff.el.querySelector('.staff-input__status')!.textContent).toBe('The note on the 4th space is not right.');
  });

  it('reveals the answer beside the kid’s note, with an optional label', () => {
    mount();
    tap(3);
    staff.mark(3, 'wrong');
    staff.reveal([4], 'B');
    const reveal = staff.el.querySelector('[data-reveal][data-pos="4"]')!;
    expect(reveal.querySelector('.staff-input__reveal')).not.toBeNull();
    const x = (n: Element) => Number(/translate\(([-\d.]+)/.exec(n.querySelector('path')!.getAttribute('transform')!)![1]);
    expect(x(reveal)).toBeGreaterThan(x(staff.el.querySelector('[data-placed][data-pos="3"]')!) + 40);
    expect(staff.el.querySelector('.staff-input__reveal-label')!.textContent).toBe('B');
    expect(staff.el.querySelector('.staff-input__status')!.textContent).toBe('B goes on the 3rd line.');
    staff.reveal([0, 1, 4]);
    expect(staff.el.querySelectorAll('[data-reveal]')).toHaveLength(3);
    expect(staff.el.querySelector('.staff-input__reveal-label')).toBeNull();
    expect(staff.el.querySelector('.staff-input__status')!.textContent).toBe('It goes on the 1st line and the 1st space and the 3rd line.');
  });

  it('reset clears everything and re-enables input', () => {
    mount();
    tap(3);
    staff.mark(3, 'right');
    staff.reveal([3], 'G');
    staff.reset();
    expect(staff.placed).toEqual([]);
    expect(staff.el.querySelectorAll('[data-placed], [data-reveal], .staff-input__reveal-label')).toHaveLength(0);
    expect(staff.el.getAttribute('aria-disabled')).toBe('false');
    tap(5);
    expect(onAnswer).toHaveBeenLastCalledWith([5]);
    expect(onAnswer).toHaveBeenCalledTimes(2);
  });
});

describe('accessibility', () => {
  it('is one focusable slider that announces the ghost position', () => {
    mount();
    const el = staff.el;
    expect(el.tabIndex).toBe(0);
    expect(el.getAttribute('role')).toBe('slider');
    expect(el.getAttribute('aria-valuetext')).toBe('no note chosen');
    expect(el.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    key('ArrowUp');
    key('ArrowDown');
    key('ArrowDown');
    expect(el.getAttribute('aria-valuetext')).toBe('2nd line');
    expect(el.getAttribute('aria-valuenow')).toBe('2');
    key('Enter');
    expect(el.querySelector('[role="status"]')!.textContent).toBe('Placed on the 2nd line.');
  });

  it('never names a note before the reveal (no answer leaks)', () => {
    const letter = new RegExp(`\\b(${LETTERS.join('|')})(\\b|[#b♯♭]|\\d)`);
    for (const clef of ['treble', 'bass'] as const) {
      mount({ clef, maxPlaced: 2, fixed: [parseNote('C4')] });
      const spoken = () => [staff.el.getAttribute('aria-label'), staff.el.getAttribute('aria-valuetext'), staff.el.textContent].join(' | ');
      expect(staff.el.getAttribute('aria-label')).toContain('Already on it: a note on the');
      for (let p = -3; p <= 11; p++) {
        pointer('pointerdown', p);
        expect(spoken(), `${clef} ${p}`).not.toMatch(letter);
        pointer('pointercancel', p);
      }
      tap(3);
      staff.mark(3, 'wrong');
      expect(spoken()).not.toMatch(letter);
      // Only visible-in-SVG test hooks carry note names, and the SVG is hidden from screen readers.
      for (const n of staff.el.querySelectorAll('[data-note]')) expect(n.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });
});

// Every color pair the staff input draws with, checked in every theme (like tests/piano.test.ts).
type Pair = [fg: keyof ThemeColors, bg: keyof ThemeColors, kind: keyof typeof MIN, where: string];
const PAIRS: Pair[] = [
  ['ink', 'card', 'large', 'placed and fixed notes'],
  ['line', 'card', 'large', 'staff lines, ledger lines, clef'],
  ['reveal', 'card', 'large', 'ghost note + its ledger lines; revealed answer + label (26px bold); focus ring'],
  ['reveal', 'bg', 'large', 'focus ring when the staff sits on the page'],
  ['right', 'card', 'large', 'right note + ✓ (24px bold)'],
  ['wrong', 'card', 'large', 'wrong note + ✗ (24px bold)'],
];

/** `fg` at `alpha` over `bg`, as #rrggbb. */
function blend(fg: string, bg: string, alpha: number): string {
  const [a, b] = [parseHex(fg), parseHex(bg)];
  return `#${a.map((v, i) => Math.round(v * alpha + b[i]! * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
}

describe('staff input colors in every theme', () => {
  for (const theme of THEMES) {
    it.each(PAIRS)(`${theme.id}: %s on %s (%s), %s`, (fg, bg, kind) => {
      expect(contrast(theme.colors[fg], theme.colors[bg])).toBeGreaterThanOrEqual(MIN[kind]);
    });

    it(`${theme.id}: the ghost band highlight keeps the ghost, lines and notes readable`, () => {
      const band = blend(theme.colors.reveal, theme.colors.card, 0.14); // .staff-input__band opacity
      for (const fg of ['reveal', 'line', 'ink'] as const) {
        expect(contrast(theme.colors[fg], band), fg).toBeGreaterThanOrEqual(MIN.large);
      }
    });
  }

  it('the band opacity in the test matches the stylesheet', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(`${process.cwd()}/src/ui/staffInput.css`, 'utf8');
    expect(/\.staff-input__band\s*\{[^}]*opacity:\s*([\d.]+)/.exec(css)![1]).toBe('0.14');
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i); // theme variables only
  });
});
