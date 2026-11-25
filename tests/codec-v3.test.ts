import qrcode from 'qrcode-generator';
import { describe, expect, it } from 'vitest';
import { ProgressCodeError, crc16, decodeProfile, decodeProgress, encodeProfile, encodeProgress } from '../src/core/codec';
import { type Engine, type ItemState, PARAMS, type StudentState, createEngine, dayIndex, isDusty, nameEngine, newStudent, recall } from '../src/core/engine';
import { defineItemSet } from '../src/core/itemset';
import { letterEngine } from '../src/core/letters';
import { catcherEngine } from '../src/core/noteCatcher';
import { CORE_MODES, type CoreMode } from '../src/core/modes';
import { isFinished, nextQuestion, startSession, submit } from '../src/core/session';
import { GOLDEN_CODES } from './fixtures/codes';
import { DAY, HOUR, T0, seededRng } from './helpers';

/** Size budget for a fully played profile: keeps the Save screen's QR code easy to scan iPad-to-iPad. */
const CODE_BUDGET = 1200;
/** What the Save screen puts in its QR code (src/ui/app.ts renderSave), on the production host. */
const saveUrl = (code: string) => `https://notepractice.jpatrickbeal.com/#import=${code}`;

// ───────────────────────────── helpers ─────────────────────────────

