// Word Decoder: the word list, the availability gate, the notes drawn for a word, the per-word
// outcome rules, and the learner simulations (guesser, masher, honest learner, memorizer).

import { afterEach, describe, expect, it } from 'vitest';
import { PARAMS, type StudentState, level, newStudent, recall } from '../src/core/engine';
import { ITEMS, TEACHING_ORDER } from '../src/core/items';
import { LETTERS, type Letter, noteId } from '../src/core/music';
import { SESSION_LENGTH, isFinished, nextQuestion, startSession, submit } from '../src/core/session';
import {
  CANONICAL_ORDER,
  SILVER_NEEDED,
  WORD_ITEMS,
  WORD_MODE,
  WORD_SET,
  chooseNotes,
  clearNameItSource,
  clefReady,
  setNameItSource,
  silverNotes,
  submission,
  wordEngine,
  wordItem,
  wordReadable,
} from '../src/core/wordDecoder';
import { WORD_LISTS } from '../src/core/words';
import { T0, seededRng } from './helpers';
import { type Policy, honestLearner, masher, simulate } from './sim';

afterEach(() => setNameItSource(null));

const CLEFS = ['treble', 'bass'] as const;
const ALL_WORDS = [...new Set([...WORD_LISTS.treble, ...WORD_LISTS.bass])];

/** A Name It learner model with these notes at silver (made up; no real student data). */
function nameWith(ids: readonly string[]): StudentState {
  const s = newStudent();
  for (const id of ids) {
    const it = s.items[id]!;
    it.unlocked = true;
    it.best = 1;
    it.n = 6;
    it.c = 6;
  }
  return s;
}
const firstTaught = (clef: 'treble' | 'bass', n: number) => TEACHING_ORDER[clef].slice(0, n).map((id) => `name:${clef}:${id}`);
const everySilver = () => nameWith(ITEMS.map((i) => i.id));

// ───────────────────────────── the word list ─────────────────────────────

describe('the word list', () => {
  it('uses only the letters A-G, 3 to 7 letters, with no duplicates in a lane', () => {
    for (const clef of CLEFS) {
      const words = WORD_LISTS[clef];
      expect(new Set(words).size, clef).toBe(words.length);
      for (const w of words) {
        expect(w, w).toMatch(/^[A-G]{3,7}$/);
      }
    }
  });

  it('has at least 25 different words, from short to long', () => {
    expect(ALL_WORDS.length).toBeGreaterThanOrEqual(25);
    expect(Math.min(...ALL_WORDS.map((w) => w.length))).toBe(3);
    expect(Math.max(...ALL_WORDS.map((w) => w.length))).toBe(7);
  });

  it('keeps clear of anything unkind, rude or easy to tease', () => {
    const banned = ['BAD', 'DEAF', 'DEAD', 'FAG', 'GAG', 'BEG', 'FAD', 'DEB', 'ABBA'];
    for (const w of ALL_WORDS) expect(banned, w).not.toContain(w);
  });

  it('teaches short words first in each clef, and the longest last', () => {
    for (const clef of CLEFS) {
      const lengths = WORD_LISTS[clef].map((w) => w.length);
      expect(lengths[0], clef).toBe(3);
      expect(Math.max(...lengths.slice(0, 3)), clef).toBeLessThanOrEqual(4);
      expect(Math.max(...lengths.slice(0, 5)), clef).toBeLessThanOrEqual(4);
      expect(Math.max(...lengths.slice(-2)), clef).toBe(Math.max(...lengths));
    }
  });

  it('opens with three different words that use only the first five notes Name It teaches', () => {
    for (const clef of CLEFS) {
      const first = WORD_SET.groups[clef]!.slice(0, 3);
      const taught = new Set(TEACHING_ORDER[clef].slice(0, 5).map((id) => id[0]));
      for (const item of first) {
        expect(new Set(item.word).size, item.word).toBe(item.word.length); // no letter twice
        for (const l of item.word) expect(taught.has(l), `${clef} ${item.word}`).toBe(true);
      }
      expect(new Set(first.map((i) => i.word)).size).toBe(3);
    }
  });

  it('ids are word:<clef>:<WORD>, one per word per clef, and every id is in the canonical order', () => {
    expect(WORD_ITEMS.length).toBe(WORD_LISTS.treble.length + WORD_LISTS.bass.length);
    expect(new Set(CANONICAL_ORDER).size).toBe(CANONICAL_ORDER.length);
    for (const item of WORD_ITEMS) expect(item.id).toBe(`word:${item.clef}:${item.word}`);
    expect(wordItem('word:treble:CABBAGE').word).toBe('CABBAGE');
  });
});

