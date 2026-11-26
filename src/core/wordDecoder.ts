// Word Decoder: a short phrase of notes on the staff spells a word; the kid names each note in turn.
//
// WHAT AN ENGINE ITEM IS: the (clef, word), with the typed word as its answer. The shared engine
// scores whole words (correct only if every note was right with no "?"; see `submission`), so a
// guess is almost never right and a wrong note makes the whole word wrong. The learner model must
// measure NOTE READING, not memorized words, so three things keep a word from being farmed:
//  1. A word opens only once every letter in it is a silver Name It note in that clef (`canUnlock`,
//     `wordReadable`): the real reading evidence lives in Name It, and a kid can't unlock words ahead
//     of it by memorizing.
//  2. The notes are drawn fresh on every play from the Name It notes the kid has at silver
//     (`chooseNotes`): a letter can sit in any octave, but consecutive notes stay close (small jumps)
//     until the kid earns gold in Name It.
//  3. Rewards come only from the shared engine, once per word (silver, then gold on another day);
//     replaying a mastered word earns nothing (D12), so repeating a known word cannot farm anything.
//
// The Name It evidence is a module-level source that fails closed (see `setNameItSource`); the play screen sets it and clears it on dispose.
// Name It's learner model is only READ here (silver notes per clef); it is never changed.

import { PARAMS, type StudentState, createEngine, level } from './engine';
import { defineItemSet } from './itemset';
import { ITEMS } from './items';
import { type Clef, type Letter, type Note, staffPosition } from './music';
import type { SessionMode } from './session';
import { WORD_LISTS } from './words';

export interface WordItem {
  id: string;
  clef: Clef;
  /** Upper-case letters A-G. */
  word: string;
}

export const wordId = (clef: Clef, word: string) => `word:${clef}:${word}`;
export const isWordItemId = (id: string) => id.startsWith('word:');

/**
 * The CANONICAL order of Word Decoder items: progress codes store one record per item by its index
 * here. APPEND-ONLY: never reorder or remove (tests/canonical-order.test.ts pins every index). The
 * word lists in words.ts are the teaching order and may be edited freely; new words get appended here.
 */
export const CANONICAL_ORDER: readonly string[] = [
  // treble
  'word:treble:ACE', 'word:treble:AGE', 'word:treble:FACE', 'word:treble:CAFE', 'word:treble:CAB',
  'word:treble:BED', 'word:treble:FED', 'word:treble:BAG', 'word:treble:BEE', 'word:treble:EGG',
  'word:treble:ADD', 'word:treble:BEAD', 'word:treble:BEEF', 'word:treble:FADE', 'word:treble:EDGE',
  'word:treble:BADGE', 'word:treble:FACED', 'word:treble:DECADE', 'word:treble:FACADE',
  'word:treble:CABBAGE', 'word:treble:BAGGAGE',
  // bass
  'word:bass:AGED', 'word:bass:FED', 'word:bass:ADD', 'word:bass:FADE', 'word:bass:EDGED',
  'word:bass:FEED', 'word:bass:FADED', 'word:bass:ADDED', 'word:bass:ACE', 'word:bass:FACE',
  'word:bass:BAGGED', 'word:bass:BADGE',
];

const build = (clef: Clef): WordItem[] => WORD_LISTS[clef].map((word) => ({ id: wordId(clef, word), clef, word }));

// ───────────────────── what the kid has learned in Name It (read only) ─────────────────────

/** Silver notes a clef needs in Name It before Word Decoder is offered for it. */
export const SILVER_NEEDED = 5;

/** Where Word Decoder reads the Name It learner model from; the app sets it when a play starts. */
let nameItSource: (() => StudentState | undefined) | null = null;
export function setNameItSource(source: (() => StudentState | undefined) | null): void {
  nameItSource = source;
}
/** Clear the source, but only if it is still `source` (a newer play screen may have set its own). */
export function clearNameItSource(source: () => StudentState | undefined): void {
  if (nameItSource === source) nameItSource = null;
}

