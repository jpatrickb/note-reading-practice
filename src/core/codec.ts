// Progress code: the whole learner model packed into a few hundred bytes, base64url-encoded,
// so it fits in a QR code or a link (for moving devices and as a backup).
//
// Format v1 (all integers big-endian):
//   u8 version | u16 rtBaseline/10 | u16 refDay | u24 practice-day bitmask (bit i = refDay - i)
//   u8 itemCount | bitmap(itemCount) of saved items
//   per saved item (in ITEMS order):
//     u8 flags (bit0 unlocked, bits1-2 best) | i8 m*20 | u8 16*log2(s) | u8 n | u8 c
//     u16 hours since last answer (0xFFFF = never) | u8 rt/100ms | u8 days since silver (0xFF = none)
//   u8 CRC-8 over everything before it
//
// Not included: the confusion matrix and recent errors (short-term diagnostic data).

import { type StudentState, dayIndex, newStudent } from './engine';
import { ITEMS } from './items';

const VERSION = 1;
const HOUR = 3_600_000;

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

export function encodeProgress(state: StudentState, now: number): string {
  const out: number[] = [];
  const u8 = (x: number) => out.push(clampInt(x, 0, 255));
  const u16 = (x: number) => {
    const v = clampInt(x, 0, 0xffff);
    out.push(v >> 8, v & 0xff);
  };
  const refDay = dayIndex(now);

  u8(VERSION);
  u16(state.rtBaseline / 10);
  u16(refDay);
  let mask = 0;
  for (const d of state.practiceDays) {
    const ago = refDay - d;
    if (ago >= 0 && ago < 24) mask |= 1 << ago;
  }
  out.push((mask >> 16) & 0xff, (mask >> 8) & 0xff, mask & 0xff);

  u8(ITEMS.length);
  const saved = ITEMS.map((i) => {
    const it = state.items[i.id]!;
    return it.unlocked || it.n > 0;
  });
  for (let b = 0; b < Math.ceil(ITEMS.length / 8); b++) {
    let byte = 0;
    for (let k = 0; k < 8; k++) if (saved[b * 8 + k]) byte |= 0x80 >> k;
    out.push(byte);
  }
  ITEMS.forEach((item, idx) => {
    if (!saved[idx]) return;
    const it = state.items[item.id]!;
    u8((it.unlocked ? 1 : 0) | (it.best << 1));
    out.push(clampInt(it.m * 20, -127, 127) & 0xff);
    u8(16 * Math.log2(Math.max(1, it.s)));
    u8(it.n);
    u8(it.c);
    u16(it.last === 0 ? 0xffff : Math.min(0xfffe, (now - it.last) / HOUR));
    u8(it.rt / 100);
    u8(it.silverDay < 0 ? 0xff : Math.min(0xfe, refDay - it.silverDay));
  });

  const bytes = Uint8Array.from(out);
  return toBase64Url(Uint8Array.from([...bytes, crc8(bytes)]));
}

export class ProgressCodeError extends Error {}

export function decodeProgress(code: string, now: number): StudentState {
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(code.trim());
  } catch {
    throw new ProgressCodeError('That code has characters that don’t belong in a progress code.');
  }
  if (bytes.length < 10) throw new ProgressCodeError('That code is too short.');
  const body = bytes.subarray(0, -1);
  if (crc8(body) !== bytes[bytes.length - 1]) throw new ProgressCodeError('That code has a typo in it.');

  let pos = 0;
  const u8 = () => {
    if (pos >= body.length) throw new ProgressCodeError('That code is incomplete.');
    return body[pos++]!;
  };
  const i8 = () => {
    const v = u8();
    return v > 127 ? v - 256 : v;
  };
  const u16 = () => (u8() << 8) | u8();

  const version = u8();
  if (version !== VERSION) throw new ProgressCodeError('That code is from a different version of the game.');

  const state = newStudent();
  for (const id in state.items) state.items[id]!.unlocked = false;
  state.rtBaseline = u16() * 10;
  const encodedDay = u16();
  const mask = (u8() << 16) | (u8() << 8) | u8();
  for (let ago = 23; ago >= 0; ago--) if (mask & (1 << ago)) state.practiceDays.push(encodedDay - ago);

  const count = u8();
  const bitmap: number[] = [];
  for (let b = 0; b < Math.ceil(count / 8); b++) bitmap.push(u8());
  for (let idx = 0; idx < count; idx++) {
    if (!(bitmap[idx >> 3]! & (0x80 >> (idx & 7)))) continue;
    const flags = u8();
    const m = i8() / 20;
    const s = 2 ** (u8() / 16);
    const n = u8();
    const c = u8();
    const hoursAgo = u16();
    const rt = u8() * 100;
    const silverAgo = u8();
    const item = ITEMS[idx];
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
      silverDay: silverAgo === 0xff ? -1 : encodedDay - silverAgo,
    };
  }
  return state;
}
