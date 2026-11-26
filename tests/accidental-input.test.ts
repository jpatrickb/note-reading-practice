// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnswerName } from '../src/core/music';
import {
  type AccidentalPad,
  type InputStyle,
  accidentalPad,
  answerToken,
  enharmonicFeedback,
  gradeAccidental,
  gradeToken,
  keyboardInput,
  parseAnswerToken,
  switchableInput,
} from '../src/ui/accidentalInput';

afterEach(() => {
  document.body.innerHTML = '';
});

const target = (id: string) => id as AnswerName; // items in these tests are their own answers
const kb = (key: string) => new KeyboardEvent('keydown', { key });
const q = (sel: string) => document.querySelector<HTMLButtonElement>(sel)!;
const letter = (l: string) => q(`.pad [data-answer="${l}"]`);
const mod = (m: string) => q(`[data-modifier="${m}"]`);

function mountPad(accidentals = true) {
  const onAnswer = vi.fn();
  const pad: AccidentalPad = accidentalPad({ label: 'Note names', onAnswer, target, accidentals: () => accidentals });
  document.body.append(pad.el);
  return { pad, onAnswer };
}

describe('accidental pad', () => {
  it('hides the modifiers until accidentals unlock, and then behaves like the plain pad', () => {
    const { pad, onAnswer } = mountPad(false);
    expect(mod('sharp').closest<HTMLElement>('.apad__mods')!.hidden).toBe(true);
    expect(pad.fromKey(kb('#'))).toBeUndefined();
    expect(pad.fromKey(kb('='))).toBeUndefined();
    expect(pad.fromKey(kb('-'))).toBeUndefined();
    expect(pad.fromKey(kb('f'))).toEqual({ answer: 'pad:F' });
    letter('G').click();
    expect(onAnswer).toHaveBeenCalledWith('pad:G');
    pad.setAccidentals(true);
    expect(mod('sharp').closest<HTMLElement>('.apad__mods')!.hidden).toBe(false);
  });

  it('tapping a modifier never answers; the letter after it does', () => {
    const { pad, onAnswer } = mountPad();
    mod('sharp').click();
    expect(onAnswer).not.toHaveBeenCalled();
    expect(pad.armed()).toBe('sharp');
    letter('F').click();
    expect(onAnswer).toHaveBeenCalledOnce();
    expect(onAnswer).toHaveBeenCalledWith('pad:F#');
    expect(pad.armed()).toBeNull();
  });

  it('a bare letter is the natural, and a flat is B♭ not B', () => {
    const { onAnswer } = mountPad();
    letter('B').click();
    expect(onAnswer).toHaveBeenLastCalledWith('pad:B');
    mod('flat').click();
    letter('B').click();
    expect(onAnswer).toHaveBeenLastCalledWith('pad:Bb');
  });

  it('shows the pending modifier everywhere: pressed key, letters, words, and aria', () => {
    const { pad } = mountPad();
    mod('sharp').click();
    expect(mod('sharp').getAttribute('aria-pressed')).toBe('true');
    expect(mod('flat').getAttribute('aria-pressed')).toBe('false');
    expect(letter('F').textContent).toBe('F♯');
    expect(letter('F').getAttribute('aria-label')).toBe('F sharp');
    expect(q('.apad__status').textContent).toContain('♯');
    expect(q('.apad__status').getAttribute('role')).toBe('status');
    mod('sharp').click(); // tapping it again turns it off
    expect(pad.armed()).toBeNull();
    expect(letter('F').textContent).toBe('F');
    expect(q('.apad__status').textContent).toBe('');
  });

  it('typing: # or = then F is F♯ (and only on the second key); - is flat', () => {
    const { pad } = mountPad();
    expect(pad.fromKey(kb('#'))).toBe('handled'); // partial: nothing is submitted
    expect(pad.armed()).toBe('sharp');
    expect(pad.fromKey(kb('f'))).toEqual({ answer: 'pad:F#' });
    expect(pad.armed()).toBeNull();
    expect(pad.fromKey(kb('='))).toBe('handled'); // unshifted on most layouts
    expect(pad.armed()).toBe('sharp');
    expect(pad.fromKey(kb('g'))).toEqual({ answer: 'pad:G#' });
    expect(pad.fromKey(kb('-'))).toBe('handled');
    expect(pad.fromKey(kb('B'))).toEqual({ answer: 'pad:Bb' });
  });

  it('Escape, Backspace, "?" and a new question all clear a pending modifier; "?" is never a note', () => {
    const { pad, onAnswer } = mountPad();
    pad.fromKey(kb('#'));
    expect(pad.fromKey(kb('Escape'))).toBe('handled');
    expect(pad.armed()).toBeNull();
    expect(pad.fromKey(kb('Escape'))).toBeUndefined(); // nothing pending: Escape is not ours
    pad.fromKey(kb('#'));
    expect(pad.fromKey(kb('?'))).toEqual({ answer: null });
    expect(pad.armed()).toBeNull();
    mod('flat').click();
    q('.pad__idk').click();
    expect(onAnswer).toHaveBeenLastCalledWith(null);
    expect(pad.armed()).toBeNull();
    mod('flat').click();
    pad.setEnabled(false);
    pad.setEnabled(true);
    expect(pad.armed()).toBeNull();
    mod('sharp').click();
    pad.ask?.('F');
    expect(pad.armed()).toBeNull();
  });

  it('a disabled pad ignores modifiers', () => {
    const { pad } = mountPad();
    pad.setEnabled(false);
    expect(mod('sharp').disabled).toBe(true);
    expect(pad.fromKey(kb('#'))).toBe('handled'); // consumed, but nothing is armed
    expect(pad.armed()).toBeNull();
  });

  it('marks the right letter and modifier, and the wrong one, with the element to react on', () => {
    const { pad } = mountPad();
    expect(pad.markRight('F#')).toBe(letter('F'));
    expect(letter('F').classList.contains('pad__key--right')).toBe(true);
    expect(mod('sharp').classList.contains('pad__key--right')).toBe(true);
    // F♯ was written; the kid said F♭: right letter, wrong modifier
    expect(pad.markWrong('F#', 'pad:Fb')).toBe(mod('flat'));
    expect(mod('flat').classList.contains('pad__key--wrong')).toBe(true);
    expect(letter('F').classList.contains('pad__key--wrong')).toBe(false);
    pad.setEnabled(true);
    pad.markRight('F#');
    expect(pad.markWrong('F#', 'pad:G')).toBe(letter('G'));
    expect(letter('G').classList.contains('pad__key--wrong')).toBe(true);
  });

  it('a plain F for an F♯ target never marks the F key both right and wrong', () => {
    const { pad } = mountPad();
    pad.markRight('F#');
    const reacted = pad.markWrong('F#', 'pad:F');
    expect(letter('F').classList.contains('pad__key--right')).toBe(true);
    expect(letter('F').classList.contains('pad__key--wrong')).toBe(false);
    expect(document.querySelectorAll('.pad__key--wrong')).toHaveLength(0); // the missing ♯ is shown by the right ♯
    expect(reacted).toBe(mod('sharp'));
    // and the other way: F♯ typed for a natural F target marks the extra ♯ wrong, the letter stays right
    pad.setEnabled(true);
    pad.markRight('F');
    expect(pad.markWrong('F', 'pad:F#')).toBe(mod('sharp'));
    expect(mod('sharp').classList.contains('pad__key--wrong')).toBe(true);
    expect(letter('F').classList.contains('pad__key--wrong')).toBe(false);
  });
});

