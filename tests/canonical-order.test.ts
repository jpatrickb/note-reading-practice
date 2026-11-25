// Golden test for the canonical item order (what progress codes index by). The lists below are
// FROZEN COPIES, deliberately not imported from src: a code saved today must decode to the same items
// forever. If one of these tests fails, DON'T update the list: fix the source so existing indices
// stay put, and only APPEND new ids at the end of the list (and of the mode's CANONICAL_ORDER).

import { describe, expect, it } from 'vitest';
import { decodeProfile, encodeProfile } from '../src/core/codec';
import { createEngine, recall } from '../src/core/engine';
import { defineItemSet } from '../src/core/itemset';
import { NAME_IT, TEACHING_ORDER } from '../src/core/items';
import { LETTER_MATH } from '../src/core/letters';
import type { CoreMode } from '../src/core/modes';
import { WORD_SET } from '../src/core/wordDecoder';
import { T0 } from './helpers';

/** Name It: index 0..33 (the original 26, then the #24 ledger notes). */
const NAME_IT_GOLDEN = [
  'name:treble:G4', 'name:treble:C4', 'name:treble:A4', 'name:treble:F4',
  'name:treble:E4', 'name:treble:B4', 'name:treble:D4', 'name:treble:C5',
  'name:treble:D5', 'name:treble:E5', 'name:treble:F5', 'name:treble:G5',
  'name:treble:A5', 'name:bass:F3', 'name:bass:G3', 'name:bass:E3',
  'name:bass:A3', 'name:bass:D3', 'name:bass:C3', 'name:bass:B2',
  'name:bass:G2', 'name:bass:A2', 'name:bass:C4', 'name:bass:B3',
  'name:bass:F2', 'name:bass:E2',
  // appended by #24 (two ledger lines)
  'name:treble:B5', 'name:treble:C6', 'name:treble:B3', 'name:treble:A3',
  'name:bass:D4', 'name:bass:E4', 'name:bass:D2', 'name:bass:C2',
];

/** Letter Math: index 0..125 (18 rungs of 7). */
const LETTER_MATH_GOLDEN = [
  'lm:after:C', 'lm:after:E', 'lm:after:A', 'lm:after:G', 'lm:after:D', 'lm:after:F', 'lm:after:B',
  'lm:before:D', 'lm:before:G', 'lm:before:B', 'lm:before:A', 'lm:before:E', 'lm:before:F', 'lm:before:C',
  'lm:skipUp:C', 'lm:skipUp:E', 'lm:skipUp:G', 'lm:skipUp:B', 'lm:skipUp:D', 'lm:skipUp:F', 'lm:skipUp:A',
  'lm:skipDown:C', 'lm:skipDown:A', 'lm:skipDown:F', 'lm:skipDown:D', 'lm:skipDown:B', 'lm:skipDown:G', 'lm:skipDown:E',
  'lm:up2:C', 'lm:up2:G', 'lm:up2:D', 'lm:up2:A', 'lm:up2:E', 'lm:up2:B', 'lm:up2:F',
  'lm:down2:C', 'lm:down2:G', 'lm:down2:D', 'lm:down2:A', 'lm:down2:E', 'lm:down2:B', 'lm:down2:F',
  'lm:up3:C', 'lm:up3:G', 'lm:up3:D', 'lm:up3:A', 'lm:up3:E', 'lm:up3:B', 'lm:up3:F',
  'lm:down3:C', 'lm:down3:G', 'lm:down3:D', 'lm:down3:A', 'lm:down3:E', 'lm:down3:B', 'lm:down3:F',
  'lm:up8:C', 'lm:up8:G', 'lm:up8:D', 'lm:up8:A', 'lm:up8:E', 'lm:up8:B', 'lm:up8:F',
  'lm:down8:C', 'lm:down8:G', 'lm:down8:D', 'lm:down8:A', 'lm:down8:E', 'lm:down8:B', 'lm:down8:F',
  'lm:up5:C', 'lm:up5:G', 'lm:up5:D', 'lm:up5:A', 'lm:up5:E', 'lm:up5:B', 'lm:up5:F',
  'lm:down5:C', 'lm:down5:G', 'lm:down5:D', 'lm:down5:A', 'lm:down5:E', 'lm:down5:B', 'lm:down5:F',
  'lm:up4:C', 'lm:up4:G', 'lm:up4:D', 'lm:up4:A', 'lm:up4:E', 'lm:up4:B', 'lm:up4:F',
  'lm:down4:C', 'lm:down4:G', 'lm:down4:D', 'lm:down4:A', 'lm:down4:E', 'lm:down4:B', 'lm:down4:F',
  'lm:up6:C', 'lm:up6:G', 'lm:up6:D', 'lm:up6:A', 'lm:up6:E', 'lm:up6:B', 'lm:up6:F',
  'lm:down6:C', 'lm:down6:G', 'lm:down6:D', 'lm:down6:A', 'lm:down6:E', 'lm:down6:B', 'lm:down6:F',
  'lm:up7:C', 'lm:up7:G', 'lm:up7:D', 'lm:up7:A', 'lm:up7:E', 'lm:up7:B', 'lm:up7:F',
  'lm:down7:C', 'lm:down7:G', 'lm:down7:D', 'lm:down7:A', 'lm:down7:E', 'lm:down7:B', 'lm:down7:F',
];

