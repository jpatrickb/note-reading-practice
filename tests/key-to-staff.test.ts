// @vitest-environment jsdom
// Key to Staff: the item set, judging, the octave rule shared with Note Catcher, and the play screen.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Synth } from '../src/audio/synth';
import { TEACHING_ORDER as NAME_IT_ORDER } from '../src/core/items';
import {
  KEY_TO_STAFF,
  KEY_TO_STAFF_MODE,
  answerAt,
  keyAnswerSpace,
  keyItem,
  keyLabel,
  keyToStaffEngine,
  wrongKeyPlacement,
} from '../src/core/keyToStaff';
import { noteId, staffPosition } from '../src/core/music';
import { classifyMiss, missText } from '../src/core/noteCatcher';
import { startSession } from '../src/core/session';
import { h } from '../src/ui/dom';
import { keyToStaffMode, keyToStaffPlay, renderKeyToStaffMap } from '../src/ui/keyToStaff';
import type { PlayShell } from '../src/ui/playShell';
import { T0 } from './helpers';

const synth = { note: vi.fn() } as unknown as Synth;
const tick = () => Promise.resolve();

describe('Key to Staff items and judging', () => {
  it("has Name It's first 12 notes per clef, in its teaching order", () => {
    for (const clef of ['treble', 'bass'] as const) {
      expect(KEY_TO_STAFF.groups[clef]!.map((i) => noteId(i.note))).toEqual(NAME_IT_ORDER[clef].slice(0, 12));
    }
  });

  it('the clef is the lane: middle C is a question in both lanes, each on its own staff', () => {
    expect(keyItem('k2s:treble:C4').clef).toBe('treble');
    expect(keyItem('k2s:bass:C4').clef).toBe('bass');
    expect(staffPosition(keyItem('k2s:treble:C4').note, 'treble')).toBe(-2);
    expect(staffPosition(keyItem('k2s:bass:C4').note, 'bass')).toBe(10);
  });

  it('the answer is the exact note, so the right letter in the wrong octave is wrong', () => {
    const g4 = keyItem('k2s:treble:G4');
    expect(keyToStaffEngine.grade(g4.id, 'G4')).toBe('correct');
    expect(keyToStaffEngine.grade(g4.id, 'G5')).toBe('wrong');
    expect(keyToStaffEngine.grade(g4.id, 'G3')).toBe('wrong');
    expect(answerAt(staffPosition(g4.note, 'treble'), 'treble')).toBe('G4');
    expect(KEY_TO_STAFF_MODE.engine).toBe(keyToStaffEngine);
  });

  it('shares ONE octave classifier with Note Catcher', () => {
    const g4 = keyItem('k2s:treble:G4');
    expect(classifyMiss(g4, 'G5')).toEqual({ kind: 'octave', octaves: 1 });
    expect(classifyMiss(g4, 'G3')).toEqual({ kind: 'octave', octaves: -1 });
    expect(classifyMiss(g4, 'A4')).toMatchObject({ kind: 'other' });
    expect(missText(g4, 'G5')).toContain('one octave too high');
  });

  it('wrong placements get kind words naming the lit key', () => {
    const g4 = keyItem('k2s:treble:G4');
    expect(wrongKeyPlacement(g4, 'G5')).toBe("That's the right letter, but one octave too high. The lit key is a G, 4 white keys above middle C.");
    expect(wrongKeyPlacement(g4, 'G3')).toContain('one octave too low');
    expect(wrongKeyPlacement(g4, 'A4')).toMatch(/^That spot is an A\. The lit key is a G/);
    expect(wrongKeyPlacement(keyItem('k2s:treble:C5'), 'C4')).toContain('one octave too low');
    expect(wrongKeyPlacement(keyItem('k2s:treble:C4'), 'D4')).toContain('middle C');
    expect(wrongKeyPlacement(g4, 'G7')).toContain('three octaves too high');
  });

  it('offers 12 answers per clef and labels items by their key', () => {
    expect(keyAnswerSpace('treble')).toHaveLength(12);
    expect(keyAnswerSpace('bass')).toHaveLength(12);
    expect(keyLabel('k2s:bass:F3')).toBe('F3 key (bass clef)');
  });
});

function setup(clefs: ('treble' | 'bass')[] = ['treble', 'bass']) {
  const session = startSession(clefs, 5, KEY_TO_STAFF_MODE);
  const host = {
    session,
    state: keyToStaffEngine.newStudent(),
    now: () => T0,
    save: vi.fn(),
    announce: vi.fn(),
    muteButton: () => h('button', {}, 'mute'),
    quit: vi.fn(),
    finish: vi.fn(),
    stopSound: vi.fn(),
  };
  const shell: PlayShell<string> = keyToStaffPlay(host, synth);
  document.body.append(shell.render());
  return { shell, host, session };
}

