import { describe, expect, it } from 'vitest';
import { type Profile, decodeProfileSections, encodeProfile, mergeImport } from '../src/core/codec';
import { PARAMS, type StudentState, createEngine, dayIndex } from '../src/core/engine';
import { defineItemSet } from '../src/core/itemset';
import { CORE_MODES, type CoreMode } from '../src/core/modes';
import { GOLDEN_CODES } from './fixtures/codes';
import { DAY, T0 } from './helpers';

// A test-only third mode, so the rule is checked for "any registered mode", not just the two today.
const THIRD = defineItemSet({
  id: 'third',
  groups: { third: Array.from({ length: 6 }, (_, i) => ({ id: `third:${i}` })) },
  groupOf: () => 'third',
  answerOf: () => 'C',
});
const MODES: readonly CoreMode[] = [...CORE_MODES, { id: 'third', tag: 201, engine: createEngine(THIRD) }];
const byId = (id: string) => MODES.find((m) => m.id === id)!;
const NAME = byId('name');
const LETTERS = byId('letters');
const ALL_IDS = MODES.map((m) => m.id);

/** A learner model that has been played a bit, distinguishable by `seed`. */
function played(mode: CoreMode, seed: number, days: number[] = []): StudentState {
  const st = mode.engine.newStudent();
  mode.engine.set.items.slice(0, 3).forEach((item, i) => {
    const it = st.items[item.id]!;
    it.unlocked = true;
    it.n = seed + i;
    it.c = seed;
    it.last = T0 - i * DAY;
    it.best = 1;
  });
  st.rtBaseline = 1000 + seed * 10;
  st.practiceDays = days;
  return st;
}

const today = dayIndex(T0);
// Every registered mode (plus the test-only third), so new modes are covered automatically.
const profileOf = (seed: number, days: number[] = []) => Object.fromEntries(MODES.map((m) => [m.id, played(m, seed, days)])) as unknown as Profile;
const importOf = (p: Profile, ids: string[]) => decodeProfileSections(encodeProfile(Object.fromEntries(ids.map((id) => [id, p[id]])), T0, MODES), T0, MODES);