// ───────────────────────────── the availability gate ─────────────────────────────

describe('availability', () => {
  it('a clef is ready with 5 silver Name It notes that cover the words open from the start', () => {
    expect(clefReady(undefined, 'treble')).toBe(false);
    expect(clefReady(newStudent(), 'treble')).toBe(false);
    expect(clefReady(nameWith(firstTaught('treble', 4)), 'treble')).toBe(false);
    expect(clefReady(nameWith(firstTaught('treble', SILVER_NEEDED)), 'treble')).toBe(true);
    expect(clefReady(nameWith(firstTaught('treble', SILVER_NEEDED)), 'bass')).toBe(false);
    // Five silver notes that are not the ones the first words need are not enough.
    const other = ['name:treble:G4', 'name:treble:C4', 'name:treble:A4', 'name:treble:F4', 'name:treble:D4'];
    expect(clefReady(nameWith(other), 'treble')).toBe(false);
  });

  it('the words open from the start are readable from exactly the first SILVER_NEEDED silver notes, in each clef', () => {
    for (const clef of CLEFS) {
      const name = nameWith(firstTaught(clef, SILVER_NEEDED));
      for (const item of WORD_SET.groups[clef]!.slice(0, PARAMS.initialUnlock)) expect(wordReadable(name, item), `${clef} ${item.word}`).toBe(true);
      // And one note fewer is not enough for the mode (so a word is never shown with an unearned note).
      expect(clefReady(nameWith(firstTaught(clef, SILVER_NEEDED - 1)), clef), clef).toBe(false);
    }
  });

  it('gold counts as silver; a learning (not yet silver) note does not', () => {
    const s = nameWith(firstTaught('treble', 4));
    s.items['name:treble:G4']!.best = 2;
    expect(silverNotes(s, 'treble').map(noteId)).toContain('G4');
    s.items['name:treble:C4']!.best = 0;
    expect(silverNotes(s, 'treble').map(noteId)).not.toContain('C4');
  });

  it('a word is readable only if every letter has a silver note in its clef', () => {
    const name = nameWith(firstTaught('treble', 5)); // G C A F E
    expect(wordReadable(name, wordItem('word:treble:FACE'))).toBe(true);
    expect(wordReadable(name, wordItem('word:treble:EGG'))).toBe(true);
    expect(wordReadable(name, wordItem('word:treble:CAB'))).toBe(false); // B
    expect(wordReadable(name, wordItem('word:bass:AGED'))).toBe(false); // wrong clef
    expect(wordReadable(undefined, wordItem('word:treble:ACE'))).toBe(false);
  });

  it('a word item opens only when its turn has come AND the gate allows it', () => {
    setNameItSource(() => nameWith(firstTaught('treble', 5)));
    const state = wordEngine.newStudent();
    const lane = WORD_SET.groups.treble!;
    let t = T0;
    const practiceAll = () => {
      for (let round = 0; round < 6; round++) {
        for (const item of lane.filter((i) => state.items[i.id]!.unlocked)) wordEngine.recordAnswer(state, item.id, 'correct', item.word, 1500, (t += 60_000));
      }
    };
    practiceAll();
    // Every word that uses only G C A F E opens; the next one needs B and is held closed, however well they do.
    expect(lane.filter((i) => state.items[i.id]!.unlocked).map((i) => i.word)).toEqual(['ACE', 'AGE', 'FACE', 'CAFE', 'EGG']);
    expect(state.items['word:treble:CAB']!.unlocked).toBe(false);
    // Silver on B opens it.
    setNameItSource(() => nameWith(firstTaught('treble', 6)));
    practiceAll();
    expect(state.items['word:treble:CAB']!.unlocked).toBe(true);
    expect(state.items['word:treble:ADD']!.unlocked).toBe(false); // D is still not silver
  });
});

