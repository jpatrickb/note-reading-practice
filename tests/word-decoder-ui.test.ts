// @vitest-environment jsdom
// The Word Decoder play flow: notes named one by one, the cursor moving, hints that wait for "Got it",
// and the word revealed only when it is solved.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Synth } from '../src/audio/synth';
import type { Profile } from '../src/core/codec';
import { newStudent } from '../src/core/engine';
import { ITEMS } from '../src/core/items';
import { startSession } from '../src/core/session';
import { WORD_MODE, wordEngine, wordItem } from '../src/core/wordDecoder';
import { h } from '../src/ui/dom';
import type { PlayShell } from '../src/ui/playShell';
import { wordDecoderMode, wordDecoderPlay } from '../src/ui/wordDecoder';
import { T0 } from './helpers';

const note = vi.fn();
const synth = { note, stopAll: vi.fn() } as unknown as Synth;

/** A Name It model with every note at silver (made up). */
function silverProfile(): Profile {
  const name = newStudent();
  for (const i of ITEMS) name.items[i.id] = { unlocked: true, m: 2, s: 80, n: 8, c: 8, last: T0, rt: 1500, best: 1, silverDay: 1 };
  return { name, letters: wordEngine.newStudent() } as unknown as Profile;
}

function setup(length = 4) {
  const session = startSession(['treble'], length, WORD_MODE);
  const host = {
    session,
    state: wordEngine.newStudent(),
    now: () => T0,
    save: vi.fn(),
    announce: vi.fn(),
    muteButton: () => h('button', {}, 'mute'),
    quit: vi.fn(),
    finish: vi.fn(),
    stopSound: vi.fn(),
  };
  const shell: PlayShell<string> = wordDecoderPlay(host, synth, silverProfile());
  document.body.append(shell.render());
  return { shell, host, session };
}

