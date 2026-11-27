// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Synth } from '../src/audio/synth';
import { newStudent } from '../src/core/engine';
import { itemById } from '../src/core/items';
import { NAME_IT_MODE, type SessionMode, startSession } from '../src/core/session';
import { letterPad } from '../src/ui/letterPad';
import { h } from '../src/ui/dom';
import { letterAnswer, letterItem, LETTER_GROUP, LETTER_MATH_MODE, letterEngine } from '../src/core/letters';
import { letterMathPlay } from '../src/ui/letterMath';
import { nameItPlay } from '../src/ui/nameIt';
import type { PlayShell } from '../src/ui/playShell';
import { T0 } from './helpers';

const synth = { note: vi.fn() } as unknown as Synth;

function setup(length = 3, mode: SessionMode<string> = NAME_IT_MODE) {
  const session = startSession(['treble'], length, mode);
  const host = {
    session,
    state: newStudent(),
    now: () => T0,
    save: vi.fn(),
    announce: vi.fn(),
    muteButton: () => h('button', {}, 'mute'),
    quit: vi.fn(),
    finish: vi.fn(), stopSound: vi.fn(),
  };
  const shell: PlayShell<string> = nameItPlay(host, synth);
  document.body.append(shell.render());
  return { shell, host, session };
}

const tick = () => Promise.resolve();
const key = (k: string, extra: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, cancelable: true, ...extra });
  return e;
};
const target = (s: ReturnType<typeof setup>) => itemById(s.session.current!.itemId).note.letter;
const wrongLetter = (s: ReturnType<typeof setup>) => (target(s) === 'A' ? 'B' : 'A');
const pad = (a: string) => document.querySelector<HTMLButtonElement>(`[data-answer="${a}"]`)!;
const cont = () => document.querySelector<HTMLButtonElement>('[data-testid=continue]');

beforeEach(async () => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
});
afterEach(() => vi.useRealTimers());