describe('the gate fails closed, and time is judged per note', () => {
  it('with no Name It source, a fresh Word Decoder model opens nothing beyond the starters, however well it does', () => {
    setNameItSource(null);
    const state = wordEngine.newStudent();
    let t = T0;
    for (let round = 0; round < 12; round++) {
      for (const item of WORD_ITEMS.filter((i) => state.items[i.id]!.unlocked)) wordEngine.recordAnswer(state, item.id, 'correct', item.word, 1500, (t += 60_000));
    }
    const open = WORD_ITEMS.filter((i) => state.items[i.id]!.unlocked);
    expect(open.length).toBe(2 * PARAMS.initialUnlock);
  });

  it('clearNameItSource only clears its own source', () => {
    const a = () => newStudent();
    const b = () => newStudent();
    setNameItSource(b);
    clearNameItSource(a);
    expect(WORD_SET.canUnlock!(wordItem('word:treble:ACE'))).toBe(false); // b is set, but its model has no silver notes
    setNameItSource(() => everySilver());
    expect(WORD_SET.canUnlock!(wordItem('word:treble:ACE'))).toBe(true);
    const c = () => everySilver();
    setNameItSource(c);
    clearNameItSource(c);
    expect(WORD_SET.canUnlock!(wordItem('word:treble:ACE'))).toBe(false);
  });

  it('response time is divided by the number of notes, so word length does not skew fluency', () => {
    const short = wordEngine.newStudent();
    const long = wordEngine.newStudent();
    wordEngine.recordAnswer(short, 'word:treble:ACE', 'correct', 'ACE', 3 * 1500, T0);
    wordEngine.recordAnswer(long, 'word:treble:CABBAGE', 'correct', 'CABBAGE', 7 * 1500, T0);
    expect(short.items['word:treble:ACE']!.rt).toBeCloseTo(1500);
    expect(long.items['word:treble:CABBAGE']!.rt).toBeCloseTo(1500);
    expect(long.rtBaseline).toBeCloseTo(short.rtBaseline);
  });
});

// ───────────────────────────── the notes drawn ─────────────────────────────