const tick = () => Promise.resolve();
const key = (k: string) => new KeyboardEvent('keydown', { key: k, cancelable: true });
const pad = (a: string) => document.querySelector<HTMLButtonElement>(`[data-answer="${a}"]`)!;
const word = (s: ReturnType<typeof setup>) => wordItem(s.session.current!.itemId).word;
const wrongFor = (l: string) => (l === 'A' ? 'B' : 'A');
const groups = () => [...document.querySelectorAll<SVGGElement>('.staff-seq__group')];
const blanks = () => [...document.querySelectorAll('.wd-blank')].map((b) => b.textContent);
const noteHint = () => document.querySelector('[data-testid=wd-hint]');
const gotIt = () => document.querySelector<HTMLButtonElement>('[data-testid=note-continue]');

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  note.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('Word Decoder play', () => {
  it('draws one note per letter with the cursor on the first, no letters given away, and blanks under', async () => {
    const s = setup();
    await tick();
    const w = word(s);
    expect(groups()).toHaveLength(w.length);
    expect(groups()[0]!.classList.contains('staff-seq__group--cursor')).toBe(true);
    expect(document.querySelectorAll('.staff-seq__label')).toHaveLength(0); // labels only after answering
    for (const g of groups()) expect(g.getAttribute('aria-label')).toMatch(/^note \d+ of \d+$/);
    expect(blanks()).toEqual(w.split('').map(() => ''));
    expect(document.querySelector('.banner')!.textContent).toContain('New word');
  });

  it('naming each note right moves the cursor along, fills its blank, plays the note, and reveals the word', async () => {
    const s = setup();
    await tick();
    const w = word(s);
    for (let i = 0; i < w.length; i++) {
      expect(groups()[i]!.classList.contains('staff-seq__group--cursor'), `cursor at ${i}`).toBe(true);
      pad(w[i]!).click();
      expect(note).toHaveBeenCalledTimes(i < w.length - 1 ? i + 1 : 2 * w.length); // the last note also starts the tune
      expect(blanks().slice(0, i + 1).join('')).toBe(w.slice(0, i + 1));
      expect(groups()[i]!.classList.contains('staff-seq__group--right')).toBe(true);
      expect(document.querySelectorAll('.staff-seq__mark--right')).toHaveLength(i + 1);
    }
    expect(s.session.results[0]!.outcome).toBe('correct');
    expect(document.querySelector('[data-testid=wd-reveal]')!.textContent).toBe(`🔓 ${w}!`);
    expect(document.querySelectorAll('.staff-seq__label')).toHaveLength(w.length);
    expect(document.querySelector('[data-testid=continue]')).toBeNull(); // right answers move on by themselves
    expect(document.querySelector('.praise')).not.toBeNull();
    // The little tune plays after the last note only for a solved word (the notes were already heard).
    expect(note.mock.calls.length).toBe(w.length + w.length);
  });

  it('a wrong note shows that note\'s hint, fills the right letter, holds the pad, and continues after Got it', async () => {
    const s = setup();
    await tick();
    const w = word(s);
    pad(wrongFor(w[0]!)).click();
    expect(noteHint()).not.toBeNull();
    expect(noteHint()!.textContent).toContain(`That note is ${w[0]}, not ${wrongFor(w[0]!)}.`);
    expect(noteHint()!.textContent).toContain('This note is on'); // its position
    expect(noteHint()!.textContent).toMatch(/Count|guide note/); // and the guide-note count
    expect(groups()[0]!.classList.contains('staff-seq__group--wrong')).toBe(true);
    expect(blanks()[0]).toBe(w[0]); // the right letter is filled in
    expect(pad('C').disabled).toBe(true);
    pad(w[1]!).click(); // held: ignored
    expect(s.session.results).toHaveLength(0);
    expect(groups()[0]!.classList.contains('staff-seq__group--cursor')).toBe(true);
    gotIt()!.click();
    expect(noteHint()).toBeNull();
    expect(groups()[1]!.classList.contains('staff-seq__group--cursor')).toBe(true);
    expect(pad('C').disabled).toBe(false);
  });

  it('Enter dismisses a note hint; a miss anywhere makes the whole word wrong and the word is shown plainly', async () => {
    const s = setup();
    await tick();
    const w = word(s);
    pad(wrongFor(w[0]!)).click();
    const enter = key('Enter');
    s.shell.onKey(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(noteHint()).toBeNull();
    for (let i = 1; i < w.length; i++) pad(w[i]!).click(); // the rest right
    expect(s.session.results[0]!.outcome).toBe('wrong');
    const reveal = document.querySelector('[data-testid=wd-reveal]')!;
    expect(reveal.textContent).toBe(`The word is ${w}.`);
    expect(reveal.className).toContain('wd-reveal--wrong');
    expect(document.querySelector('.praise')).toBeNull(); // wrong is never more fun than right
    vi.advanceTimersByTime(10_000);
    expect(document.querySelector('[data-testid=continue]')).not.toBeNull(); // waits for Got it
    expect(note.mock.calls.length).toBe(w.length); // no tune
  });

  it('a "?" on a note reveals it with its hint; with nothing wrong the word counts as "?"', async () => {
    const s = setup();
    await tick();
    const w = word(s);
    pad('?').click();
    expect(noteHint()!.textContent).toContain(`That note is ${w[0]}.`);
    expect(groups()[0]!.classList.contains('staff-seq__group--reveal')).toBe(true);
    gotIt()!.click();
    for (let i = 1; i < w.length; i++) pad(w[i]!).click();
    expect(s.session.results[0]!.outcome).toBe('idk');
    expect(document.querySelector('.hint--idk')).not.toBeNull();
  });

  it('a miss on the LAST note goes straight to the word feedback, with that note\'s hint, not two Got its', async () => {
    const s = setup();
    await tick();
    const w = word(s);
    for (let i = 0; i < w.length - 1; i++) pad(w[i]!).click();
    pad(wrongFor(w.at(-1)!)).click();
    expect(noteHint()).toBeNull();
    expect(s.session.results[0]!.outcome).toBe('wrong');
    const hint = document.querySelector('.hint--wrong')!;
    expect(hint.textContent).toContain(w);
    expect(hint.textContent).toContain(`The ${['1st', '2nd', '3rd'][w.length - 1] ?? `${w.length}th`} note is ${w.at(-1)}`);
    expect(hint.textContent).toContain('This note is on');
    expect(document.querySelectorAll('[data-testid=continue]')).toHaveLength(1);
  });

  it('typed letters and ? work from the keyboard, and a note hint holds letters until Got it', async () => {
    const s = setup();
    await tick();
    const w = word(s);
    const e = key(w[0]!.toLowerCase());
    s.shell.onKey(e);
    expect(e.defaultPrevented).toBe(true);
    expect(blanks()[0]).toBe(w[0]);
    s.shell.onKey(key('?'));
    expect(noteHint()).not.toBeNull();
    s.shell.onKey(key(w[2]!)); // ignored while the hint is up
    expect(blanks()[2]).toBe('');
    s.shell.onKey(key(' '));
    expect(noteHint()).toBeNull();
    s.shell.onKey(key('x')); // not a letter of the pad: ignored
    s.shell.onKey(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, cancelable: true }));
    expect(s.session.results).toHaveLength(0);
  });

  it('the notes come from the kid\'s silver notes, in order, and the question is in the DOM only as an item id', async () => {
    const s = setup();
    await tick();
    const w = word(s);
    expect(document.querySelector<HTMLElement>('[data-testid=wd-question]')!.dataset.item).toBe(s.session.current!.itemId);
    const heads = [...document.querySelectorAll<SVGElement>('.staff-seq__group')].map((g) => g.dataset.note![0]);
    expect(heads.join('')).toBe(w);
  });

  it('disposes cleanly and ignores late input', async () => {
    const s = setup();
    await tick();
    s.shell.dispose();
    pad(word(s)[0]!).click();
    expect(s.session.results).toHaveLength(0);
    expect(s.host.stopSound).toHaveBeenCalled();
  });
});

