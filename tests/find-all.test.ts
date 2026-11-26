// @vitest-environment jsdom
// Find All: the targets per letter, the one answer the engine gets, the multi-tap play screen
// (found keys, first wrong ends it, "?" teaches, black keys never score), and the random-tapper odds.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Synth } from '../src/audio/synth';
import {
  CANONICAL_ORDER,
  FIND_ALL,
  findGroups,
  isNearKey,
  FIND_ALL_MODE,
  answerFor,
  findEngine,
  findItem,
  landmarkFor,
  targetsOf,
} from '../src/core/findAll';
import { LETTERS } from '../src/core/music';
import { MIN, THEMES, contrast, parseHex } from '../src/core/themes';
import { type StudentState } from '../src/core/engine';
import { startSession } from '../src/core/session';
import { h } from '../src/ui/dom';
import { TOUR_GAP, TOUR_START, ZONE_TIP, findAllMode, findAllPlay, renderFindMap } from '../src/ui/findAll';
import { pianoKeys } from '../src/ui/piano';
import { T0 } from './helpers';

/** FROZEN copy of the canonical order (progress codes index by it): only ever append. */
const WHOLE = ['find:C', 'find:F', 'find:E', 'find:B', 'find:D', 'find:G', 'find:A'];
const NEAR = ['find:2oct:C', 'find:2oct:F', 'find:2oct:E', 'find:2oct:B', 'find:2oct:D', 'find:2oct:G', 'find:2oct:A'];
// The whole-keyboard items shipped first; the gentle stage was appended after them.
const GOLDEN = [...WHOLE, ...NEAR];

