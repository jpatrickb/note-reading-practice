// @vitest-environment jsdom
// The placement round's first-run flow: who is offered it, what the round shows (and never shows),
// and what the result says. Search and apply logic are tested in placement.test.ts.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Synth } from '../src/audio/synth';
import { nameEngine } from '../src/core/engine';
import { itemById } from '../src/core/items';
import { LETTER_GROUP, letterEngine } from '../src/core/letters';
import { MAX_ANSWERS, type PlacementRun, applyPlacement, nextPlacementItem, startPlacement, submitPlacement } from '../src/core/placement';
import { MIN_PLACEMENT_ANSWERS, answerSpace, placementLane, resultText, startingItem } from '../src/core/placementFlow';
import { NAME_IT_MODE, startSession } from '../src/core/session';
import { h } from '../src/ui/dom';
import { MODES } from '../src/ui/modes';
import { nameItMode, nameItPlay } from '../src/ui/nameIt';
import { PLACEMENT_ACK_MS } from '../src/ui/playShell';
import { renderPlacementOffer, renderPlacementResult } from '../src/ui/placementScreens';
import { T0, seededRng } from './helpers';

describe('who is offered placement', () => {
  it('a fresh lane is offered; the first fresh lane of the chosen ones is placed', () => {
    const s = nameEngine.newStudent();
    expect(placementLane(nameEngine, s, ['treble'])).toBe('treble');
    expect(placementLane(nameEngine, s, ['treble', 'bass'])).toBe('treble');
  });

  it('a lane with any answer is never offered, so nothing can be overwritten', () => {
    const s = nameEngine.newStudent();
    const first = nameEngine.set.groups.treble![0]!.id;
    nameEngine.recordAnswer(s, first, 'correct', nameEngine.answerOf(first), 1500, T0);
    expect(placementLane(nameEngine, s, ['treble'])).toBeNull();
    // ...but the untouched bass lane still is.
    expect(placementLane(nameEngine, s, ['treble', 'bass'])).toBe('bass');
  });

  it('a lane whose items were opened by placement is not offered again', () => {
    const s = nameEngine.newStudent();
    const run = startPlacement(nameEngine, 'treble');
    for (let id = nextPlacementItem(nameEngine, run, seededRng(1)); id; id = nextPlacementItem(nameEngine, run, seededRng(1))) {
      submitPlacement(nameEngine, run, nameEngine.answerOf(id), 1500, T0);
    }
    expect(applyPlacement(nameEngine, s, run).applied).toBe(true);
    expect(placementLane(nameEngine, s, ['treble'])).toBeNull();
  });

  it('nothing is offered without a learner state', () => {
    expect(placementLane(nameEngine, undefined, ['treble'])).toBeNull();
  });

  it('Name It and Letter Math opt in; a mode must have at least 5 different answers', () => {
    expect(nameItMode.placement).toBe(true);
    expect(MODES.filter((m) => m.placement).map((m) => m.id)).toEqual(['name', 'letters']);
    expect(answerSpace(nameEngine, 'treble')).toBe(7);
    expect(answerSpace(letterEngine, LETTER_GROUP)).toBe(7);
    expect(MIN_PLACEMENT_ANSWERS).toBe(5);
  });

  it('a lane with fewer than 5 answers is not offered', () => {
    const tiny = { ...nameEngine, answerOf: (id: string) => (['C', 'D', 'E'] as const)[nameEngine.set.groups.treble!.findIndex((i) => i.id === id) % 3]! } as typeof nameEngine;
    expect(answerSpace(tiny, 'treble')).toBe(3);
    expect(placementLane(tiny, nameEngine.newStudent(), ['treble'])).toBeNull();
  });

  it('every mode that opts in has a friendly starting line', () => {
    for (const m of MODES.filter((x) => x.placement)) {
      const id = m.core.engine.set.items[3]!.id;
      expect(m.placedLine(id)).toMatch(/^You're starting/);
    }
  });
});

describe('the result', () => {
  function placed(knows: number): PlacementRun {
    const run = startPlacement(nameEngine, 'treble');
    const ids = run.ids;
    const rng = seededRng(3);
    for (let id = nextPlacementItem(nameEngine, run, rng); id; id = nextPlacementItem(nameEngine, run, rng)) {
      submitPlacement(nameEngine, run, ids.indexOf(id) < knows ? nameEngine.answerOf(id) : null, 1500, T0);
    }
    return run;
  }
  const words = { medal: 'key', line: nameItMode.placedLine };

  it('names where the kid starts, with no score', () => {
    const run = placed(6);
    const { body } = resultText(run, words);
    expect(body).toContain("You're starting at");
    expect(body).toContain('in the treble clef');
    expect(body).toContain('Your mastery keys fill in as you play.');
    expect(body).not.toMatch(/\d+ (of|out)|score|points|wrong|right/i);
    expect(itemById(startingItem(run)).clef).toBe('treble');
  });

  it('a kid placed at the start hears a start-from-the-first message', () => {
    const { body } = resultText(placed(0), words);
    expect(body).toMatch(/^Let's start with the first ones/);
  });

  it('a mode with no medal word says "progress"', () => {
    expect(resultText(placed(6), { medal: '', line: () => 'X.' }).body).toBe('X. Your progress fills in as you play.');
  });

  it('the screens: two equal offers, and a result with one button', () => {
    const onPlace = vi.fn();
    const onBegin = vi.fn();
    const offer = renderPlacementOffer({ mode: nameItMode, lane: 'bass', onPlace, onBegin, onBack: vi.fn() });
    expect(offer.textContent).toContain('Show me what you know');
    expect(offer.querySelector('[data-testid=placement-lane]')!.textContent).toBe('Bass clef');
    const a = offer.querySelector('[data-testid=placement-start]') as HTMLElement;
    const b = offer.querySelector('[data-testid=placement-skip]') as HTMLElement;
    expect(a.className).toBe(b.className); // same style: neither is the default
    expect(offer.querySelector('[data-autofocus]')).toBeNull();
    (offer.querySelector('[data-testid=placement-skip]') as HTMLElement).click();
    expect(onBegin).toHaveBeenCalled();
    (offer.querySelector('[data-testid=placement-start]') as HTMLElement).click();
    expect(onPlace).toHaveBeenCalled();
    const onGo = vi.fn();
    const result = renderPlacementResult({ mode: nameItMode, run: placed(6), onGo });
    expect(result.querySelectorAll('button')).toHaveLength(1);
    (result.querySelector('[data-testid=placement-go]') as HTMLElement).click();
    expect(onGo).toHaveBeenCalled();
  });
});

describe('the placement round on the play shell', () => {
  const synth = { note: vi.fn() } as unknown as Synth;
  const pad = (a: string) => document.querySelector<HTMLButtonElement>(`[data-answer="${a}"]`)!;

  function setup() {
    const state = nameEngine.newStudent();
    const run = startPlacement(nameEngine, 'treble');
    const done = vi.fn();
    const host = {
      session: startSession(['treble'], MAX_ANSWERS, NAME_IT_MODE),
      state,
      now: () => T0,
      save: vi.fn(),
      announce: vi.fn(),
      muteButton: () => h('button', {}, 'mute'),
      quit: vi.fn(),
      finish: vi.fn(),
      stopSound: vi.fn(),
      placement: { run, done },
    };
    document.body.innerHTML = '';
    document.body.append(nameItPlay(host, synth).render());
    return { host, run, done, state };
  }

  beforeEach(() => vi.useFakeTimers());

  it('hides the progress bar: the round has no fixed length', async () => {
    setup();
    await Promise.resolve();
    expect(document.querySelector('.play')!.classList.contains('play--placement')).toBe(true);
  });

  it('asks the round with no new-note banner, and a right answer gets only a quiet thanks', async () => {
    const { run, host } = setup();
    await Promise.resolve();
    expect(run.pending).not.toBeNull();
    expect(document.querySelector('.banner')!.textContent).toContain('Tap ?');
    expect(document.querySelector('.banner')!.textContent).not.toContain('New note');
    pad(nameEngine.answerOf(run.pending!)).click();
    expect(document.querySelector('[data-testid=placement-ack]')!.textContent).toBe('Thanks!');
    expect(document.querySelector('.praise, .hint, [data-testid=continue], .pad__key--right, .pad__key--wrong')).toBeNull();
    expect(host.save).not.toHaveBeenCalled();
    expect(run.answers).toHaveLength(1);
    vi.advanceTimersByTime(PLACEMENT_ACK_MS);
    expect(document.querySelector('[data-testid=placement-ack]')).toBeNull();
    expect(run.pending).not.toBeNull();
  });

  it('a wrong answer and "?" look exactly the same: no red, no lesson, no Got it', async () => {
    const { run, host } = setup();
    await Promise.resolve();
    const right = nameEngine.answerOf(run.pending!);
    pad(right === 'A' ? 'B' : 'A').click();
    expect(document.querySelector('.hint, .lesson, [data-testid=continue], .pad__key--wrong, .pad__key--right')).toBeNull();
    vi.advanceTimersByTime(PLACEMENT_ACK_MS);
    pad('?').click();
    expect(document.querySelector('.hint, .lesson, [data-testid=continue], .pad__key--wrong, .pad__key--right')).toBeNull();
    expect(run.answers.map((a) => a.outcome)).toEqual(['wrong', 'idk']);
    expect(host.announce).not.toHaveBeenCalled();
    // The learner state is untouched until the round is applied.
    expect(Object.values(host.state.items).every((it) => it.n === 0)).toBe(true);
  });

  it('answers while the thanks is showing are ignored, and finishing calls done once', async () => {
    const { run, done } = setup();
    await Promise.resolve();
    for (let i = 0; i < MAX_ANSWERS + 3 && !run.done; i++) {
      pad('?').click();
      pad('?').click(); // a double tap during the thanks
      vi.advanceTimersByTime(PLACEMENT_ACK_MS);
    }
    expect(run.answers.length).toBeLessThanOrEqual(MAX_ANSWERS);
    expect(done).toHaveBeenCalledTimes(1);
  });
});
