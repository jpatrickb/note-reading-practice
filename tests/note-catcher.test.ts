// @vitest-environment jsdom
// Note Catcher: the item set, why a key was wrong (octave handling), the diagnose lesson, the key
// window for narrow screens, and the play screen (no answers leaked to sight or to screen readers).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Synth } from '../src/audio/synth';
import { LESSONS, diagnose } from '../src/core/diagnose';
import { PARAMS } from '../src/core/engine';
import { NAME_IT } from '../src/core/items';
import { noteId, parseNote } from '../src/core/music';
import {
  BLACK_KEY_TIP,
  CANONICAL_ORDER,
  CATCHER_LESSONS,
  CATCHER_RANGE,
  MIDDLE_C,
  NOTE_CATCHER,
  NOTE_CATCHER_MODE,
  catchItem,
  catcherEngine,
  classifyMiss,
  diagnoseCatcher,
  missText,
  whereIs,
} from '../src/core/noteCatcher';
import { startSession } from '../src/core/session';
import { h } from '../src/ui/dom';
import { neutralKeyLabels, noteCatcherMode, noteCatcherPlay, renderCatcherMap } from '../src/ui/noteCatcher';
import { pianoKeys } from '../src/ui/piano';
import { DAY, T0 } from './helpers';

/** FROZEN copy of the canonical order (progress codes index by it): only ever append. */
const GOLDEN = [
  'catch:treble:G4', 'catch:treble:C4', 'catch:treble:A4', 'catch:treble:F4', 'catch:treble:E4',
  'catch:treble:B4', 'catch:treble:D4', 'catch:treble:C5', 'catch:treble:D5', 'catch:treble:E5',
  'catch:treble:F5', 'catch:treble:G5', 'catch:treble:A5', 'catch:treble:C6', 'catch:treble:B5',
  'catch:treble:A3', 'catch:treble:B3', 'catch:bass:F3', 'catch:bass:G3', 'catch:bass:E3',
  'catch:bass:A3', 'catch:bass:D3', 'catch:bass:C3', 'catch:bass:B2', 'catch:bass:G2',
  'catch:bass:A2', 'catch:bass:C4', 'catch:bass:B3', 'catch:bass:F2', 'catch:bass:E2',
  'catch:bass:D4', 'catch:bass:E4', 'catch:bass:C2', 'catch:bass:D2',
];

describe('the Note Catcher item set', () => {
  it('has the same notes as Name It, in the same teaching order, with its own ids, except middle C', () => {
    expect(NOTE_CATCHER.items.map((i) => i.id)).toEqual(GOLDEN);
    expect(CANONICAL_ORDER).toEqual(GOLDEN);
    for (const clef of ['treble', 'bass'] as const) {
      expect(NOTE_CATCHER.groups[clef]!.map((i) => noteId(i.note))).toEqual(
        NAME_IT.groups[clef]!.map((i) => noteId(i.note)).filter((n) => n !== MIDDLE_C),
      );
    }
  });

  it('retires the C4 items: they keep their index but are never asked, even from an old save that had them open', () => {
    expect(NOTE_CATCHER.retired.map((i) => i.id)).toEqual(['catch:treble:C4', 'catch:bass:C4']);
    for (const id of NOTE_CATCHER.retired.map((i) => i.id)) {
      expect(GOLDEN).toContain(id);
      expect(Object.values(NOTE_CATCHER.groups).flat().map((i) => i.id)).not.toContain(id);
    }
    const state = catcherEngine.newStudent();
    for (const id of ['catch:treble:C4', 'catch:bass:C4']) state.items[id]!.unlocked = true;
    let n = 0;
    const rng = () => (n++ % 97) / 97;
    for (let i = 0; i < 200; i++) {
      const id = catcherEngine.selectItem(state, ['treble', 'bass'], T0, rng);
      expect(noteId(catchItem(id).note)).not.toBe('C4');
    }
  });

  it('answers with the exact key: the right letter in another octave is wrong', () => {
    const g4 = 'catch:treble:G4';
    expect(catcherEngine.grade(g4, 'G4')).toBe('correct');
    expect(catcherEngine.grade(g4, 'G5')).toBe('wrong');
    expect(catcherEngine.grade(g4, 'G3')).toBe('wrong');
    expect(catcherEngine.grade(g4, 'F#4')).toBe('wrong');
    expect(catcherEngine.grade(g4, null)).toBe('idk');
  });

  it('every item of both clefs is on the one keyboard, which runs from the lowest bass to the highest treble note', () => {
    const keys = pianoKeys(CATCHER_RANGE.low, CATCHER_RANGE.high).map((k) => k.id);
    expect(keys[0]).toBe('C2');
    expect(keys.at(-1)).toBe('C6');
    for (const item of NOTE_CATCHER.items) expect(keys, item.id).toContain(noteId(item.note));
  });

  it('opens different answers first, so one key cannot carry early play (D33)', () => {
    for (const lane of Object.values(NOTE_CATCHER.groups)) {
      const first = lane.slice(0, PARAMS.initialUnlock).map((i) => noteId(i.note));
      expect(new Set(first).size).toBe(first.length);
      expect(new Set(first.map((n) => parseNote(n).letter)).size).toBe(first.length);
    }
  });
});