describe('the Find All item set', () => {
  it('has one item per letter in a pinned order; the first three answers differ; the answer space is 7', () => {
    expect(FIND_ALL.items.map((i) => i.id)).toEqual(GOLDEN);
    expect(CANONICAL_ORDER).toEqual(GOLDEN);
    for (const lane of ['near', 'keys']) {
      const first = FIND_ALL.groups[lane]!.slice(0, 3).map((i) => findEngine.answerOf(i.id));
      expect(new Set(first).size, lane).toBe(3);
    }
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

  it('stage 1 asks only for the two octaves around middle C: exactly 2 keys per letter', () => {
    for (const l of LETTERS) expect(targetsOf(l, 'near'), l).toEqual([`${l}3`, `${l}4`]);
    expect(isNearKey('C3')).toBe(true);
    expect(isNearKey('B4')).toBe(true);
    expect(isNearKey('C5')).toBe(false);
    expect(isNearKey('B2')).toBe(false);
  });

  it('whole-keyboard targets: 5 for C, 4 for every other letter', () => {
    for (const l of LETTERS) expect(targetsOf(l).length, l).toBe(l === 'C' ? 5 : 4);
  });

  // Chance of finding every key by tapping at random, EXACTLY: a tap on an already-found key is ignored,
  // so with f found the next tap is a target with chance (k - f) / (n - f), and the product over f is
  // k! (n - k)! / n!. (A simulation can't see numbers this small, so it was no guard at all.)
  const odds = (k: number, n: number) => Array.from({ length: k }, (_, f) => (k - f) / (n - f)).reduce((a, b) => a * b, 1);

  it('a random tapper essentially never completes a whole-keyboard question (exact odds)', () => {
    for (const l of LETTERS) expect(odds(targetsOf(l).length, 29), l).toBeLessThan(1e-4); // real: ~8e-6 (C) and ~4e-5 (others)
    expect(odds(5, 29)).toBeCloseTo(1 / 118755, 8);
    expect(odds(4, 29)).toBeCloseTo(1 / 23751, 8);
  });

  it('a random tapper on the tinted two octaves (14 keys, which they can see) gets 2 of 2 about 1% of the time', () => {
    // They can see the zone, so they tap only inside it: 2 targets among 14 keys is 1/91.
    expect(odds(2, 14)).toBeCloseTo(1 / 91, 8);
    expect(odds(2, 14)).toBeLessThan(0.012);
    // Even ignoring the tint, 2 of 29 keys is about a quarter of one percent.
    expect(odds(2, 29)).toBeLessThan(0.003);
  });

  it('a kid who never scrolls cannot complete a question by chance: the on-screen window never holds every target', () => {
    // A phone shows about 7 white keys centered on middle C: one of each letter, so at most 1 target is in reach
    // (stage 1 needs both of its 2, the whole keyboard 4 or 5). The mode cannot be progressed by tapping what is
    // on screen; the kid has to scroll. That is by design (the keyboard is one piano), and fine for the guardrails.
    const whites = pianoKeys('C2', 'C6').filter((k) => !k.black).map((k) => k.id);
    const c = whites.indexOf('C4');
    const phone = whites.slice(c - 3, c + 4);
    for (const l of LETTERS) {
      expect(phone.filter((k) => targetsOf(l).includes(k)).length, l).toBe(1);
      expect(phone.filter((k) => targetsOf(l, 'near').includes(k)).length, l).toBe(1);
    }
  });

  it('stage 2 opens only when every stage-1 letter is silver or better', () => {
    const fresh = findEngine.newStudent();
    expect(findGroups(undefined)).toEqual(['near']);
    expect(findGroups(fresh)).toEqual(['near']);
    const done: StudentState = findEngine.newStudent();
    for (const id of NEAR) Object.assign(done.items[id]!, { unlocked: true, best: 1, n: 6, c: 6 });
    expect(findGroups(done)).toEqual(['near', 'keys']);
    Object.assign(done.items['find:2oct:A']!, { best: 0, n: 1, c: 0 });
    expect(findGroups(done)).toEqual(['near']);
  });
});

// ───────────────────────── the play screen ─────────────────────────

const synth = { note: vi.fn() } as unknown as Synth;

function setup(lane: 'near' | 'keys' = 'keys') {
  const session = startSession([lane], 3, FIND_ALL_MODE);
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
const spanOf = (s: ReturnType<typeof setup>) => findItem(s.session.current!.itemId).span;
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
    expect(count()).toBe(`0 of ${targetsOf(l, spanOf(s)).length} found`);
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
    const targets = targetsOf(letterOf(s), spanOf(s));
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
    const targets = targetsOf(l, spanOf(s));
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
    const span = spanOf(s);
    document.querySelector<HTMLButtonElement>('[data-answer="?"]')!.click();
    expect(s.session.results[0]!.outcome).toBe('idk');
    for (const t of targetsOf(l, span)) expect(keyEl(t).dataset.mark).toBe('target');
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

describe('stage 1: the tinted zone', () => {
  it('tints the same 14 keys whatever the letter, with no marks, and counts only the zone keys', async () => {
    const s = setup('near');
    await tick();
    const l = letterOf(s);
    expect(spanOf(s)).toBe('near');
    const tinted = [...document.querySelectorAll<HTMLElement>('.piano__key.is-zone')].map((b) => b.dataset.note);
    expect(tinted).toEqual(pianoKeys('C3', 'B4').filter((k) => !k.black).map((k) => k.id));
    expect(document.querySelectorAll('.piano [data-mark]')).toHaveLength(0);
    expect(count()).toBe('0 of 2 found');
    expect(document.querySelector('.find-zone-note')!.textContent).toContain('tinted');
    // Both keys in the zone finish it correct.
    for (const t of targetsOf(l, 'near')) press(t);
    expect(s.session.results[0]!.outcome).toBe('correct');
  });

  it('a tap outside the zone is a kind tip, not a miss, even on the right letter', async () => {
    const s = setup('near');
    await tick();
    const l = letterOf(s);
    press(`${l}5`);
    expect(document.querySelector('[data-testid=catcher-tip]')!.textContent).toBe(ZONE_TIP);
    press('D2');
    expect(s.session.results).toHaveLength(0);
    expect(document.querySelectorAll('.piano [data-mark]')).toHaveLength(0);
    // A wrong key inside the zone still ends it.
    const inZone = pianoKeys('C3', 'B4').find((k) => !k.black && k.letter !== l)!.id;
    press(inZone);
    expect(s.session.results[0]!.outcome).toBe('wrong');
  });

  it('the whole-keyboard stage has no tint', async () => {
    setup('keys');
    await tick();
    expect(document.querySelectorAll('.is-zone')).toHaveLength(0);
    expect(document.querySelector('.find-zone-note')).toBeNull();
  });
});

describe('showing every target after a miss', () => {
  it('scrolls to each target in step with the low-to-high playback after a miss', async () => {
    const s = setup('keys');
    await tick();
    const scroller = document.querySelector<HTMLElement>('.piano__scroller')!;
    const jumps: number[] = [];
    // jsdom has no layout or matchMedia, so a reveal is an instant jump: count the scrollLeft writes.
    Object.defineProperty(scroller, 'scrollLeft', { get: () => 0, set: (v: number) => void jumps.push(v), configurable: true });
    const targets = targetsOf(letterOf(s));
    document.querySelector<HTMLButtonElement>('[data-answer="?"]')!.click();
    const before = jumps.length; // the first reveal after the answer
    await vi.advanceTimersByTimeAsync((TOUR_START + targets.length * TOUR_GAP) * 1000 + 200);
    expect(jumps.length - before).toBe(targets.length);
    const calls = (synth.note as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.map((c) => c[1])).toEqual(targets.map((_, i) => TOUR_START + i * TOUR_GAP));
  });
});

describe('the Find All registration', () => {
  it('is a Find keys mode with the permanent tag 5, a short blurb and a map cell per letter', () => {
    expect(findAllMode.id).toBe('find');
    expect(findAllMode.core.tag).toBe(5);
    expect(findAllMode.group).toBe('keys');
    expect(findAllMode.blurb.split(' ').length).toBeLessThanOrEqual(8);
    const map = renderFindMap(findEngine.newStudent(), T0);
    expect(map.querySelectorAll('[data-item]')).toHaveLength(14);
    expect(findAllMode.groups([], undefined)).toEqual(['near']);
    expect(findAllMode.itemLabel('find:G')).toBe('G keys');
    expect(findAllMode.itemLabel('find:2oct:G')).toBe('G keys near middle C');
  });
});

// ───────────────────────── the stage-1 tint, in every theme ─────────────────────────

/** `fg` at `alpha` over `bg`, as #rrggbb (the same maths as color-mix in srgb). */
function blend(fg: string, bg: string, alpha: number): string {
  const [a, b] = [parseHex(fg), parseHex(bg)];
  return `#${a.map((v, i) => Math.round(v * alpha + b[i]! * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
}

describe('the stage-1 zone tint in every theme', () => {
  it('the percentage used here matches the stylesheet, and the stylesheet uses theme variables only', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(`${process.cwd()}/src/ui/findAll.css`, 'utf8');
    expect(/\.is-zone[^{]*\{[^}]*color-mix\(in srgb, var\(--meter\) (\d+)%, var\(--key-white\)\)/.exec(css)![1]).toBe('14');
    expect(css).toMatch(/inset 0 -8px 0 color-mix\(in srgb, var\(--meter\) 65%, var\(--key-ink\)\)/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  });

  for (const theme of THEMES) {
    it(`${theme.id}: what sits on a tinted key stays readable, and the bar stands out from it`, () => {
      const c = theme.colors;
      const tint = blend(c.meter, c.keyWhite, 0.14);
      // The tint only applies to keys with no mark (found/target/wrong keys draw their own, already-checked colors),
      // so what can sit on it is: the middle-C label and dot, the focus ring, and the bar along the bottom.
      expect(contrast(c.keyInk, tint), 'middle-C label (small text)').toBeGreaterThanOrEqual(MIN.text);
      expect(contrast(c.keyDot, tint), 'middle-C dot').toBeGreaterThanOrEqual(MIN.large);
      expect(contrast(c.keyInk, tint), 'focus ring').toBeGreaterThanOrEqual(MIN.large);
      const bar = blend(c.meter, c.keyInk, 0.65); // box-shadow color in findAll.css
      expect(contrast(bar, tint), 'bottom bar').toBeGreaterThanOrEqual(MIN.large);
    });
  }
});
