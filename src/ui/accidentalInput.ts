// Answer inputs that can say 'F♯' or 'B♭' (issue #33, owner decision on #10): both styles, because they teach
// different things. The A–G pad with ♯/♭ modifiers teaches spelling and enharmonics; the 12-key keyboard
// builds the key relationship. They are AnswerInputs, so any mode can use them through PlayShell.
//
// THE ANSWER IS A TOKEN that carries the style: 'pad:Db' or 'keys:C#' (AccidentalAnswer). The pad's answer must
// match the written spelling exactly; the keyboard's answer is judged by pitch (a key has no spelling, and a
// black key answers with its sharp name). Because the style travels in the answer, a mode's grade/isCorrect
// stays a pure function of (item, answer): call gradeToken(answer, spelledTarget). No input has to be asked
// "which style was that?" at grading time, and a confusion matrix can tell a spelling error from a key error.
//
// WHO CHOOSES THE STYLE: by default the mode, per item (styleFor). A kid's free Letters | Keys switch is
// opt-in (kidChoice) for a mode where both styles are equally hard; for accidental items it would let the
// kid pick the one-tap keyboard every time and never practise spelling (or meet the enharmonic rule).
//
// Pad input is modifier first, then letter: tap ♯ (or type #, or =), then F. A bare letter is the natural and is
// submitted at once, so there is never a half-typed answer that could be submitted by mistake: the only
// pending state is '♯ armed', shown on the key, on every letter, in words, and to screen readers.

import {
  type AccidentalAnswer,
  type AccidentalGrade,
  type InputStyle,
  answerToken,
  enharmonicFeedback,
  gradeAccidental,
  gradeToken,
  parseAnswerToken,
  pitchClassOf,
} from '../core/accidentals';
import { type Accidental, type AnswerName, parseAnswerName } from '../core/music';
import { h } from './dom';
import type { AnswerInput } from './letterPad';
import { neutralKeyLabels } from './noteCatcher';
import { type PianoMark, createPiano, keyName, pianoKeys } from './piano';
import './accidentalInput.css';

const LETTER_ROW = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
const isLetter = (k: string) => (LETTER_ROW as readonly string[]).includes(k);

export {
  type AccidentalAnswer,
  type AccidentalGrade,
  type InputStyle,
  answerToken,
  enharmonicFeedback,
  gradeAccidental,
  gradeToken,
  parseAnswerToken,
};

export type Modifier = 'sharp' | 'flat';
const MOD_ID: Record<Modifier, string> = { sharp: '#', flat: 'b' };
const MOD_SYMBOL: Record<Modifier, string> = { sharp: '♯', flat: '♭' };
const MOD_WORD: Record<Modifier, string> = { sharp: 'sharp', flat: 'flat' };

export interface AccidentalPad extends AnswerInput<AccidentalAnswer> {
  /** Show or hide the ♯/♭ modifiers (they appear once accidentals unlock). Clears any armed modifier. */
  setAccidentals(on: boolean): void;
  /** The modifier waiting for a letter, if any. */
  armed(): Modifier | null;
}

export interface AccidentalPadOptions {
  label: string;
  onAnswer: (answer: AccidentalAnswer | null) => void;
  /** The right answer for an item, as spelled on the staff. */
  target: (itemId: string) => AnswerName;
  /** Are accidentals unlocked? Read each time a question opens. Default: yes. */
  accidentals?: () => boolean;
}