const isSilver = (name: StudentState, id: string) => {
  const l = level(name.items[id]!);
  return l === 'silver' || l === 'gold';
};

/** The Name It notes of a clef the kid has at silver or better, in teaching order. */
export function silverNotes(name: StudentState | undefined, clef: Clef): Note[] {
  if (!name) return [];
  return ITEMS.filter((i) => i.clef === clef && name.items[i.id] && isSilver(name, i.id)).map((i) => i.note);
}

/**
 * Can the kid play Word Decoder in this clef yet? They need SILVER_NEEDED silver notes AND the words
 * open from the start (`newStudent` opens them without asking `canUnlock`) must be readable from
 * them, so no word is ever offered with a note the kid has not earned.
 */
export const clefReady = (name: StudentState | undefined, clef: Clef) =>
  silverNotes(name, clef).length >= SILVER_NEEDED && WORD_SET.groups[clef]!.slice(0, PARAMS.initialUnlock).every((i) => wordReadable(name, i));

/** Does every letter of the word have a silver Name It note in its clef? */
export function wordReadable(name: StudentState | undefined, item: WordItem): boolean {
  const have = new Set<Letter>(silverNotes(name, item.clef).map((n) => n.letter));
  return [...item.word].every((l) => have.has(l as Letter));
}

export const WORD_SET = defineItemSet<WordItem, string>({
  id: 'words',
  groups: { treble: build('treble'), bass: build('bass') },
  order: CANONICAL_ORDER,
  groupOf: (i) => i.clef,
  answerOf: (i) => i.word,
  // The availability gate. It fails CLOSED: with no Name It source set, no word opens.
  canUnlock: (item) => nameItSource !== null && wordReadable(nameItSource(), item),
  // Response time is judged per note, so word length does not skew the speed baseline or silver's fluency check.
  rtUnits: (i) => i.word.length,
});

export const wordItem = (id: string) => WORD_SET.get(id);
export const WORD_ITEMS = WORD_SET.items;
export const wordEngine = createEngine(WORD_SET);
export const WORD_MODE: SessionMode<string> = { engine: wordEngine };

// ───────────────────────────── playing a word ─────────────────────────────

/** The Name It notes of a clef that are gold, as a share (0..1) of all that clef's Name It notes: how advanced the kid is there. */
export function goldShare(name: StudentState | undefined, clef: Clef): number {
  if (!name) return 0;
  const all = ITEMS.filter((i) => i.clef === clef);
  const gold = all.filter((i) => name.items[i.id] && level(name.items[i.id]!) === 'gold').length;
  return all.length === 0 ? 0 : gold / all.length;
}

/** Chance that a note takes a bigger leap instead of the closest note: 0 with no gold, at most 0.5 with all gold. */
export const leapChance = (share: number) => share * 0.5;
/** The biggest leap (in staff steps) a bigger-leap note may take: 3 steps with no gold, up to 7 (an octave) with all gold. */
export const leapMax = (share: number) => 3 + Math.round(share * 4);
/** The middle line of the staff (position 4): the first note of a word is drawn near it. */
const MIDDLE = 4;

/** How far from the middle line (in staff steps) the first note of a word may be. */
const START_REACH = 3;
/** Paths whose biggest jump is within this many steps of the smallest possible are all equally likely. */
const SLACK = 1;