describe('why a key was wrong', () => {
  const g4 = catchItem('catch:treble:G4');
  it('classifies an octave slip, a black key and another letter', () => {
    expect(classifyMiss(g4, 'G5')).toEqual({ kind: 'octave', octaves: 1 });
    expect(classifyMiss(g4, 'G3')).toEqual({ kind: 'octave', octaves: -1 });
    expect(classifyMiss(g4, 'G2')).toEqual({ kind: 'octave', octaves: -2 });
    expect(classifyMiss(g4, 'F#4')).toEqual({ kind: 'black' });
    expect(classifyMiss(g4, 'G#4')).toEqual({ kind: 'black' });
    expect(classifyMiss(g4, 'E4')).toMatchObject({ kind: 'other' });
  });

  it('says it kindly, and says where the right key is', () => {
    expect(missText(g4, 'G5')).toBe("That's the right letter, but one octave too high. This G is 4 white keys above middle C.");
    expect(missText(g4, 'G3')).toBe("That's the right letter, but one octave too low. This G is 4 white keys above middle C.");
    expect(missText(catchItem('catch:bass:G2'), 'G4')).toContain('two octaves too high');
    expect(missText(g4, 'E4')).toBe("That's E. This note is G. This G is 4 white keys above middle C.");
    expect(missText(g4, 'F#4')).toContain("That's a black key. This note is a white key: G.");
    expect(whereIs(parseNote('C4'))).toBe('middle C');
    expect(whereIs(parseNote('D4'))).toBe('1 white key above middle C');
  });
});

describe('the octave lesson', () => {
  const state = () => catcherEngine.newStudent();
  const miss = (s: ReturnType<typeof state>, id: string, answer: string, at: number) => s.recentErrors.push({ itemId: id, answer, at });

  it('triggers on 3 right-letter-wrong-octave errors in the last 8, then waits out a 30-minute cooldown', () => {
    const s = state();
    miss(s, 'catch:treble:G4', 'G5', T0);
    miss(s, 'catch:treble:C4', 'C5', T0);
    miss(s, 'catch:treble:A4', 'E4', T0);
    expect(diagnoseCatcher(s, T0)).toBeNull();
    miss(s, 'catch:treble:F4', 'F3', T0);
    expect(diagnoseCatcher(s, T0)).toBe('octave');
    expect(diagnoseCatcher(s, T0 + 10 * 60_000)).toBeNull();
    expect(diagnoseCatcher(s, T0 + 31 * 60_000)).toBe('octave');
  });

  it('ignores other kinds of miss and old errors', () => {
    const s = state();
    for (let i = 0; i < 4; i++) miss(s, 'catch:treble:G4', 'A4', T0);
    expect(diagnoseCatcher(s, T0)).toBeNull();
    miss(s, 'catch:treble:G4', 'G5', T0);
    miss(s, 'catch:treble:C4', 'C5', T0);
    for (let i = 0; i < 6; i++) miss(s, 'catch:treble:G4', 'A4', T0); // pushes the 2 slips toward the edge
    miss(s, 'catch:treble:A4', 'A5', T0);
    expect(diagnoseCatcher(s, T0 + DAY)).toBeNull();
  });

  it('has a lesson text that points to middle C, and is the mode\'s detector (Name It\'s is not affected)', () => {
    expect(CATCHER_LESSONS.octave.body.join(' ')).toMatch(/middle C/);
    expect(NOTE_CATCHER_MODE.diagnose).toBe(diagnoseCatcher);
    const s = state();
    miss(s, 'catch:treble:G4', 'G5', T0);
    expect(diagnoseCatcher(s, T0)).toBeNull();
    expect(typeof diagnose).toBe('function');
  });
});

