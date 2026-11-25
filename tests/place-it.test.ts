// @vitest-environment jsdom
// Place It: the wording, the octave rule and the play screen (name → staff).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Synth } from '../src/audio/synth';
import { PLACE_IT, PLACE_IT_MODE, placeAnswerSpace, placeEngine, placeItem, placePrompt, placeRange, whichOne, wrongPlacement } from '../src/core/placeIt';
import { startSession } from '../src/core/session';
import { h } from '../src/ui/dom';
import { placeItMode, placeItPlay, renderPlaceMap } from '../src/ui/placeIt';
import type { PlayShell } from '../src/ui/playShell';
import { T0 } from './helpers';

const synth = { note: vi.fn() } as unknown as Synth;
const tick = () => Promise.resolve();

describe('Place It wording', () => {
  it('asks for the letter, with a which-one only when the clef has several', () => {
    expect(placePrompt(placeItem('place:treble:G4'))).toEqual({ lead: 'Put the lower', letter: 'G', tail: 'on the treble staff.' });
    expect(whichOne(placeItem('place:treble:G5'))).toBe('higher');
    expect(whichOne(placeItem('place:treble:A4'))).toBe('');
    expect(placePrompt(placeItem('place:treble:A4')).lead).toBe('Put a');
    expect(whichOne(placeItem('place:bass:D3'))).toBe('');
  });

  it('the prompt never says where the note goes', () => {
    for (const item of PLACE_IT.items) {
      const p = placePrompt(item);
      expect(`${p.lead} ${p.letter} ${p.tail}`, item.id).not.toMatch(/line|space|\d/);
    }
  });

  it('the right letter in the wrong octave is wrong, with kind words', () => {
    const g4 = placeItem('place:treble:G4');
    expect(placeEngine.grade(g4.id, String(g4.pos + 7))).toBe('wrong');
    expect(placeEngine.grade(g4.id, String(g4.pos))).toBe('correct');
    expect(wrongPlacement(g4, g4.pos + 7)).toBe("That's a G, but the one an octave lower. Close!");
    const g5 = placeItem('place:treble:G5');
    expect(wrongPlacement(g5, g5.pos - 7)).toContain('an octave higher');
    expect(wrongPlacement(g4, g4.pos + 1)).toBe('That spot is an A, not G.');
    expect(wrongPlacement(placeItem('place:treble:C4'), 12)).toContain('two octaves lower');
    expect(wrongPlacement(g4, g4.pos + 28)).toContain('4 octaves lower');
    expect(wrongPlacement(g4, g4.pos + 5)).toBe('That spot is an E, not G.');
  });

  it('offers every position of the clef, whatever is unlocked', () => {
    expect(placeRange('treble').low).toBeLessThanOrEqual(-2);
    expect(placeAnswerSpace().length).toBeGreaterThan(12);
  });
});

function setup() {
  const session = startSession(['treble', 'bass'], 5, PLACE_IT_MODE);
  const host = {
    session,
    state: placeEngine.newStudent(),
    now: () => T0,
    save: vi.fn(),
    announce: vi.fn(),
    muteButton: () => h('button', {}, 'mute'),
    quit: vi.fn(),
    finish: vi.fn(),
    stopSound: vi.fn(),
  };
  const shell: PlayShell<string> = placeItPlay(host, synth);
  document.body.append(shell.render());
  return { shell, host, session };
}

/** Keyboard-drive the visible staff to a position and press Enter. */
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
const item = (s: ReturnType<typeof setup>) => placeItem(s.session.current!.itemId);
const cont = () => document.querySelector<HTMLButtonElement>('[data-testid=continue]');

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  vi.mocked(synth.note).mockClear();
});
afterEach(() => vi.useRealTimers());

describe('Place It play screen', () => {
  it('shows the question without the answer, to the eye and to screen readers', async () => {
    const s = setup();
    await tick();
    const it = item(s);
    const text = document.querySelector('.place-prompt')!.textContent!;
    expect(text).toContain(it.note.letter);
    expect(text).not.toMatch(/line|space/);
    const slider = document.querySelector('.staff-input:not([hidden]) .staff-input__slider')!;
    expect(slider.getAttribute('aria-label')).not.toMatch(new RegExp(`\\b${it.note.letter}\\b`));
    expect(slider.getAttribute('aria-valuetext')).toBe('no note chosen');
    expect(document.querySelector('[data-reveal]')).toBeNull();
    expect(document.querySelectorAll('.staff-input:not([hidden])')).toHaveLength(1);
    expect(document.querySelector('.staff-input:not([hidden])')!.getAttribute('data-clef')).toBe(it.clef);
    expect(synth.note).not.toHaveBeenCalled(); // no sound before the answer: it would give the position away
  });

  it('a right placement auto-advances; the next question starts from a clean staff', async () => {
    const s = setup();
    await tick();
    placeAt(item(s).pos);
    expect(s.session.results[0]!.outcome).toBe('correct');
    expect(document.querySelector('[data-mark=right]')).not.toBeNull();
    expect(cont()).toBeNull();
    vi.advanceTimersByTime(2000);
    expect(s.session.current).not.toBeNull();
    expect(document.querySelector('.staff-input__placed')).toBeNull();
  });

  it('a wrong placement shows the right spot beside it with a hint, and waits for Got it', async () => {
    const s = setup();
    await tick();
    const it = item(s);
    const range = placeRange(it.clef);
    placeAt(it.pos + 7 <= range.high ? it.pos + 7 : it.pos + 1);
    expect(s.session.results[0]!.outcome).toBe('wrong');
    vi.advanceTimersByTime(10_000);
    expect(cont()).not.toBeNull();
    expect(document.querySelector('[data-mark=wrong]')).not.toBeNull();
    expect(document.querySelector('[data-reveal]')).not.toBeNull();
    expect(document.querySelector('.hint')!.textContent).toMatch(/Count|guide note/);
    expect(synth.note).toHaveBeenCalled();
    cont()!.click();
    expect(s.session.current).not.toBeNull();
  });

  it('"?" and the ? key show the answer and wait for Got it', async () => {
    const s = setup();
    await tick();
    document.querySelector<HTMLButtonElement>('[data-answer="?"]')!.click();
    expect(s.session.results[0]!.outcome).toBe('idk');
    expect(document.querySelector('[data-reveal]')).not.toBeNull();
    expect(cont()).not.toBeNull();
    cont()!.click();
    s.shell.onKey(new KeyboardEvent('keydown', { key: '?' }));
    expect(s.session.results[1]!.outcome).toBe('idk');
  });
});

describe('Place It registration and map', () => {
  it('is a Read notes mode with clef lanes and a short blurb', () => {
    expect(placeItMode.group).toBe('read');
    expect(placeItMode.lanes).toBe('clefs');
    expect(placeItMode.blurb.split(' ').length).toBeLessThanOrEqual(8);
    expect(placeItMode.groups(['bass'])).toEqual(['bass']);
    expect(placeItMode.itemLabel('place:bass:F3')).toBe('F (bass clef)');
  });

  it('draws a row per clef with locked squares blank', () => {
    const el = renderPlaceMap(placeEngine.newStudent(), T0);
    expect(el.querySelectorAll('.place-cell')).toHaveLength(24);
    expect(el.querySelectorAll('.place-cell--locked').length).toBeGreaterThan(10);
    expect(renderPlaceMap(placeEngine.newStudent(), T0, { lanes: ['bass'] }).querySelectorAll('.place-cell')).toHaveLength(12);
  });
});
