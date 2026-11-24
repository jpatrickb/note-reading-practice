import { describe, expect, it } from 'vitest';
import { ProgressCodeError, decodeProfile, decodeProgress, encodeProgress } from '../src/core/codec';
import { type StudentState, dayIndex, newStudent } from '../src/core/engine';
import { ITEMS, itemById } from '../src/core/items';
import { LETTER_GROUP, LETTER_ITEMS, LETTER_MATH_MODE, letterEngine } from '../src/core/letters';
import { isFinished, nextQuestion, startSession, submit } from '../src/core/session';
import { type KeyValueStore, loadSettings, loadState, saveSettings, saveState, stateKey } from '../src/core/storage';
import { DAY, HOUR, T0, seededRng } from './helpers';

/**
 * A v1 code made by the build before Letter Math (commit fa34384): 60 Name It answers over two
 * days, encoded at T0. Codes like this are already saved on kids' devices and in screenshots.
 */
const V1_CODE =
  'AQCCUS0AAAca-AeAAAEVTgoJAAwN_wMjWgoKAAoNAAEcWggIAAkN_wEXSgUFAAsN_wEAKQAA__8A_wEOTQkIAA0N_wEYTwUFABkN_wMlWwkJAAkNAAH9NgQDAA4N_yg';

const firstByte = (code: string) => atob(code.slice(0, 4).replace(/-/g, '+').replace(/_/g, '/')).charCodeAt(0);

function playLetters(s: StudentState, start: number, sessions: number): number {
  const rng = seededRng(21);
  let now = start;
  for (let n = 0; n < sessions; n++) {
    const session = startSession([LETTER_GROUP], 20, LETTER_MATH_MODE);
    while (!isFinished(session)) {
      const q = nextQuestion(session, s, now, rng);
      submit(session, s, rng() < 0.9 ? letterEngine.answerOf(q.itemId) : null, now + 1800);
      now += 30 * 60_000;
    }
  }
  return now;
}

function playName(s: StudentState, start: number): number {
  const rng = seededRng(22);
  const session = startSession(['treble', 'bass'], 40);
  let now = start;
  while (!isFinished(session)) {
    const q = nextQuestion(session, s, now, rng);
    submit(session, s, itemById(q.itemId).note.letter, now + 1200);
    now += 20 * 60_000;
  }
  return now;
}

function expectSameModel(a: StudentState, b: StudentState, ids: string[]) {
  expect(b.practiceDays).toEqual(a.practiceDays);
  expect(b.rtBaseline).toBeCloseTo(a.rtBaseline, -1);
  for (const id of ids) {
    const x = a.items[id]!;
    const y = b.items[id]!;
    expect(y.unlocked, id).toBe(x.unlocked);
    expect(y.best, id).toBe(x.best);
    expect(y.n, id).toBe(x.n);
    expect(y.c, id).toBe(x.c);
    expect(y.silverDay, id).toBe(x.silverDay);
    expect(y.m, id).toBeCloseTo(x.m, 1);
    expect(Math.abs(y.last - x.last), id).toBeLessThanOrEqual(HOUR);
  }
}