/** The A–G + ? pad with ♯/♭ modifier keys. With accidentals off it is the plain pad. Answers are 'pad:' tokens. */
export function accidentalPad(opts: AccidentalPadOptions): AccidentalPad {
  const unlocked = opts.accidentals ?? (() => true);
  let on = unlocked();
  let armed: Modifier | null = null;
  let enabled = true;

  const status = h('p', { class: 'apad__status', role: 'status' });
  const modButtons = (['sharp', 'flat'] as const).map((m) =>
    h(
      'button',
      {
        class: 'pad__key apad__mod',
        type: 'button',
        'data-modifier': m,
        'aria-pressed': 'false',
        'aria-label': MOD_WORD[m],
        onClick: () => arm(armed === m ? null : m),
      },
      MOD_SYMBOL[m],
    ),
  );
  const mods = h('div', { class: 'apad__mods' }, ...modButtons, status);
  const letters = LETTER_ROW.map((l) => h('button', { class: 'pad__key', type: 'button', 'data-answer': l, onClick: () => answer(l) }, l));
  const idk = h('button', { class: 'pad__key pad__idk', type: 'button', 'data-answer': '?', 'aria-label': "I don't know", onClick: () => answer(null) }, '?');
  const el = h('div', { class: 'apad', role: 'group', 'aria-label': opts.label }, mods, h('div', { class: 'pad' }, ...letters, idk));

  function paint() {
    // Absent, not just hidden, while accidentals are locked: a hidden ♯ must not be the first "pad key" a
    // test, a screen reader or a focus ring finds.
    if (on) el.prepend(mods);
    else mods.remove();
    el.classList.toggle('apad--armed', armed !== null);
    for (const b of modButtons) {
      const active = b.dataset.modifier === armed;
      b.setAttribute('aria-pressed', String(active));
      b.classList.toggle('apad__mod--on', active);
    }
    // Every letter shows what it would answer, so a pending ♯ is impossible to miss.
    for (const b of letters) {
      const l = b.dataset.answer!;
      b.textContent = armed ? `${l}${MOD_SYMBOL[armed]}` : l;
      b.setAttribute('aria-label', armed ? `${l} ${MOD_WORD[armed]}` : l);
    }
    status.textContent = armed ? `${MOD_SYMBOL[armed]} is on: now tap a letter` : '';
  }
  function arm(m: Modifier | null) {
    if (!on || !enabled) return;
    armed = m;
    paint();
  }
  /** One answer, built from the letter and whatever modifier is armed; null is '?'. The modifier never outlives it. */
  function take(letter: string | null): AccidentalAnswer | null {
    const name = letter === null ? null : answerToken('pad', `${letter}${on && armed ? MOD_ID[armed] : ''}` as AnswerName);
    armed = null;
    paint();
    return name;
  }
  function answer(letter: string | null) {
    opts.onAnswer(take(letter));
  }
  paint();

  const letterKey = (letter: string) => el.querySelector<HTMLElement>(`.pad [data-answer="${letter}"]`);
  const modKey = (acc: Accidental) => {
    const m: Modifier | null = acc === 1 ? 'sharp' : acc === -1 ? 'flat' : null;
    return m ? el.querySelector<HTMLElement>(`[data-modifier="${m}"]`) : null;
  };

  return {
    el,
    setAccidentals(next) {
      on = next;
      armed = null;
      paint();
    },
    armed: () => armed,
    ask() {
      on = unlocked();
      armed = null;
      paint();
    },
    setEnabled(next) {
      enabled = next;
      armed = null;
      paint();
      el.querySelectorAll<HTMLButtonElement>('.pad__key').forEach((b) => {
        b.disabled = !next;
        if (next) b.classList.remove('pad__key--right', 'pad__key--wrong');
      });
    },
    markRight(itemId) {
      const t = parseAnswerName(opts.target(itemId));
      if (!t) return null;
      modKey(t.acc)?.classList.add('pad__key--right');
      const b = letterKey(t.letter);
      b?.classList.add('pad__key--right');
      return b;
    },
    markWrong(itemId, given) {
      const t = parseAnswerName(opts.target(itemId));
      const a = parseAnswerToken(given);
      if (!t || !a) return null;
      const wrongMod = a.acc !== t.acc ? modKey(a.acc) : null;
      wrongMod?.classList.add('pad__key--wrong');
      if (a.letter === t.letter) {
        // The letter was right, so it is never marked wrong: the modifier was. A missing modifier shows as the
        // target's modifier (already marked right) and the feedback says one was needed.
        return wrongMod ?? modKey(t.acc) ?? letterKey(t.letter);
      }
      const b = letterKey(a.letter);
      b?.classList.add('pad__key--wrong');
      return b;
    },
    fromKey(e) {
      const k = e.key;
      if (on && (k === '#' || k === '=' || k === '♯')) return arm('sharp'), 'handled';
      if (on && (k === '-' || k === '♭')) return arm('flat'), 'handled';
      if ((k === 'Escape' || k === 'Backspace') && armed) return arm(null), 'handled';
      const U = k.toUpperCase();
      const typed = isLetter(U) ? U : k === '?' || k === '/' ? null : undefined;
      if (typed === undefined) return undefined;
      return { answer: take(typed) }; // the shell submits it; the modifier is spent either way
    },
    dispose() {
      el.remove();
    },
  };
}

