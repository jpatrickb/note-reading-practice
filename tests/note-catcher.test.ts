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
  CANONICAL_ORDER,
  CATCHER_RANGE,
  MIN_WHITE_KEYS,
  NOTE_CATCHER,
  NOTE_CATCHER_MODE,
  catchItem,
  catcherEngine,
  classifyMiss,
  diagnoseCatcher,
  keyWindow,
  missText,
  whereIs,
} from '../src/core/noteCatcher';
import { startSession } from '../src/core/session';
import { h } from '../src/ui/dom';
import { neutralKeyLabels, noteCatcherMode, noteCatcherPlay, renderCatcherMap, whiteKeysThatFit } from '../src/ui/noteCatcher';
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
  it('has the same notes as Name It, in the same teaching order, with its own ids', () => {
    expect(NOTE_CATCHER.items.map((i) => i.id)).toEqual(GOLDEN);
    expect(CANONICAL_ORDER).toEqual(GOLDEN);
    for (const clef of ['treble', 'bass'] as const) {
      expect(NOTE_CATCHER.groups[clef]!.map((i) => noteId(i.note))).toEqual(NAME_IT.groups[clef]!.map((i) => noteId(i.note)));
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

  it('every item of a lane is within the range the piano shows for that clef', () => {
    for (const clef of ['treble', 'bass'] as const) {
      const keys = pianoKeys(CATCHER_RANGE[clef].low, CATCHER_RANGE[clef].high).map((k) => k.id);
      for (const item of NOTE_CATCHER.groups[clef]!) expect(keys, item.id).toContain(noteId(item.note));
    }
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
    expect(LESSONS.octave.body.join(' ')).toMatch(/middle C/);
    expect(NOTE_CATCHER_MODE.diagnose).toBe(diagnoseCatcher);
    const s = state();
    miss(s, 'catch:treble:G4', 'G5', T0);
    expect(diagnoseCatcher(s, T0)).toBeNull();
    expect(typeof diagnose).toBe('function');
  });
});

describe('a smaller key range for narrow screens', () => {
  it('fits 44px keys: a phone gets 7 white keys, a portrait iPad about 17, landscape the app column', () => {
    expect(whiteKeysThatFit(375)).toBe(7);
    expect(whiteKeysThatFit(390)).toBe(8);
    expect(whiteKeysThatFit(820)).toBe(17);
    expect(whiteKeysThatFit(1366)).toBe(21);
  });

  it('shows the whole range when it fits, otherwise a window that always holds the note', () => {
    expect(keyWindow(CATCHER_RANGE.treble, parseNote('G4'), 21, 0.5)).toEqual(CATCHER_RANGE.treble);
    for (const clef of ['treble', 'bass'] as const) {
      for (const size of [4, 7, 8, 12]) {
        for (const item of NOTE_CATCHER.groups[clef]!) {
          for (const rand of [0, 0.37, 0.999]) {
            const w = keyWindow(CATCHER_RANGE[clef], item.note, size, rand);
            const keys = pianoKeys(w.low, w.high);
            const whites = keys.filter((k) => !k.black);
            expect(whites.length, `${item.id} ${size}`).toBe(Math.max(MIN_WHITE_KEYS, Math.min(size, 99)));
            expect(keys.map((k) => k.id), `${item.id} ${size} ${rand}`).toContain(noteId(item.note));
            const all = pianoKeys(CATCHER_RANGE[clef].low, CATCHER_RANGE[clef].high).map((k) => k.id);
            expect(all).toContain(w.low);
            expect(all).toContain(w.high);
          }
        }
      }
    }
  });

  it('puts the note in varied places in the window, so position alone says little', () => {
    const spots = new Set([0, 0.2, 0.4, 0.6, 0.8, 0.99].map((r) => keyWindow(CATCHER_RANGE.treble, parseNote('G4'), 7, r).low));
    expect(spots.size).toBeGreaterThan(2);
  });

  it('only names keys by place while a question is open', () => {
    const labels = [...neutralKeyLabels(pianoKeys('C4', 'B4')).values()];
    expect(labels).toContain('Piano key 1 of 7');
    expect(labels).toContain('Black key after white key 1');
    expect(labels.join(' ')).not.toMatch(/\b[A-G][0-9#]?\b/);
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
      expect(b.getAttribute('aria-label'), b.outerHTML).toMatch(/^(Piano key \d+ of \d+|Black key after white key \d+)$/);
      expect(b.textContent).toBe('');
    }
    expect(document.querySelector('.staff')!.getAttribute('aria-label')).not.toMatch(/the note/);
    expect(document.querySelector('.staff__label')).toBeNull();
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
    const up = `${letter}${Number(want.slice(1)) + 1}`;
    press(up);
    expect(s.session.results[0]!.outcome).toBe('wrong');
    expect(document.querySelector('.hint__lead')!.textContent).toContain("That's the right letter, but one octave too high.");
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

  it('on a phone the piano is a window of the range, and the note is on it', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
    const s = setup();
    await tick();
    expect(document.querySelectorAll('.piano__key--white')).toHaveLength(7);
    expect(keyEl(answerOf(s))).not.toBeNull();
  });

  it('is registered as a Find keys mode with its own map', () => {
    expect(noteCatcherMode.group).toBe('keys');
    expect(noteCatcherMode.core.tag).toBe(4);
    const map = renderCatcherMap(catcherEngine.newStudent(), T0);
    expect(map.querySelectorAll('[data-item]')).toHaveLength(NOTE_CATCHER.items.length);
    expect(noteCatcherMode.itemLabel('catch:treble:G4')).toBe('G4 key (treble clef)');
  });
});