describe('progress codes with Letter Math (v2)', () => {
  it('still decodes v1 codes made before Letter Math', () => {
    const { name, letters } = decodeProfile(V1_CODE, T0);
    expect(name.rtBaseline).toBe(1300);
    expect(name.practiceDays).toEqual([dayIndex(T0) - 2, dayIndex(T0) - 1, dayIndex(T0)]);
    expect(name.items['name:treble:C4']).toMatchObject({ unlocked: true, best: 1, n: 10, c: 10, silverDay: dayIndex(T0) });
    expect(name.items['name:bass:E3']).toMatchObject({ unlocked: true, best: 1, n: 9, c: 9 });
    expect(name.items['name:treble:E4']).toMatchObject({ unlocked: true, n: 0, last: 0 });
    expect(name.items['name:treble:B4']!.unlocked).toBe(false);
    expect(ITEMS.filter((i) => name.items[i.id]!.unlocked)).toHaveLength(9);
    // Letter Math starts fresh.
    expect(letters).toEqual(letterEngine.newStudent());
    expect(decodeProgress(V1_CODE, T0)).toEqual(name);
  });

  it('keeps writing v1 while Letter Math is untouched (older builds can still read it)', () => {
    const name = newStudent();
    const now = playName(name, T0);
    const v1 = encodeProgress(name, now);
    expect(firstByte(v1)).toBe(1);
    expect(encodeProgress(name, now, letterEngine.newStudent())).toBe(v1);
  });

  it('round-trips both modes in a v2 code', () => {
    const name = newStudent();
    const letters = letterEngine.newStudent();
    let now = playName(name, T0 - 3 * DAY);
    now = playLetters(letters, now, 4);
    const code = encodeProgress(name, now, letters);
    expect(firstByte(code)).toBe(2);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(800);

    const back = decodeProfile(code, now);
    expectSameModel(name, back.name, ITEMS.map((i) => i.id));
    expectSameModel(letters, back.letters, LETTER_ITEMS.map((i) => i.id));
    expect(LETTER_ITEMS.filter((i) => back.letters.items[i.id]!.unlocked).length).toBeGreaterThan(3);
    // The Name It-only decoder reads v2 codes too.
    expect(decodeProgress(code, now)).toEqual(back.name);
  });

  it('handles Letter Math progress with an untouched Name It', () => {
    const letters = letterEngine.newStudent();
    const now = playLetters(letters, T0, 1);
    const back = decodeProfile(encodeProgress(newStudent(), now, letters), now);
    expectSameModel(letters, back.letters, LETTER_ITEMS.map((i) => i.id));
    expect(back.name.items['name:treble:G4']!.unlocked).toBe(true);
  });

  it('rejects truncated and corrupted v2 codes', () => {
    const letters = letterEngine.newStudent();
    const now = playLetters(letters, T0, 2);
    const code = encodeProgress(newStudent(), now, letters);
    expect(() => decodeProfile(code.slice(0, -12), now)).toThrow(ProgressCodeError);
    const typo = code.slice(0, 40) + (code[40] === 'A' ? 'B' : 'A') + code.slice(41);
    expect(() => decodeProfile(typo, now)).toThrow(ProgressCodeError);
    // A v2 header whose Letter Math section is missing (valid checksum) is "incomplete".
    const bytes = Uint8Array.from(atob(encodeProgress(newStudent(), now).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const body = [2, ...bytes.subarray(1, -1)];
    let crc = 0;
    for (const b of body) {
      crc ^= b;
      for (let i = 0; i < 8; i++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
    const v2 = btoa(String.fromCharCode(...body, crc)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(() => decodeProfile(v2, now)).toThrow(/incomplete/);
  });
});

describe('storage per mode', () => {
  function memoryStore(): KeyValueStore & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
  }

  it('keeps Letter Math in its own key and leaves Name It where it was', () => {
    const store = memoryStore();
    const letters = letterEngine.newStudent();
    letterEngine.recordAnswer(letters, 'lm:after:C', 'correct', 'D', 1500, T0);
    saveState(store, letters, letterEngine);
    expect(stateKey(letterEngine)).toBe('nrp:v1:state:letters');
    expect([...store.data.keys()]).toEqual(['nrp:v1:state:letters']);
    expect(loadState(store, letterEngine).items['lm:after:C']!.n).toBe(1);
    expect(loadState(store).items['name:treble:G4']!.n).toBe(0);
  });

  it('remembers the chosen mode, defaulting to Name It', () => {
    const store = memoryStore();
    expect(loadSettings(store).mode).toBeUndefined();
    saveSettings(store, { clefs: ['treble'], muted: false, mode: 'letters' });
    expect(loadSettings(store).mode).toBe('letters');
  });
});