describe('the one keyboard', () => {
  it('only names keys by place while a question is open', () => {
    const labels = [...neutralKeyLabels(pianoKeys('C2', 'C6')).values()];
    expect(labels).toContain('Piano key 1 of 29');
    expect(labels).toContain('Black key after white key 1');
    // Only middle C, the marked anchor, is named.
    expect(labels.filter((l) => /middle C/.test(l))).toEqual(['Piano key 15 of 29, middle C']);
    expect(labels.join(' ').replace('middle C', '')).not.toMatch(/\b[A-G][0-9#]?\b/);
  });
});

// ───────────────────────── the play screen ─────────────────────────

const synth = { note: vi.fn() } as unknown as Synth;

function setup() {
  const session = startSession(['treble'], 3, NOTE_CATCHER_MODE);
  const host = {
    session,
    state: catcherEngine.newStudent(),
    now: () => T0,
    save: vi.fn(),
    announce: vi.fn(),
    muteButton: () => h('button', {}, 'mute'),
    quit: vi.fn(),
    finish: vi.fn(),
    stopSound: vi.fn(),
  };
  const shell = noteCatcherPlay(host, synth);
  document.body.append(shell.render());
  return { shell, host, session };
}
const tick = () => Promise.resolve();
const answerOf = (s: ReturnType<typeof setup>) => catcherEngine.answerOf(s.session.current!.itemId);
const keyEl = (note: string) => document.querySelector<HTMLButtonElement>(`.piano [data-note="${note}"]`)!;
const press = (note: string) => keyEl(note).dispatchEvent(new MouseEvent('click', { bubbles: true }));
const cont = () => document.querySelector<HTMLButtonElement>('[data-testid=continue]');

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  (synth.note as ReturnType<typeof vi.fn>).mockClear();
  Object.defineProperty(window, 'innerWidth', { value: 1180, configurable: true });
});
afterEach(() => vi.useRealTimers());

