// @vitest-environment jsdom
// Find All: the targets per letter, the one answer the engine gets, the multi-tap play screen
// (found keys, first wrong ends it, "?" teaches, black keys never score), and the random-tapper odds.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Synth } from '../src/audio/synth';
import {
  CANONICAL_ORDER,
  FIND_ALL,
  FIND_ALL_MODE,
  answerFor,
  findEngine,
  findItem,
  landmarkFor,
  targetsOf,
} from '../src/core/findAll';
import { LETTERS } from '../src/core/music';
import { startSession } from '../src/core/session';
import { h } from '../src/ui/dom';
import { findAllMode, findAllPlay, renderFindMap } from '../src/ui/findAll';
import { pianoKeys } from '../src/ui/piano';
import { T0 } from './helpers';

/** FROZEN copy of the canonical order (progress codes index by it): only ever append. */
const GOLDEN = ['find:C', 'find:F', 'find:E', 'find:B', 'find:D', 'find:G', 'find:A'];

describe('the Find All item set', () => {
  it('has one item per letter in a pinned order; the first three answers differ; the answer space is 7', () => {
    expect(FIND_ALL.items.map((i) => i.id)).toEqual(GOLDEN);
    expect(CANONICAL_ORDER).toEqual(GOLDEN);
    const first = FIND_ALL.groups.keys!.slice(0, 3).map((i) => findEngine.answerOf(i.id));
    expect(new Set(first).size).toBe(3);
    expect(new Set(FIND_ALL.items.map((i) => findEngine.answerOf(i.id))).size).toBe(7);
  });

  it('targets are every white key with the letter on the C2 to C6 keyboard, low to high', () => {
    expect(targetsOf('G')).toEqual(['G2', 'G3', 'G4', 'G5']);
    expect(targetsOf('C')).toEqual(['C2', 'C3', 'C4', 'C5', 'C6']);
    const white = pianoKeys('C2', 'C6').filter((k) => !k.black);
    for (const l of LETTERS) expect(targetsOf(l)).toEqual(white.filter((k) => k.letter === l).map((k) => k.id));
  });

  it('the answer passed to the engine: the letter when all found, else the wrong key letter (graded wrong)', () => {
    const g = findItem('find:G');
    expect(findEngine.isCorrect(g.id, answerFor(g, null))).toBe(true);
    expect(answerFor(g, 'A3')).toBe('A');
    expect(findEngine.isCorrect(g.id, answerFor(g, 'A3'))).toBe(false);
    for (const l of LETTERS) for (const w of LETTERS.filter((x) => x !== l)) expect(findEngine.isCorrect(`find:${l}`, answerFor(findItem(`find:${l}`), `${w}3`))).toBe(false);
  });

  it('a hint for every letter, built from black-key groups and letters met earlier', () => {
    for (const l of LETTERS) expect(landmarkFor(l)).toMatch(/black key/);
    expect(landmarkFor('C')).toBe('C is just to the left of each group of two black keys.');
  });

  it('a random tapper almost never completes a question (well under 5%)', () => {
    // Taps keys at random (white keys only) until the first wrong one or all found.
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const whites = pianoKeys('C2', 'C6').filter((k) => !k.black).map((k) => k.id);
    for (const l of LETTERS) {
      const targets = targetsOf(l);
      let done = 0;
      const N = 20000;
      for (let t = 0; t < N; t++) {
        const found = new Set<string>();
        for (;;) {
          const k = whites[Math.floor(rnd() * whites.length)]!;
          if (found.has(k)) continue;
          if (!targets.includes(k)) break;
          found.add(k);
          if (found.size === targets.length) {
            done++;
            break;
          }
        }
      }
      expect(done / N, l).toBeLessThan(0.05);
    }
  });
});

// ───────────────────────── the play screen ─────────────────────────

const synth = { note: vi.fn() } as unknown as Synth;

function setup() {
  const session = startSession(['keys'], 3, FIND_ALL_MODE);
  const host = {
    session,
    state: findEngine.newStudent(),
    now: () => T0,
    save: vi.fn(),
    announce: vi.fn(),
    muteButton: () => h('button', {}, 'mute'),
    quit: vi.fn(),
    finish: vi.fn(),
    stopSound: vi.fn(),
  };
  const shell = findAllPlay(host, synth);
  document.body.append(shell.render());
  return { shell, host, session };
}
const tick = () => Promise.resolve();
const keyEl = (note: string) => document.querySelector<HTMLButtonElement>(`.piano [data-note="${note}"]`)!;
const press = (note: string) => keyEl(note).dispatchEvent(new MouseEvent('click', { bubbles: true }));
const cont = () => document.querySelector<HTMLButtonElement>('[data-testid=continue]');
const letterOf = (s: ReturnType<typeof setup>) => findItem(s.session.current!.itemId).letter;
const count = () => document.querySelector('[data-testid=find-count]')!.textContent;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  (synth.note as ReturnType<typeof vi.fn>).mockClear();
  Object.defineProperty(window, 'innerWidth', { value: 1180, configurable: true });
});
afterEach(() => vi.useRealTimers());

