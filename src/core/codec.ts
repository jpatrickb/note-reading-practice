// Progress code: every mode's learner model packed into a few hundred bytes, base64url-encoded, so
// it fits in a QR code or a link (for moving devices and as a backup). The QR code carries the same
// bytes as uppercase base32 (progress-qr.ts). A kid's code must never stop working: the decoder reads every format ever written (golden tests in tests/codec-v3.test.ts).
//
// ── v3 (written by this build; all integers big-endian) ──────────────────────────────────────────
//   u8 version=3 | u16 refDay | u8 sectionCount | sections… | u16 CRC-16 | u8 CRC-8
//   section: u8 tag | u16 byteLength (of the rest of the section)
//            | u16 rtBaseline/10 | u24 practice-day bitmask (bit i = refDay - i)
//            | u16 itemCount | bitmap(itemCount) of saved items | u8 recordLen | records
//   - Tags come from CORE_MODES (modes.ts). Only modes the kid has touched get a section; a decoder
//     skips tags it doesn't know (a code from a newer build loads what it understands).
//   - Records follow the mode's canonical item order (append-only). Saved = unlocked or answered.
//   - recordLen lets a later build append fields to records; a reader ignores bytes it doesn't
//     know, and a section's bytes past the records are ignored too.
//   - CRC-16/CCITT-FALSE covers everything before it; the trailing CRC-8 covers everything before
//     it (including the CRC-16), so builds from before v3 pass their checksum and then say "from a
//     different version" instead of "typo". Later versions should keep that last byte.
//
//   Record (recordLen 5 = 40 bits, packed MSB-first). Quantization keeps level, unlocking, silver and
//   gold behavior identical and recall within ±0.04 (proven in tests/codec-v3.test.ts):
//     1 unlocked | 2 best | 4 n (capped at 15) | 4 c (capped at 15)
//     7 m: 0..126 ↦ -6..6, step 6/63 (0 exact)
//     7 s: log2(s) = log2(6) + (q - 25)·13/127, so s ∈ [1.02, 8350] h (6 exact)
//     7 hours since last answer: log2(1 + h) = q·16/126 for q ≤ 126, 127 = never
//     4 rt as a ratio to the mode's baseline, log scale (0 = none); the fluency threshold sits
//       exactly between two steps, so "fluent enough for silver" never flips
//     4 days since silver (0..14, clamped), 15 = none
//
// ── compact-gold layout (recordLen 0; written only when a section has a gold item to shrink) ──────
//   section: … | u16 itemCount | bitmap | u8 recordLen=0 | u8 layout=1 | records (bit stream)
//   recordLen 0 can never mean "5 or more bytes per record", so a v3 build from before this layout
//   throws "different version" (never misreads): it rejects recordLen < 5. `layout` names which
//   bit-packed stream follows, so a later one gets its own number (a reader that doesn't know a
//   layout says "different version" too). The stream is padded with zero bits to a whole byte at the
//   end of the section, and a reader ignores any bytes after the last record.
//   Each record starts with a 2-bit kind:
//     0, 1, 2 = best (none, silver, gold): 1 unlocked, then the 37 bits of the fixed record from
//               "4 n" on, so 40 bits like before.
//     3 = compact gold, for an unlocked gold item that has been answered: 1 counts | [4 n | 4 c if
//         counts = 1] | 7 m | 7 s | 7 hours since last answer. 24 bits when n and c are at the
//         cap of 15 (counts = 0 means n = c = 15, what records clamp every well-practiced item to),
//         32 bits otherwise. Dropped: rt and silverDay. Gold never leaves gold, so for a gold item
//         the engine reads only m, s, the time since the last answer, and n and c (via the
//         ratio c/n and thresholds already met); silverDay matters only for silver→gold and rt
//         only for reaching silver. A reader gives such an item rt = 0 (none) and silverDay = -1.
//
// ── v1 / v2 (read only) ──────────────────────────────────────────────────────────────────────────
//   v1: u8 version=1 | u16 rtBaseline/10 | u16 refDay | u24 practice-day bitmask
//       <Name It items> | u8 CRC-8
//   v2: v1 with u16 Letter Math rtBaseline/10 | u24 Letter Math bitmask | <Letter Math items>
//       appended before the CRC-8.
//   items: u8 itemCount | bitmap | per saved item (9 bytes):
//     u8 flags (bit0 unlocked, bits1-2 best) | i8 m*20 | u8 16*log2(s) | u8 n | u8 c
//     u16 hours since last answer (0xFFFF = never) | u8 rt/100ms | u8 days since silver (0xFF = none)
//
// Not included in any version: confusions and recent errors (short-term diagnostics, D31).

