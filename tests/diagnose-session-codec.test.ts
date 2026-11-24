import { describe, expect, it } from 'vitest';
import { ProgressCodeError, decodeProgress, encodeProgress } from '../src/core/codec';
import { LESSONS, diagnose } from '../src/core/diagnose';
import { newStudent, recordAnswer } from '../src/core/engine';
import { ITEMS, itemById } from '../src/core/items';
import type { Letter } from '../src/core/music';
import { isFinished, nextQuestion, startSession, submit, summarize } from '../src/core/session';
import {
  DEFAULT_SETTINGS,
  type KeyValueStore,
  clearState,
  loadSettings,
  loadState,
  saveSettings,
  saveState,
} from '../src/core/storage';
import { DAY, T0, seededRng } from './helpers';

function wrong(s: ReturnType<typeof newStudent>, id: string, answer: Letter, now: number) {
  recordAnswer(s, id, 'wrong', answer, 1000, now);
}

describe('diagnose', () => {
  it('detects reading bass clef as treble', () => {
    const s = newStudent();
    // Bass F3 read as treble → D; Bass C3 → A; Bass C4 → A.
    wrong(s, 'name:bass:F3', 'D', T0);
    wrong(s, 'name:bass:C3', 'A', T0 + 1);
    expect(diagnose(s, T0 + 2)).toBeNull();
    wrong(s, 'name:bass:C4', 'A', T0 + 2);
    expect(diagnose(s, T0 + 3)).toBe('clefSwap:bass');
    // Cooldown: not shown again right away.
    expect(diagnose(s, T0 + 4)).toBeNull();
    expect(diagnose(s, T0 + DAY)).toBe('clefSwap:bass');
  });

  it('detects reading treble clef as bass', () => {
    const s = newStudent();
    wrong(s, 'name:treble:G4', 'B', T0);
    wrong(s, 'name:treble:C5', 'E', T0);
    wrong(s, 'name:treble:G4', 'B', T0);
    expect(diagnose(s, T0)).toBe('clefSwap:treble');
  });

  it('detects line/space neighbor confusion', () => {
    const s = newStudent();
    wrong(s, 'name:treble:G4', 'A', T0);
    wrong(s, 'name:treble:G4', 'F', T0);
    wrong(s, 'name:treble:C5', 'D', T0);
    wrong(s, 'name:treble:C4', 'B', T0);
    expect(diagnose(s, T0)).toBe('neighbor');
  });

  it('ignores scattered errors', () => {
    const s = newStudent();
    wrong(s, 'name:treble:G4', 'D', T0);
    wrong(s, 'name:treble:C5', 'G', T0);
    expect(diagnose(s, T0)).toBeNull();
  });

  it('has text for every lesson', () => {
    for (const lesson of Object.values(LESSONS)) expect(lesson.body.length).toBeGreaterThan(0);
  });
});

describe('session', () => {
  it('runs a full session and summarizes it', () => {
    const s = newStudent();
    const session = startSession(['treble'], 10);
    const rng = seededRng(5);
    let now = T0;
    let finishPicks = 0;
    while (!isFinished(session)) {
      const q = nextQuestion(session, s, now, rng);
      now += 1500;
      const letter = itemById(q.itemId).note.letter;
      const idx = session.results.length;
      const answer = idx === 0 ? null : idx === 1 ? ('A' === letter ? 'B' : 'A') : letter;
      submit(session, s, answer, now);
      if (idx >= 7) finishPicks++;
      now += 500;
    }
    const sum = summarize(session);
    expect(sum.total).toBe(10);
    expect(sum.idk).toBe(1);
    expect(sum.correct).toBe(8);
    expect(finishPicks).toBe(3);
    expect(() => submit(session, s, 'C', now)).toThrow();
  });

  it('returns a lesson when a misconception appears', () => {
    const s = newStudent();
    wrong(s, 'name:bass:F3', 'D', T0);
    wrong(s, 'name:bass:C3', 'A', T0);
    const session = startSession(['bass']);
    session.current = { itemId: 'name:bass:C4', shownAt: T0 };
    expect(submit(session, s, 'A', T0 + 1000).lesson).toBe('clefSwap:bass');
  });
});

