// The rules around the placement round that are not the search itself: which lane may be placed,
// whether a mode can offer it at all, and what the result says. Pure; the UI screens call this.
// See placement.ts for the search. Placement answers are evidence, never play (D12).

import type { Engine, StudentState } from './engine';
import { type PlacementRun, canPlace } from './placement';

/** Fewer different answers than this and one lucky guess per level is too likely (D63): no placement. */
export const MIN_PLACEMENT_ANSWERS = 5;

/** How many different answers the lane's items have. */
export function answerSpace(engine: Engine, group: string): number {
  return new Set((engine.set.groups[group] ?? []).filter((i) => engine.set.placeable?.(i) ?? true).map((i) => engine.answerOf(i.id))).size;
}

/**
 * The lane to place for a session on `groups`: the first one that is fresh and has enough answers,
 * or null (no offer). A lane with any progress is never returned, so placement cannot overwrite it.
 */
export function placementLane(engine: Engine, state: StudentState | undefined, groups: readonly string[]): string | null {
  if (!state) return null;
  return groups.find((g) => answerSpace(engine, g) >= MIN_PLACEMENT_ANSWERS && canPlace(engine, state, g)) ?? null;
}

/** The item the kid starts at: the first one not yet known (the last one, if all are known). */
export function startingItem(run: PlacementRun): string {
  return run.ids[Math.min(run.lo, run.ids.length - 1)]!;
}

export interface PlacementWords {
  /** "keys", "squares"...: what fills in; '' for "progress". */
  medal: string;
  /** The mode's sentence for the starting item. */
  line: (itemId: string) => string;
}

/** The friendly result. Nothing in it is a score. */
export function resultText(run: PlacementRun, words: PlacementWords): { title: string; body: string } {
  const fills = words.medal ? `Your mastery ${words.medal}s fill in as you play.` : 'Your progress fills in as you play.';
  if (run.lo === 0) return { title: 'Thanks for showing me!', body: `Let's start with the first ones. ${fills}` };
  return { title: 'Thanks for showing me!', body: `${words.line(startingItem(run))} ${fills}` };
}
