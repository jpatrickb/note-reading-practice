// Name It: sharps and flats (issue #34, owner decision on #10): the items, how an answer token is graded
// through the ENGINE (no hidden globals), the hints, the diagnosis, placement, and the learning guardrails
// (guesser, masher, honest learner, variety) on the real answer space a kid sees.

import { describe, expect, it } from 'vitest';
import { gradeToken } from '../src/core/accidentals';
import { decodeProfile, encodeProfile } from '../src/core/codec';
import { diagnose, LESSONS } from '../src/core/diagnose';
import { type StudentState, nameEngine, recall } from '../src/core/engine';
import { hintFor } from '../src/core/hints';
import { ACCIDENTAL_ORDER, ITEMS, ITEMS_BY_CLEF, TEACHING_ORDER, inputStyleOf, itemById } from '../src/core/items';
import { canPlace, startPlacement } from '../src/core/placement';
import { answerSpace } from '../src/core/placementFlow';
import { NAME_IT_MODE } from '../src/core/session';
import { goldShare, silverNotes } from '../src/core/wordDecoder';
import { T0, seededRng } from './helpers';
import { honestLearner, masher, randomGuesser, simulate } from './sim';

const lane = ITEMS_BY_CLEF.treble;
const naturals = lane.filter((i) => !i.note.acc);
const accidentals = lane.filter((i) => i.note.acc);

describe('the sharp and flat items', () => {
  it('append to each clef lane after every natural and ledger note, with spelled answers', () => {
    for (const clef of ['treble', 'bass'] as const) {
      const ids = ITEMS_BY_CLEF[clef].map((i) => i.id);
      const first = ids.findIndex((id) => itemById(id).note.acc);
      expect(ids.slice(0, first).every((id) => !itemById(id).note.acc)).toBe(true);
      expect(first).toBe(TEACHING_ORDER[clef].length);
      expect(ids.slice(first)).toEqual(ACCIDENTAL_ORDER[clef].map((n) => `name:${clef}:${n}`));
    }
    expect(itemById('name:treble:F#4').note).toEqual({ letter: 'F', octave: 4, acc: 1 });
    expect(nameEngine.answerOf('name:treble:F#4')).toBe('F#');
    expect(nameEngine.answerOf('name:treble:Bb4')).toBe('Bb');
    expect(nameEngine.answerOf('name:treble:G4')).toBe('G'); // naturals keep their answer
  });

  it('alternate sharps and flats, with a different letter each time', () => {
    for (const clef of ['treble', 'bass'] as const) {
      const a = ITEMS_BY_CLEF[clef].filter((i) => i.note.acc);
      a.forEach((i, k) => expect(i.note.acc, i.id).toBe(k % 2 === 0 ? 1 : -1));
      a.forEach((i, k) => k > 0 && expect(i.note.letter).not.toBe(a[k - 1]!.note.letter));
      expect(new Set(a.slice(0, 6).map((i) => i.note.letter)).size).toBe(6);
    }
  });

  it('are drawn once the naturals are open: they start locked', () => {
    const s = nameEngine.newStudent();
    for (const i of accidentals) expect(s.items[i.id]!.unlocked, i.id).toBe(false);
  });

  it('are never part of placement: a kid is not placed onto sharps and flats', () => {
    const s = nameEngine.newStudent();
    expect(canPlace(nameEngine, s, 'treble')).toBe(true);
    const run = startPlacement(nameEngine, 'treble');
    expect(run.ids).toEqual(naturals.map((i) => i.id));
    expect(answerSpace(nameEngine, 'treble')).toBe(7);
  });
});

describe('which input an item uses (the mode decides, per item)', () => {
  it('naturals use the pad; sharps and flats go pad, pad, keys, keys, so each style meets both kinds', () => {
    expect(naturals.every((i) => inputStyleOf(i) === 'pad')).toBe(true);
    expect(accidentals.map((i) => inputStyleOf(i))).toEqual(['pad', 'pad', 'keys', 'keys', 'pad', 'pad']);
    expect(new Set(accidentals.filter((i) => inputStyleOf(i) === 'pad').map((i) => i.note.acc))).toEqual(new Set([1, -1]));
    expect(new Set(accidentals.filter((i) => inputStyleOf(i) === 'keys').map((i) => i.note.acc))).toEqual(new Set([1, -1]));
  });
});