describe('progress code', () => {
  function played() {
    const s = newStudent();
    const rng = seededRng(6);
    const session = startSession(['treble', 'bass'], 80);
    let now = T0 - 3 * DAY;
    while (!isFinished(session)) {
      const q = nextQuestion(session, s, now, rng);
      submit(session, s, rng() < 0.85 ? itemById(q.itemId).note.letter : 'B', now + 1200);
      now += 40 * 60_000;
    }
    return { s, now };
  }

  it('round-trips the learner model compactly', () => {
    const { s, now } = played();
    const code = encodeProgress(s, now);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(400);
    const back = decodeProgress(code, now);
    expect(back.practiceDays).toEqual(s.practiceDays);
    expect(back.rtBaseline).toBeCloseTo(s.rtBaseline, -1);
    for (const item of ITEMS) {
      const a = s.items[item.id]!;
      const b = back.items[item.id]!;
      expect(b.unlocked).toBe(a.unlocked);
      expect(b.best).toBe(a.best);
      expect(b.n).toBe(a.n);
      expect(b.c).toBe(a.c);
      expect(b.silverDay).toBe(a.silverDay);
      expect(b.m).toBeCloseTo(a.m, 1);
      expect(b.s / a.s).toBeGreaterThan(0.95);
      expect(b.s / a.s).toBeLessThan(1.05);
      expect(Math.abs(b.last - a.last)).toBeLessThanOrEqual(3_600_000);
    }
  });

  it('encodes a brand-new student', () => {
    const s = newStudent();
    const back = decodeProgress(encodeProgress(s, T0), T0);
    expect(back.items['name:treble:G4']!.unlocked).toBe(true);
    expect(back.items['name:treble:G4']!.last).toBe(0);
    expect(back.items['name:treble:A5']!.unlocked).toBe(false);
  });

  it('rejects typos, junk, and other versions with friendly errors', () => {
    const { s, now } = played();
    const code = encodeProgress(s, now);
    const typo = code.slice(0, 20) + (code[20] === 'A' ? 'B' : 'A') + code.slice(21);
    expect(() => decodeProgress(typo, now)).toThrow(ProgressCodeError);
    expect(() => decodeProgress('abc', now)).toThrow(/too short/);
    expect(() => decodeProgress('!!!!!!!!!!!!!!!!', now)).toThrow(ProgressCodeError);
    expect(() => decodeProgress(code.slice(0, 30), now)).toThrow(ProgressCodeError);
    // Version 2 header with a valid checksum.
    const bytes = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let crc = 0;
    for (const b of bytes) {
      crc ^= b;
      for (let i = 0; i < 8; i++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
    const v2 = btoa(String.fromCharCode(...bytes, crc)).replace(/=+$/, '');
    expect(() => decodeProgress(v2, now)).toThrow(/different version/);
  });
});

describe('storage', () => {
  function memoryStore(): KeyValueStore & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    };
  }

  it('saves and loads state and settings', () => {
    const store = memoryStore();
    const s = newStudent();
    recordAnswer(s, 'name:treble:G4', 'correct', 'G', 1000, T0);
    saveState(store, s);
    expect(loadState(store).items['name:treble:G4']!.n).toBe(1);
    clearState(store);
    expect(loadState(store).items['name:treble:G4']!.n).toBe(0);

    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
    saveSettings(store, { clefs: ['bass'], muted: true });
    expect(loadSettings(store)).toEqual({ clefs: ['bass'], muted: true });
  });

  it('survives corrupt data and blocked storage', () => {
    const store = memoryStore();
    store.data.set('nrp:v1:state', '{not json');
    expect(loadState(store).version).toBe(1);
    const blocked: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
      removeItem: () => {},
    };
    expect(() => saveState(blocked, newStudent())).not.toThrow();
    expect(() => saveSettings(blocked, DEFAULT_SETTINGS)).not.toThrow();
  });
});
