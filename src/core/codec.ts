// Progress code: the whole learner model packed into a few hundred bytes, base64url-encoded,
// so it fits in a QR code or a link (for moving devices and as a backup).
//
// Format v1 (all integers big-endian), Name It only:
//   u8 version=1 | u16 rtBaseline/10 | u16 refDay | u24 practice-day bitmask (bit i = refDay - i)
//   <items section for Name It>
//   u8 CRC-8 over everything before it
//
// Format v2 = v1 with a Letter Math section appended before the CRC:
//   u8 version=2 | <same header and Name It section as v1>
//   u16 Letter Math rtBaseline/10 | u24 Letter Math practice-day bitmask (same refDay)
//   <items section for Letter Math>
//   u8 CRC-8
//
// Items section (per mode, in that mode's canonical item order):
//   u8 itemCount | bitmap(itemCount) of saved items
//   per saved item:
//     u8 flags (bit0 unlocked, bits1-2 best) | i8 m*20 | u8 16*log2(s) | u8 n | u8 c
//     u16 hours since last answer (0xFFFF = never) | u8 rt/100ms | u8 days since silver (0xFF = none)
//
// The encoder writes v1 while Letter Math is untouched, so those codes still load in older builds.
// Not included: the confusion matrix and recent errors (short-term diagnostic data).

import { type Engine, type StudentState, dayIndex, nameEngine } from './engine';
import { letterEngine } from './letters';

const V1 = 1;
const V2 = 2;
const HOUR = 3_600_000;

/** All of a kid's learner models, one per mode. */
export interface Profile {
  name: StudentState;
  letters: StudentState;
}

function crc8(bytes: Uint8Array): number {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const clampInt = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(x)));

class Writer {
  readonly out: number[] = [];
  u8(x: number) {
    this.out.push(clampInt(x, 0, 255));
  }
  i8(x: number) {
    this.out.push(clampInt(x, -127, 127) & 0xff);
  }
  u16(x: number) {
    const v = clampInt(x, 0, 0xffff);
    this.out.push(v >> 8, v & 0xff);
  }
  u24(x: number) {
    this.out.push((x >> 16) & 0xff, (x >> 8) & 0xff, x & 0xff);
  }
}

class Reader {
  private pos = 0;
  constructor(private readonly body: Uint8Array) {}
  u8(): number {
    if (this.pos >= this.body.length) throw new ProgressCodeError('That code is incomplete.');
    return this.body[this.pos++]!;
  }
  i8(): number {
    const v = this.u8();
    return v > 127 ? v - 256 : v;
  }
  u16(): number {
    return (this.u8() << 8) | this.u8();
  }
  u24(): number {
    return (this.u8() << 16) | (this.u8() << 8) | this.u8();
  }
}

function dayMask(state: StudentState, refDay: number): number {
  let mask = 0;
  for (const d of state.practiceDays) {
    const ago = refDay - d;
    if (ago >= 0 && ago < 24) mask |= 1 << ago;
  }
  return mask;
}

function daysFromMask(mask: number, refDay: number): number[] {
  const days: number[] = [];
  for (let ago = 23; ago >= 0; ago--) if (mask & (1 << ago)) days.push(refDay - ago);
  return days;
}

function writeItems(w: Writer, engine: Engine, state: StudentState, now: number, refDay: number): void {
  const items = engine.set.items;
  w.u8(items.length);
  const saved = items.map((i) => {
    const it = state.items[i.id]!;
    return it.unlocked || it.n > 0;
  });
  for (let b = 0; b < Math.ceil(items.length / 8); b++) {
    let byte = 0;
    for (let k = 0; k < 8; k++) if (saved[b * 8 + k]) byte |= 0x80 >> k;
    w.out.push(byte);
  }
  items.forEach((item, idx) => {
    if (!saved[idx]) return;
    const it = state.items[item.id]!;
    w.u8((it.unlocked ? 1 : 0) | (it.best << 1));
    w.i8(it.m * 20);
    w.u8(16 * Math.log2(Math.max(1, it.s)));
    w.u8(it.n);
    w.u8(it.c);
    w.u16(it.last === 0 ? 0xffff : Math.min(0xfffe, (now - it.last) / HOUR));
    w.u8(it.rt / 100);
    w.u8(it.silverDay < 0 ? 0xff : Math.min(0xfe, refDay - it.silverDay));
  });
}

