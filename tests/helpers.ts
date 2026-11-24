/** Deterministic PRNG (mulberry32) for reproducible tests. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
/** Noon, local time, on a fixed date, so day boundaries are predictable. */
export const T0 = new Date(2026, 10, 24, 12, 0, 0).getTime();
