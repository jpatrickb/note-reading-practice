// The game modes the home screen offers, in the order they are shown within each group.
//
// ADDING A MODE: write its `defineMode({...})` in its own file and list it in MODES below (one
// import, one line). Its learner model is registered separately in src/core/modes.ts (CORE_MODES),
// because that one is permanent: the tag is written into every progress code. CONTRIBUTING.md,
// "Adding a game mode", has the steps.

import { nameEngine } from '../core/engine';
import { DEFAULT_MODE } from '../core/storage';
import { letterMathMode } from './letterMath';
import { type UiMode, defineMode } from './mode';
import { nameItMode } from './nameIt';
import { wordDecoderMode } from './wordDecoder';

export const MODES: readonly UiMode[] = [nameItMode, letterMathMode, wordDecoderMode];

/**
 * A mode that is always locked. It exists only behind `?debug`, so the e2e suite can prove that a
 * locked mode is shown with its reason (and cannot be started) before any real mode is ever locked.
 * Its learner model is not in CORE_MODES: nothing about it is ever played, saved or put in a code.
 */
export const lockedDemoMode: UiMode = defineMode({
  id: 'demo-locked',
  title: 'Locked demo',
  icon: 'lock',
  blurb: 'Only for testing locked cards',
  group: 'music',
  core: { id: 'demo-locked', tag: 255, engine: nameEngine },
  words: { item: 'item', medal: '', encourage: '' },
  createPlay: () => {
    throw new Error('The locked demo mode cannot be played');
  },
  renderMap: () => document.createElement('div'),
  availability: () => ({ ok: false, reason: 'Learn 7 notes in Name It first!' }),
});

/** The modes this session offers. `debug` adds the test-only locked demo. */
export function registeredModes(debug = false): readonly UiMode[] {
  return debug ? [...MODES, lockedDemoMode] : MODES;
}

/** Look a mode up by id; an unknown id (an old save, a removed mode) falls back to Name It. */
export function modeById(modes: readonly UiMode[], id: string | undefined): UiMode {
  return modes.find((m) => m.id === id) ?? modes.find((m) => m.id === DEFAULT_MODE) ?? modes[0]!;
}