/** Read an items section into a fresh learner model for `engine`. */
function readItems(r: Reader, engine: Engine, rtBaseline: number, practiceDays: number[], now: number, refDay: number): StudentState {
  const state = engine.newStudent();
  for (const id in state.items) state.items[id]!.unlocked = false;
  state.rtBaseline = rtBaseline;
  state.practiceDays = practiceDays;
  const count = r.u8();
  const bitmap: number[] = [];
  for (let b = 0; b < Math.ceil(count / 8); b++) bitmap.push(r.u8());
  for (let idx = 0; idx < count; idx++) {
    if (!(bitmap[idx >> 3]! & (0x80 >> (idx & 7)))) continue;
    const flags = r.u8();
    const m = r.i8() / 20;
    const s = 2 ** (r.u8() / 16);
    const n = r.u8();
    const c = r.u8();
    const hoursAgo = r.u16();
    const rt = r.u8() * 100;
    const silverAgo = r.u8();
    const item = engine.set.items[idx];
    if (!item) continue; // Code from a newer version with more items: ignore the extras.
    state.items[item.id] = {
      unlocked: (flags & 1) === 1,
      best: ((flags >> 1) & 3) as 0 | 1 | 2,
      m,
      s,
      n,
      c,
      last: hoursAgo === 0xffff ? 0 : now - hoursAgo * HOUR,
      rt,
      silverDay: silverAgo === 0xff ? -1 : refDay - silverAgo,
    };
  }
  return state;
}

/** True if the kid has never answered a question in this mode. */
function untouched(state: StudentState): boolean {
  return Object.values(state.items).every((it) => it.n === 0);
}

/**
 * Encode a kid's progress. Pass the Letter Math model too; while it's untouched the code stays v1
 * (shorter, and readable by builds from before Letter Math).
 */
export function encodeProgress(state: StudentState, now: number, letters?: StudentState): string {
  const w = new Writer();
  const refDay = dayIndex(now);
  const withLetters = letters !== undefined && !untouched(letters);

  w.u8(withLetters ? V2 : V1);
  w.u16(state.rtBaseline / 10);
  w.u16(refDay);
  w.u24(dayMask(state, refDay));
  writeItems(w, nameEngine, state, now, refDay);
  if (withLetters) {
    w.u16(letters.rtBaseline / 10);
    w.u24(dayMask(letters, refDay));
    writeItems(w, letterEngine, letters, now, refDay);
  }

  const bytes = Uint8Array.from(w.out);
  return toBase64Url(Uint8Array.from([...bytes, crc8(bytes)]));
}

export class ProgressCodeError extends Error {}

/** Decode a v1 or v2 code into every mode's learner model (Letter Math is fresh for v1 codes). */
export function decodeProfile(code: string, now: number): Profile {
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(code.trim());
  } catch {
    throw new ProgressCodeError('That code has characters that don’t belong in a progress code.');
  }
  if (bytes.length < 10) throw new ProgressCodeError('That code is too short.');
  const body = bytes.subarray(0, -1);
  if (crc8(body) !== bytes[bytes.length - 1]) throw new ProgressCodeError('That code has a typo in it.');

  const r = new Reader(body);
  const version = r.u8();
  if (version !== V1 && version !== V2) throw new ProgressCodeError('That code is from a different version of the game.');

  const rtBaseline = r.u16() * 10;
  const refDay = r.u16();
  const days = daysFromMask(r.u24(), refDay);
  const name = readItems(r, nameEngine, rtBaseline, days, now, refDay);
  let letters = letterEngine.newStudent();
  if (version === V2) {
    const lrt = r.u16() * 10;
    const ldays = daysFromMask(r.u24(), refDay);
    letters = readItems(r, letterEngine, lrt, ldays, now, refDay);
  }
  return { name, letters };
}

/** Decode a code's Name It learner model (see decodeProfile for all modes). */
export function decodeProgress(code: string, now: number): StudentState {
  return decodeProfile(code, now).name;
}