describe('answer tokens', () => {
  it('build and parse', () => {
    expect(answerToken('pad', 'Db')).toBe('pad:Db');
    expect(answerToken('keys', 'C#')).toBe('keys:C#');
    expect(parseAnswerToken('pad:Db')).toEqual({ style: 'pad', name: 'Db', letter: 'D', acc: -1 });
    expect(parseAnswerToken('keys:C#')).toMatchObject({ style: 'keys', name: 'C#', letter: 'C', acc: 1 });
    expect(parseAnswerToken('C#')).toBeNull();
    expect(parseAnswerToken('pad:H')).toBeNull();
    expect(parseAnswerToken('midi:C')).toBeNull();
  });

  it('grading is pure over the token: the pad needs the spelling, the keys need the pitch', () => {
    expect(gradeToken('pad:Db', 'Db')).toBe('correct');
    expect(gradeToken('pad:C#', 'Db')).toBe('enharmonic');
    expect(gradeToken('keys:C#', 'Db')).toBe('correct');
    expect(gradeToken('keys:D', 'Db')).toBe('wrong');
    expect(gradeToken('pad:D', 'Db')).toBe('wrong');
    expect(gradeToken('Db', 'Db')).toBe('wrong'); // a bare name has no style: fails closed
  });
});

describe('12-key keyboard', () => {
  function mount(labels?: 'all' | 'middleC' | 'unlabelled') {
    const onAnswer = vi.fn();
    const input = keyboardInput({ label: 'Keys', onAnswer, target, labels });
    document.body.append(input.el);
    return { input, onAnswer };
  }
  const key = (id: string) => q(`.piano__key[data-note="${id}"]`);

  it('has 7 white and 5 black keys; black keys answer with their sharp name', () => {
    const { onAnswer } = mount();
    expect(document.querySelectorAll('.piano__key--white')).toHaveLength(7);
    expect(document.querySelectorAll('.piano__key--black')).toHaveLength(5);
    key('C#4').click();
    expect(onAnswer).toHaveBeenLastCalledWith('keys:C#');
    key('E4').click();
    expect(onAnswer).toHaveBeenLastCalledWith('keys:E');
    q('.kpad [data-answer="?"]').click();
    expect(onAnswer).toHaveBeenLastCalledWith(null);
  });

  it('black keys show both names, stacked (A♯ over B♭), and are announced with both', () => {
    mount();
    expect(key('A#4').querySelector('.piano__label')!.textContent).toBe('A♯\nB♭');
    expect(key('A#4').getAttribute('aria-label')).toBe('A sharp or B flat');
    expect(key('C#4').querySelector('.piano__label')!.textContent).toBe('C♯\nD♭');
    expect(key('B4').querySelector('.piano__label')!.textContent).toBe('B');
  });

  it('shows the right key by pitch whichever way the note is spelled (B♭ lights the A♯ key)', () => {
    const { input } = mount();
    expect(input.markRight('Bb')).toBe(key('A#4'));
    expect(key('A#4').dataset.mark).toBe('right');
    expect(input.markWrong('Bb', 'keys:B')).toBe(key('B4'));
    expect(key('B4').dataset.mark).toBe('wrong');
    input.setEnabled(true);
    expect(document.querySelector('[data-mark]')).toBeNull();
  });

  it('typing a letter answers that natural; "?" is I do not know; other keys are not ours', () => {
    const { input } = mount();
    expect(input.fromKey(kb('d'))).toEqual({ answer: 'keys:D' });
    expect(input.fromKey(kb('?'))).toEqual({ answer: null });
    expect(input.fromKey(kb('x'))).toBeUndefined();
  });

  it('the unlabelled variant shows no names and announces keys by position until the answer', () => {
    const { input } = mount('unlabelled');
    expect(document.querySelectorAll('.piano__label')).toHaveLength(0);
    const labels = [...document.querySelectorAll('.piano__key')].map((b) => b.getAttribute('aria-label')!);
    expect(labels.join('|')).not.toMatch(/sharp|flat|\b[A-G]\b/); // no note names (middle C is the one anchor)
    expect(key('F#4').getAttribute('aria-label')).toBe('Black key after white key 4');
    expect(key('D4').getAttribute('aria-label')).toBe('Piano key 2 of 7');
    input.setEnabled(false); // the answer: names come back
    expect(key('F#4').getAttribute('aria-label')).toBe('F sharp or G flat');
    expect(key('D4').getAttribute('aria-label')).toBe('D4');
    input.setEnabled(true); // the next question: neutral again, marks cleared
    expect(key('F#4').getAttribute('aria-label')).toBe('Black key after white key 4');
  });
});

