// A tappable on-screen piano for location modes (Note Catcher, Find All, Key to Staff, Echo, …).
// Separate from the mastery map (src/render/keyboard.ts). It makes no sound: the mode plays the
// synth in onPress, so sound policy stays in one place. Colors come only from theme tokens
// (piano.css), and every mark also has a non-color cue (D53).

import { LETTERS, type Letter, midi as midiOf, parseNote } from '../core/music';
import './piano.css';

export type PianoLabels = 'none' | 'middleC' | 'all';
export type PianoMark = 'right' | 'wrong' | 'target' | 'found' | 'hint';

export interface PianoOptions {
  /** Lowest white key, a natural note id such as 'C4'. */
  low: string;
  /** Highest white key, a natural note id such as 'B5'. */
  high: string;
  /** 'middleC' (default) puts a small dot on C4; 'all' names every key; 'none' shows nothing. */
  labels?: PianoLabels;
  onPress: (midi: number, id: string) => void;
}

export interface Piano {
  readonly el: HTMLElement;
  mark(midi: number, kind: PianoMark): void;
  clearMarks(): void;
  setEnabled(enabled: boolean): void;
  /** Read-only glow on one key (Key to Staff, Echo); null clears it. Independent of marks. */
  highlight(midi: number | null): void;
  dispose(): void;
}

export interface PianoKey {
  midi: number;
  /** Natural-preferring id: black keys use the sharp spelling, e.g. 'C#4'. */
  id: string;
  black: boolean;
  letter: Letter;
  octave: number;
  /** White keys: index among white keys. Black keys: index of the white key to their left. */
  white: number;
}

/** Spoken name: "C4, middle C", "C sharp 4", "D4". */
export function keyName(key: PianoKey): string {
  if (key.black) return `${key.letter} sharp ${key.octave}`;
  return key.id === 'C4' ? 'C4, middle C' : key.id;
}

const MARK_WORDS: Record<PianoMark, string> = {
  right: 'correct',
  wrong: 'not this one',
  target: 'target',
  found: 'found',
  hint: 'hint',
};

/** Every key from white key `low` to white key `high`, in pitch order. */
export function pianoKeys(low: string, high: string): PianoKey[] {
  const lo = parseNote(low);
  const hi = parseNote(high);
  if (lo.acc || hi.acc) throw new Error(`Piano bounds must be white keys (natural notes): ${low}–${high}`);
  const start = lo.octave * 7 + LETTERS.indexOf(lo.letter);
  const end = hi.octave * 7 + LETTERS.indexOf(hi.letter);
  if (end < start) throw new Error(`Piano range is upside down: ${low}–${high}`);
  const keys: PianoKey[] = [];
  for (let d = start; d <= end; d++) {
    const octave = Math.floor(d / 7);
    const letter = LETTERS[d - octave * 7]!;
    const white = d - start;
    const m = midiOf({ letter, octave });
    keys.push({ midi: m, id: `${letter}${octave}`, black: false, letter, octave, white });
    if (d < end && letter !== 'E' && letter !== 'B') {
      keys.push({ midi: m + 1, id: `${letter}#${octave}`, black: true, letter, octave, white });
    }
  }
  return keys;
}

/**
 * A pointer release is followed by its click within a few ms. A click arriving longer than this after
 * the release is not the pointer's (e.g. VoiceOver activating a key).
 */
const CLICK_AFTER_RELEASE_MS = 600;
const ACTIVATE_KEYS = new Set(['Enter', ' ']);