import { type Engine, PARAMS, type StudentState, dayIndex } from './engine';
import { CORE_MODES, type CoreMode } from './modes';

const V1 = 1;
const V2 = 2;
const V3 = 3;
const HOUR = 3_600_000;
const RECORD_LEN = 5;
/** recordLen 0 followed by a layout number: bit-packed records of mixed width (see above). */
const VARIABLE = 0;
const LAYOUT_COMPACT_GOLD = 1;
const KIND_COMPACT_GOLD = 3;
const COUNT_CAP = 15;

/** All of a kid's learner models, keyed by mode id (see CORE_MODES). */
export type Profile = Record<string, StudentState> & { name: StudentState; letters: StudentState };

export class ProgressCodeError extends Error {}

/**
 * A code that decodes as "from a different version of the game": what a link in a format this build
 * doesn't know (a newer build's) stands for, so the import screen can say so.
 */
export function newerFormatCode(): string {
  const body = [0xff, 0, 0, 0, 0, 0, 0];
  return toBase64Url(Uint8Array.from([...body, crc8(Uint8Array.from(body))]));
}

const incomplete = () => new ProgressCodeError('That code is incomplete.');
const otherVersion = () => new ProgressCodeError('That code is from a different version of the game.');

// ───────────────────────────── checksums and base64 ─────────────────────────────

function crc8(bytes: Uint8Array): number {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF). */
export function crc16(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
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

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32, uppercase, no padding: every character is a QR "alphanumeric" one (5.5 bits each). */
function toBase32(bytes: Uint8Array): string {
  let out = '';
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(acc >> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32[(acc << (5 - bits)) & 31];
  return out;
}

function fromBase32(text: string): Uint8Array {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of text.toUpperCase()) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error('not base32');
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((acc >> (bits - 8)) & 255);
      bits -= 8;
      acc &= (1 << bits) - 1;
    }
  }
  return Uint8Array.from(out);
}

/** The same code as uppercase base32, for the Save screen's QR code (denser there than base64). */
export function codeToBase32(code: string): string {
  return toBase32(fromBase64Url(code.trim()));
}

/** A base32 code (either letter case) back to the base64url text that decodeProfile reads. */
export function codeFromBase32(text: string): string {
  try {
    return toBase64Url(fromBase32(text.trim()));
  } catch {
    throw new ProgressCodeError('That code has characters that don’t belong in a progress code.');
  }
}

// ───────────────────────────── byte and bit I/O ─────────────────────────────

const clampInt = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(x)));

class Writer {
  readonly out: number[] = [];
  u8(x: number) {
    this.out.push(clampInt(x, 0, 255));
  }
  u16(x: number) {
    const v = clampInt(x, 0, 0xffff);
    this.out.push(v >> 8, v & 0xff);
  }
  u24(x: number) {
    this.out.push((x >> 16) & 0xff, (x >> 8) & 0xff, x & 0xff);
  }
  bytes(b: readonly number[]) {
    for (const x of b) this.out.push(x);
  }
}

