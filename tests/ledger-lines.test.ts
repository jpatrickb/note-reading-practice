// Name It's two-ledger-line notes (#24): the new items, their hints and teaching order, and proof
// that everything saved before they existed still loads onto the same notes.

import { describe, expect, it } from 'vitest';
import { decodeProfile, encodeProfile } from '../src/core/codec';
import { nameEngine } from '../src/core/engine';
import { hintFor, isLandmark, nearestLandmark } from '../src/core/hints';
import { ITEMS, ITEMS_BY_CLEF, TEACHING_ORDER } from '../src/core/items';
import { ledgerLines, notesInRange, parseNote, staffPosition } from '../src/core/music';
import { NAME_IT_MODE } from '../src/core/session';
import { type KeyValueStore, loadState, saveState, stateKey } from '../src/core/storage';
import { GOLDEN_CODES } from './fixtures/codes';
import { firstOpen, knower, nameBeginner, simulate } from './sim';

const NEW_TREBLE = ['B5', 'C6', 'B3', 'A3'];
const NEW_BASS = ['D4', 'E4', 'D2', 'C2'];
const NEW_IDS = [...NEW_TREBLE.map((n) => `name:treble:${n}`), ...NEW_BASS.map((n) => `name:bass:${n}`)];

describe('the two-ledger-line items', () => {
  it('exist with the expected ids, appended after the original 26', () => {
    expect(ITEMS).toHaveLength(34);
    expect(ITEMS.slice(26).map((i) => i.id)).toEqual(NEW_IDS);
  });

  it('are taught after the 13 in-staff notes, alternating above and below, guide C first', () => {
    expect(TEACHING_ORDER.treble.slice(13)).toEqual(NEW_TREBLE);
    expect(TEACHING_ORDER.bass.slice(13)).toEqual(NEW_BASS);
    for (const clef of ['treble', 'bass'] as const) {
      const rest = TEACHING_ORDER[clef].slice(13).map((n) => parseNote(n));
      // No letter twice in a row.
      rest.forEach((n, i) => i > 0 && expect(n.letter).not.toBe(rest[i - 1]!.letter));
      expect(notesInRange(clef)).toHaveLength(17);
    }
  });

  it('sit on the 1st/2nd ledger lines or in the spaces beside them', () => {
    const pos = (n: string, clef: 'treble' | 'bass') => staffPosition(parseNote(n), clef);
    expect([pos('B5', 'treble'), pos('C6', 'treble'), pos('B3', 'treble'), pos('A3', 'treble')]).toEqual([11, 12, -3, -4]);
    expect([pos('D4', 'bass'), pos('E4', 'bass'), pos('D2', 'bass'), pos('C2', 'bass')]).toEqual([11, 12, -3, -4]);
    expect(ledgerLines(12)).toEqual([10, 12]);
    expect(ledgerLines(-4)).toEqual([-2, -4]);
  });
});

describe('hints for the new notes', () => {
  const cases: [string, 'treble' | 'bass', string, string][] = [
    ['B5', 'treble', 'over ledger line 1 above the staff', 'Count down from High C (two ledger lines above the treble staff): C → B.'],
    ['C6', 'treble', 'ledger line 2 above the staff', 'This is a guide note: High C, two ledger lines above the treble staff.'],
    ['B3', 'treble', 'under ledger line 1 below the staff', 'Count down from Middle C (on its own little line below the treble staff): C → B.'],
    ['A3', 'treble', 'ledger line 2 below the staff', 'Count down from Middle C (on its own little line below the treble staff): C → B → A.'],
    ['D4', 'bass', 'over ledger line 1 above the staff', 'Count up from Middle C (on its own little line above the bass staff): C → D.'],
    ['E4', 'bass', 'ledger line 2 above the staff', 'Count up from Middle C (on its own little line above the bass staff): C → D → E.'],
    ['D2', 'bass', 'under ledger line 1 below the staff', 'Count up from Low C (two ledger lines below the bass staff): C → D.'],
    ['C2', 'bass', 'ledger line 2 below the staff', 'This is a guide note: Low C, two ledger lines below the bass staff.'],
  ];
  it.each(cases)('%s in the %s clef', (id, clef, where, landmark) => {
    const h = hintFor(parseNote(id), clef);
    expect(h.position).toBe(`This note is on ${where}.`);
    expect(h.mnemonic).toBeUndefined();
    expect(h.landmark).toBe(landmark);
  });

  it('nearestLandmark picks High C and Low C for the far notes', () => {
    expect(nearestLandmark(parseNote('C6'), 'treble').landmark.name).toBe('High C');
    expect(nearestLandmark(parseNote('B5'), 'treble').landmark.name).toBe('High C');
    expect(nearestLandmark(parseNote('C2'), 'bass').landmark.name).toBe('Low C');
    expect(nearestLandmark(parseNote('D2'), 'bass').landmark.name).toBe('Low C');
    expect(isLandmark(parseNote('C6'), 'treble')).toBe(true);
    expect(isLandmark(parseNote('C2'), 'bass')).toBe(true);
    expect(nearestLandmark(parseNote('A5'), 'treble').landmark.name).toBe('High C'); // closer than Treble C now
  });
});