/**
 * The notes to draw for a word: one per letter, each from the Name It notes of that letter the kid
 * has at silver (any octave). A note the kid has not earned is NEVER drawn: a letter with no silver
 * note throws (the gate and `clefReady` make that unreachable for any word that is offered).
 *
 * SMALL JUMPS WITH VARIETY (issue #88; amends D161):
 *  1. The first note is any silver note of the first letter within START_REACH steps of the middle
 *     line (or the nearest one if none is that close).
 *  2. A dynamic program over each letter's silver choices finds the smallest possible BIGGEST jump
 *     between consecutive notes. Every path whose biggest jump is within SLACK steps of that
 *     minimum is equally likely, so a beginner reads gentle melodies that still differ from play to play.
 *  3. As the kid advances (`goldShare`: the share of the clef's Name It notes at gold), a note
 *     sometimes (`leapChance`) takes a bigger leap instead, to a silver note of its letter within
 *     `leapMax` steps of both neighbours, so reading across the staff is still practiced. (Gold
 *     arrives late and a small share rarely fires; a leap may also pick the same note again.)
 * Deterministic for a seeded `rng`.
 */
export function chooseNotes(item: WordItem, name: StudentState | undefined, rng: () => number): Note[] {
  const silver = silverNotes(name, item.clef);
  const pos = (n: Note) => staffPosition(n, item.clef);
  const pools = [...item.word].map((letter) => {
    const pool = silver.filter((n) => n.letter === letter);
    if (pool.length === 0) throw new Error(`No silver ${item.clef} note for ${letter} in ${item.word}`);
    return pool;
  });
  const near = pools[0]!.filter((n) => Math.abs(pos(n) - MIDDLE) <= START_REACH);
  const best = Math.min(...pools[0]!.map((n) => Math.abs(pos(n) - MIDDLE)));
  pools[0] = near.length > 0 ? near : pools[0]!.filter((n) => Math.abs(pos(n) - MIDDLE) === best);

  // minWorst[i][k]: the smallest possible biggest jump over the notes from pools[i][k] to the end
  const minWorst: number[][] = pools.map((p) => p.map(() => 0));
  for (let i = pools.length - 2; i >= 0; i--) {
    pools[i]!.forEach((a, k) => {
      minWorst[i]![k] = Math.min(...pools[i + 1]!.map((b, j) => Math.max(Math.abs(pos(a) - pos(b)), minWorst[i + 1]![j]!)));
    });
  }
  const limit = Math.min(...minWorst[0]!) + SLACK;

  // every path whose biggest jump is within the limit (word lengths and pools keep this small)
  const paths: Note[][] = [];
  const walk = (i: number, path: Note[]): void => {
    if (i === pools.length) {
      paths.push(path);
      return;
    }
    for (const n of pools[i]!) {
      if (i === 0 || Math.abs(pos(n) - pos(path[i - 1]!)) <= limit) walk(i + 1, [...path, n]);
    }
  };
  walk(0, []);
  const out = paths[Math.floor(rng() * paths.length)]!;

  const share = goldShare(name, item.clef);
  const reach = leapMax(share);
  for (let i = 1; i < out.length; i++) {
    if (rng() >= leapChance(share)) continue;
    const ok = pools[i]!.filter((n) => Math.abs(pos(n) - pos(out[i - 1]!)) <= reach && (i + 1 >= out.length || Math.abs(pos(n) - pos(out[i + 1]!)) <= reach));
    if (ok.length > 0) out[i] = ok[Math.floor(rng() * ok.length)]!;
  }
  return out;
}

/** How the kid answered one note: right, wrong (with the letter they chose), or "?". */
export type NoteResult = { mark: 'right' } | { mark: 'wrong'; letter: string } | { mark: 'idk' };

/**
 * What the shell submits for a finished word (the engine does the grading): the word itself if every
 * note was right; null ("I don't know") if any "?" and nothing wrong; otherwise what was typed,
 * which can never equal the word. A wrong note outweighs a "?" (a miss is a miss).
 */
export function submission(word: string, results: readonly NoteResult[]): string | null {
  if (results.some((r) => r.mark === 'wrong')) {
    return results.map((r) => (r.mark === 'wrong' ? r.letter : r.mark === 'idk' ? '?' : '')).map((x, i) => x || word[i]).join('');
  }
  return results.some((r) => r.mark === 'idk') ? null : word;
}