/** Reads bytes in [pos, end); running past `end` means the code is cut short. */
class Reader {
  constructor(
    private readonly body: Uint8Array,
    public pos = 0,
    readonly end = body.length,
  ) {}
  u8(): number {
    if (this.pos >= this.end) throw incomplete();
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
  /** The bytes not read yet. */
  rest(): number[] {
    return [...this.body.subarray(this.pos, this.end)];
  }
  /** A reader over the next `n` bytes; this reader moves past them. */
  take(n: number): Reader {
    if (this.pos + n > this.end) throw incomplete();
    const sub = new Reader(this.body, this.pos, this.pos + n);
    this.pos += n;
    return sub;
  }
}

/** Exported for tests only. */
export class BitWriter {
  private readonly out: number[] = [];
  private acc = 0;
  private bits = 0;
  write(value: number, width: number) {
    for (let i = width - 1; i >= 0; i--) {
      this.acc = (this.acc << 1) | ((value >> i) & 1);
      if (++this.bits === 8) {
        this.out.push(this.acc);
        this.acc = 0;
        this.bits = 0;
      }
    }
  }
  /** The bytes written, for a stream that must be a whole number of bytes; throws if bits are left over. */
  bytes(): number[] {
    if (this.bits !== 0) throw new Error(`BitWriter: ${this.bits} bits left over, not a whole number of bytes`);
    return this.out;
  }
  /** The bytes written, with the last partial byte padded with zero bits. */
  flush(): number[] {
    if (this.bits > 0) this.write(0, 8 - this.bits);
    return this.out;
  }
}

class BitReader {
  private bit = 0;
  constructor(private readonly bytes: readonly number[]) {}
  /** Running past the last byte means the code is cut short. */
  read(width: number): number {
    if (this.bit + width > this.bytes.length * 8) throw incomplete();
    let v = 0;
    for (let i = 0; i < width; i++, this.bit++) v = (v << 1) | ((this.bytes[this.bit >> 3]! >> (7 - (this.bit & 7))) & 1);
    return v;
  }
}

// ───────────────────────────── shared helpers ─────────────────────────────

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

/** A fresh learner model with nothing unlocked, ready to have saved items filled in. */
function blankState(engine: Engine, rtBaseline: number, practiceDays: number[]): StudentState {
  const state = engine.newStudent();
  for (const id in state.items) state.items[id]!.unlocked = false;
  state.rtBaseline = rtBaseline;
  state.practiceDays = practiceDays;
  return state;
}

function readBitmap(r: Reader, count: number): (idx: number) => boolean {
  const bitmap: number[] = [];
  for (let b = 0; b < Math.ceil(count / 8); b++) bitmap.push(r.u8());
  return (idx) => (bitmap[idx >> 3]! & (0x80 >> (idx & 7))) !== 0;
}

// ───────────────────────────── v3 record quantization ─────────────────────────────

const M_STEP = 6 / 63;
const S_STEP = 13 / 127;
const S_ZERO = 25; // the code for s = PARAMS.initialS, so a fresh item round-trips exactly
const H_STEP = 16 / 126;
const H_NEVER = 127;
const RT_STEP = 0.35;
const RT_FLUENT_MAX = 8; // codes 1..8 are fluent (≤ fluentRatio × baseline), 9..15 are not
const SILVER_MAX = 14;
const SILVER_NONE = 15;

const log2 = Math.log2;
const rtCenter = log2(PARAMS.fluentRatio);

/** The speed baseline the engine judges this mode by (see `baseline` in engine.ts). */
const effectiveBaseline = (rtBaseline: number) => rtBaseline || PARAMS.defaultBaseline;

/** `baseline` is the one the decoder will see; `fluent` is the engine's verdict on the original. */
function encodeRt(rt: number, baseline: number, fluent: boolean): number {
  if (rt <= 0) return 0;
  const q = clampInt((log2(rt / baseline) - rtCenter) / RT_STEP + RT_FLUENT_MAX + 0.5, 1, 15);
  return fluent ? Math.min(q, RT_FLUENT_MAX) : Math.max(q, RT_FLUENT_MAX + 1);
}

function decodeRt(q: number, baseline: number): number {
  if (q === 0) return 0;
  return baseline * 2 ** (rtCenter + (q - RT_FLUENT_MAX - 0.5) * RT_STEP);
}

interface Baselines {
  /** What the decoder will see (rounded to 10 ms). */
  stored: number;
  /** What the engine judges the original state by. */
  original: number;
}

type Item = StudentState['items'][string];

/** `best` as the 2-bit field every reader understands (0, 1 or 2), whatever a saved state holds. */
const bestOf = (it: Item): 0 | 1 | 2 => clampInt(it.best || 0, 0, 2) as 0 | 1 | 2;

/** True if `it` can be written as a compact gold record: gold, answered, with nothing else it needs. */
function isCompactGold(it: Item): boolean {
  return it.unlocked && bestOf(it) === 2 && it.last > 0;
}

const quantM = (it: Item) => clampInt(it.m / M_STEP + 63, 0, 126);
const quantS = (it: Item) => clampInt((log2(Math.max(1, it.s)) - log2(PARAMS.initialS)) / S_STEP + S_ZERO, 0, 127);
const quantH = (it: Item, now: number) => (it.last === 0 ? H_NEVER : clampInt(log2(1 + Math.max(0, now - it.last) / HOUR) / H_STEP, 0, 126));

/** m, s and the time since the last answer: the fields every record has. */
function writeMsh(w: BitWriter, it: Item, now: number) {
  w.write(quantM(it), 7);
  w.write(quantS(it), 7);
  w.write(quantH(it, now), 7);
}

function readMsh(r: BitReader, now: number): Pick<Item, 'm' | 's' | 'last'> {
  const m = (Math.min(126, r.read(7)) - 63) * M_STEP;
  const s = 2 ** (log2(PARAMS.initialS) + (r.read(7) - S_ZERO) * S_STEP);
  const h = r.read(7);
  return { m, s, last: h === H_NEVER ? 0 : now - (2 ** (h * H_STEP) - 1) * HOUR };
}

/** A full record's fields after `unlocked` and `best` (37 bits). */
function writeFullBody(w: BitWriter, it: Item, now: number, refDay: number, baselines: Baselines) {
  const n = Math.min(COUNT_CAP, it.n);
  w.write(n, 4);
  w.write(Math.min(n, it.c), 4);
  writeMsh(w, it, now);
  w.write(encodeRt(it.rt, baselines.stored, it.rt <= PARAMS.fluentRatio * baselines.original), 4);
  w.write(bestOf(it) === 0 || it.silverDay < 0 ? SILVER_NONE : clampInt(refDay - it.silverDay, 0, SILVER_MAX), 4);
}

function readFullBody(r: BitReader, unlocked: boolean, best: 0 | 1 | 2, now: number, refDay: number, baseline: number): Item {
  const n = r.read(4);
  const c = r.read(4);
  const { m, s, last } = readMsh(r, now);
  const rt = decodeRt(r.read(4), baseline);
  const silver = r.read(4);
  return { unlocked, best, m, s, n, c, last, rt, silverDay: silver === SILVER_NONE ? -1 : refDay - silver };
}

/** Fixed 40-bit record (recordLen 5). */
function writeFixedRecord(w: BitWriter, it: Item, now: number, refDay: number, baselines: Baselines) {
  w.write(it.unlocked ? 1 : 0, 1);
  w.write(bestOf(it), 2);
  writeFullBody(w, it, now, refDay, baselines);
}

function readFixedRecord(bytes: readonly number[], now: number, refDay: number, baseline: number): Item {
  const r = new BitReader(bytes);
  const unlocked = r.read(1) === 1;
  const best = Math.min(2, r.read(2)) as 0 | 1 | 2;
  return readFullBody(r, unlocked, best, now, refDay, baseline);
}

/** Mixed-width record of the compact-gold layout: 24 or 32 bits for a compact gold item, else 40. */
function writeVariableRecord(w: BitWriter, it: Item, now: number, refDay: number, baselines: Baselines) {
  if (isCompactGold(it)) {
    const n = Math.min(COUNT_CAP, it.n);
    const c = Math.min(n, it.c);
    const capped = n === COUNT_CAP && c === COUNT_CAP;
    w.write(KIND_COMPACT_GOLD, 2);
    w.write(capped ? 0 : 1, 1);
    if (!capped) {
      w.write(n, 4);
      w.write(c, 4);
    }
    writeMsh(w, it, now);
    return;
  }
  w.write(bestOf(it), 2);
  w.write(it.unlocked ? 1 : 0, 1);
  writeFullBody(w, it, now, refDay, baselines);
}

function readVariableRecord(r: BitReader, now: number, refDay: number, baseline: number): Item {
  const kind = r.read(2);
  if (kind === KIND_COMPACT_GOLD) {
    const counts = r.read(1) === 1;
    const n = counts ? r.read(4) : COUNT_CAP;
    const c = counts ? r.read(4) : COUNT_CAP;
    return { unlocked: true, best: 2, n, c, rt: 0, silverDay: -1, ...readMsh(r, now) };
  }
  const unlocked = r.read(1) === 1;
  return readFullBody(r, unlocked, kind as 0 | 1 | 2, now, refDay, baseline);
}

// ───────────────────────────── v3 ─────────────────────────────

/** True if this learner model holds anything a fresh one doesn't (so it needs a section). */
function touched(engine: Engine, state: StudentState): boolean {
  if (state.rtBaseline > 0 || state.practiceDays.length > 0) return true;
  const fresh = engine.newStudent();
  return engine.set.items.some((i) => {
    const it = state.items[i.id];
    return it !== undefined && (it.n > 0 || it.unlocked !== fresh.items[i.id]!.unlocked);
  });
}

function writeSection(w: Writer, mode: CoreMode, state: StudentState, now: number, refDay: number): void {
  const items = mode.engine.set.items;
  const fresh = mode.engine.newStudent();
  const states = items.map((i) => state.items[i.id] ?? fresh.items[i.id]!);
  const saved = states.map((it) => it.unlocked || it.n > 0);
  const rtBaseline = Math.round(state.rtBaseline / 10) * 10;
  const baselines = { stored: effectiveBaseline(rtBaseline), original: effectiveBaseline(state.rtBaseline) };

  const body = new Writer();
  body.u16(rtBaseline / 10);
  body.u24(dayMask(state, refDay));
  body.u16(items.length);
  for (let b = 0; b < Math.ceil(items.length / 8); b++) {
    let byte = 0;
    for (let k = 0; k < 8; k++) if (saved[b * 8 + k]) byte |= 0x80 >> k;
    body.u8(byte);
  }
  // Use the compact layout only when it is smaller than plain 5-byte records (its layout byte costs
  // one, so a lone gold item that isn't at the count cap saves nothing). A section that doesn't
  // shrink stays a plain v3 section that builds from before the compact layout can still read.
  const savedStates = states.filter((_, idx) => saved[idx]);
  const variable = new BitWriter();
  for (const it of savedStates) writeVariableRecord(variable, it, now, refDay, baselines);
  const compactBytes = variable.flush();
  if (savedStates.some(isCompactGold) && 1 + compactBytes.length < RECORD_LEN * savedStates.length) {
    body.u8(VARIABLE);
    body.u8(LAYOUT_COMPACT_GOLD);
    body.bytes(compactBytes);
  } else {
    body.u8(RECORD_LEN);
    const records = new BitWriter();
    for (const it of savedStates) writeFixedRecord(records, it, now, refDay, baselines);
    body.bytes(records.bytes());
  }

  w.u8(mode.tag);
  w.u16(body.out.length);
  w.bytes(body.out);
}

function readSection(r: Reader, engine: Engine, now: number, refDay: number): StudentState {
  const rtBaseline = r.u16() * 10;
  const state = blankState(engine, rtBaseline, daysFromMask(r.u24(), refDay));
  const count = r.u16();
  const isSaved = readBitmap(r, count);
  const recordLen = r.u8();
  const baseline = effectiveBaseline(rtBaseline);
  if (recordLen === VARIABLE) {
    if (r.u8() !== LAYOUT_COMPACT_GOLD) throw otherVersion();
    const records = new BitReader(r.rest());
    for (let idx = 0; idx < count; idx++) {
      if (!isSaved(idx)) continue;
      const rec = readVariableRecord(records, now, refDay, baseline);
      const item = engine.set.items[idx];
      if (item) state.items[item.id] = rec; // Extra items from a newer build with more items: ignore.
    }
    return state;
  }
  if (recordLen < RECORD_LEN) throw otherVersion();
  for (let idx = 0; idx < count; idx++) {
    if (!isSaved(idx)) continue;
    const rec = r.take(recordLen);
    const bytes: number[] = [];
    for (let k = 0; k < RECORD_LEN; k++) bytes.push(rec.u8());
    const item = engine.set.items[idx];
    if (!item) continue; // Code from a newer build with more items: ignore the extras.
    state.items[item.id] = readFixedRecord(bytes, now, refDay, baseline);
  }
  return state;
}

/**
 * Encode a kid's progress in every mode (v3). Modes missing from `profile` or never touched are
 * left out of the code and decode as fresh.
 */
export function encodeProfile(profile: Readonly<Record<string, StudentState | undefined>>, now: number, modes: readonly CoreMode[] = CORE_MODES): string {
  const refDay = dayIndex(now);
  const sections = modes.filter((m) => {
    const state = profile[m.id];
    return state !== undefined && touched(m.engine, state);
  });
  const w = new Writer();
  w.u8(V3);
  w.u16(refDay);
  w.u8(sections.length);
  for (const mode of sections) writeSection(w, mode, profile[mode.id]!, now, refDay);
  const crc = crc16(Uint8Array.from(w.out));
  w.u16(crc);
  w.u8(crc8(Uint8Array.from(w.out)));
  return toBase64Url(Uint8Array.from(w.out));
}

function decodeV3(bytes: Uint8Array, now: number, modes: readonly CoreMode[]): Record<string, StudentState> {
  const body = bytes.subarray(0, -3);
  const r = new Reader(body);
  r.u8(); // version
  const refDay = r.u16();
  const count = r.u8();
  const out: Record<string, StudentState> = {};
  for (let k = 0; k < count; k++) {
    const tag = r.u8();
    const section = r.take(r.u16());
    const mode = modes.find((m) => m.tag === tag);
    if (!mode || out[mode.id]) continue; // Unknown tag (newer build): skip it.
    out[mode.id] = readSection(section, mode.engine, now, refDay);
  }
  return out;
}

// ───────────────────────────── v1 / v2 (read only) ─────────────────────────────

function readLegacyItems(r: Reader, engine: Engine, rtBaseline: number, practiceDays: number[], now: number, refDay: number): StudentState {
  const state = blankState(engine, rtBaseline, practiceDays);
  const count = r.u8();
  const isSaved = readBitmap(r, count);
  for (let idx = 0; idx < count; idx++) {
    if (!isSaved(idx)) continue;
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
      best: Math.min(2, (flags >> 1) & 3) as 0 | 1 | 2,
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

function decodeLegacy(bytes: Uint8Array, now: number, modes: readonly CoreMode[]): Record<string, StudentState> {
  const engineOf = (id: string) => (modes.find((m) => m.id === id) ?? CORE_MODES.find((m) => m.id === id)!).engine;
  const r = new Reader(bytes.subarray(0, -1));
  const version = r.u8();
  const rtBaseline = r.u16() * 10;
  const refDay = r.u16();
  const days = daysFromMask(r.u24(), refDay);
  const out: Record<string, StudentState> = { name: readLegacyItems(r, engineOf('name'), rtBaseline, days, now, refDay) };
  if (version === V2) {
    const lrt = r.u16() * 10;
    const ldays = daysFromMask(r.u24(), refDay);
    out.letters = readLegacyItems(r, engineOf('letters'), lrt, ldays, now, refDay);
  }
  return out;
}

// ───────────────────────────── public API ─────────────────────────────

/** Decode a v1, v2 or v3 code into every mode's learner model (fresh for modes not in the code). */
export function decodeProfile(code: string, now: number, modes: readonly CoreMode[] = CORE_MODES): Profile {
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(code.trim());
  } catch {
    throw new ProgressCodeError('That code has characters that don’t belong in a progress code.');
  }
  if (bytes.length < 7) throw new ProgressCodeError('That code is too short.');
  const version = bytes[0];
  const crc8Ok = crc8(bytes.subarray(0, -1)) === bytes[bytes.length - 1];

  let decoded: Record<string, StudentState>;
  if (version === V1 || version === V2) {
    if (bytes.length < 10) throw new ProgressCodeError('That code is too short.');
    if (!crc8Ok) throw new ProgressCodeError('That code has a typo in it.');
    decoded = decodeLegacy(bytes, now, modes);
  } else if (version === V3) {
    const crc = (bytes[bytes.length - 3]! << 8) | bytes[bytes.length - 2]!;
    if (!crc8Ok || crc16(bytes.subarray(0, -3)) !== crc) throw new ProgressCodeError('That code has a typo in it.');
    decoded = decodeV3(bytes, now, modes);
  } else {
    throw crc8Ok ? otherVersion() : new ProgressCodeError('That code has a typo in it.');
  }

  const profile: Record<string, StudentState> = {};
  for (const m of modes) profile[m.id] = decoded[m.id] ?? m.engine.newStudent();
  for (const id in decoded) profile[id] ??= decoded[id]!;
  return profile as Profile;
}

/** Encode Name It and (optionally) Letter Math progress. Kept for existing callers; see encodeProfile. */
export function encodeProgress(state: StudentState, now: number, letters?: StudentState): string {
  return encodeProfile({ name: state, letters }, now);
}

/** Decode a code's Name It learner model (see decodeProfile for all modes). */
export function decodeProgress(code: string, now: number): StudentState {
  return decodeProfile(code, now).name;
}