export function createPiano(options: PianoOptions): Piano {
  const labels = options.labels ?? 'middleC';
  const keys = pianoKeys(options.low, options.high);
  const whites = keys.filter((k) => !k.black).length;
  const buttons = new Map<number, HTMLButtonElement>();
  const order: HTMLButtonElement[] = [];
  let enabled = true;
  let glow: number | null = null;
  let activePointer: number | null = null;
  /** Pointers that went down on a key; their release is followed by a click to swallow. */
  const downPointers = new Set<number>();
  /** Clicks still expected from released pointers, valid until swallowUntil. */
  let swallow = 0;
  let swallowUntil = -Infinity;

  const el = document.createElement('div');
  el.className = `piano piano--labels-${labels}`;
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Piano keyboard');
  const deck = document.createElement('div');
  deck.className = 'piano__keys';
  el.style.setProperty('--whites', String(whites));
  el.append(deck);

  for (const key of keys) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `piano__key piano__key--${key.black ? 'black' : 'white'}`;
    b.dataset.midi = String(key.midi);
    b.dataset.note = key.id;
    b.tabIndex = -1;
    b.setAttribute('aria-label', keyName(key));
    b.style.setProperty('--x', String(key.black ? key.white + 1 : key.white));
    if (labels === 'all') {
      const t = document.createElement('span');
      t.className = 'piano__label';
      t.setAttribute('aria-hidden', 'true');
      t.textContent = key.black ? `${key.letter}♯` : key.letter;
      b.append(t);
    } else if (labels === 'middleC' && key.id === 'C4') {
      const dot = document.createElement('span');
      dot.className = 'piano__dot';
      dot.setAttribute('aria-hidden', 'true');
      b.append(dot);
    }
    const icon = document.createElement('span');
    icon.className = 'piano__icon';
    icon.setAttribute('aria-hidden', 'true');
    b.append(icon);
    buttons.set(key.midi, b);
    order.push(b);
    deck.append(b);
  }
  // Roving tabindex: one Tab stop for the whole keyboard; arrows move between keys.
  const firstFocus = buttons.get(midiOf({ letter: 'C', octave: 4 })) ?? order[0]!;
  firstFocus.tabIndex = 0;

  const keyOf = (target: EventTarget | null) =>
    target instanceof Element ? target.closest<HTMLButtonElement>('.piano__key') : null;

  function press(b: HTMLButtonElement) {
    if (!enabled) return;
    options.onPress(Number(b.dataset.midi), b.dataset.note!);
  }

  function focusKey(b: HTMLButtonElement) {
    for (const o of order) o.tabIndex = o === b ? 0 : -1;
    b.focus();
  }

  function onPointerDown(e: PointerEvent) {
    const b = keyOf(e.target);
    if (!b) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault(); // no text selection / compatibility mouse events
    downPointers.add(e.pointerId);
    if (activePointer !== null) return; // a second simultaneous finger is ignored
    activePointer = e.pointerId;
    for (const o of order) o.tabIndex = o === b ? 0 : -1;
    b.classList.add('is-down');
    press(b);
  }

  function onPointerEnd(e: PointerEvent) {
    // The click comes after the release, however long the key was held, so the window opens here.
    // A cancelled pointer (scroll, interruption) produces no click.
    if (downPointers.delete(e.pointerId) && e.type === 'pointerup') {
      swallow++;
      swallowUntil = performance.now() + CLICK_AFTER_RELEASE_MS;
    }
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    for (const o of order) o.classList.remove('is-down');
  }

  // Assistive tech (VoiceOver, switch access) activates buttons with a bare click. A pointer press already
  // fired on pointerdown, so the click that follows its release is swallowed: one press per pointer.
  // The keyboard never goes through here (onKeyDown), so a pending swallow can't eat a keyboard press.
  function onClick(e: MouseEvent) {
    if (swallow > 0 && performance.now() < swallowUntil) {
      swallow--;
      return;
    }
    swallow = 0;
    const b = keyOf(e.target);
    if (b) press(b);
  }

  function onKeyDown(e: KeyboardEvent) {
    const b = keyOf(e.target);
    if (!b) return;
    if (ACTIVATE_KEYS.has(e.key)) {
      e.preventDefault(); // handled here, so the button doesn't also fire a click
      if (!e.repeat) press(b); // holding Enter/Space presses once
      return;
    }
    const i = order.indexOf(b);
    const next = { ArrowRight: i + 1, ArrowUp: i + 1, ArrowLeft: i - 1, ArrowDown: i - 1, Home: 0, End: order.length - 1 }[
      e.key
    ];
    if (next === undefined) return;
    e.preventDefault();
    focusKey(order[Math.max(0, Math.min(order.length - 1, next))]!);
  }

  const noMenu = (e: Event) => e.preventDefault();
  // Space activates a button on keyup; cancel that too, the press already happened on keydown.
  const onKeyUp = (e: KeyboardEvent) => {
    if (ACTIVATE_KEYS.has(e.key) && keyOf(e.target)) e.preventDefault();
  };

  deck.addEventListener('pointerdown', onPointerDown);
  deck.addEventListener('click', onClick);
  deck.addEventListener('keydown', onKeyDown);
  deck.addEventListener('keyup', onKeyUp);
  deck.addEventListener('contextmenu', noMenu);
  // Pointer capture can't be relied on for mouse, so the release is watched document-wide.
  document.addEventListener('pointerup', onPointerEnd);
  document.addEventListener('pointercancel', onPointerEnd);

  function relabel(b: HTMLButtonElement) {
    const key = keys.find((k) => k.midi === Number(b.dataset.midi))!;
    const mark = b.dataset.mark as PianoMark | undefined;
    b.setAttribute('aria-label', mark ? `${keyName(key)}, ${MARK_WORDS[mark]}` : keyName(key));
  }

  return {
    el,
    mark(m, kind) {
      const b = buttons.get(m);
      if (!b) return;
      if (b.dataset.mark) b.classList.remove(`piano__key--${b.dataset.mark}`);
      b.dataset.mark = kind;
      b.classList.add(`piano__key--${kind}`);
      relabel(b);
    },
    clearMarks() {
      for (const b of order) {
        if (!b.dataset.mark) continue;
        b.classList.remove(`piano__key--${b.dataset.mark}`);
        delete b.dataset.mark;
        relabel(b);
      }
    },
    setEnabled(on) {
      enabled = on;
      el.classList.toggle('piano--disabled', !on);
      for (const b of order) {
        if (on) b.removeAttribute('aria-disabled');
        else b.setAttribute('aria-disabled', 'true');
      }
    },
    highlight(m) {
      if (glow !== null) buttons.get(glow)?.classList.remove('piano__key--glow');
      glow = m !== null && buttons.has(m) ? m : null;
      if (glow !== null) buttons.get(glow)!.classList.add('piano__key--glow');
    },
    dispose() {
      document.removeEventListener('pointerup', onPointerEnd);
      document.removeEventListener('pointercancel', onPointerEnd);
      el.remove();
    },
  };
}