function placeAt(pos: number) {
  const slider = document.querySelector<HTMLElement>('.staff-input:not([hidden]) .staff-input__slider')!;
  const press = (k: string) => slider.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  press('ArrowUp'); // the first press shows the ghost on the middle line (4)
  let cur = 4;
  while (cur < pos) {
    press('ArrowUp');
    cur++;
  }
  while (cur > pos) {
    press('ArrowDown');
    cur--;
  }
  press('Enter');
}
const item = (s: ReturnType<typeof setup>) => keyItem(s.session.current!.itemId);
const cont = () => document.querySelector<HTMLButtonElement>('[data-testid=continue]');

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  vi.mocked(synth.note).mockClear();
});
afterEach(() => vi.useRealTimers());

describe('Key to Staff play screen', () => {
  it("lights the key, plays it, and shows only that clef's staff; key names stay hidden from screen readers", async () => {
    const s = setup();
    await tick();
    const it = item(s);
    expect(document.querySelector('.k2s-prompt')!.textContent).toBe('Where does this key go on the staff?');
    expect(document.querySelectorAll('.piano__key--glow')).toHaveLength(1);
    expect(synth.note).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.staff-input:not([hidden])')!.getAttribute('data-clef')).toBe(it.clef);
    const lit = document.querySelector('.piano__key--glow')!;
    expect(lit.getAttribute('data-note')).toBe(noteId(it.note));
    const label = lit.getAttribute('aria-label')!;
    expect(label).toContain('lit up');
    if (noteId(it.note) !== 'C4') expect(label).not.toContain(noteId(it.note));
    // Middle C keeps its quiet anchor.
    expect(document.querySelector('.piano__dot')).not.toBeNull();
  });

  it('pressing a piano key only plays it: it is never an answer', async () => {
    const s = setup();
    await tick();
    document.querySelector<HTMLButtonElement>('.piano__key')!.click();
    expect(s.session.results).toHaveLength(0);
  });

  it('a right placement auto-advances to a clean staff', async () => {
    const s = setup();
    await tick();
    placeAt(staffPosition(item(s).note, item(s).clef));
    expect(s.session.results[0]!.outcome).toBe('correct');
    expect(cont()).toBeNull();
    vi.advanceTimersByTime(2000);
    expect(s.session.current).not.toBeNull();
    expect(document.querySelector('.staff-input__placed')).toBeNull();
  });

  it('a right letter in the wrong octave is wrong, with kind words, and waits for Got it', async () => {
    const s = setup(['treble']);
    await tick();
    const it = item(s);
    const pos = staffPosition(it.note, it.clef);
    // The same letter an octave away when the staff offers it, else the next position up or down.
    const target = pos + 7 <= 9 ? pos + 7 : pos - 7 >= -2 ? pos - 7 : pos + 1;
    placeAt(target);
    expect(s.session.results[0]!.outcome).toBe('wrong');
    vi.advanceTimersByTime(10_000);
    expect(cont()).not.toBeNull();
    expect(document.querySelector('.hint__lead')!.textContent).toContain(wrongKeyPlacement(it, answerAt(target, it.clef)));
    if (Math.abs(target - pos) === 7) expect(document.querySelector('.hint__lead')!.textContent).toMatch(/right letter, but one octave too (high|low)/);
    expect(document.querySelector('[data-mark=wrong]')).not.toBeNull();
    expect(document.querySelector('[data-reveal]')).not.toBeNull();
    expect(document.querySelector('.piano__key--glow')!.getAttribute('aria-label')).toContain(noteId(it.note));
  });

  it('"?" explains without a placed note', async () => {
    const s = setup();
    await tick();
    document.querySelector<HTMLButtonElement>('[data-answer="?"]')!.click();
    expect(s.session.results[0]!.outcome).toBe('idk');
    expect(cont()).not.toBeNull();
    expect(document.querySelector('.hint__lead')!.textContent).toMatch(/^(Meet|That key is) /);
  });
});

describe('Key to Staff registration and map', () => {
  it('is a Find keys mode with a short blurb and clef lanes', () => {
    expect(keyToStaffMode.group).toBe('keys');
    expect(keyToStaffMode.blurb).toBe('See the key, find the spot');
    expect(keyToStaffMode.core.tag).toBe(6);
  });

  it('draws one row per chosen clef, locked squares blank', () => {
    const map = renderKeyToStaffMap(keyToStaffEngine.newStudent(), T0, { lanes: ['bass'] });
    expect(map.querySelectorAll('.place-map__clef')).toHaveLength(1);
    expect(map.querySelectorAll('.place-cell')).toHaveLength(12);
    expect(map.querySelectorAll('.place-cell--locked').length).toBeGreaterThan(0);
  });
});