describe('chooseNotes', () => {
  it('draws one note per letter, in the word order, each from the Name It notes the kid has at silver', () => {
    const name = nameWith([...firstTaught('treble', 7), 'name:treble:C5', 'name:treble:D5', 'name:treble:E5']);
    const silver = new Set(silverNotes(name, 'treble').map(noteId));
    for (let seed = 1; seed <= 20; seed++) {
      const item = wordItem('word:treble:CABBAGE');
      const notes = chooseNotes(item, name, seededRng(seed));
      expect(notes.map((n) => n.letter).join('')).toBe('CABBAGE');
      for (const n of notes) expect(silver.has(noteId(n)), noteId(n)).toBe(true);
    }
  });

  it('varies the octave from play to play, and uses different notes for a repeated letter when it can', () => {
    const name = nameWith([...firstTaught('treble', 7), 'name:treble:C5', 'name:treble:D5', 'name:treble:E5']);
    const item = wordItem('word:treble:BEEF');
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const notes = chooseNotes(item, name, seededRng(seed));
      expect(noteId(notes[1]!)).not.toBe(noteId(notes[2]!)); // E and E: E4 and E5 are both silver
      seen.add(notes.map(noteId).join(' '));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('a repeated letter with only one silver note repeats it', () => {
    const name = nameWith(firstTaught('treble', 7));
    const notes = chooseNotes(wordItem('word:treble:BEEF'), name, seededRng(1));
    expect(noteId(notes[1]!)).toBe('E4');
    expect(noteId(notes[2]!)).toBe('E4');
  });

  it('draws ledger-line notes only once they are silver', () => {
    const plain = nameWith(firstTaught('treble', 7));
    const ledger = nameWith([...firstTaught('treble', 7), 'name:treble:B3', 'name:treble:A3']);
    const item = wordItem('word:treble:BAG');
    const ids = (name: StudentState) => new Set(Array.from({ length: 40 }, (_, k) => chooseNotes(item, name, seededRng(k + 1)).map(noteId).join(' ')).values());
    expect([...ids(plain)].join(' ')).not.toMatch(/[AB]3/);
    expect([...ids(ledger)].join(' ')).toMatch(/[AB]3/);
  });

  it('never draws a note the kid has not earned: a letter with no silver note throws', () => {
    expect(() => chooseNotes(wordItem('word:treble:ACE'), newStudent(), seededRng(1))).toThrow(/No silver treble note/);
    expect(() => chooseNotes(wordItem('word:treble:ACE'), undefined, seededRng(1))).toThrow();
    // Opened but not silver is not enough either.
    const opened = nameWith(firstTaught('treble', 4));
    opened.items['name:treble:E4']!.unlocked = true;
    expect(() => chooseNotes(wordItem('word:treble:ACE'), opened, seededRng(1))).toThrow();
  });
});

// ───────────────────────────── per-word outcome ─────────────────────────────

describe('outcome of a word', () => {
  const right = { mark: 'right' } as const;
  const idk = { mark: 'idk' } as const;
  const wrong = (letter: string) => ({ mark: 'wrong', letter }) as const;

  it('is correct only if every note was right with no "?"', () => {
    const answer = submission('CAB', [right, right, right]);
    expect(answer).toBe('CAB');
    expect(wordEngine.grade('word:treble:CAB', answer)).toBe('correct');
  });

  it('is "?" if any note was "?" and none was wrong', () => {
    expect(submission('CAB', [right, idk, right])).toBeNull();
    expect(wordEngine.grade('word:treble:CAB', submission('CAB', [idk, idk, idk]))).toBe('idk');
  });

  it('is wrong if any note was wrong, with the typed word as the answer, even with a "?" too', () => {
    const answer = submission('CAB', [right, wrong('D'), right]);
    expect(answer).toBe('CDB');
    expect(wordEngine.grade('word:treble:CAB', answer)).toBe('wrong');
    expect(submission('CAB', [idk, right, wrong('A')])).toBe('?AA');
    expect(wordEngine.grade('word:treble:CAB', '?AA')).toBe('wrong');
  });

  it('guessing the rest of a word from its first letters does not pay: one wrong letter spoils it', () => {
    for (const l of LETTERS.filter((l) => l !== 'B')) {
      expect(wordEngine.grade('word:treble:CAB', submission('CAB', [right, right, wrong(l)]))).toBe('wrong');
    }
  });
});

// ───────────────────────────── learner simulations ─────────────────────────────

/** A kid who names every note on their own: `knows(letterExposures)` decides each note. */
function noteReader(opts: { pLetter: (item: string, exposures: number) => number; idk?: boolean; letters?: readonly Letter[] }): Policy<string> {
  return {
    answer: (id, target, exposures, _s, rng) => {
      const p = opts.pLetter(id, exposures);
      const results = [...target].map((l) => {
        if (rng() < p) return { mark: 'right' as const };
        if (opts.idk) return { mark: 'idk' as const };
        const others = (opts.letters ?? LETTERS).filter((x) => x !== l);
        return { mark: 'wrong' as const, letter: others[Math.floor(rng() * others.length)]! };
      });
      return { answer: submission(target, results), rtMs: 1800 * (0.75 + 0.5 * rng()) };
    },
    pCorrect: (id, e) => opts.pLetter(id, e) ** (wordItem(id).word.length),
  };
}

describe('simulations: the guardrails hold at the note level', () => {
  const run = (policy: Policy<string>, sessions: number, seed: number, groups: string[] = ['treble', 'bass']) =>
    simulate({ mode: WORD_MODE, groups, policy, sessions, seed });

  it('a kid who guesses every note at random earns nothing and falls back (D10)', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = run(noteReader({ pLetter: () => 1 / 7 }), 30, seed);
      expect(r.unlocked, `seed ${seed}`).toBe(0);
      expect(r.silver, `seed ${seed}`).toBe(0);
      expect(r.gold, `seed ${seed}`).toBe(0);
      expect(r.meanRecall, `seed ${seed}`).toBeLessThan(0.5);
    }
  });

  it('a kid who presses one letter for every note earns nothing', () => {
    for (const button of LETTERS) {
      for (const seed of [1, 2, 3]) {
        const r = run(
          {
            answer: (_id, target, _e, _s, rng) => ({ answer: submission(target, [...target].map((l) => (l === button ? { mark: 'right' as const } : { mark: 'wrong' as const, letter: button }))), rtMs: 300 + 100 * rng() }),
            pCorrect: () => 0,
          },
          10,
          seed,
        );
        expect(r.unlocked, `${button} seed ${seed}`).toBe(0);
        // A word is made of a single letter only if it is that letter repeated: there is none.
        expect(r.silver, `${button} seed ${seed}`).toBe(0);
        expect(r.gold, `${button} seed ${seed}`).toBe(0);
      }
    }
  });

  it('a kid who presses the same whole answer earns nothing either (the typed word shape)', () => {
    for (const w of ALL_WORDS) {
      const r = run(masher(w, ALL_WORDS.length), 8, 1);
      expect(r.unlocked, w).toBe(0);
    }
  });

  it('a kid who taps "?" on every note earns nothing, and loses less than a guesser', () => {
    const idk = run({ answer: (_i, _t, _e, _s, rng) => ({ answer: null, rtMs: 400 + 100 * rng() }), pCorrect: () => 0 }, 10, 2);
    expect(idk.silver + idk.gold + idk.unlocked).toBe(0);
    const guess = run(noteReader({ pLetter: () => 1 / 7 }), 10, 2);
    expect(idk.meanRecall).toBeGreaterThan(guess.meanRecall);
  });

  describe('an honest learner (knows a word after a few sightings, "?" when unsure)', () => {
    // The Name It evidence is in: every note is silver, so the whole lane may open.
    const policy = () => honestLearner({ learnAfter: 2, answerSpace: ALL_WORDS });

    it('opens the whole first lane and earns silver within a bounded number of sessions', () => {
      setNameItSource(() => everySilver());
      const treble = WORD_SET.groups.treble!.map((i) => i.id);
      const BOUND = 18; // daily sessions of 20 words: about 14 sightings per word, each learned after two
      for (const seed of [1, 2, 3]) {
        const r = run(policy(), 20, seed, ['treble']);
        expect(Math.max(...treble.map((id) => r.openedBy.get(id) ?? Infinity)), `seed ${seed}: the lane opens`).toBeLessThanOrEqual(BOUND);
        expect(r.silver, `seed ${seed}`).toBeGreaterThanOrEqual(treble.length - 2);
        expect(r.meanRecall, `seed ${seed}`).toBeGreaterThan(0.7);
      }
    });

    it('also makes real early progress with no Name It evidence beyond the first words', () => {
      setNameItSource(() => nameWith(firstTaught('treble', 5)));
      const r = run(policy(), 10, 1, ['treble']);
      expect(r.silver).toBeGreaterThanOrEqual(3);
    });
  });

  it('early play is varied: no single answer is over 40% of the first 3 sessions, and every 10 questions have 3+ answers', () => {
    setNameItSource(() => everySilver());
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const groups of [['treble'], ['bass'], ['treble', 'bass']]) {
        const r = run(honestLearner({ learnAfter: 1, answerSpace: ALL_WORDS }), 3, seed, groups);
        const answers = r.picks.map((id) => WORD_MODE.engine.answerOf(id));
        const counts = new Map<string, number>();
        for (const a of answers) counts.set(a, (counts.get(a) ?? 0) + 1);
        expect(Math.max(...counts.values()) / answers.length, `${groups} seed ${seed}`).toBeLessThanOrEqual(0.4);
        for (let i = 0; i + 10 <= answers.length; i++) expect(new Set(answers.slice(i, i + 10)).size, `${groups} seed ${seed} window ${i}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('the weakest open word is asked at least once in every session', () => {
    setNameItSource(() => everySilver());
    const rng = seededRng(7);
    const state = wordEngine.newStudent();
    let now = T0;
    for (let n = 0; n < 12; n++) {
      const open = WORD_ITEMS.filter((i) => state.items[i.id]!.unlocked);
      const weakest = open.reduce((a, b) => (recall(state.items[a.id]!, now) <= recall(state.items[b.id]!, now) ? a : b));
      const session = startSession(['treble'], SESSION_LENGTH, WORD_MODE);
      const asked = new Set<string>();
      while (!isFinished(session)) {
        const q = nextQuestion(session, state, now, rng);
        asked.add(q.itemId);
        // Knows a word only after seeing it twice.
        const known = state.items[q.itemId]!.n >= 2;
        submit(session, state, known ? wordEngine.answerOf(q.itemId) : null, now + 1800);
        now += 5000;
      }
      if (weakest.clef === 'treble') expect(asked.has(weakest.id), `session ${n}: ${weakest.id}`).toBe(true);
      now += 24 * 3_600_000;
    }
  });
});

describe('simulations: knowing a word by heart cannot be farmed', () => {
  /** Reads a word's notes the first time (says "?" until it has seen it twice), then just types it from memory, fast. */
  const memorizer = (): Policy<string> => honestLearner({ learnAfter: 2, rtMs: 900, answerSpace: ALL_WORDS });

  it('memorizing opens nothing the Name It notes have not earned', () => {
    // Only the first five treble notes are silver: words with B or D must stay closed.
    setNameItSource(() => nameWith(firstTaught('treble', 5)));
    const r = simulate({ mode: WORD_MODE, groups: ['treble'], policy: memorizer(), sessions: 40, seed: 3 });
    const opened = [...r.openedBy.keys()].map((id) => wordItem(id)).filter((i) => i.clef === 'treble');
    expect(opened.length).toBeGreaterThan(3);
    const open = opened.filter((i) => !WORD_SET.groups.treble!.slice(0, 3).includes(i));
    for (const item of open) expect(wordReadable(nameWith(firstTaught('treble', 5)), item), item.word).toBe(true);
    for (const w of ['CAB', 'BAG', 'BED', 'ADD', 'BEAD']) expect(r.state.items[`word:treble:${w}`]!.unlocked, w).toBe(false);
  });

  it('each word pays at most one silver and one gold, however often it is repeated', () => {
    setNameItSource(() => everySilver());
    const r = simulate({ mode: WORD_MODE, groups: ['treble'], policy: memorizer(), sessions: 60, seed: 4 });
    const words = WORD_SET.groups.treble!.length;
    expect(r.silver).toBeLessThanOrEqual(words);
    expect(r.gold).toBeLessThanOrEqual(words);
    // And once everything is gold, replaying earns nothing at all.
    const lateEarnings = r.sessions.slice(30).reduce((a, s) => a + s.silver + s.gold + s.unlocked, 0);
    expect(lateEarnings).toBe(0);
    const levels = WORD_SET.groups.treble!.map((i) => level(r.state.items[i.id]!));
    expect(levels.every((l) => l === 'gold')).toBe(true);
  });
});