export interface KeyboardInputOptions {
  label: string;
  onAnswer: (answer: AccidentalAnswer | null) => void;
  target: (itemId: string) => AnswerName;
  /**
   * 'all' (default) puts names on the keys, black keys as both spellings (A♯ over B♭): this variant teaches the
   * name-to-key link. 'unlabelled' is for 'find the key' questions: no visible names, and while a question is
   * open every key is announced by position only ('Piano key 3 of 7'), as in Note Catcher; the real names come
   * back at the answer. 'middleC' is the piano's usual single dot.
   */
  labels?: 'all' | 'middleC' | 'unlabelled';
}

/** The 12-key keyboard (C–B, black keys on, black hit areas ≥ 44px) plus '?'. Answers are 'keys:' tokens. */
export function keyboardInput(opts: KeyboardInputOptions): AnswerInput<AccidentalAnswer> {
  const mode = opts.labels ?? 'all';
  const unlabelled = mode === 'unlabelled';
  const piano = createPiano({
    low: 'C4',
    high: 'B4',
    labels: unlabelled ? 'none' : mode,
    blackLabels: 'both',
    bigBlackHit: true,
    onPress: (_m, id) => opts.onAnswer(answerToken('keys', id.replace(/\d+$/, '') as AnswerName)),
  });
  const idk = h('button', { class: 'pad__key pad__idk kpad__idk', type: 'button', 'data-answer': '?', 'aria-label': "I don't know", onClick: () => opts.onAnswer(null) }, '?');
  const el = h('div', { class: 'kpad', role: 'group', 'aria-label': opts.label }, piano.el, idk);

  const keys = pianoKeys('C4', 'B4');
  const buttons = () => [...el.querySelectorAll<HTMLButtonElement>('.piano__key')];
  /** Neutral (positional) names while a question is open; the real names (both spellings on black keys) after. */
  function announce(named: boolean) {
    if (!unlabelled) return;
    const neutral = neutralKeyLabels(keys);
    for (const b of buttons()) {
      const k = keys.find((key) => key.midi === Number(b.dataset.midi))!;
      b.setAttribute('aria-label', named ? keyName(k, true) : neutral.get(k.midi)!.replace(', middle C', '')); // C may be the question
    }
    piano.el.setAttribute('aria-label', named ? 'Piano keyboard' : 'Piano keys');
  }
  announce(false);

  const mark = (name: string, kind: PianoMark) => {
    const p = parseAnswerToken(name) ?? parseAnswerName(name);
    if (!p) return null;
    const m = 60 + pitchClassOf(p);
    piano.mark(m, kind);
    return el.querySelector<HTMLElement>(`.piano__key[data-midi="${m}"]`);
  };
  return {
    el,
    setEnabled(enabled) {
      piano.setEnabled(enabled);
      idk.disabled = !enabled;
      if (enabled) piano.clearMarks();
      announce(!enabled);
    },
    markRight: (id) => mark(opts.target(id), 'right'),
    markWrong: (_id, answer) => mark(answer, 'wrong'),
    fromKey(e) {
      // Typing a letter answers that natural. Black keys are reached with the arrow keys and Enter.
      const U = e.key.toUpperCase();
      if (isLetter(U)) return { answer: answerToken('keys', U as AnswerName) };
      return e.key === '?' || e.key === '/' ? { answer: null } : undefined;
    },
    dispose() {
      piano.dispose();
      el.remove();
    },
  };
}