describe('an honest learner reaches the ledger notes last', () => {
  const SEEDS = [1, 2, 3, 4, 5];
  for (const [name, policy] of [['a kid who knows the notes', knower(0.97, 1500)], ['a beginner', nameBeginner]] as const) {
    it(`${name}: none in session 1, and never before the in-staff notes have opened`, () => {
      for (const seed of SEEDS) {
        const r = simulate({ mode: NAME_IT_MODE, groups: ['treble', 'bass'], policy, sessions: 6, seed });
        for (const clef of ['treble', 'bass'] as const) {
          const ids = ITEMS_BY_CLEF[clef].map((i) => i.id);
          const far = ids.slice(13);
          const label = `${name} seed ${seed} ${clef}`;
          expect(firstOpen(r, far), label).toBeGreaterThan(1);
          // The lane unlocks in teaching order, so every in-staff note opened first (or the same day).
          for (const id of ids.slice(0, 13)) {
            expect(r.openedBy.get(id) ?? Infinity, `${label} ${id}`).toBeLessThanOrEqual(firstOpen(r, far));
          }
        }
      }
    });
  }
});

describe('older saves keep working', () => {
  // A real v3 code written by the build BEFORE #24 (26 Name It items): the first 9 treble notes
  // unlocked and answered 4 times each. Made-up data; never regenerate.
  const V3_BEFORE_LEDGER =
    'A1EwAQEAUgCWAAAIABr_5wAABaiUTLFzqJaeMXOolp4xc6iWnjFzqJaeMXOolp4xc6iWnjFzqJaeMXOolp4xc4APzP8PgA_M_w-AD8z_D4APzP8PgA_M_w_LsiI';
  const DECODE_AT = 1795806000000;

  it('a v3 code from before the ledger notes decodes onto the same notes; new ones are locked and unseen', () => {
    const name = decodeProfile(V3_BEFORE_LEDGER, DECODE_AT).name;
    const first9 = ITEMS.slice(0, 9).map((i) => i.id);
    for (const id of first9) {
      expect(name.items[id]!.unlocked, id).toBe(true);
      expect(name.items[id]!.n, id).toBe(4);
      expect(name.items[id]!.c, id).toBe(4);
    }
    for (const i of ITEMS.slice(9, 26)) expect([i.id, name.items[i.id]!.n]).toEqual([i.id, 0]);
    for (const id of NEW_IDS) expect(name.items[id], id).toMatchObject({ unlocked: false, n: 0, c: 0, best: 0 });
    // And it keeps working: re-saving writes the new items too, without moving the old ones.
    const again = decodeProfile(encodeProfile({ name }, DECODE_AT), DECODE_AT).name;
    for (const id of first9) expect(again.items[id]!.n, id).toBe(4);
    for (const id of NEW_IDS) expect(again.items[id]!.unlocked, id).toBe(false);
  });

  it('every golden v1/v2 code still decodes its original items, with the new ones locked and unseen', () => {
    for (const [key, g] of Object.entries(GOLDEN_CODES)) {
      const name = decodeProfile(g.code, g.decodeAt).name;
      for (const [id, was] of Object.entries(g.expected.name.items)) expect(name.items[id], `${key} ${id}`).toEqual(was);
      for (const id of NEW_IDS) expect(name.items[id], `${key} ${id}`).toMatchObject({ unlocked: false, n: 0 });
    }
  });

  it('a saved localStorage state (26 items) loads, with the new notes locked and unseen', () => {
    const data = new Map<string, string>();
    const store: KeyValueStore = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    };
    const old = GOLDEN_CODES.v1Played!.expected.name;
    expect(Object.keys(old.items)).toHaveLength(26);
    data.set(stateKey(nameEngine), JSON.stringify(old));
    const loaded = loadState(store);
    for (const [id, was] of Object.entries(old.items)) expect(loaded.items[id], id).toEqual(was);
    for (const id of NEW_IDS) expect(loaded.items[id], id).toMatchObject({ unlocked: false, n: 0, c: 0 });
    saveState(store, loaded);
    expect(loadState(store).items['name:bass:C2']!.unlocked).toBe(false);
  });
});