describe('play shell', () => {
  it('asks a question and shows the new-note banner on first sight', async () => {
    const s = setup();
    await tick();
    expect(s.session.current).not.toBeNull();
    expect(document.querySelector('.banner')!.textContent).toContain('New note');
    expect(document.querySelectorAll('.pad .pad__key')).toHaveLength(8);
  });

  it('auto-advances 700 ms after a correct answer, with no Got it button', async () => {
    const s = setup();
    await tick();
    pad(target(s)).click();
    expect(cont()).toBeNull();
    expect(document.querySelector('.praise')).not.toBeNull();
    vi.advanceTimersByTime(699);
    expect(s.session.results).toHaveLength(1);
    expect(document.querySelector('.praise')).not.toBeNull(); // still celebrating
    vi.advanceTimersByTime(1);
    expect(s.session.current).not.toBeNull(); // the next question is up
    expect(document.querySelector('.praise')).toBeNull();
  });

  it('waits for Got it after a wrong answer and after "?"', async () => {
    const s = setup();
    await tick();
    pad(wrongLetter(s)).click();
    vi.advanceTimersByTime(10_000);
    expect(cont()).not.toBeNull();
    expect(s.host.finish).not.toHaveBeenCalled();
    cont()!.click();
    expect(cont()).toBeNull();

    pad('?').click();
    vi.advanceTimersByTime(10_000);
    expect(cont()).not.toBeNull();
    expect(document.querySelector('.hint--idk')).not.toBeNull();
  });

  it('Enter and Space press Got it; typed letters and ? answer', async () => {
    const s = setup(5);
    await tick();
    const a = target(s);
    const e = key(a.toLowerCase());
    s.shell.onKey(e);
    expect(e.defaultPrevented).toBe(true);
    expect(s.session.results[0]!.outcome).toBe('correct');
    vi.advanceTimersByTime(700);

    s.shell.onKey(key('/'));
    expect(s.session.results[1]!.outcome).toBe('idk');
    (document.activeElement as HTMLElement | null)?.blur();
    const enter = key('Enter');
    s.shell.onKey(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(cont()).toBeNull();

    s.shell.onKey(key('?'));
    expect(s.session.results[2]!.outcome).toBe('idk');
    (document.activeElement as HTMLElement | null)?.blur();
    s.shell.onKey(key(' '));
    expect(cont()).toBeNull();
  });

  it('ignores modifier shortcuts and unrelated keys', async () => {
    const s = setup();
    await tick();
    s.shell.onKey(key('a', { ctrlKey: true }));
    s.shell.onKey(key('x'));
    expect(s.session.results).toHaveLength(0);
  });

  it('a wrong answer only counts once (the pad is disabled until the next question)', async () => {
    const s = setup();
    await tick();
    pad(wrongLetter(s)).click();
    expect(pad('C').disabled).toBe(true);
    s.shell.answer('C');
    expect(s.session.results).toHaveLength(1);
  });

  it('finishes the session after the last Got it', async () => {
    const s = setup(1);
    await tick();
    pad('?').click();
    expect(s.host.finish).not.toHaveBeenCalled();
    cont()!.click();
    expect(s.host.finish).toHaveBeenCalledTimes(1);
  });

  it('finishes after the last correct answer auto-advances', async () => {
    const s = setup(1);
    await tick();
    pad(target(s)).click();
    vi.advanceTimersByTime(700);
    expect(s.host.finish).toHaveBeenCalledTimes(1);
  });

  it('dispose clears the pending auto-advance', async () => {
    const s = setup(1);
    await tick();
    pad(target(s)).click();
    s.shell.dispose();
    vi.advanceTimersByTime(5000);
    expect(s.host.finish).not.toHaveBeenCalled();
    expect(s.host.stopSound).toHaveBeenCalled();
  });

  it('does nothing once the screen is gone', async () => {
    const s = setup();
    await tick();
    document.body.innerHTML = '';
    s.shell.answer('A');
    expect(s.session.results).toHaveLength(0);
  });

  it('quit goes home', async () => {
    const s = setup();
    await tick();
    document.querySelector<HTMLButtonElement>('[aria-label="Stop and go home"]')!.click();
    expect(s.host.quit).toHaveBeenCalled();
  });
});

const medalMode = (kind: 'silver' | 'gold'): SessionMode<string> => ({
  ...NAME_IT_MODE,
  engine: { ...NAME_IT_MODE.engine, recordAnswer: (...a) => ({ ...NAME_IT_MODE.engine.recordAnswer(...a), events: [{ kind, itemId: a[1] }] }) },
});

describe('play shell: medals, lessons, dispose', () => {
  it('a new silver waits 1600 ms and announces the events', async () => {
    const s = setup(3, medalMode('silver'));
    await tick();
    pad(target(s)).click();
    expect(s.host.announce).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.praise--silver')).not.toBeNull();
    vi.advanceTimersByTime(1599);
    expect(document.querySelector('.praise--silver')).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(document.querySelector('.praise')).toBeNull();
  });

  it('dispose during the medal wait never advances or finishes', async () => {
    const s = setup(1, medalMode('gold'));
    await tick();
    pad(target(s)).click();
    vi.advanceTimersByTime(1000);
    s.shell.dispose();
    vi.advanceTimersByTime(5000);
    expect(s.host.finish).not.toHaveBeenCalled();
  });

  const lessonMode: SessionMode<string> = { ...NAME_IT_MODE, diagnose: () => 'neighbor' };

  it('a wrong answer with a diagnosis shows the lesson after Got it, then the next question', async () => {
    const s = setup(3, lessonMode);
    await tick();
    pad(wrongLetter(s)).click();
    cont()!.click();
    const lesson = document.querySelector('[data-testid=lesson]');
    expect(lesson).not.toBeNull();
    expect(lesson!.getAttribute('role')).toBe('dialog');
    expect(s.session.current).toBeNull(); // no new question yet
    cont()!.click(); // OK, got it
    expect(document.querySelector('[data-testid=lesson]')).toBeNull();
    expect(s.session.current).not.toBeNull();
  });

  it('Enter dismisses the lesson', async () => {
    const s = setup(3, lessonMode);
    await tick();
    pad(wrongLetter(s)).click();
    cont()!.click();
    (document.activeElement as HTMLElement | null)?.blur();
    s.shell.onKey(key('Enter'));
    expect(document.querySelector('[data-testid=lesson]')).toBeNull();
    expect(s.session.current).not.toBeNull();
  });

  it('no diagnosis means no lesson; "?" never shows one', async () => {
    const s = setup(3, { ...NAME_IT_MODE, diagnose: () => null });
    await tick();
    pad(wrongLetter(s)).click();
    cont()!.click();
    expect(document.querySelector('[data-testid=lesson]')).toBeNull();
    expect(s.session.current).not.toBeNull();
    const t = setup(3, lessonMode);
    document.body.innerHTML = '';
    document.body.append(t.shell.render());
    await tick();
    pad('?').click();
    cont()!.click();
    expect(document.querySelector('[data-testid=lesson]')).toBeNull();
  });

  it('dispose during a lesson ignores OK', async () => {
    const s = setup(1, lessonMode);
    await tick();
    pad(wrongLetter(s)).click();
    cont()!.click();
    s.shell.dispose();
    cont()!.click();
    expect(s.host.finish).not.toHaveBeenCalled();
  });

  it('a disposed shell ignores answers even while still in the DOM', async () => {
    const s = setup();
    await tick();
    s.shell.dispose();
    s.shell.answer('C');
    expect(s.session.results).toHaveLength(0);
  });

  it('the letter pad ignores non-letter keys', () => {
    const p = letterPad('x', () => {}, () => 'C');
    expect(p.fromKey(key('x'))).toBeUndefined();
    expect(p.fromKey(key('?'))).toEqual({ answer: null });
    expect(p.fromKey(key('g'))).toEqual({ answer: 'G' });
  });
});

describe('play shell, Letter Math timings', () => {
  it('auto-advances after 1000 ms', async () => {
    const session = startSession([LETTER_GROUP], 3, LETTER_MATH_MODE);
    const host = { session, state: letterEngine.newStudent(), now: () => T0, save: vi.fn(), announce: vi.fn(), muteButton: () => h('button'), quit: vi.fn(), finish: vi.fn(), stopSound: vi.fn() };
    const shell = letterMathPlay(host, synth);
    document.body.append(shell.render());
    await tick();
    pad(letterAnswer(letterItem(session.current!.itemId))).click();
    vi.advanceTimersByTime(999);
    expect(document.querySelector('.praise')).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(document.querySelector('.praise')).toBeNull();
    expect(session.current).not.toBeNull();
  });
});

describe('play shell, Letter Math feedback', () => {
  function lm() {
    const session = startSession([LETTER_GROUP], 3, LETTER_MATH_MODE);
    const host = { session, state: letterEngine.newStudent(), now: () => T0, save: vi.fn(), announce: vi.fn(), muteButton: () => h('button'), quit: vi.fn(), finish: vi.fn(), stopSound: vi.fn() };
    const shell = letterMathPlay(host, synth);
    document.body.append(shell.render());
    return { session, host };
  }
  const right = (session: ReturnType<typeof lm>['session']) => letterAnswer(letterItem(session.current!.itemId));

  it('correct answers show the target letter in the praise', async () => {
    const { session } = lm();
    await tick();
    const t = right(session);
    pad(t).click();
    expect(document.querySelector('.praise')!.textContent).toBe(t);
  });

  it('wrong and "?" wait for Got it', async () => {
    const { session, host } = lm();
    await tick();
    pad(right(session) === 'A' ? 'B' : 'A').click();
    vi.advanceTimersByTime(10_000);
    expect(cont()).not.toBeNull();
    cont()!.click();
    pad('?').click();
    vi.advanceTimersByTime(10_000);
    expect(cont()).not.toBeNull();
    expect(host.finish).not.toHaveBeenCalled();
  });
});