export interface SwitchableInputOptions {
  label: string;
  onAnswer: (answer: AccidentalAnswer | null) => void;
  target: (itemId: string) => AnswerName;
  accidentals?: () => boolean;
  /** Keyboard labels (see KeyboardInputOptions). */
  keyLabels?: KeyboardInputOptions['labels'];
  /**
   * The default: the MODE decides the style per item (spelling items on the pad, key-finding items on the
   * keyboard). An item it doesn't decide uses `initial` (default 'pad'), with no switch.
   */
  styleFor?: (itemId: string) => InputStyle | undefined;
  /**
   * Opt-in, for a mode where both styles are equally hard: items `styleFor` leaves undecided show a
   * Letters | Keys switch and the kid picks. Not for accidental items: the kid would pick the keyboard.
   */
  kidChoice?: boolean;
  /** The kid's starting choice (default 'pad'), and a callback so a mode can remember it. */
  initial?: InputStyle;
  onStyleChange?: (style: InputStyle) => void;
}

export interface SwitchableInput extends AnswerInput<AccidentalAnswer> {
  /** The style the current question shows (convenience; the answer token already says which style answered). */
  style(): InputStyle;
}

/** Both inputs in one place. The mode picks per item; the kid's switch is opt-in (kidChoice). */
export function switchableInput(opts: SwitchableInputOptions): SwitchableInput {
  let preferred: InputStyle = opts.initial ?? 'pad'; // the kid's choice; a forced item never overwrites it
  let forced: InputStyle | undefined;
  let enabled = true;
  const pad = accidentalPad(opts);
  const keys = keyboardInput({ ...opts, labels: opts.keyLabels });
  const style = () => forced ?? preferred;
  const tabs = (['pad', 'keys'] as const).map((s) =>
    h('button', { class: 'ainput__tab', type: 'button', 'data-style': s, onClick: () => choose(s) }, s === 'pad' ? 'Letters' : 'Keys'),
  );
  const switcher = h('div', { class: 'ainput__switch', role: 'group', 'aria-label': 'Answer with' }, ...tabs);
  const el = h('div', { class: 'ainput' }, switcher);
  const active = () => (style() === 'pad' ? pad : keys);

  function paint() {
    // Only the active input is in the page, so its "?" and letter keys are the only ones anything can find.
    const [shown, other] = style() === 'pad' ? [pad.el, keys.el] : [keys.el, pad.el];
    other.remove();
    if (!shown.isConnected) el.append(shown);
    switcher.hidden = !opts.kidChoice || forced !== undefined;
    for (const t of tabs) t.setAttribute('aria-pressed', String(t.dataset.style === style()));
  }
  function choose(s: InputStyle) {
    if (!opts.kidChoice || forced !== undefined || !enabled || s === preferred) return;
    preferred = s;
    pad.ask?.(''); // a switch never leaves a modifier armed
    opts.onStyleChange?.(s);
    paint();
  }
  paint();

  return {
    el,
    style,
    ask(itemId) {
      forced = opts.styleFor?.(itemId);
      pad.ask?.(itemId);
      paint();
    },
    setEnabled(next) {
      enabled = next;
      for (const t of tabs) t.disabled = !next;
      pad.setEnabled(next);
      keys.setEnabled(next);
    },
    markRight: (id) => active().markRight(id),
    markWrong: (id, a) => active().markWrong(id, a),
    fromKey: (e) => active().fromKey(e),
    dispose() {
      pad.dispose?.();
      keys.dispose?.();
      el.remove();
    },
  };
}