describe('the Find All play screen', () => {
  it('asks for the letter, counts, and uses the same keyboard as Note Catcher with only middle C marked', async () => {
    const s = setup();
    await tick();
    const l = letterOf(s);
    expect(document.querySelector('.lm-prompt')!.textContent).toBe(`Find all the ${l}s!`);
    expect(count()).toBe(`0 of ${targetsOf(l).length} found`);
    const piano = document.querySelector('.piano')!;
    expect(piano.querySelectorAll('.piano__key--white')).toHaveLength(29);
    expect(piano.querySelectorAll('.piano__label')).toHaveLength(0);
    expect(piano.querySelectorAll('.piano__dot')).toHaveLength(1);
    for (const b of piano.querySelectorAll('.piano__key')) expect(b.getAttribute('aria-label')).toMatch(/^(Piano key \d+ of \d+(, middle C)?|Black key after white key \d+)$/);
    expect(synth.note).not.toHaveBeenCalled();
  });

  it('each right tap marks the key found and plays it; the last one finishes correct', async () => {
    const s = setup();
    await tick();
    const targets = targetsOf(letterOf(s));
    targets.slice(0, -1).forEach((t, i) => {
      press(t);
      expect(keyEl(t).dataset.mark).toBe('found');
      expect(count()).toBe(`${i + 1} of ${targets.length} found`);
    });
    expect(s.session.results).toHaveLength(0);
    press(targets[0]!); // a found key tapped again does nothing
    expect(count()).toBe(`${targets.length - 1} of ${targets.length} found`);
    expect(synth.note).toHaveBeenCalledTimes(targets.length - 1);
    press(targets.at(-1)!);
    expect(s.session.results).toHaveLength(1);
    expect(s.session.results[0]!.outcome).toBe('correct');
    for (const t of targets) expect(keyEl(t).dataset.mark).toBe('right');
    await vi.advanceTimersByTimeAsync(5000);
    expect(s.session.results.length).toBeGreaterThan(0);
  });

  it('the first wrong tap ends it: the key is marked wrong, every target is shown, and Got it waits', async () => {
    const s = setup();
    await tick();
    const l = letterOf(s);
    const targets = targetsOf(l);
    press(targets[0]!);
    const wrongId = pianoKeys('C2', 'C6').find((k) => !k.black && k.letter !== l)!.id;
    press(wrongId);
    expect(s.session.results).toHaveLength(1);
    expect(s.session.results[0]!.outcome).toBe('wrong');
    expect(keyEl(wrongId).dataset.mark).toBe('wrong');
    expect(keyEl(targets[0]!).dataset.mark).toBe('right');
    for (const t of targets.slice(1)) expect(keyEl(t).dataset.mark).toBe('target');
    expect(document.querySelector('.hint__lead')!.textContent).toContain(`We were finding ${l}s`);
    expect(document.querySelector('.hint')!.textContent).toContain(landmarkFor(l));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(cont()).not.toBeNull();
    press(targets[1]!); // the question is over: more taps do nothing
    expect(s.session.results).toHaveLength(1);
  });

  it('"?" shows every target and teaches', async () => {
    const s = setup();
    await tick();
    const l = letterOf(s);
    document.querySelector<HTMLButtonElement>('[data-answer="?"]')!.click();
    expect(s.session.results[0]!.outcome).toBe('idk');
    for (const t of targetsOf(l)) expect(keyEl(t).dataset.mark).toBe('target');
    expect(cont()).not.toBeNull();
  });

  it('a black key is never an answer: a tip, a sound, nothing scored or marked', async () => {
    const s = setup();
    await tick();
    const black = pianoKeys('C2', 'C6').find((k) => k.black)!.id;
    press(black);
    expect(document.querySelector('[data-testid=catcher-tip]')!.textContent).toContain('black key');
    expect(s.session.results).toHaveLength(0);
    expect(document.querySelectorAll('.piano [data-mark]')).toHaveLength(0);
    expect(count()).toMatch(/^0 of/);
  });
});

describe('the Find All registration', () => {
  it('is a Find keys mode with the permanent tag 5, a short blurb and a map cell per letter', () => {
    expect(findAllMode.id).toBe('find');
    expect(findAllMode.core.tag).toBe(5);
    expect(findAllMode.group).toBe('keys');
    expect(findAllMode.blurb.split(' ').length).toBeLessThanOrEqual(8);
    const map = renderFindMap(findEngine.newStudent(), T0);
    expect(map.querySelectorAll('[data-item]')).toHaveLength(7);
    expect(findAllMode.itemLabel('find:G')).toBe('G keys');
  });
});