/** Word Decoder: index 0..33 (22 treble words, then 12 bass words). */
const WORD_DECODER_GOLDEN = [
  // treble
  'word:treble:ACE', 'word:treble:AGE', 'word:treble:FACE', 'word:treble:CAFE', 'word:treble:CAB',
  'word:treble:BED', 'word:treble:FED', 'word:treble:BAG', 'word:treble:BEE', 'word:treble:EGG',
  'word:treble:ADD', 'word:treble:BEAD', 'word:treble:BEEF', 'word:treble:FADE', 'word:treble:EDGE',
  'word:treble:BADGE', 'word:treble:DECAF', 'word:treble:FACED', 'word:treble:DECADE', 'word:treble:FACADE',
  'word:treble:CABBAGE', 'word:treble:BAGGAGE',
  // bass
  'word:bass:AGED', 'word:bass:FED', 'word:bass:ADD', 'word:bass:FADE', 'word:bass:EDGED',
  'word:bass:FEED', 'word:bass:FADED', 'word:bass:ADDED', 'word:bass:ACE', 'word:bass:FACE',
  'word:bass:BAGGED', 'word:bass:BADGE',
];

describe('canonical item order is pinned', () => {
  it('Name It: every item keeps its index', () => {
    expect(NAME_IT.items.map((i) => i.id)).toEqual(NAME_IT_GOLDEN);
    NAME_IT_GOLDEN.forEach((id, idx) => expect(NAME_IT.items.indexOf(NAME_IT.get(id)), id).toBe(idx));
  });

  it('Letter Math: every item keeps its index', () => {
    expect(LETTER_MATH.items.map((i) => i.id)).toEqual(LETTER_MATH_GOLDEN);
    LETTER_MATH_GOLDEN.forEach((id, idx) => expect(LETTER_MATH.items.indexOf(LETTER_MATH.get(id)), id).toBe(idx));
  });

  it('Word Decoder: every item keeps its index (and the word lists may be reordered freely)', () => {
    expect(WORD_SET.items.map((i) => i.id)).toEqual(WORD_DECODER_GOLDEN);
    WORD_DECODER_GOLDEN.forEach((id, idx) => expect(WORD_SET.items.indexOf(WORD_SET.get(id)), id).toBe(idx));
    // The teaching order is a different list: here the first treble words are not the first indices.
    expect(WORD_SET.groups.treble!.map((i) => i.id)).not.toEqual(WORD_DECODER_GOLDEN.slice(0, 22));
  });

  it('the canonical order is independent of the teaching order', () => {
    // Teaching order is per lane and editable; the canonical list is its own thing.
    expect(NAME_IT.groups.treble!.map((i) => i.id.split(':')[2])).toEqual(TEACHING_ORDER.treble);
    expect(NAME_IT.items.slice(0, 13).map((i) => i.id)).toEqual(NAME_IT.groups.treble!.slice(0, 13).map((i) => i.id));
  });
});