describe('switchable input', () => {
  function mount(opts: { styleFor?: (id: string) => InputStyle | undefined; kidChoice?: boolean } = {}) {
    const onAnswer = vi.fn();
    const onStyleChange = vi.fn();
    const input = switchableInput({ label: 'Answer', onAnswer, target, onStyleChange, ...opts });
    document.body.append(input.el);
    return { input, onAnswer, onStyleChange };
  }
  const tab = (s: string) => q(`[data-style="${s}"]`);

  it('by default the mode decides: no switch, the item gets its style, undecided items use the initial style', () => {
    const { input } = mount({ styleFor: (id) => (id === 'F#' ? 'keys' : undefined) });
    input.ask?.('F#');
    expect(input.style()).toBe('keys');
    expect(q('.kpad').hidden).toBe(false);
    expect(q('.apad').hidden).toBe(true);
    expect(q('.ainput__switch').hidden).toBe(true);
    input.ask?.('C');
    expect(input.style()).toBe('pad');
    expect(q('.ainput__switch').hidden).toBe(true); // still no kid switch: it is opt-in
    tab('keys').click(); // even a stray click is ignored
    expect(input.style()).toBe('pad');
  });

  it('opt-in kid choice: switch between the pad and the keys; the mode hears about it', () => {
    const { input, onStyleChange } = mount({ kidChoice: true });
    input.ask?.('F#');
    expect(input.style()).toBe('pad');
    expect(q('.ainput__switch').hidden).toBe(false);
    tab('keys').click();
    expect(input.style()).toBe('keys');
    expect(q('.apad').hidden).toBe(true);
    expect(q('.kpad').hidden).toBe(false);
    expect(tab('keys').getAttribute('aria-pressed')).toBe('true');
    expect(onStyleChange).toHaveBeenLastCalledWith('keys');
    tab('pad').click();
    expect(onStyleChange).toHaveBeenCalledTimes(2);
  });

  it('a forced style does not leak into the next free question', () => {
    const { input, onStyleChange } = mount({ kidChoice: true, styleFor: (id) => (id === 'forced' ? 'keys' : undefined) });
    input.ask?.('free1');
    expect(input.style()).toBe('pad');
    input.ask?.('forced');
    expect(input.style()).toBe('keys');
    expect(q('.ainput__switch').hidden).toBe(true);
    input.ask?.('free2');
    expect(input.style()).toBe('pad'); // the kid's own preference is back
    expect(q('.ainput__switch').hidden).toBe(false);
    expect(onStyleChange).not.toHaveBeenCalled();
    // and a kid who prefers the keys still gets them after a forced pad item
    tab('keys').click();
    input.ask?.('forced');
    input.ask?.('free3');
    expect(input.style()).toBe('keys');
  });

  it('switching clears a pending modifier, and cannot happen mid-feedback', () => {
    const { input } = mount({ kidChoice: true });
    input.ask?.('F#');
    mod('sharp').click();
    tab('keys').click();
    tab('pad').click();
    expect(letter('F').textContent).toBe('F');
    input.setEnabled(false);
    tab('keys').click(); // disabled: ignored
    expect(input.style()).toBe('pad');
  });

  it('marks and typing go to the style in use', () => {
    const { input } = mount({ styleFor: (id) => (id === 'F#' ? 'keys' : 'pad') });
    input.ask?.('F#');
    expect(input.markRight('F#')).toBe(q('.piano__key[data-note="F#4"]'));
    input.setEnabled(true);
    expect(input.fromKey(kb('#'))).toBeUndefined(); // the keyboard has no modifiers
    input.ask?.('Bb');
    expect(input.fromKey(kb('#'))).toBe('handled');
  });
});

describe('grading', () => {
  it('pad: the spelling must match; the same key under another name is enharmonic (counts wrong)', () => {
    expect(gradeAccidental('pad', 'F#', 'F#')).toBe('correct');
    expect(gradeAccidental('pad', 'Gb', 'F#')).toBe('enharmonic');
    expect(gradeAccidental('pad', 'F', 'F#')).toBe('wrong');
    expect(gradeAccidental('pad', 'E#', 'F')).toBe('enharmonic');
    expect(gradeAccidental('pad', '?', 'F')).toBe('wrong');
  });

  it('keys: the pitch must match', () => {
    expect(gradeAccidental('keys', 'A#', 'Bb')).toBe('correct');
    expect(gradeAccidental('keys', 'B', 'Bb')).toBe('wrong');
  });

  it('the enharmonic feedback is gentle and uses the real symbols (from a token or a bare name)', () => {
    const text = 'G♭ and F♯ are the same key with different names. This note is written as F♯.';
    expect(enharmonicFeedback('pad:Gb', 'F#')).toBe(text);
    expect(enharmonicFeedback('Gb', 'F#')).toBe(text);
  });
});
