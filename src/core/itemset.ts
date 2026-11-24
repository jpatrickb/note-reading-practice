// An item set is what a game mode gives the adaptive engine: its practice items, the order they are
// taught in, and the letter that answers each one. The engine (learner model, selection, unlocking,
// rewards) is shared by every mode; see `createEngine` in engine.ts.

import type { Letter } from './music';

export interface PracticeItem {
  id: string;
}

export interface ItemSet<I extends PracticeItem = PracticeItem> {
  /** Short, stable id (also used in storage keys). */
  readonly id: string;
  /**
   * Canonical item list. Progress codes depend on this ORDER: only ever APPEND new items, and bump
   * the codec version if that's impossible.
   */
  readonly items: readonly I[];
  /** Unlock lanes (e.g. clefs), each in teaching order. Every item belongs to exactly one lane. */
  readonly groups: Readonly<Record<string, readonly I[]>>;
  /** Items open from the start in each lane. Defaults to PARAMS.initialUnlock. */
  readonly initialUnlock?: number;
  groupOf(item: I): string;
  /** The letter that answers this item (what the A–G pad should receive). */
  answerOf(item: I): Letter;
  /** Look up an item; throws on unknown ids. */
  get(id: string): I;
}

export interface ItemSetSpec<I extends PracticeItem> {
  id: string;
  groups: Record<string, I[]>;
  initialUnlock?: number;
  groupOf(item: I): string;
  answerOf(item: I): Letter;
}

/** Build an item set. Canonical order = the lanes' items, lane by lane, in teaching order. */
export function defineItemSet<I extends PracticeItem>(spec: ItemSetSpec<I>): ItemSet<I> {
  const items = Object.values(spec.groups).flat();
  const byId = new Map(items.map((i) => [i.id, i]));
  if (byId.size !== items.length) throw new Error(`Duplicate item ids in set ${spec.id}`);
  return {
    id: spec.id,
    items,
    groups: spec.groups,
    initialUnlock: spec.initialUnlock,
    groupOf: spec.groupOf,
    answerOf: spec.answerOf,
    get(id: string): I {
      const item = byId.get(id);
      if (!item) throw new Error(`Unknown item: ${id}`);
      return item;
    },
  };
}