describe('grading an answer token through the engine', () => {
  const grade = (id: string, answer: string | null) => nameEngine.grade(id, answer);

  it('the pad must match the written spelling: an enharmonic answer is wrong', () => {
    expect(grade('name:treble:F#4', 'pad:F#')).toBe('correct');
    expect(grade('name:treble:F#4', 'pad:Gb')).toBe('wrong');
    expect(gradeToken('pad:Gb', 'F#')).toBe('enharmonic');
    expect(grade('name:treble:Bb4', 'pad:Bb')).toBe('correct');
    expect(grade('name:treble:Bb4', 'pad:A#')).toBe('wrong');
    expect(grade('name:treble:F#4', 'pad:F')).toBe('wrong'); // the bare letter of a sharp
    expect(grade('name:treble:F#4', 'pad:G')).toBe('wrong');
  });

  it('the keyboard is judged by pitch (a key has no spelling)', () => {
    expect(grade('name:treble:F#4', 'keys:F#')).toBe('correct');
    expect(grade('name:treble:Bb4', 'keys:A#')).toBe('correct');
    expect(grade('name:treble:Bb4', 'keys:B')).toBe('wrong');
    expect(grade('name:treble:C#5', 'keys:D')).toBe('wrong');
  });

  it('a natural is right only as a natural, and "?" is "I don\'t know"', () => {
    expect(grade('name:treble:G4', 'pad:G')).toBe('correct');
    expect(grade('name:treble:G4', 'G')).toBe('correct'); // a bare name still works (old callers)
    expect(grade('name:treble:G4', 'pad:G#')).toBe('wrong');
    expect(grade('name:treble:F#4', null)).toBe('idk');
  });
});

describe('hints', () => {
  it('explain the symbol, in the owner\'s words, and count from the natural letter\'s guide note', () => {
    const sharp = itemById('name:treble:F#4');
    const flat = itemById('name:treble:Bb4');
    expect(hintFor(sharp.note, sharp.clef).accidental).toBe('A sharp ♯ raises the note to the very next key up.');
    expect(hintFor(flat.note, flat.clef).accidental).toBe('A flat ♭ lowers the note to the very next key down.');
    const natural = itemById('name:treble:F4');
    expect(hintFor(natural.note, natural.clef).accidental).toBeUndefined();
    expect(hintFor(sharp.note, sharp.clef).position).toBe(hintFor(natural.note, natural.clef).position);
  });
});

describe('diagnose: ignoresAccidental', () => {
  const err = (s: StudentState, itemId: string, answer: string, at: number) => s.recentErrors.push({ itemId, answer, at });

  it('fires when 3 of the last 8 errors are the bare letter of a sharp or flat (pad or keys)', () => {
    const s = nameEngine.newStudent();
    err(s, 'name:treble:F#4', 'pad:F', T0);
    err(s, 'name:treble:Bb4', 'pad:B', T0 + 1);
    expect(diagnose(s, T0 + 2)).toBeNull();
    err(s, 'name:treble:C#5', 'keys:C', T0 + 2);
    expect(diagnose(s, T0 + 3)).toBe('ignoresAccidental');
    expect(LESSONS.ignoresAccidental.body.join(' ')).toContain('Look left of the note');
  });

  it('does not fire for enharmonic or wrong-letter errors, or for naturals', () => {
    const s = nameEngine.newStudent();
    err(s, 'name:treble:F#4', 'pad:Gb', T0);
    err(s, 'name:treble:Bb4', 'pad:A#', T0);
    err(s, 'name:treble:C#5', 'pad:D', T0);
    err(s, 'name:treble:G4', 'pad:G#', T0);
    expect(diagnose(s, T0 + 5)).toBeNull();
  });

  it('still reads plain letter answers (old saves)', () => {
    const s = nameEngine.newStudent();
    for (let k = 0; k < 3; k++) err(s, 'name:treble:F#4', 'F', T0 + k);
    expect(diagnose(s, T0 + 9)).toBe('ignoresAccidental');
  });
});