const toBytes = (code: string) => Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const toCode = (bytes: readonly number[]) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function crc8(bytes: readonly number[]): number {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

/** Append valid v3 checksums to a hand-built body. */
function signV3(body: readonly number[]): string {
  const c16 = crc16(Uint8Array.from(body));
  const withCrc = [...body, c16 >> 8, c16 & 0xff];
  return toCode([...withCrc, crc8(withCrc)]);
}

/** A v3 code's bytes without its 3 checksum bytes. */
const v3Body = (code: string) => [...toBytes(code).subarray(0, -3)];

/** A test-only mode with 300 items in one lane (more than v1/v2's 255 limit). */
const BIG = defineItemSet({
  id: 'big',
  groups: { big: Array.from({ length: 300 }, (_, i) => ({ id: `big:${i}` })) },
  groupOf: () => 'big',
  answerOf: () => 'C',
});
const bigEngine = createEngine(BIG);
const WITH_BIG: readonly CoreMode[] = [...CORE_MODES, { id: 'big', tag: 200, engine: bigEngine }];

/** Every item unlocked and played, with varied values (the largest code a mode can make). */
function fullyPlayed(engine: Engine, now: number, seed: number): StudentState {
  const rng = seededRng(seed);
  const s = engine.newStudent();
  s.rtBaseline = 2340;
  const today = dayIndex(now);
  for (let d = 20; d >= 0; d -= 2) s.practiceDays.push(today - d);
  for (const id in s.items) {
    const n = 5 + Math.floor(rng() * 200);
    const best = Math.floor(rng() * 3) as 0 | 1 | 2;
    s.items[id] = {
      unlocked: true,
      m: rng() * 12 - 6,
      s: 2 + rng() * 3000,
      n,
      c: Math.floor(n * (0.6 + rng() * 0.4)),
      last: now - Math.floor(rng() * 400 * DAY),
      rt: 400 + Math.floor(rng() * 8000),
      best,
      silverDay: best > 0 ? today - Math.floor(rng() * 30) : -1,
    };
  }
  return s;
}

function playName(s: StudentState, start: number, sessions: number, seed: number): number {
  const rng = seededRng(seed);
  let now = start;
  for (let k = 0; k < sessions; k++) {
    const session = startSession(['treble', 'bass'], 30);
    while (!isFinished(session)) {
      const q = nextQuestion(session, s, now, rng);
      const right = nameEngine.answerOf(q.itemId);
      submit(session, s, rng() < 0.85 ? right : right === 'B' ? 'C' : 'B', now + 800 + Math.floor(rng() * 4000));
      now += 5000;
    }
    now += 19 * HOUR;
  }
  return now;
}

const fluent = (it: ItemState, state: StudentState) => it.rt > 0 && it.rt <= PARAMS.fluentRatio * (state.rtBaseline || PARAMS.defaultBaseline);

/**
 * Everything the engine decides from a learner model must come out the same after a v3 round trip:
 * level, unlocking inputs, silver/gold inputs, and recall within ±0.04 (now and later).
 */
function expectSameBehavior(engine: Engine, a: StudentState, b: StudentState, now: number): number {
  let worst = 0;
  expect(b.practiceDays).toEqual(a.practiceDays);
  expect(Math.abs(b.rtBaseline - a.rtBaseline)).toBeLessThanOrEqual(5);
  for (const item of engine.set.items) {
    const x = a.items[item.id]!;
    const y = b.items[item.id]!;
    const id = item.id;
    expect(y.unlocked, id).toBe(x.unlocked);
    expect(y.best, id).toBe(x.best);
    expect(y.n === 0, id).toBe(x.n === 0);
    expect(y.n >= 2, id).toBe(x.n >= 2);
    expect(y.c >= PARAMS.silverMinCorrect, id).toBe(x.c >= PARAMS.silverMinCorrect);
    expect(fluent(y, b), id).toBe(fluent(x, a));
    expect(y.last === 0, id).toBe(x.last === 0);
    // Gold needs silver on an earlier day than today.
    for (const later of [0, 1, 30]) {
      const today = dayIndex(now) + later;
      if (x.best === 1) expect(today > y.silverDay, id).toBe(today > x.silverDay);
    }
    for (const later of [0, HOUR, DAY, 7 * DAY, 60 * DAY]) {
      const diff = Math.abs(recall(y, now + later) - recall(x, now + later));
      worst = Math.max(worst, diff);
      expect(diff, `${id} recall at +${later / HOUR}h`).toBeLessThanOrEqual(0.04);
    }
    expect(Math.abs(Math.log2(y.s / x.s)), id).toBeLessThanOrEqual(0.06);
  }
  return worst;
}

/** How often selectItem picks the same item for both models with identical random draws. */
function selectionAgreement(engine: Engine, a: StudentState, b: StudentState, now: number): number {
  const groups = Object.keys(engine.set.groups);
  const draws = 400;
  let same = 0;
  for (let k = 0; k < draws; k++) {
    const r = (k + 0.5) / draws;
    if (engine.selectItem(a, groups, now, () => r) === engine.selectItem(b, groups, now, () => r)) same++;
  }
  return same / draws;
}

// ───────────────────────────── tests ─────────────────────────────

describe('progress code v3', () => {
  it('uses CRC-16/CCITT-FALSE', () => {
    expect(crc16(new TextEncoder().encode('123456789'))).toBe(0x29b1);
  });

  it('has permanent, unique mode tags', () => {
    expect(CORE_MODES.map((m) => [m.id, m.tag])).toEqual([
      ['name', 1],
      ['letters', 2],
      ['catch', 4],
    ]);
    expect(new Set(CORE_MODES.map((m) => m.tag)).size).toBe(CORE_MODES.length);
  });

  /**
   * The golden fixtures predate later Name It items (appended per CANONICAL_ORDER): decoding them
   * must give the fixture's state for every item it knew, and a fresh, locked, unseen record for each
   * item added since. `withNewItems` adds those fresh records to the frozen expectation.
   */
  const withNewItems = (s: StudentState): StudentState => {
    const fresh = newStudent();
    const items = { ...s.items };
    for (const id of Object.keys(fresh.items)) if (!(id in items)) items[id] = fresh.items[id]!;
    return { ...s, items };
  };

  describe('golden v1/v2 codes from the previous build', () => {
    for (const [key, g] of Object.entries(GOLDEN_CODES)) {
      it(`${key}: ${g.about}`, () => {
        const back = decodeProfile(g.code, g.decodeAt);
        expect(back.name).toEqual(withNewItems(g.expected.name));
        expect(back.letters).toEqual(g.expected.letters);
        expect(decodeProgress(g.code, g.decodeAt)).toEqual(withNewItems(g.expected.name));
      });
    }

    it('re-saving a golden code in v3 keeps the engine behaving the same', { timeout: 30_000 }, () => {
      for (const [key, g] of Object.entries(GOLDEN_CODES)) {
        const now = g.decodeAt;
        const expected = { name: withNewItems(g.expected.name), letters: g.expected.letters };
        const v3 = decodeProfile(encodeProfile(expected, now), now);
        for (const mode of CORE_MODES.filter((m) => m.id in expected)) {
          const a = expected[mode.id as 'name' | 'letters'];
          const b = v3[mode.id]!;
          expectSameBehavior(mode.engine, a, b, now);
          expect(selectionAgreement(mode.engine, a, b, now), key).toBeGreaterThanOrEqual(0.95);
        }
      }
    });
  });

  it('always writes v3 (supersedes D58), even for a brand-new kid', () => {
    const fresh = encodeProgress(newStudent(), T0, letterEngine.newStudent());
    expect(toBytes(fresh)[0]).toBe(3);
    expect(fresh.length).toBeLessThanOrEqual(12); // no sections at all
    const back = decodeProfile(fresh, T0);
    expect(back.name).toEqual(newStudent());
    expect(back.letters).toEqual(letterEngine.newStudent());

    const name = newStudent();
    const now = playName(name, T0, 1, 3);
    expect(toBytes(encodeProgress(name, now))[0]).toBe(3);
  });

  it('round-trips name + letters + a 300-item mode (no more 255-item limit)', () => {
    const now = T0 + 50 * DAY;
    const profile = {
      name: fullyPlayed(nameEngine, now, 1),
      letters: fullyPlayed(letterEngine, now, 2),
      big: fullyPlayed(bigEngine, now, 3),
    };
    // A locked, unplayed item is left out of the code (bitmap only).
    profile.big.items['big:150'] = { ...bigEngine.newStudent().items['big:150']!, unlocked: false };
    const back = decodeProfile(encodeProfile(profile, now, WITH_BIG), now, WITH_BIG);
    expect(Object.keys(back).sort()).toEqual(['big', 'catch', 'letters', 'name']);
    expect(back.catch).toEqual(catcherEngine.newStudent()); // a mode never played stays fresh
    for (const mode of WITH_BIG.filter((m) => m.id in profile)) expectSameBehavior(mode.engine, profile[mode.id as keyof typeof profile], back[mode.id]!, now);
    expect(back.big!.items['big:299']!.n).toBe(15);
    expect(back.big!.items['big:150']).toEqual({ ...bigEngine.newStudent().items['big:150']!, unlocked: false });
    // Confusions and recent errors are not part of the code (D31).
    expect(back.name.confusions).toEqual({});
    expect(back.name.recentErrors).toEqual([]);
  });

  it('keeps precision on simulated real play: same behavior, same selection, recall within ±0.04', () => {
    const name = newStudent();
    const now = playName(name, T0, 8, 11);
    const back = decodeProfile(encodeProgress(name, now), now).name;
    const worst = expectSameBehavior(nameEngine, name, back, now);
    expect(worst).toBeLessThanOrEqual(0.04);
    expect(selectionAgreement(nameEngine, name, back, now)).toBeGreaterThanOrEqual(0.95);
    for (const later of [0, DAY, 7 * DAY]) {
      for (const lane of ['treble', 'bass']) {
        expect(nameEngine.maybeUnlock(structuredClone(back), lane, now + later)).toBe(nameEngine.maybeUnlock(structuredClone(name), lane, now + later));
      }
      for (const item of nameEngine.set.items) {
        const x = name.items[item.id]!;
        const y = back.items[item.id]!;
        // Dusty is a recall threshold; allow a flip only when recall sits right at it.
        if (Math.abs(recall(x, now + later) - PARAMS.dustyP) > 0.04) expect(isDusty(y, now + later)).toBe(isDusty(x, now + later));
      }
    }
  });

  it('keeps the fluency verdict for rt right at the silver threshold', () => {
    const now = T0;
    const s = fullyPlayed(nameEngine, now, 9);
    s.rtBaseline = 2000;
    const ids = nameEngine.set.items.map((i) => i.id);
    const rts = [3199, 3200, 3201, 2000, 1, 20000, 100];
    ids.forEach((id, k) => (s.items[id]!.rt = rts[k % rts.length]!));
    const back = decodeProfile(encodeProgress(s, now), now).name;
    for (const id of ids) expect(fluent(back.items[id]!, back), id).toBe(fluent(s.items[id]!, s));
  });

  it('extreme values survive (clamped, never corrupting other fields)', () => {
    const now = T0;
    const s = newStudent();
    const id = nameEngine.set.items[0]!.id;
    s.items[id] = { unlocked: true, m: 99, s: 0.1, n: 9999, c: 9999, last: now + 5 * HOUR, rt: 0, best: 2, silverDay: dayAfter(now) };
    const id2 = nameEngine.set.items[1]!.id;
    s.items[id2] = { unlocked: true, m: -99, s: 1e9, n: 1, c: 0, last: 1, rt: 1e9, best: 1, silverDay: -1 };
    const back = decodeProfile(encodeProgress(s, now), now).name;
    expect(back.items[id]).toMatchObject({ unlocked: true, m: 6, n: 15, c: 15, rt: 0, best: 2, last: now });
    expect(back.items[id]!.s).toBeCloseTo(1.02, 1);
    expect(back.items[id2]).toMatchObject({ unlocked: true, m: -6, n: 1, c: 0, best: 1, silverDay: -1 });
    expect(back.items[id2]!.s).toBeGreaterThan(8000);
    expect(back.items[id2]!.last).toBeLessThan(now - 65_000 * HOUR);
  });

  describe('robustness', () => {
    const now = T0 + 50 * DAY;
    const profile = { name: fullyPlayed(nameEngine, now, 4), letters: fullyPlayed(letterEngine, now, 5), big: fullyPlayed(bigEngine, now, 6) };
    const code = encodeProfile(profile, now, WITH_BIG);

    it('skips an unknown tag (a code from a newer build loads what it understands)', () => {
      const all = decodeProfile(code, now, WITH_BIG);
      const older = decodeProfile(code, now); // this build's modes: doesn't know tag 200
      expect(older.name).toEqual(all.name);
      expect(older.letters).toEqual(all.letters);
      expect(older.big).toBeUndefined();

      // An unknown section first, then a known one.
      const body = v3Body(encodeProgress(profile.name, now));
      const unknown = [99, 0, 4, 1, 2, 3, 4];
      const crafted = [body[0]!, body[1]!, body[2]!, 2, ...unknown, ...body.slice(4)];
      expect(decodeProfile(signV3(crafted), now).name).toEqual(older.name);
    });

    it('ignores appended record bytes and trailing section bytes from a newer build', () => {
      const s = newStudent();
      const t = playName(s, T0, 2, 8);
      const plain = v3Body(encodeProgress(s, t));
      // Rebuild the Name It section with recordLen 6 (one unknown byte per record) and 2 trailing bytes.
      const [, , , , tag, , , ...rest] = plain;
      const head = rest.slice(0, 2 + 3 + 2 + Math.ceil(nameEngine.set.items.length / 8)); // baseline, days, count, bitmap
      const records = rest.slice(head.length + 1);
      const wide: number[] = [];
      for (let k = 0; k < records.length; k += 5) wide.push(...records.slice(k, k + 5), 0xab);
      const section = [...head, 6, ...wide, 0xee, 0xee];
      const crafted = [plain[0]!, plain[1]!, plain[2]!, 1, tag!, section.length >> 8, section.length & 0xff, ...section];
      expect(decodeProfile(signV3(crafted), t).name).toEqual(decodeProfile(encodeProgress(s, t), t).name);
      // A record shorter than this build understands means a different format.
      const narrow = [...head, 4, ...records];
      const bad = [plain[0]!, plain[1]!, plain[2]!, 1, tag!, narrow.length >> 8, narrow.length & 0xff, ...narrow];
      expect(() => decodeProfile(signV3(bad), t)).toThrow(/different version/);
    });

    it('keeps the first section when a tag repeats', () => {
      const first = v3Body(encodeProgress(profile.name, now)).slice(4);
      const other = newStudent();
      const second = v3Body(encodeProgress(other, playName(other, now, 1, 5))).slice(4);
      const twice = [...v3Body(code).slice(0, 3), 2, ...first, ...second];
      expect(decodeProfile(signV3(twice), now).name).toEqual(decodeProfile(code, now).name);
    });

    it('rejects truncated codes and typos with the kid-friendly messages', () => {
      expect(() => decodeProfile(code.slice(0, -12), now)).toThrow(ProgressCodeError);
      expect(() => decodeProfile(code.slice(0, -12), now)).toThrow(/typo/);
      const typo = code.slice(0, 40) + (code[40] === 'A' ? 'B' : 'A') + code.slice(41);
      expect(() => decodeProfile(typo, now)).toThrow(/typo/);
      // A bad CRC-16 with a matching CRC-8 is still a typo.
      const bytes = [...toBytes(code)];
      bytes[bytes.length - 2]! ^= 1;
      bytes[bytes.length - 1] = crc8(bytes.slice(0, -1));
      expect(() => decodeProfile(toCode(bytes), now)).toThrow(/typo/);
      // Valid checksums but a section cut short, or a missing section: "incomplete".
      const body = v3Body(code);
      expect(() => decodeProfile(signV3(body.slice(0, 60)), now, WITH_BIG)).toThrow(/incomplete/);
      expect(() => decodeProfile(signV3([...body.slice(0, 3), body[3]! + 1, ...body.slice(4)]), now, WITH_BIG)).toThrow(/incomplete/);
      expect(() => decodeProfile('AwAB', now)).toThrow(/too short/);
      expect(() => decodeProfile('!!!!!!!!!!!!!!!!', now)).toThrow(/characters/);
    });

    it('lets builds from before v3 report "different version", not "typo"', () => {
      // Pre-v3 builds check a CRC-8 in the last byte, then the version byte.
      const bytes = [...toBytes(code)];
      expect(crc8(bytes.slice(0, -1))).toBe(bytes.at(-1));
      expect(bytes[0]).toBe(3);
      // And this build says the same about a future version that keeps that convention.
      const future = [4, ...bytes.slice(1, -1)];
      expect(() => decodeProfile(toCode([...future, crc8(future)]), now)).toThrow(/different version/);
      expect(() => decodeProfile(toCode([...future, crc8(future) ^ 1]), now)).toThrow(/typo/);
    });
  });

  describe('size budget', () => {
    const now = T0 + 50 * DAY;
    const fullProfile = (modes: readonly CoreMode[]) => Object.fromEntries(modes.map((m, k) => [m.id, fullyPlayed(m.engine, now, 100 + k)]));

    it(`a fully played Name It + Letter Math profile is ≤ ${CODE_BUDGET} characters`, () => {
      const code = encodeProgress(fullyPlayed(nameEngine, now, 1), now, fullyPlayed(letterEngine, now, 2));
      expect(code.length).toBeLessThanOrEqual(CODE_BUDGET);
    });

    it('the Save-screen URL with a fully played code builds a QR code at level L', () => {
      const url = saveUrl(encodeProfile(fullProfile(CORE_MODES), now));
      const qr = qrcode(0, 'L');
      qr.addData(url);
      expect(() => qr.make()).not.toThrow();
      expect(qr.getModuleCount()).toBeLessThanOrEqual(4 * 40 + 17);
    });

    it('guard: every core mode fully played still fits the budget', () => {
      const code = encodeProfile(fullProfile(CORE_MODES), now);
      expect(
        code.length,
        `A fully played profile of all ${CORE_MODES.length} core modes is ${code.length} characters, over the ` +
          `${CODE_BUDGET} budget that keeps the Save screen's QR code scannable. Make v3 records smaller ` +
          `(see "Record" in src/core/codec.ts) or log a decision to raise the budget.`,
      ).toBeLessThanOrEqual(CODE_BUDGET);
    });
  });
});

function dayAfter(now: number): number {
  return dayIndex(now) + 1;
}
