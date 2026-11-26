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
//     (`chooseNotes`), so the picture is never the same twice and a letter can sit in any octave.
//  3. Rewards come only from the shared engine, once per word (silver, then gold on another day);
//     replaying a mastered word earns nothing (D12), so repeating a known word cannot farm anything.
//
// The Name It evidence is a module-level source that fails closed (see `setNameItSource`); the play screen sets it and clears it on dispose.
// Name It's learner model is only READ here (silver notes per clef); it is never changed.

import { PARAMS, type StudentState, createEngine, level } from './engine';
import { defineItemSet } from './itemset';
import { ITEMS } from './items';
import { type Clef, type Letter, type Note, noteId } from './music';
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

/**
 * The notes to draw for a word: one per letter, each from the Name It notes of that letter the kid
 * has at silver (any octave: they vary from play to play), and a different note for a repeated letter
 * when the kid has more than one. A note the kid has not earned is NEVER drawn: a letter with no silver
 * note throws (the gate and `clefReady` make that unreachable for any word that is offered).
 */
export function chooseNotes(item: WordItem, name: StudentState | undefined, rng: () => number): Note[] {
  const silver = silverNotes(name, item.clef);
  const used = new Set<string>();
  return [...item.word].map((letter) => {
    const pool = silver.filter((n) => n.letter === letter);
    if (pool.length === 0) throw new Error(`No silver ${item.clef} note for ${letter} in ${item.word}`);
    const fresh = pool.filter((n) => !used.has(noteId(n)));
    const from = fresh.length > 0 ? fresh : pool;
    const note = from[Math.floor(rng() * from.length)]!;
    used.add(noteId(note));
    return note;
  });
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