describe('Word Decoder registration', () => {
  it('is in "Read notes", with a short blurb, and locked until a clef has 4 silver Name It notes', () => {
    expect(wordDecoderMode.group).toBe('read');
    expect(wordDecoderMode.blurb.split(/\s+/).length).toBeLessThanOrEqual(8);
    const fresh = { name: wordEngine.newStudent(), letters: wordEngine.newStudent() } as unknown as Profile;
    expect(wordDecoderMode.availability(fresh)).toEqual({ ok: false, reason: 'Learn a few more notes in Name It first!' });
    expect(wordDecoderMode.availability(silverProfile())).toEqual({ ok: true });
  });

  it('plays only the clefs that are ready', () => {
    const p = silverProfile();
    for (const i of ITEMS.filter((n) => n.clef === 'bass')) p.name.items[i.id]!.best = 0;
    expect(wordDecoderMode.groups(['treble', 'bass'], p)).toEqual(['treble']);
    expect(wordDecoderMode.groups(['bass'], p)).toEqual(['treble']); // none of the pick is ready: any ready clef
    expect(wordDecoderMode.groups(['treble', 'bass'])).toEqual(['treble', 'bass']);
  });

  it('draws its progress map, with locked words left out until they open', () => {
    const state = wordEngine.newStudent();
    const map = wordDecoderMode.renderMap(state, T0, { legend: true });
    expect(map.querySelectorAll('.wd-cell').length).toBe(6); // 3 per clef open
    expect(map.textContent).toContain('more words to unlock');
    expect(wordDecoderMode.itemLabel('word:bass:FED')).toBe('FED (bass clef)');
    expect(wordDecoderMode.renderMap(state, T0, { lanes: ['treble'] }).querySelectorAll('.wd-cell').length).toBe(3);
  });
});