describe('guardrails on the real answer space (naturals + sharps and flats)', () => {
  const LETTERS7 = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
  /** What a kid can tap: pad letters with no, ♯ or ♭ modifier, and the 12 keys. */
  const PAD = LETTERS7.flatMap((l) => [`pad:${l}`, `pad:${l}#`, `pad:${l}b`]);
  const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map((k) => `keys:${k}`);
  const SPACE = [...PAD, ...KEYS];
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
  /** The sim opens every item at once so the accidentals are in play from the start. */
  const run = (policy: ReturnType<typeof randomGuesser<string>>, sessions: number, seed: number) =>
    simulate({ mode: NAME_IT_MODE, groups: ['treble'], policy, sessions, seed });

  it('a random guesser earns no silver and its mean recall falls over 10 sessions', () => {
    for (const seed of SEEDS) {
      const r = run(randomGuesser(SPACE), 10, seed);
      expect(r.silver, `seed ${seed}`).toBe(0);
      expect(r.gold).toBe(0);
      const early = run(randomGuesser(SPACE), 1, seed).meanRecall;
      expect(r.meanRecall, `seed ${seed}`).toBeLessThanOrEqual(early + 1e-9);
    }
  });

  it('a one-button masher (a pad letter, a modifier letter, or one key) earns nothing', () => {
    for (const button of ['pad:F', 'pad:F#', 'pad:Bb', 'keys:F#']) {
      for (const seed of SEEDS) {
        const r = run(masher(button, SPACE.length), 10, seed);
        expect(r.silver, `${button} seed ${seed}`).toBe(0);
        expect(r.gold).toBe(0);
      }
    }
  });

  it('an honest learner who taps "?" when unsure unlocks the whole first lane, sharps and flats too, and earns silver', () => {
    // Bound: the whole 23-note lane is open within 25 daily sessions of 20 questions (measured: 15-22), and every
    // note has earned silver within 28 (measured: 22-26). The accidentals are the last 6 of the lane.
    const OPEN_BY = 25;
    const BOUND = 28;
    for (const seed of SEEDS) {
      const r = simulate({
        mode: NAME_IT_MODE,
        groups: ['treble'],
        policy: honestLearner<string>({ learnAfter: 3, answerSpace: SPACE }),
        sessions: BOUND,
        seed,
      });
      for (const i of lane) expect(r.openedBy.get(i.id) ?? Infinity, `${i.id} seed ${seed}`).toBeLessThanOrEqual(OPEN_BY);
      expect(r.silver, `seed ${seed}`).toBe(lane.length);
    }
  });

  it('early accidental play is varied: neither modifier carries it, and no letter does', () => {
    for (const seed of SEEDS) {
      const r = simulate({
        mode: NAME_IT_MODE,
        groups: ['treble'],
        policy: honestLearner<string>({ learnAfter: 2, answerSpace: SPACE }),
        sessions: 20,
        seed,
      });
      const acc = r.picks.map((id, k) => [id, r.answers[k]] as const).filter(([id]) => itemById(id).note.acc);
      expect(acc.length, `seed ${seed}`).toBeGreaterThan(10);
      const sharps = acc.filter(([id]) => itemById(id).note.acc === 1).length;
      expect(sharps / acc.length, `seed ${seed}`).toBeLessThanOrEqual(0.6);
      expect(1 - sharps / acc.length, `seed ${seed}`).toBeLessThanOrEqual(0.6);
    }
  });

  it('the first three sessions: no answer is over 40% of questions, and every 10-question window has 3+ different answers', () => {
    for (const seed of SEEDS) {
      const r = simulate({
        mode: NAME_IT_MODE,
        groups: ['treble'],
        policy: honestLearner<string>({ learnAfter: 1, answerSpace: SPACE }),
        sessions: 3,
        seed,
      });
      const targets = r.picks.map((id) => nameEngine.answerOf(id));
      const counts = new Map<string, number>();
      for (const t of targets) counts.set(t, (counts.get(t) ?? 0) + 1);
      expect(Math.max(...counts.values()) / targets.length, `seed ${seed}`).toBeLessThanOrEqual(0.4);
      for (let k = 0; k + 10 <= targets.length; k++) expect(new Set(targets.slice(k, k + 10)).size, `seed ${seed} @${k}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('the weakest open item is still picked at least once per session', () => {
    const rng = seededRng(7);
    const s = nameEngine.newStudent();
    for (const i of lane) s.items[i.id]!.unlocked = true;
    const weak = accidentals[1]!.id;
    for (const i of lane) {
      const it = s.items[i.id]!;
      it.n = 6;
      it.c = 6;
      it.m = i.id === weak ? -1 : 3;
      it.s = 8;
      it.last = T0 - 3_600_000;
    }
    let seen = 0;
    for (let k = 0; k < 40; k++) {
      const picks = new Set<string>();
      for (let q = 0; q < 20; q++) picks.add(nameEngine.selectItem(s, ['treble'], T0, rng, [], 'normal'));
      if (picks.has(weak)) seen++;
    }
    expect(seen).toBe(40);
    expect(recall(s.items[weak]!, T0)).toBeLessThan(recall(s.items[naturals[0]!.id]!, T0));
  });
});

describe('Word Decoder reads Name It letters, not sharps and flats', () => {
  it('a silver F♯ is not a silver F, and gold sharps do not change how advanced the kid looks', () => {
    const s = nameEngine.newStudent();
    for (const id of ['name:treble:F#4', 'name:treble:Bb4']) Object.assign(s.items[id]!, { unlocked: true, best: 2, n: 30, c: 30 });
    expect(silverNotes(s, 'treble')).toEqual([]);
    expect(goldShare(s, 'treble')).toBe(0);
  });
});

describe('progress codes', () => {
  it('round-trip a profile with accidental items open and played', () => {
    const state = nameEngine.newStudent();
    for (const i of ITEMS) state.items[i.id]!.unlocked = true;
    const f = state.items['name:treble:F#4']!;
    f.n = 5;
    f.c = 5;
    f.m = 2;
    f.s = 6;
    f.last = T0;
    const code = encodeProfile({ name: state }, T0);
    const back = decodeProfile(code, T0);
    expect(back.name!.items['name:treble:F#4']).toMatchObject({ unlocked: true, n: 5, c: 5 });
    expect(back.name!.items['name:bass:Ab3']!.unlocked).toBe(true);
  });
});
