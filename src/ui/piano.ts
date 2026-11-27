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
  /**
   * A keyboard wider than its box: keys stay at least 44px and the piano scrolls sideways. A touch
   * press then fires on release, and only if the finger didn't travel: a swipe scrolls and never
   * answers. A mouse still presses on the way down.
   */
  scroll?: boolean;
  /** Write "Middle C" on C4 (with the labels:'middleC' dot): a quiet reference point. */
  anchorText?: boolean;
  /** With labels:'all': black keys name both spellings, "A♯ / B♭" (stacked, so they fit a phone). Default: the sharp only. */
  blackLabels?: 'sharp' | 'both';
  /**
   * Black keys that are answers: each black key's hit area is at least 44px wide, though it still looks as
   * wide as a piano key. Where a black key's hit area overlaps a white key's, the black key wins.
   */
  bigBlackHit?: boolean;
}

export interface Piano {
  readonly el: HTMLElement;
  mark(midi: number, kind: PianoMark): void;
  clearMarks(): void;
  setEnabled(enabled: boolean): void;
  /** Read-only glow on one key (Key to Staff, Echo); null clears it. Independent of marks. */
  highlight(midi: number | null): void;
  /**
   * Scroll a `scroll` piano so these keys are in view, centered together (the first one wins when they
   * don't all fit). `smooth` animates (unless the kid prefers reduced motion); otherwise it jumps.
   */
  reveal(midis: readonly number[], smooth: boolean): void;
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
export function keyName(key: PianoKey, both = false): string {
  if (key.black && both) return `${key.letter} sharp or ${LETTERS[(LETTERS.indexOf(key.letter) + 1) % 7]} flat`;
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
/** A finger that moves farther than this (px) is scrolling, not tapping. */
const TAP_SLOP_PX = 10;
const ACTIVATE_KEYS = new Set(['Enter', ' ']);

export function createPiano(options: PianoOptions): Piano {
  const labels = options.labels ?? 'middleC';
  const keys = pianoKeys(options.low, options.high);
  const whites = keys.filter((k) => !k.black).length;
  const buttons = new Map<number, HTMLButtonElement>();
  const order: HTMLButtonElement[] = [];
  let enabled = true;
  let glow: number | null = null;
  const cleanups: Array<() => void> = [];
  let activePointer: number | null = null;
  /** Pointers that went down on a key; their release is followed by a click to swallow. */
  const downPointers = new Set<number>();
  /** Clicks still expected from released pointers, valid until swallowUntil. */
  let swallow = 0;
  let swallowUntil = -Infinity;

  const el = document.createElement('div');
  el.className = `piano piano--labels-${labels}${options.scroll ? ' piano--scroll' : ''}${options.bigBlackHit ? ' piano--big-black' : ''}`;
  const both = options.blackLabels === 'both';
  const nameOf = (key: PianoKey) => keyName(key, both);
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Piano keyboard');
  const deck = document.createElement('div');
  deck.className = 'piano__keys';
  el.style.setProperty('--whites', String(whites));
  // A scrolling piano keeps its keys in a scroller inside `el`, so the edge cues can sit outside the scroll.
  const scroller = options.scroll ? document.createElement('div') : null;
  if (scroller) {
    scroller.className = 'piano__scroller';
    scroller.append(deck);
    el.append(scroller);
  } else el.append(deck);
  const view = scroller ?? el;

  for (const key of keys) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `piano__key piano__key--${key.black ? 'black' : 'white'}`;
    b.dataset.midi = String(key.midi);
    b.dataset.note = key.id;
    b.tabIndex = -1;
    b.setAttribute('aria-label', nameOf(key));
    b.style.setProperty('--x', String(key.black ? key.white + 1 : key.white));
    if (options.anchorText && labels === 'middleC' && key.id === 'C4') {
      const t = document.createElement('span');
      t.className = 'piano__anchor';
      t.setAttribute('aria-hidden', 'true');
      t.textContent = 'Middle C';
      b.append(t);
    }
    if (labels === 'all') {
      const t = document.createElement('span');
      t.className = 'piano__label';
      t.setAttribute('aria-hidden', 'true');
      t.textContent = key.black ? (both ? `${key.letter}♯\n${LETTERS[(LETTERS.indexOf(key.letter) + 1) % 7]}♭` : `${key.letter}♯`) : key.letter;
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

  /** A touch on a scrolling piano waits for its release: where it started, and whether it turned into a swipe. */
  let pending: { b: HTMLButtonElement; x: number; y: number; left: number; moved: boolean } | null = null;

  function onPointerDown(e: PointerEvent) {
    const b = keyOf(e.target);
    if (!b) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const deferred = !!options.scroll && e.pointerType !== 'mouse';
    if (!deferred) e.preventDefault(); // no text selection / compatibility mouse events
    downPointers.add(e.pointerId);
    if (activePointer !== null) return; // a second simultaneous finger is ignored
    activePointer = e.pointerId;
    for (const o of order) o.tabIndex = o === b ? 0 : -1;
    b.classList.add('is-down');
    if (deferred) pending = { b, x: e.clientX, y: e.clientY, left: view.scrollLeft, moved: false };
    else press(b);
  }

  function onPointerMove(e: PointerEvent) {
    if (!pending || e.pointerId !== activePointer) return;
    if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > TAP_SLOP_PX) {
      pending.moved = true;
      pending.b.classList.remove('is-down');
    }
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
    const tap = pending;
    pending = null;
    // A tap, not a swipe: the finger stayed put, the browser didn't take the gesture for a scroll
    // (that sends pointercancel), and the piano didn't move under it.
    if (tap && e.type === 'pointerup' && !tap.moved && view.scrollLeft === tap.left) press(tap.b);
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
  deck.addEventListener('pointermove', onPointerMove);
  // Pointer capture can't be relied on for mouse, so the release is watched document-wide.
  document.addEventListener('pointerup', onPointerEnd);
  document.addEventListener('pointercancel', onPointerEnd);

  function relabel(b: HTMLButtonElement) {
    const key = keys.find((k) => k.midi === Number(b.dataset.midi))!;
    const mark = b.dataset.mark as PianoMark | undefined;
    b.setAttribute('aria-label', mark ? `${nameOf(key)}, ${MARK_WORDS[mark]}` : nameOf(key));
  }

  /** Scroll the keys to `left`: an animation, or (smooth false) an instant jump that never animates, even on old Safari. */
  function scrollTo(left: number, smooth: boolean) {
    if (!scroller) return;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (smooth && !reduce && typeof scroller.scrollTo === 'function') {
      scroller.scrollTo({ left, behavior: 'smooth' });
    } else {
      scroller.style.scrollBehavior = 'auto'; // beats the stylesheet's smooth, so the jump is a jump
      scroller.scrollLeft = left;
      scroller.style.scrollBehavior = '';
    }
    updateCues();
  }

  // Scroll cues: a fade and a chevron on each side that has more keys. They follow only the scroll
  // position (which always starts centered on middle C), so they say nothing about the answer.
  let chevLeft: HTMLButtonElement | null = null;
  let chevRight: HTMLButtonElement | null = null;
  function updateCues() {
    if (!scroller) return;
    const left = scroller.scrollLeft > 4;
    const right = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 4;
    el.classList.toggle('piano--more-left', left);
    el.classList.toggle('piano--more-right', right);
    if (chevLeft) chevLeft.hidden = !left;
    if (chevRight) chevRight.hidden = !right;
  }
  function chevron(dir: -1 | 1): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `piano__more piano__more--${dir < 0 ? 'left' : 'right'}`;
    b.setAttribute('aria-label', dir < 0 ? 'Show keys to the left' : 'Show keys to the right');
    b.textContent = dir < 0 ? '‹' : '›';
    b.hidden = true;
    // One octave (7 white keys) per tap.
    b.addEventListener('click', () => scrollTo(scroller!.scrollLeft + (dir * 7 * scroller!.scrollWidth) / whites, true));
    el.append(b);
    return b;
  }
  if (scroller) {
    chevLeft = chevron(-1);
    chevRight = chevron(1);
    scroller.addEventListener('scroll', updateCues, { passive: true });
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(updateCues);
      ro.observe(scroller);
      cleanups.push(() => ro.disconnect());
    }
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
    reveal(midis, smooth) {
      const bs = midis.map((m) => buttons.get(m)).filter((b): b is HTMLButtonElement => !!b);
      if (!scroller || bs.length === 0) return;
      const edge = (b: HTMLButtonElement) => [b.offsetLeft, b.offsetLeft + b.offsetWidth] as const;
      const spans = bs.map(edge);
      let lo = Math.min(...spans.map((x) => x[0]));
      let hi = Math.max(...spans.map((x) => x[1]));
      if (hi - lo > scroller.clientWidth) [lo, hi] = edge(bs[0]!); // they don't all fit: keep the first in view
      scrollTo(Math.max(0, Math.round((lo + hi) / 2 - scroller.clientWidth / 2)), smooth);
    },
    dispose() {
      document.removeEventListener('pointerup', onPointerEnd);
      document.removeEventListener('pointercancel', onPointerEnd);
      for (const c of cleanups) c();
      el.remove();
    },
  };
}
