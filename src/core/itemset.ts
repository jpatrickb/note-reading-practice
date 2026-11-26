// An item set is what a game mode gives the adaptive engine: its practice items, the order they are
// taught in, and what answers each one. The engine (learner model, selection, unlocking, rewards) is
// shared by every mode; see `createEngine` in engine.ts.
//
// Two orders, deliberately separate:
//   - TEACHING order: each lane's list in `groups`. Free to edit, reorder and extend.
//   - CANONICAL order: `items` (and `order`). Progress codes store one record per item by its index
//     here, so it is APPEND-ONLY: never reorder or remove, only add at the end. Pinned by
//     tests/canonical-order.test.ts.

import type { Pacing } from './engine';
import type { Letter } from './music';

export interface PracticeItem {
  id: string;
}

/**
 * `A` is what the kid answers with: a letter by default, but a mode can answer with any string
 * (a piano key, a staff position, "step"/"skip"…). It is only ever compared and used in keys, so
 * it must be a string.
 */
export interface ItemSet<I extends PracticeItem = PracticeItem, A extends string = Letter> {
  /** Short, stable id (also used in storage keys). */
  readonly id: string;
  /**
   * Canonical item list (see the note at the top of this file): the spec's `order`, or the lanes
   * flattened when there is none. Progress codes depend on this ORDER.
   */
  readonly items: readonly I[];
  /** Unlock lanes (e.g. clefs), each in teaching order. Every item belongs to exactly one lane. */
  readonly groups: Readonly<Record<string, readonly I[]>>;
  /**
   * Retired items: still in `items` (so their canonical index, and every saved progress code, stays
   * valid) but in no lane, so they are never asked, unlocked or counted toward unlocking.
   */
  readonly retired: readonly I[];
  /** Items open from the start in each lane. Defaults to PARAMS.initialUnlock. */
  readonly initialUnlock?: number;
  /**
   * Items with the same skill predict each other (knowing "after C" and "after E" predicts
   * "after D"), so a new item's starting estimate is transferred from them. Default: none.
   */
  skillOf?(item: I): string;
  /** Per-set tuning of the fast track (see PACING). */
  readonly pacing?: Partial<Pacing>;
  groupOf(item: I): string;
  /**
   * An outside condition on opening an item (its turn in the lane has come, but is the kid ready?):
   * Word Decoder opens a word only once every letter is a silver Name It note. Return false to hold
   * it (and so the rest of the lane) closed. Default: no condition. Must be cheap and pure.
   */
  canUnlock?(item: I): boolean;
  /**
   * How many "units" of work one answer to this item covers (default 1). The engine divides the
   * response time by it, so the speed baseline and the silver fluency check compare like with like
   * (Word Decoder: a word's time per note, so a 7-letter word is not slower than a 3-letter one).
   */
  rtUnits?(item: I): number;
  /**
   * The answer this item is taught with. It is also the item's "answer key": the engine discourages
   * asking two items with the same one in a row, so one button can't carry a streak.
   */
  answerOf(item: I): A;
  /**
   * Is `answer` right? Default: `answer === answerOf(item)`. Supply it only when several answers are
   * valid (the black key C♯4 can be answered "C♯" or "D♭").
   */
  isCorrect?(item: I, answer: A): boolean;
  /** Look up an item; throws on unknown ids. */
  get(id: string): I;
}

export interface ItemSetSpec<I extends PracticeItem, A extends string = Letter> {
  id: string;
  groups: Record<string, I[]>;
  /** Items taken out of play: they keep their place in `order` but belong to no lane (see ItemSet.retired). */
  retired?: I[];
  /**
   * The canonical item ids, in progress-code order. Must list every item exactly once. Omit it and
   * the canonical order is the lanes flattened, which is only safe if no lane ever grows: appending
   * to the first lane would shift every later lane's indices. Every set that ships should give one.
   */
  order?: readonly string[];
  initialUnlock?: number;
  skillOf?(item: I): string;
  pacing?: Partial<Pacing>;
  groupOf(item: I): string;
  canUnlock?(item: I): boolean;
  rtUnits?(item: I): number;
  answerOf(item: I): A;
  isCorrect?(item: I, answer: A): boolean;
}

/** Build an item set; throws if ids repeat, or `order` isn't exactly the set of items. */
export function defineItemSet<I extends PracticeItem, A extends string = Letter>(spec: ItemSetSpec<I, A>): ItemSet<I, A> {
  const active = Object.values(spec.groups).flat();
  const retired = spec.retired ?? [];
  const flat = [...active, ...retired];
  const byId = new Map(flat.map((i) => [i.id, i]));
  if (byId.size !== flat.length) throw new Error(`Duplicate item ids in set ${spec.id}`);
  let items = flat;
  if (spec.order) {
    const listed = new Set(spec.order);
    if (listed.size !== spec.order.length) throw new Error(`Duplicate ids in the order of set ${spec.id}`);
    const unknown = spec.order.find((id) => !byId.has(id));
    if (unknown !== undefined) throw new Error(`Order of set ${spec.id} lists unknown item ${unknown}`);
    const missing = flat.find((i) => !listed.has(i.id));
    if (missing) throw new Error(`Item ${missing.id} is missing from the order of set ${spec.id}: append it`);
    items = spec.order.map((id) => byId.get(id)!);
  }
  return {
    id: spec.id,
    items,
    groups: spec.groups,
    retired,
    initialUnlock: spec.initialUnlock,
    skillOf: spec.skillOf,
    pacing: spec.pacing,
    groupOf: spec.groupOf,
    canUnlock: spec.canUnlock,
    rtUnits: spec.rtUnits,
    answerOf: spec.answerOf,
    isCorrect: spec.isCorrect,
    get(id: string): I {
      const item = byId.get(id);
      if (!item) throw new Error(`Unknown item: ${id}`);
      return item;
    },
  };
}