describe('importing a progress code', () => {
  it('leaves modes the code does not contain exactly as they were', () => {
    const device = profileOf(5);
    const code = importOf(profileOf(9), ['name', 'letters']);
    expect(code.present).toEqual(['name', 'letters']);
    const merged = mergeImport(device, code, MODES);
    expect(merged.third).toEqual(device.third);
    expect(merged.name).not.toEqual(device.name);
    expect(merged.name.items[NAME.engine.set.items[0]!.id]!.n).toBe(9);
    expect(merged.letters.items[LETTERS.engine.set.items[0]!.id]!.n).toBe(9);
  });

  it('replaces every mode when the code has them all', () => {
    const code = importOf(profileOf(9), ALL_IDS);
    expect([...code.present].sort()).toEqual([...ALL_IDS].sort());
    const merged = mergeImport(profileOf(5), code, MODES);
    for (const m of MODES) expect(merged[m.id]!.items[m.engine.set.items[0]!.id]!.n).toBe(9);
  });

  it('does not mistake a fresh stand-in for a mode in the code', () => {
    expect(importOf(profileOf(9), ['third']).present).toEqual(['third']);
  });

  it('unions practice days of the replaced modes and caps them', () => {
    const device = profileOf(5, [today - 3, today - 1]);
    const merged = mergeImport(device, importOf(profileOf(9, [today - 4, today - 1, today]), ['name']), MODES);
    expect(merged.name.practiceDays).toEqual([today - 4, today - 3, today - 1, today]);
    expect(merged.letters.practiceDays).toEqual([today - 3, today - 1]);

    const many = Array.from({ length: PARAMS.maxPracticeDays }, (_, i) => today - 100 + i);
    const capped = mergeImport({ ...device, name: { ...device.name, practiceDays: many } } as Profile, importOf(profileOf(9, [today]), ['name']), MODES);
    expect(capped.name.practiceDays).toHaveLength(PARAMS.maxPracticeDays);
    expect(capped.name.practiceDays.at(-1)).toBe(today);
  });

  it('a v1 code (Name It only) replaces only Name It', () => {
    const g = GOLDEN_CODES.v1Played!;
    const code = decodeProfileSections(g.code, g.decodeAt, MODES);
    expect(code.present).toEqual(['name']);
    const device = profileOf(5);
    const merged = mergeImport(device, code, MODES);
    expect(merged.letters).toEqual(device.letters);
    expect(merged.third).toEqual(device.third);
    expect(merged.name).toEqual(code.profile.name);
    expect(merged.name.items['name:treble:G4']).toEqual(g.expected.name.items['name:treble:G4']);
  });

  it('a v2 code (Name It and Letter Math) replaces those two only', () => {
    const g = GOLDEN_CODES.v2Played!;
    const code = decodeProfileSections(g.code, g.decodeAt, MODES);
    expect(code.present).toEqual(['name', 'letters']);
    const device = profileOf(5);
    const merged = mergeImport(device, code, MODES);
    expect(merged.third).toEqual(device.third);
    expect(merged.letters).toEqual(code.profile.letters);
  });

  it('a v2 code from a kid who only played Letter Math never wipes the device\u2019s Name It', () => {
    // Real v2 encoder output: it always wrote a Name It section, untouched here.
    const g = GOLDEN_CODES.v2LettersOnly!;
    expect(Object.values(g.expected.name.items).every((i) => i.n === 0)).toBe(true);
    const code = decodeProfileSections(g.code, g.decodeAt, MODES);
    expect(code.present).toEqual(['letters']);
    const device = profileOf(5);
    device.name.items[NAME.engine.set.items[0]!.id]!.best = 2;
    const merged = mergeImport(device, code, MODES);
    expect(merged.name).toEqual(device.name);
    expect(merged.third).toEqual(device.third);
    expect(merged.letters).toEqual(code.profile.letters);
  });

  it('an empty code changes nothing', () => {
    const code = decodeProfileSections(encodeProfile({}, T0, MODES), T0, MODES);
    expect(code.present).toEqual([]);
    expect(code.unreadable).toBe(0);
    const device = profileOf(5);
    expect(mergeImport(device, code, MODES)).toEqual(device);
  });

  it('skips sections of modes this build does not know, and says so', () => {
    const encoded = encodeProfile({ third: profileOf(9).third }, T0, MODES);
    const code = decodeProfileSections(encoded, T0, CORE_MODES);
    expect(code.present).toEqual([]);
    expect(code.unreadable).toBe(1);
    const mixed = decodeProfileSections(encodeProfile(profileOf(9), T0, MODES), T0, CORE_MODES);
    expect([...mixed.present].sort()).toEqual(CORE_MODES.map((m) => m.id).sort());
    expect(mixed.unreadable).toBe(1);
    expect(mixed.profile.third).toBeUndefined();
  });

  it('reads a duplicated tag once (the first section wins)', () => {
    const twin: CoreMode = { id: 'twin', tag: NAME.tag, engine: NAME.engine };
    const encoded = encodeProfile({ name: played(NAME, 9), twin: played(NAME, 3) }, T0, [NAME, twin]);
    const code = decodeProfileSections(encoded, T0, [NAME]);
    expect(code.present).toEqual(['name']);
    expect(code.profile.name.items[NAME.engine.set.items[0]!.id]!.n).toBe(9);
  });

  it('does not mutate the device profile or the decoded code', () => {
    const device = profileOf(5, [today - 1]);
    const code = importOf(profileOf(9, [today]), ['name']);
    const deviceBefore = structuredClone(device);
    const codeBefore = structuredClone(code);
    mergeImport(device, code, MODES);
    expect(device).toEqual(deviceBefore);
    expect(code).toEqual(codeBefore);
  });

  it('drops the oldest practice days when over the cap', () => {
    const many = Array.from({ length: PARAMS.maxPracticeDays }, (_, i) => today - 100 + i);
    const capped = mergeImport({ ...profileOf(5), name: { ...profileOf(5).name, practiceDays: many } } as Profile, importOf(profileOf(9, [today]), ['name']), MODES);
    expect(capped.name.practiceDays).toEqual([...many.slice(1), today]);
  });
});
