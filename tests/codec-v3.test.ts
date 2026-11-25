import qrcode from 'qrcode-generator';
import { describe, expect, it } from 'vitest';
import { BitWriter, ProgressCodeError, codeFromBase32, codeToBase32, crc16, decodeProfile, decodeProgress, encodeProfile, encodeProgress } from '../src/core/codec';
import { type Engine, type ItemState, PARAMS, type StudentState, createEngine, dayIndex, isDusty, nameEngine, newStudent, recall } from '../src/core/engine';
import { defineItemSet } from '../src/core/itemset';
import { letterEngine } from '../src/core/letters';
import { CORE_MODES, type CoreMode } from '../src/core/modes';
import { codeFromHash, progressQr } from '../src/core/progress-qr';
import { isFinished, nextQuestion, startSession, submit } from '../src/core/session';
import * as frozen from './fixtures/codec-v3-frozen';
import { GOLDEN_CODES } from './fixtures/codes';
import { DAY, HOUR, T0, seededRng } from './helpers';

/** Size budget for a fully played profile: keeps the Save screen's QR code easy to scan iPad-to-iPad. */
const CODE_BUDGET = 1200;
/** The Save screen's QR code (src/ui/app.ts renderSave) on the production host. */
const saveQr = (code: string) => progressQr('https://notepractice.jpatrickbeal.com/', code);
/** QR version (1..40) of a code with this many modules per side. */
const qrVersion = (modules: number) => (modules - 17) / 4;

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
    // A compact gold record drops rt: for a gold item the engine never asks whether it is fluent.
    if (x.best < 2) expect(fluent(y, b), id).toBe(fluent(x, a));
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
    ]);
    expect(new Set(CORE_MODES.map((m) => m.tag)).size).toBe(CORE_MODES.length);
  });

  describe('golden v1/v2 codes from the previous build', () => {
    for (const [key, g] of Object.entries(GOLDEN_CODES)) {
      it(`${key}: ${g.about}`, () => {
        const back = decodeProfile(g.code, g.decodeAt);
        expect(back.name).toEqual(g.expected.name);
        expect(back.letters).toEqual(g.expected.letters);
        expect(decodeProgress(g.code, g.decodeAt)).toEqual(g.expected.name);
      });
    }

    it('re-saving a golden code in v3 keeps the engine behaving the same', { timeout: 30_000 }, () => {
      for (const [key, g] of Object.entries(GOLDEN_CODES)) {
        const now = g.decodeAt;
        const v3 = decodeProfile(encodeProfile(g.expected, now), now);
        for (const mode of CORE_MODES) {
          const a = g.expected[mode.id as 'name' | 'letters'];
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
    expect(Object.keys(back).sort()).toEqual(['big', 'letters', 'name']);
    for (const mode of WITH_BIG) expectSameBehavior(mode.engine, profile[mode.id as keyof typeof profile], back[mode.id]!, now);
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
    for (const id of ids) if (s.items[id]!.best < 2) expect(fluent(back.items[id]!, back), id).toBe(fluent(s.items[id]!, s));
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
      // Plain 5-byte records, as the build before compact gold records wrote them.
      const plain = v3Body(frozen.encodeProgress(s, t));
      // Rebuild the Name It section with recordLen 6 (one unknown byte per record) and 2 trailing bytes.
      const [, , , , tag, , , ...rest] = plain;
      const head = rest.slice(0, 2 + 3 + 2 + 4); // baseline, days, count, bitmap (26 items)
      const records = rest.slice(head.length + 1);
      const wide: number[] = [];
      for (let k = 0; k < records.length; k += 5) wide.push(...records.slice(k, k + 5), 0xab);
      const section = [...head, 6, ...wide, 0xee, 0xee];
      const crafted = [plain[0]!, plain[1]!, plain[2]!, 1, tag!, section.length >> 8, section.length & 0xff, ...section];
      expect(decodeProfile(signV3(crafted), t).name).toEqual(decodeProfile(frozen.encodeProgress(s, t), t).name);
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

    it('the Save-screen QR code for a fully played profile is at most version 22 at level L', () => {
      const qr = saveQr(encodeProfile(fullProfile(CORE_MODES), now));
      expect(qrVersion(qr.getModuleCount())).toBeLessThanOrEqual(22);
    });

    it('compact gold records roughly halve a profile of gold items, and never grow one without any', () => {
      const withBest = (best: 0 | 2) => {
        const p = fullProfile(CORE_MODES);
        for (const id in p) for (const key in p[id]!.items) Object.assign(p[id]!.items[key]!, { best, silverDay: -1, n: 40, c: 38, last: now - HOUR });
        return p;
      };
      const gold = withBest(2);
      const none = withBest(0);
      expect(encodeProfile(gold, now).length).toBeLessThan(0.7 * frozen.encodeProfile(gold, now).length);
      expect(encodeProfile(none, now)).toBe(frozen.encodeProfile(none, now));
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

// ───────────────────────────── compact gold records (#60) ─────────────────────────────

/** A gold item the compact record can stand in for. */
const compactGold = (it: ItemState): boolean => it.unlocked && it.best === 2 && it.last > 0;

/** A learner model with every kind of item: locked, new, learning, silver, gold (compact or not). */
function fuzzState(engine: Engine, now: number, seed: number): StudentState {
  const rng = seededRng(seed);
  const s = engine.newStudent();
  s.rtBaseline = rng() < 0.2 ? 0 : 800 + Math.floor(rng() * 5000);
  const today = dayIndex(now);
  for (let d = 23; d >= 0; d--) if (rng() < 0.3) s.practiceDays.push(today - d);
  for (const id in s.items) {
    const kind = Math.floor(rng() * 8);
    if (kind === 0) continue; // untouched
    const n = kind === 1 ? 0 : 1 + Math.floor(rng() * (kind >= 5 ? 300 : 30));
    const best = (kind >= 6 ? 2 : kind >= 4 ? 1 : 0) as 0 | 1 | 2;
    s.items[id] = {
      unlocked: kind !== 7 || rng() < 0.9,
      m: rng() < 0.1 ? (rng() < 0.5 ? -6 : 6) : rng() * 12 - 6,
      s: rng() < 0.1 ? 1.1 + rng() * 8000 : 2 + rng() * 3000,
      n,
      c: Math.floor(n * (0.4 + rng() * 0.6)),
      last: n === 0 ? 0 : now - Math.floor(rng() * 500 * DAY),
      rt: n === 0 ? 0 : 300 + Math.floor(rng() * 9000),
      best,
      silverDay: best > 0 ? today - Math.floor(rng() * 40) : -1,
    };
  }
  return s;
}

/** Big-endian bytes from a string of 0s and 1s, padded to a whole byte with 0s. */
function bitsToBytes(bits: string): number[] {
  const padded = bits.padEnd(Math.ceil(bits.length / 8) * 8, '0');
  return padded.match(/.{8}/g)!.map((b) => parseInt(b, 2));
}
const bin = (v: number, width: number) => v.toString(2).padStart(width, '0');

describe('compact gold records (#60)', () => {
  const now = T0 + 50 * DAY;

  describe('BitWriter', () => {
    it('flush pads the last byte with zeros', () => {
      const w = new BitWriter();
      w.write(0b101, 3);
      expect(w.flush()).toEqual([0b10100000]);
    });

    it('flush adds nothing to a whole number of bytes', () => {
      const w = new BitWriter();
      w.write(0xab, 8);
      w.write(0xcd, 8);
      expect(w.flush()).toEqual([0xab, 0xcd]);
    });

    it('bytes() throws instead of silently dropping bits', () => {
      const w = new BitWriter();
      w.write(1, 1);
      expect(() => w.bytes()).toThrow(/whole number of bytes/);
      w.write(0, 7);
      expect(w.bytes()).toEqual([0x80]);
    });
  });

  describe('layout signal', () => {
    // A profile whose Name It items are all compact gold.
    const allGold = () => {
      const p = { name: fuzzState(nameEngine, now, 1), letters: letterEngine.newStudent() };
      for (const id in p.name.items) p.name.items[id] = { ...p.name.items[id]!, unlocked: true, best: 2, n: 40, c: 38, last: now - HOUR, silverDay: dayIndex(now) - 3 };
      return p;
    };
    const recordLenAt = 4 + 1 + 2 + 2 + 3 + 2 + Math.ceil(nameEngine.set.items.length / 8);

    it("today's v3 decoder says \"different version\" to a code with compact gold records", () => {
      const code = encodeProfile(allGold(), now);
      expect(() => frozen.decodeProfile(code, now)).toThrow(/different version/);
      // This build reads it.
      expect(Object.values(decodeProfile(code, now).name.items).every((i) => i.best === 2)).toBe(true);
    });

    it('marks the section with recordLen 0 and a layout number, and keeps the v3 checksum framing', () => {
      const bytes = toBytes(encodeProfile(allGold(), now));
      expect(bytes[0]).toBe(3);
      expect(crc8([...bytes.subarray(0, -1)])).toBe(bytes.at(-1));
      // header(4) + tag(1) + len(2) + baseline(2) + days(3) + count(2) + bitmap, then recordLen, layout.
      expect([...bytes.subarray(recordLenAt, recordLenAt + 2)]).toEqual([0, 1]);
    });

    it("a section with no compact gold item stays a plain v3 section that today's decoder reads", () => {
      const p = { name: fuzzState(nameEngine, now, 1), letters: letterEngine.newStudent() };
      for (const id in p.name.items) if (p.name.items[id]!.best === 2) p.name.items[id]!.best = 1;
      const code = encodeProfile(p, now);
      expect(code).toBe(frozen.encodeProfile(p, now));
      expect(frozen.decodeProfile(code, now).name).toEqual(decodeProfile(code, now).name);
    });

    it('rejects a layout number it does not know as a different version', () => {
      const bytes = [...toBytes(encodeProfile(allGold(), now))];
      expect(bytes[recordLenAt + 1]).toBe(1);
      bytes[recordLenAt + 1] = 2;
      expect(() => decodeProfile(signV3(bytes.slice(0, -3)), now)).toThrow(/different version/);
    });

    it('skips a compact section of a mode it does not know, like any unknown tag', () => {
      const p = { ...allGold(), big: fullyPlayed(bigEngine, now, 3) };
      for (const id in p.big.items) p.big.items[id] = { ...p.big.items[id]!, best: 2, n: 30, c: 30 };
      const code = encodeProfile(p, now, WITH_BIG);
      const older = decodeProfile(code, now);
      expect(older.big).toBeUndefined();
      expect(older.name).toEqual(decodeProfile(code, now, WITH_BIG).name);
    });
  });

  describe('records by hand (independent of the encoder)', () => {
    // A 3-item mode: items 0 and 2 saved as compact gold, item 1 untouched.
    const TINY = defineItemSet({
      id: 'tiny',
      groups: { tiny: [0, 1, 2].map((i) => ({ id: `tiny:${i}` })) },
      groupOf: () => 'tiny',
      answerOf: () => 'C',
    });
    const tinyEngine = createEngine(TINY);
    const MODES: readonly CoreMode[] = [{ id: 'tiny', tag: 201, engine: tinyEngine }];
    const refDay = dayIndex(now);

    const build = (bits: string, extra: number[] = []) => {
      const records = [...bitsToBytes(bits), ...extra];
      const section = [0, 0, 0, 0, 0, 0, 3, 0b10100000, 0, 1, ...records];
      return signV3([3, refDay >> 8, refDay & 0xff, 1, 201, section.length >> 8, section.length & 0xff, ...section]);
    };
    const gold = (m: number, s: number, h: number) => `110${bin(m, 7)}${bin(s, 7)}${bin(h, 7)}`; // counts at the cap
    const goldCounts = (n: number, c: number, m: number, s: number, h: number) => `111${bin(n, 4)}${bin(c, 4)}${bin(m, 7)}${bin(s, 7)}${bin(h, 7)}`;
    const bits = gold(63, 25, 0) + gold(64, 26, 2); // 48 bits, 6 bytes
    const bits2 = goldCounts(7, 6, 63, 25, 0) + gold(64, 26, 2);

    it('decodes kind-3 records to unlocked gold, with the counts at their cap unless given', () => {
      const back = decodeProfile(build(bits), now, MODES).tiny!;
      expect(back.items['tiny:0']).toEqual({ unlocked: true, best: 2, m: 0, s: PARAMS.initialS, n: 15, c: 15, last: now, rt: 0, silverDay: -1 });
      const second = back.items['tiny:2']!;
      expect(second.m).toBeCloseTo(6 / 63, 10);
      expect(second.s).toBeCloseTo(PARAMS.initialS * 2 ** (13 / 127), 10);
      expect(second.last).toBeCloseTo(now - (2 ** (2 * (16 / 126)) - 1) * HOUR, 3);
      expect(back.items['tiny:1']).toEqual({ ...tinyEngine.newStudent().items['tiny:1']!, unlocked: false });
      // counts = 1 carries n and c.
      expect(decodeProfile(build(bits2), now, MODES).tiny!.items['tiny:0']).toMatchObject({ n: 7, c: 6, m: 0, best: 2 });
    });

    it('ignores bytes after the records (a newer build may append)', () => {
      expect(decodeProfile(build(bits, [0xee, 0xee]), now, MODES).tiny).toEqual(decodeProfile(build(bits), now, MODES).tiny);
    });

    it('says "incomplete" when the records are cut short', () => {
      expect(() => decodeProfile(build(gold(63, 25, 0) + '11010'), now, MODES)).toThrow(/incomplete/);
      expect(() => decodeProfile(build(gold(63, 25, 0) + '1111011'), now, MODES)).toThrow(/incomplete/);
      expect(() => decodeProfile(build(gold(63, 25, 0)), now, MODES)).toThrow(/incomplete/); // second record missing
    });
  });

  describe('the frozen v3 codec and this one', () => {
    it('still decodes every v3 code the previous build wrote, identically', () => {
      for (const key of ['v3Played', 'v3Mixed', 'v3Full']) {
        const g = GOLDEN_CODES[key]!;
        const back = decodeProfile(g.code, g.decodeAt);
        expect(back.name, key).toEqual(g.expected.name);
        expect(back.letters, key).toEqual(g.expected.letters);
        expect(back).toEqual(frozen.decodeProfile(g.code, g.decodeAt));
      }
    });

    it('golden v3 profiles re-save smaller in the new layout, which the old decoder refuses', () => {
      for (const key of ['v3Played', 'v3Mixed', 'v3Full']) {
        const g = GOLDEN_CODES[key]!;
        const again = encodeProfile(g.expected, g.decodeAt);
        expect(again.length, key).toBeLessThan(g.code.length);
        expect(() => frozen.decodeProfile(again, g.decodeAt), key).toThrow(/different version/);
        const back = decodeProfile(again, g.decodeAt);
        expectSameBehavior(nameEngine, g.expected.name, back.name, g.decodeAt);
        expectSameBehavior(letterEngine, g.expected.letters, back.letters, g.decodeAt);
      }
    });
  });

  describe('round-trip fuzz', () => {
    it('matches the previous codec item for item, except what a gold item no longer needs', { timeout: 60_000 }, () => {
      let compactItems = 0;
      let plainCodes = 0;
      let worst = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const profile = { name: fuzzState(nameEngine, now, seed), letters: fuzzState(letterEngine, now, 1000 + seed) };
        const oldCode = frozen.encodeProfile(profile, now);
        const newCode = encodeProfile(profile, now);
        const A = frozen.decodeProfile(oldCode, now);
        const B = decodeProfile(newCode, now);
        // The new decoder reads what the old encoder wrote, exactly as the old decoder does.
        expect(decodeProfile(oldCode, now)).toEqual(A);

        let anyCompact = false;
        for (const mode of CORE_MODES) {
          const orig = profile[mode.id as 'name' | 'letters'];
          const a = A[mode.id]!;
          const b = B[mode.id]!;
          for (const item of mode.engine.set.items) {
            const was = a.items[item.id]!;
            if (compactGold(orig.items[item.id]!)) {
              anyCompact = true;
              compactItems++;
              expect(b.items[item.id], item.id).toEqual({ ...was, rt: 0, silverDay: -1 });
            } else {
              expect(b.items[item.id], item.id).toEqual(was);
            }
          }
          expect(b.practiceDays).toEqual(a.practiceDays);
          expect(b.rtBaseline).toBe(a.rtBaseline);
          // Identical engine behavior: level, unlocks and which item comes next.
          worst = Math.max(worst, expectSameBehavior(mode.engine, orig, b, now));
          expect(selectionAgreement(mode.engine, a, b, now), `seed ${seed} ${mode.id}`).toBe(1);
          for (const later of [0, DAY, 7 * DAY]) {
            for (const lane of Object.keys(mode.engine.set.groups)) {
              expect(mode.engine.maybeUnlock(structuredClone(b), lane, now + later)).toBe(mode.engine.maybeUnlock(structuredClone(a), lane, now + later));
            }
          }
        }
        if (anyCompact) {
          expect(newCode.length).toBeLessThan(oldCode.length);
          expect(() => frozen.decodeProfile(newCode, now)).toThrow(/different version/);
        } else {
          plainCodes++;
          expect(newCode).toBe(oldCode);
        }
      }
      expect(compactItems).toBeGreaterThan(300);
      expect(plainCodes).toBeLessThan(60);
      expect(worst).toBeLessThanOrEqual(0.04);
    });

    it('behaves the same after long simulated play, where most items are gold', { timeout: 60_000 }, () => {
      const name = newStudent();
      const t = playName(name, T0, 40, 21);
      expect(Object.values(name.items).filter(compactGold).length).toBeGreaterThan(10);
      const code = encodeProgress(name, t);
      expect(() => frozen.decodeProfile(code, t)).toThrow(/different version/);
      const back = decodeProfile(code, t).name;
      const before = frozen.decodeProfile(frozen.encodeProfile({ name }, t), t).name;
      expectSameBehavior(nameEngine, name, back, t);
      expect(selectionAgreement(nameEngine, before, back, t)).toBe(1);
      expect(selectionAgreement(nameEngine, name, back, t)).toBeGreaterThanOrEqual(0.95);
      // Keep playing on both imported copies: the same answers lead to the same questions and levels.
      const rngA = seededRng(5);
      const rngB = seededRng(5);
      const a = structuredClone(before);
      const b = structuredClone(back);
      let at = t + DAY;
      for (let k = 0; k < 3; k++) {
        const sa = startSession(['treble', 'bass'], 30);
        const sb = startSession(['treble', 'bass'], 30);
        while (!isFinished(sa)) {
          const qa = nextQuestion(sa, a, at, rngA);
          const qb = nextQuestion(sb, b, at, rngB);
          expect(qb.itemId).toBe(qa.itemId);
          submit(sa, a, nameEngine.answerOf(qa.itemId), at + 1500);
          submit(sb, b, nameEngine.answerOf(qb.itemId), at + 1500);
          at += 5000;
        }
        at += 20 * HOUR;
      }
      for (const item of nameEngine.set.items) {
        expect([b.items[item.id]!.unlocked, b.items[item.id]!.best]).toEqual([a.items[item.id]!.unlocked, a.items[item.id]!.best]);
      }
    });

    it('re-encoding a decoded profile does not change it (compact records are stable)', () => {
      const profile = { name: fuzzState(nameEngine, now, 7), letters: fuzzState(letterEngine, now, 8) };
      const once = decodeProfile(encodeProfile(profile, now), now);
      const twice = decodeProfile(encodeProfile(once, now), now);
      expect(twice).toEqual(once);
    });
  });

  describe('alphanumeric QR code', () => {
    const code = encodeProfile({ name: fuzzState(nameEngine, now, 3), letters: fuzzState(letterEngine, now, 4) }, now);

    it('converts a code to uppercase base32 and back without changing a byte', () => {
      for (const c of [code, GOLDEN_CODES.v1Fresh!.code, GOLDEN_CODES.v2Full!.code, encodeProgress(newStudent(), now)]) {
        const b32 = codeToBase32(c);
        expect(b32).toMatch(/^[A-Z2-7]+$/);
        expect(codeFromBase32(b32)).toBe(c);
        expect(codeFromBase32(b32.toLowerCase())).toBe(c);
        expect(decodeProfile(codeFromBase32(b32), now)).toEqual(decodeProfile(c, now));
      }
    });

    it('matches RFC 4648 test vectors', () => {
      const enc = (s: string) => codeToBase32(toCode([...new TextEncoder().encode(s)]));
      expect([enc('f'), enc('fo'), enc('foo'), enc('foob'), enc('fooba'), enc('foobar')]).toEqual(['MY', 'MZXQ', 'MZXW6', 'MZXW6YQ', 'MZXW6YTB', 'MZXW6YTBOI']);
    });

    it('reports characters that are not base32', () => {
      expect(() => codeFromBase32('ABC1DEF')).toThrow(/characters/);
      expect(() => codeFromBase32('AB-_')).toThrow(ProgressCodeError);
    });

    it('opens from a base32 link (either letter case) or the base64 link, as the same code', () => {
      expect(codeFromHash(`#import32=${codeToBase32(code)}`)).toBe(code);
      expect(codeFromHash(`#IMPORT32=${codeToBase32(code)}`)).toBe(code);
      expect(codeFromHash(`#import32=${codeToBase32(code).toLowerCase()}`)).toBe(code);
      expect(codeFromHash(`#import=${code}`)).toBe(code);
      expect(codeFromHash('#something-else')).toBeNull();
      expect(codeFromHash('')).toBeNull();
      expect(codeFromHash('#import32=')).toBeNull();
      // Not base32 after all: handed back so the import screen can say what is wrong.
      expect(codeFromHash('#import32=AB1-')).toBe('AB1-');
      expect(() => decodeProfile(codeFromHash('#import32=AB1-')!, now)).toThrow(ProgressCodeError);
    });

    it('stores the code in alphanumeric mode: a smaller QR than the base64 link, for the same data', () => {
      const full = encodeProfile(Object.fromEntries(CORE_MODES.map((m, k) => [m.id, fullyPlayed(m.engine, now, 100 + k)])), now);
      const moduleCounts = (c: string) => {
        const qr = progressQr('https://notepractice.jpatrickbeal.com/', c);
        const old = qrcode(0, 'L');
        old.addData(`https://notepractice.jpatrickbeal.com/#import=${c}`);
        old.make();
        return [qr.getModuleCount(), old.getModuleCount()] as const;
      };
      const [small, smallOld] = moduleCounts(code);
      expect(small).toBeLessThanOrEqual(smallOld);
      // At full size the gain is a whole QR version or more.
      const [big, bigOld] = moduleCounts(full);
      expect(big).toBeLessThan(bigOld);
    });
  });
});

function dayAfter(now: number): number {
  return dayIndex(now) + 1;
}
