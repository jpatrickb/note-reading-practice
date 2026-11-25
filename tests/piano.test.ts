// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MIN, THEMES, type ThemeColors, contrast } from '../src/core/themes';
import { type Piano, type PianoOptions, createPiano, keyName, pianoKeys } from '../src/ui/piano';

let current: Piano | undefined;
afterEach(() => {
  current?.dispose();
  current = undefined;
  document.body.innerHTML = '';
});

function mount(opts: Partial<PianoOptions> = {}) {
  const onPress = vi.fn();
  current = createPiano({ low: 'C4', high: 'B5', onPress, ...opts });
  document.body.append(current.el);
  return { piano: current, onPress };
}

const key = (note: string) => document.querySelector<HTMLButtonElement>(`[data-note="${note}"]`)!;
const keys = () => [...document.querySelectorAll<HTMLButtonElement>('.piano__key')];
const notesOf = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].map((k) => k.dataset.note);

function pointer(type: string, target: EventTarget, init: PointerEventInit = {}) {
  const e = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch', ...init });
  target.dispatchEvent(e);
  return e;
}
function keydown(target: HTMLElement, k: string, repeat = false) {
  const e = new KeyboardEvent('keydown', { key: k, repeat, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
}
/** A full tap as a browser delivers it: pointerdown, pointerup, then the compatibility click. */
function tap(target: HTMLElement, pointerId = 1) {
  pointer('pointerdown', target, { pointerId });
  pointer('pointerup', target, { pointerId });
  target.click();
}

describe('pianoKeys layout', () => {
  it.each([
    ['C2', 'C6', 29, 20],
    ['C4', 'B5', 14, 10],
    ['E2', 'C4', 13, 8],
  ])('%s–%s has %i white and %i black keys', (low, high, w, b) => {
    const ks = pianoKeys(low, high);
    expect(ks.filter((k) => !k.black)).toHaveLength(w);
    expect(ks.filter((k) => k.black)).toHaveLength(b);
    expect(ks[0]!.id).toBe(low);
    expect(ks.at(-1)!.id).toBe(high);
  });

  it('lists keys in pitch order, one semitone apart', () => {
    for (const [low, high] of [['C2', 'C6'], ['C4', 'B5'], ['E2', 'C4']] as const) {
      const ks = pianoKeys(low, high);
      ks.forEach((k, i) => i > 0 && expect(k.midi - ks[i - 1]!.midi).toBe(1));
    }
  });

  it('spells E2–C4 with sharps and starts at MIDI 40', () => {
    expect(pianoKeys('E2', 'C4').map((k) => k.id)).toEqual([
      'E2', 'F2', 'F#2', 'G2', 'G#2', 'A2', 'A#2', 'B2', 'C3', 'C#3', 'D3', 'D#3', 'E3',
      'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3', 'C4',
    ]);
    expect(pianoKeys('E2', 'C4')[0]!.midi).toBe(40);
  });

  it('places each black key after the white key to its left', () => {
    const ks = pianoKeys('C4', 'E4');
    expect(ks.map((k) => [k.id, k.white])).toEqual([
      ['C4', 0], ['C#4', 0], ['D4', 1], ['D#4', 1], ['E4', 2],
    ]);
  });

  it('rejects upside-down ranges and accidentals as bounds', () => {
    expect(() => pianoKeys('C5', 'C4')).toThrow(/upside down/);
    expect(() => pianoKeys('C#4', 'C5')).toThrow(/white keys/);
    expect(() => pianoKeys('C4', 'Bb5')).toThrow(/white keys/);
    expect(() => pianoKeys('H4', 'C5')).toThrow(/Bad note id/);
  });
});

describe('createPiano DOM', () => {
  it('renders every key as a button with data-midi and data-note', () => {
    mount({ low: 'C2', high: 'C6' });
    expect(keys()).toHaveLength(49);
    expect(document.querySelectorAll('.piano__key--white')).toHaveLength(29);
    expect(document.querySelectorAll('.piano__key--black')).toHaveLength(20);
    expect(key('C2').dataset.midi).toBe('36');
    expect(key('C6').dataset.midi).toBe('84');
    expect(key('A#3').dataset.midi).toBe('58');
    for (const k of keys()) {
      expect(k.tagName).toBe('BUTTON');
      expect(k.type).toBe('button');
    }
  });

  it('keeps white and black keys in pitch order in the DOM (tab and screen-reader order)', () => {
    mount();
    expect(notesOf('.piano__key').slice(0, 6)).toEqual(['C4', 'C#4', 'D4', 'D#4', 'E4', 'F4']);
    expect(notesOf('.piano__key--black')).toEqual([
      'C#4', 'D#4', 'F#4', 'G#4', 'A#4', 'C#5', 'D#5', 'F#5', 'G#5', 'A#5',
    ]);
  });

  it('sizes the deck by white-key count and positions keys', () => {
    mount();
    expect(current!.el.style.getPropertyValue('--whites')).toBe('14');
    expect(key('D4').style.getPropertyValue('--x')).toBe('1');
    expect(key('C#4').style.getPropertyValue('--x')).toBe('1');
  });

  it('has aria labels for white, black and middle-C keys', () => {
    mount();
    expect(key('C4').getAttribute('aria-label')).toBe('C4, middle C');
    expect(key('C#4').getAttribute('aria-label')).toBe('C sharp 4');
    expect(key('B5').getAttribute('aria-label')).toBe('B5');
    expect(current!.el.getAttribute('role')).toBe('group');
    expect(keyName(pianoKeys('F3', 'G3')[1]!)).toBe('F sharp 3');
  });

  it('labels: middleC (default) shows only a dot on C4, no letters', () => {
    mount();
    expect(document.querySelectorAll('.piano__dot')).toHaveLength(1);
    expect(key('C4').querySelector('.piano__dot')).not.toBeNull();
    expect(document.querySelectorAll('.piano__label')).toHaveLength(0);
  });

  it('labels: none shows no letters and no dot', () => {
    mount({ labels: 'none' });
    expect(document.querySelectorAll('.piano__dot, .piano__label')).toHaveLength(0);
    expect(keys().every((k) => k.textContent === '')).toBe(true);
  });

  it('labels: all names every key', () => {
    mount({ labels: 'all', low: 'C4', high: 'D4' });
    expect(notesOf('.piano__key').map((n) => key(n!).textContent)).toEqual(['C', 'C♯', 'D']);
  });

  it('dispose removes the element', () => {
    const { piano } = mount();
    piano.dispose();
    expect(document.querySelector('.piano')).toBeNull();
    current = undefined;
  });
});

describe('input', () => {
  it('reports MIDI and the natural-preferring id on pointerdown, before any click', () => {
    const { onPress } = mount();
    pointer('pointerdown', key('E4'));
    expect(onPress).toHaveBeenCalledWith(64, 'E4');
    pointer('pointerdown', key('F#5'), { pointerId: 2 });
    expect(onPress).toHaveBeenCalledTimes(1); // second finger while the first is down
  });

  it('reports the right MIDI for every key', () => {
    const { onPress } = mount({ low: 'E2', high: 'C4' });
    for (const k of keys()) tap(k);
    expect(onPress.mock.calls.map((c) => c[0])).toEqual(Array.from({ length: 21 }, (_, i) => 40 + i));
    expect(onPress.mock.calls.map((c) => c[1])).toEqual(notesOf('.piano__key'));
  });

  it('fires once per tap: the click after a pointer press is swallowed', () => {
    const { onPress } = mount();
    tap(key('G4'));
    tap(key('G4'));
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('prevents default on pointerdown (no selection, no compatibility mouse events)', () => {
    mount();
    expect(pointer('pointerdown', key('A4')).defaultPrevented).toBe(true);
  });

  it('ignores a second simultaneous finger, including its click', () => {
    const { onPress } = mount();
    pointer('pointerdown', key('C4'), { pointerId: 1 });
    pointer('pointerdown', key('E4'), { pointerId: 2 });
    pointer('pointerup', key('C4'), { pointerId: 1 });
    key('C4').click();
    pointer('pointerup', key('E4'), { pointerId: 2 });
    key('E4').click();
    expect(onPress.mock.calls).toEqual([[60, 'C4']]);
    tap(key('D4'), 3); // and the keyboard works normally afterwards
    expect(onPress).toHaveBeenLastCalledWith(62, 'D4');
  });

  it.each(['mouse', 'touch'])('a long %s hold presses exactly once (the click comes at release)', (pointerType) => {
    const { onPress } = mount();
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    pointer('pointerdown', key('C4'), { pointerType });
    now.mockReturnValue(4000); // held for 3 seconds
    pointer('pointerup', key('C4'), { pointerType });
    now.mockReturnValue(4005);
    key('C4').click();
    expect(onPress.mock.calls).toEqual([[60, 'C4']]);
    now.mockRestore();
  });

  it('a cancelled pointer does not swallow the next assistive-tech click', () => {
    const { onPress } = mount();
    pointer('pointerdown', key('C4'));
    pointer('pointercancel', key('C4'));
    key('D4').click();
    expect(onPress.mock.calls).toEqual([[60, 'C4'], [62, 'D4']]);
  });

  it('a click long after a release (its own click went elsewhere) still presses', () => {
    const { onPress } = mount();
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    pointer('pointerdown', key('C4'));
    pointer('pointerup', document.body); // dragged off and released outside the piano
    now.mockReturnValue(2000);
    key('D4').click();
    expect(onPress).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });

  it('ignores right/middle mouse buttons and pointerdown off the keys', () => {
    const { onPress } = mount();
    pointer('pointerdown', key('C4'), { pointerType: 'mouse', button: 2 });
    pointer('pointerdown', document.querySelector('.piano__keys')!);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a pressed state while the pointer is down', () => {
    mount();
    pointer('pointerdown', key('C4'));
    expect(key('C4').classList.contains('is-down')).toBe(true);
    pointer('pointerup', document.body); // released anywhere
    expect(key('C4').classList.contains('is-down')).toBe(false);
  });

  it('blocks the long-press context menu', () => {
    mount();
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    key('C4').dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('assistive-tech clicks press the key', () => {
    const { onPress } = mount();
    key('A#4').click();
    expect(onPress).toHaveBeenCalledWith(70, 'A#4');
  });

  it('Enter and Space press the focused key once, ignoring auto-repeat', () => {
    const { onPress } = mount();
    const enter = keydown(key('E4'), 'Enter');
    expect(enter.defaultPrevented).toBe(true); // no extra click from the button
    keydown(key('E4'), 'Enter', true);
    keydown(key('E4'), 'Enter', true);
    keydown(key('F4'), ' ');
    const up = new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true });
    key('F4').dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);
    expect(onPress.mock.calls).toEqual([[64, 'E4'], [65, 'F4']]);
  });

  it('a keyboard press right after dragging off a key is not lost', () => {
    const { onPress } = mount();
    pointer('pointerdown', key('C4'));
    pointer('pointerup', document.body); // released outside: no click reaches the piano
    keydown(key('D4'), 'Enter');
    expect(onPress.mock.calls).toEqual([[60, 'C4'], [62, 'D4']]);
  });

  it('disabled keys ignore presses but stay focusable', () => {
    const { piano, onPress } = mount();
    piano.setEnabled(false);
    expect(piano.el.classList.contains('piano--disabled')).toBe(true);
    expect(key('C4').getAttribute('aria-disabled')).toBe('true');
    expect(key('C4').disabled).toBe(false);
    tap(key('C4'));
    key('D4').click();
    keydown(key('E4'), 'Enter');
    expect(onPress).not.toHaveBeenCalled();
    piano.setEnabled(true);
    expect(key('C4').hasAttribute('aria-disabled')).toBe(false);
    tap(key('C4'));
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('stops listening for pointer releases after dispose', () => {
    const { piano } = mount();
    const spy = vi.spyOn(document, 'removeEventListener');
    piano.dispose();
    expect(spy.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(['pointerup', 'pointercancel']));
    current = undefined;
  });
});

describe('keyboard focus', () => {
  const arrow = (k: string) =>
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

  it('has one tab stop (middle C when shown) and arrows walk keys in pitch order', () => {
    mount();
    expect(keys().filter((k) => k.tabIndex === 0)).toEqual([key('C4')]);
    key('C4').focus();
    arrow('ArrowRight');
    expect(document.activeElement).toBe(key('C#4'));
    arrow('ArrowUp');
    expect(document.activeElement).toBe(key('D4'));
    arrow('ArrowLeft');
    arrow('ArrowDown');
    arrow('ArrowLeft'); // clamps at the bottom
    expect(document.activeElement).toBe(key('C4'));
    arrow('End');
    expect(document.activeElement).toBe(key('B5'));
    arrow('ArrowRight');
    expect(document.activeElement).toBe(key('B5'));
    arrow('Home');
    expect(document.activeElement).toBe(key('C4'));
    expect(keys().filter((k) => k.tabIndex === 0)).toEqual([key('C4')]);
  });

  it('starts on the lowest key when middle C is out of range, and ignores other keys', () => {
    mount({ low: 'C2', high: 'B2' });
    expect(key('C2').tabIndex).toBe(0);
    key('C2').focus();
    const e = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    key('C2').dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });

  it('a tapped key becomes the tab stop', () => {
    mount();
    tap(key('G5'));
    expect(keys().filter((k) => k.tabIndex === 0)).toEqual([key('G5')]);
  });
});

describe('marks and highlight', () => {
  it('mark adds a class, data-mark and a spoken state; re-marking replaces it', () => {
    const { piano } = mount();
    piano.mark(60, 'right');
    expect(key('C4').classList.contains('piano__key--right')).toBe(true);
    expect(key('C4').dataset.mark).toBe('right');
    expect(key('C4').getAttribute('aria-label')).toBe('C4, middle C, correct');
    piano.mark(60, 'wrong');
    expect(key('C4').classList.contains('piano__key--right')).toBe(false);
    expect(key('C4').classList.contains('piano__key--wrong')).toBe(true);
    piano.mark(61, 'target');
    piano.mark(62, 'found');
    piano.mark(63, 'hint');
    expect(key('D#4').getAttribute('aria-label')).toBe('D sharp 4, hint');
    expect(document.querySelectorAll('[data-mark]')).toHaveLength(4);
  });

  it('marks never add letter labels (no answer reveal with labels: none)', () => {
    const { piano } = mount({ labels: 'none' });
    for (const [m, kind] of [[60, 'right'], [62, 'wrong'], [64, 'target'], [65, 'found'], [67, 'hint']] as const) {
      piano.mark(m, kind);
    }
    expect(keys().every((k) => k.textContent === '')).toBe(true);
  });

  it('clearMarks removes every mark and restores labels; unknown MIDI is ignored', () => {
    const { piano } = mount();
    piano.mark(60, 'found');
    piano.mark(70, 'wrong');
    piano.mark(20, 'right');
    piano.clearMarks();
    expect(document.querySelectorAll('[data-mark], .piano__key--found, .piano__key--wrong')).toHaveLength(0);
    expect(key('A#4').getAttribute('aria-label')).toBe('A sharp 4');
  });

  it('highlight glows one key at a time and is independent of marks', () => {
    const { piano } = mount();
    piano.highlight(64);
    expect(notesOf('.piano__key--glow')).toEqual(['E4']);
    piano.highlight(66);
    expect(notesOf('.piano__key--glow')).toEqual(['F#4']);
    piano.clearMarks();
    expect(notesOf('.piano__key--glow')).toEqual(['F#4']);
    piano.highlight(10);
    expect(notesOf('.piano__key--glow')).toEqual([]);
    piano.highlight(64);
    piano.highlight(null);
    expect(notesOf('.piano__key--glow')).toEqual([]);
  });
});

// The token pairs piano.css draws with, checked for every theme (like CONTRAST_CHECKS).
// Small letters (labels: 'all') are 'text' (4.5:1); on marked keys they sit on a keyWhite chip.
const PIANO_CHECKS: [keyof ThemeColors, keyof ThemeColors, 'text' | 'large', string][] = [
  ['keyInk', 'keyWhite', 'text', 'letters on white keys and on the chip of any marked key'],
  ['keyWhite', 'keyBlack', 'text', 'letters on black keys'],
  ['keyInk', 'keyWhite', 'large', 'focus ring and hint box on white (incl. glowing) keys'],
  ['keyWhite', 'keyBlack', 'large', 'focus ring and hint box on black (incl. glowing) keys'],
  ['keyDot', 'keyWhite', 'large', 'middle-C dot (with a keyWhite ring on marked keys)'],
  ['rightInk', 'right', 'large', '✓ / ★ icon and focus ring on right and found keys'],
  ['wrongInk', 'wrong', 'large', '✗ icon and focus ring on wrong keys'],
  ['card', 'reveal', 'large', '◎ icon and focus ring on target keys'],
  ['meter', 'keyWhite', 'large', 'glow ring and bar on white keys'],
  ['meter', 'keyBlack', 'large', 'glow rim and bar on black keys'],
];

describe('piano colors in every theme', () => {
  for (const theme of THEMES) {
    it.each(PIANO_CHECKS)(`${theme.id}: %s on %s (%s) — %s`, (fg, bg, kind) => {
      expect(contrast(theme.colors[fg], theme.colors[bg])).toBeGreaterThanOrEqual(MIN[kind]);
    });
  }
});