/** A small two-lane set, optionally with `extra` teaching entries spliced into the middle of lane a. */
function makeSet(extra: string[], order?: string[]) {
  const lane = (name: string, ids: string[]) => ids.map((n) => ({ id: `${name}:${n}` }));
  const a = ['1', '2', '3'];
  a.splice(1, 0, ...extra);
  return defineItemSet({
    id: 'tiny',
    groups: { a: lane('a', a), b: lane('b', ['1', '2', '3']) },
    ...(order ? { order } : {}),
    groupOf: (i) => i.id[0]!,
    answerOf: () => 'C',
  });
}
const BASE_ORDER = ['a:1', 'a:2', 'a:3', 'b:1', 'b:2', 'b:3'];

describe('growing a set (the reason `order` exists)', () => {
  it('appending to the FIRST lane via `order` leaves every existing index unchanged', () => {
    const before = makeSet([], BASE_ORDER);
    const after = makeSet(['x'], [...BASE_ORDER, 'a:x']);
    BASE_ORDER.forEach((id, idx) => {
      expect(before.items[idx]!.id).toBe(id);
      expect(after.items[idx]!.id, id).toBe(id);
    });
    expect(after.items.at(-1)!.id).toBe('a:x');
    // ...while teaching it in the middle of lane a.
    expect(after.groups.a!.map((i) => i.id)).toEqual(['a:1', 'a:x', 'a:2', 'a:3']);
  });

  it('without `order`, the same change would shift every later lane (the bug `order` prevents)', () => {
    const before = makeSet([]);
    const after = makeSet(['x']);
    expect(before.items.map((i) => i.id).indexOf('b:1')).toBe(3);
    expect(after.items.map((i) => i.id).indexOf('b:1')).toBe(4);
  });

  it('a saved progress code still decodes onto the same items after a lane grows', () => {
    const modeOf = (set: ReturnType<typeof makeSet>): CoreMode => ({ id: 'tiny', tag: 77, engine: createEngine(set) });
    const old = modeOf(makeSet([], BASE_ORDER));
    const grown = modeOf(makeSet(['x'], [...BASE_ORDER, 'a:x']));
    const state = old.engine.newStudent();
    for (const id of ['a:1', 'b:1', 'b:2']) {
      for (let k = 0; k < 4; k++) old.engine.recordAnswer(state, id, 'correct', 'C', 1500, T0 + k * 1000);
    }
    const code = encodeProfile({ tiny: state }, T0 + 5000, [old]);
    const decoded = decodeProfile(code, T0 + 5000, [grown]).tiny!;
    for (const id of BASE_ORDER) {
      const was = state.items[id]!;
      const now = decoded.items[id]!;
      expect([id, now.unlocked, now.best, now.n, now.c]).toEqual([id, was.unlocked, was.best, was.n, was.c]);
      expect(Math.abs(recall(now, T0 + 5000) - recall(was, T0 + 5000)), id).toBeLessThan(0.05);
    }
    expect(decoded.items['a:x']!.n).toBe(0);
  });

  it('refuses a set whose order is not exactly its items (so a new item can’t silently shift others)', () => {
    expect(() => makeSet(['x'], BASE_ORDER)).toThrow(/a:x is missing from the order/);
    expect(() => makeSet([], [...BASE_ORDER, 'a:nope'])).toThrow(/unknown item a:nope/);
    expect(() => makeSet([], [...BASE_ORDER, 'a:1'])).toThrow(/Duplicate ids in the order/);
  });
});