describe('the Note Catcher play screen', () => {
  it('gives nothing away while a question is open: no letters on keys, no key names for screen readers, no sound', async () => {
    const s = setup();
    await tick();
    const piano = document.querySelector('.piano')!;
    expect(piano.querySelectorAll('.piano__label')).toHaveLength(0);
    expect(piano.querySelectorAll('[data-mark]')).toHaveLength(0);
    for (const b of piano.querySelectorAll('.piano__key')) {
      expect(b.getAttribute('aria-label'), b.outerHTML).toMatch(/^(Piano key \d+ of \d+(, middle C)?|Black key after white key \d+)$/);
    }
    expect(document.querySelector('.staff')!.getAttribute('aria-label')).not.toMatch(/the note/);
    expect(document.querySelector('.staff__label')).toBeNull();
    // The only thing on any key is the middle-C anchor.
    expect(piano.querySelectorAll('.piano__dot')).toHaveLength(1);
    expect(keyEl('C4').querySelector('.piano__dot')).not.toBeNull();
    expect([...piano.querySelectorAll('.piano__key')].filter((b) => b.textContent !== '').map((b) => (b as HTMLElement).dataset.note)).toEqual(['C4']);
    expect(keyEl('C4').textContent).toBe('Middle C');
    expect(synth.note).not.toHaveBeenCalled();
    expect(s.session.current).not.toBeNull();
  });

  it('a right key turns right, plays, and auto-advances', async () => {
    const s = setup();
    await tick();
    const want = answerOf(s);
    press(want);
    expect(keyEl(want).dataset.mark).toBe('right');
    expect(synth.note).toHaveBeenCalledTimes(1);
    expect(cont()).toBeNull();
    vi.advanceTimersByTime(700);
    expect(s.session.results).toHaveLength(1);
  });

  it('the right letter in the wrong octave is wrong: kind words, the right key shown, waits for Got it', async () => {
    const s = setup();
    await tick();
    const want = answerOf(s);
    const letter = want[0]!;
    const climb = keyEl(`${letter}${Number(want.slice(1)) + 1}`) ? 1 : -1;
    const up = `${letter}${Number(want.slice(1)) + climb}`;
    press(up);
    expect(s.session.results[0]!.outcome).toBe('wrong');
    expect(document.querySelector('.hint__lead')!.textContent).toContain(`That's the right letter, but one octave too ${climb > 0 ? 'high' : 'low'}.`);
    expect(keyEl(want).dataset.mark).toBe('target');
    expect(keyEl(up).dataset.mark).toBe('wrong');
    expect(synth.note).toHaveBeenCalledTimes(2); // the pressed key, then the right one 0.45 s later
    expect((synth.note as ReturnType<typeof vi.fn>).mock.calls[1]![1]).toBe(0.45);
    vi.advanceTimersByTime(10_000);
    expect(cont()).not.toBeNull();
    // Key names come back once the answer is in.
    expect(keyEl(want).getAttribute('aria-label')).toMatch(new RegExp(`^${want}`));
  });

  it('"?" shows the key as the target and teaches, with no penalty beyond the engine', async () => {
    const s = setup();
    await tick();
    const want = answerOf(s);
    document.querySelector<HTMLButtonElement>('[data-answer="?"]')!.click();
    expect(s.session.results[0]!.outcome).toBe('idk');
    expect(keyEl(want).dataset.mark).toBe('target');
    expect(document.querySelector('.hint__lead')!.textContent).toContain('This note is');
    expect(cont()).not.toBeNull();
  });

  it('treble and bass questions share one keyboard: same keys, same range, never changed by the clef', async () => {
    const seen = new Set<string>();
    for (const clef of ['treble', 'bass'] as const) {
      document.body.innerHTML = '';
      const session = startSession([clef], 3, NOTE_CATCHER_MODE);
      const host = { session, state: catcherEngine.newStudent(), now: () => T0, save: vi.fn(), announce: vi.fn(), muteButton: () => h('button', {}, 'm'), quit: vi.fn(), finish: vi.fn(), stopSound: vi.fn() };
      document.body.append(noteCatcherPlay(host, synth).render());
      await tick();
      expect(document.querySelectorAll('.piano__key--white')).toHaveLength(29);
      seen.add([...document.querySelectorAll('.piano__key')].map((b) => (b as HTMLElement).dataset.note).join());
    }
    expect(seen.size).toBe(1);
  });

  it('C4 is never asked, so the marked middle C is no clue', async () => {
    for (let i = 0; i < 30; i++) {
      document.body.innerHTML = '';
      const s = setup();
      await tick();
      expect(answerOf(s)).not.toBe('C4');
    }
  });

  it('a swipe across the keys scrolls and does not answer; a still tap does', async () => {
    const s = setup();
    await tick();
    const k = keyEl('E4');
    const fire = (type: string, x: number, id: number) => {
      const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 10 });
      Object.assign(e, { pointerId: id, pointerType: 'touch' });
      (type === 'pointerup' || type === 'pointercancel' ? document : k).dispatchEvent(e);
    };
    fire('pointerdown', 100, 7);
    fire('pointermove', 160, 7);
    fire('pointerup', 160, 7);
    expect(s.session.results).toHaveLength(0);
    fire('pointerdown', 100, 8);
    fire('pointercancel', 100, 8); // the browser took it for a scroll
    expect(s.session.results).toHaveLength(0);
    expect(synth.note).not.toHaveBeenCalled();
    fire('pointerdown', 100, 9);
    expect(s.session.results).toHaveLength(0); // not yet: it waits for the release
    fire('pointerup', 101, 9);
    expect(s.session.results).toHaveLength(1);
  });

  it('a black key is not an answer: it says so, scores nothing and lets the kid tap again', async () => {
    const s = setup();
    await tick();
    const black = document.querySelector<HTMLButtonElement>('.piano__key--black')!;
    black.click();
    expect(document.querySelector('[data-testid=catcher-tip]')!.textContent).toBe(BLACK_KEY_TIP);
    expect(s.session.results).toHaveLength(0);
    expect(s.session.current).not.toBeNull();
    expect(cont()).toBeNull();
    expect(black.dataset.mark).toBeUndefined();
    press(answerOf(s)); // the next tap is the answer, and clears the tip
    expect(s.session.results[0]!.outcome).toBe('correct');
    expect(document.querySelector('[data-testid=catcher-tip]')!.textContent).toBe('');
  });

  it('middle C is marked during every question and after it, and nothing else is', async () => {
    const s = setup();
    for (let i = 0; i < 3; i++) {
      await tick();
      expect(document.querySelectorAll('.piano__dot'), `question ${i}`).toHaveLength(1);
      expect(keyEl('C4').querySelector('.piano__dot'), `question ${i}`).not.toBeNull();
      press(answerOf(s));
      expect(document.querySelectorAll('.piano__dot'), `after answer ${i}`).toHaveLength(1);
      vi.advanceTimersByTime(1700);
    }
  });

  it('each question starts centered on middle C (a jump), and a miss scrolls smoothly to the tapped and right keys', async () => {
    const calls: ScrollToOptions[] = [];
    (HTMLElement.prototype as unknown as { scrollTo: unknown }).scrollTo = (o: ScrollToOptions) => calls.push(o);
    const s = setup();
    await tick();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.behavior).toBe('instant'); // never an animation that shows where it came from
    const want = answerOf(s);
    press(want === 'D3' ? 'E3' : 'D3');
    expect(calls).toHaveLength(2);
    expect(calls[1]!.behavior).toBe('smooth');
    delete (HTMLElement.prototype as unknown as { scrollTo?: unknown }).scrollTo;
  });

  it('has the octave lesson for itself, and Name It keeps its own lessons', () => {
    expect(NOTE_CATCHER_MODE.lessons!.octave!.body.join(' ')).toMatch(/middle C/);
    expect(Object.keys(LESSONS).sort()).toEqual(['clefSwap:bass', 'clefSwap:treble', 'neighbor']);
  });

  it('shows its own octave lesson through the shell after three octave slips, then Name It lessons stay separate', async () => {
    const s = setup();
    s.session.length = 8;
    await tick();
    for (let i = 0; i < 3; i++) {
      const want = answerOf(s);
      const up = `${want[0]}${Number(want.slice(1)) + 1}`;
      press(up);
      cont()!.click();
      if (i < 2) await tick();
    }
    const dialog = document.querySelector('[data-testid=lesson]');
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain('Right letter, different key!');
  });

  it('is registered as a Find keys mode with its own map', () => {
    expect(noteCatcherMode.group).toBe('keys');
    expect(noteCatcherMode.core.tag).toBe(4);
    const map = renderCatcherMap(catcherEngine.newStudent(), T0);
    expect(map.querySelectorAll('[data-item]')).toHaveLength(NOTE_CATCHER.items.length - NOTE_CATCHER.retired.length);
    expect(noteCatcherMode.itemLabel('catch:treble:G4')).toBe('G4 key (treble clef)');
  });
});
