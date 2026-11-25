// Pins the hint text of every Name It item, so any change to a hint (or to who anchors it) is
// deliberate: update a row only on purpose. A hint counts from a guide note the kid has already met
// (taught at or before the note itself), see anchorFor in src/core/hints.ts.

import { describe, expect, it } from 'vitest';
import { LANDMARKS, anchorFor, hintFor } from '../src/core/hints';
import { ITEMS, TEACHING_ORDER, itemById } from '../src/core/items';
import { noteId } from '../src/core/music';

// [item id, position, mnemonic, landmark]
const HINTS: [string, string, string | null, string][] = [
  ['name:treble:G4', "This note is on the 2nd line.", "Lines, bottom to top: Every Good Boy Does Fine. Number 2 is G.", "This is a guide note: Treble G, the line the treble clef curls around."],
  ['name:treble:C4', "This note is on a ledger line below the staff.", null, "This is a guide note: Middle C, on its own little line below the treble staff."],
  ['name:treble:A4', "This note is on the 2nd space.", "Spaces, bottom to top: F-A-C-E spells FACE. Number 2 is A.", "Count up from Treble G (the line the treble clef curls around): G → A."],
  ['name:treble:F4', "This note is on the 1st space.", "Spaces, bottom to top: F-A-C-E spells FACE. Number 1 is F.", "Count down from Treble G (the line the treble clef curls around): G → F."],
  ['name:treble:E4', "This note is on the 1st line.", "Lines, bottom to top: Every Good Boy Does Fine. Number 1 is E.", "Count up from Middle C (on its own little line below the treble staff): C → D → E."],
  ['name:treble:B4', "This note is on the 3rd line.", "Lines, bottom to top: Every Good Boy Does Fine. Number 3 is B.", "Count up from Treble G (the line the treble clef curls around): G → A → B."],
  ['name:treble:D4', "This note is on the space just below the staff.", null, "Count up from Middle C (on its own little line below the treble staff): C → D."],
  ['name:treble:C5', "This note is on the 3rd space.", "Spaces, bottom to top: F-A-C-E spells FACE. Number 3 is C.", "This is a guide note: Treble C, the 3rd space."],
  ['name:treble:D5', "This note is on the 4th line.", "Lines, bottom to top: Every Good Boy Does Fine. Number 4 is D.", "Count up from Treble C (the 3rd space): C → D."],
  ['name:treble:E5', "This note is on the 4th space.", "Spaces, bottom to top: F-A-C-E spells FACE. Number 4 is E.", "Count up from Treble C (the 3rd space): C → D → E."],
  ['name:treble:F5', "This note is on the 5th line.", "Lines, bottom to top: Every Good Boy Does Fine. Number 5 is F.", "Count up from Treble C (the 3rd space): C → D → E → F."],
  ['name:treble:G5', "This note is on the space just above the staff.", null, "Count up from Treble C (the 3rd space): C → D → E → F → G."],
  ['name:treble:A5', "This note is on a ledger line above the staff.", null, "Count up from Treble C (the 3rd space): C → D → E → F → G → A."],
  ['name:bass:F3', "This note is on the 4th line.", "Lines, bottom to top: Good Boys Do Fine Always. Number 4 is F.", "This is a guide note: Bass F, the line between the bass clef's two dots."],
  ['name:bass:G3', "This note is on the 4th space.", "Spaces, bottom to top: All Cows Eat Grass. Number 4 is G.", "Count up from Bass F (the line between the bass clef's two dots): F → G."],
  ['name:bass:E3', "This note is on the 3rd space.", "Spaces, bottom to top: All Cows Eat Grass. Number 3 is E.", "Count down from Bass F (the line between the bass clef's two dots): F → E."],
  ['name:bass:A3', "This note is on the 5th line.", "Lines, bottom to top: Good Boys Do Fine Always. Number 5 is A.", "Count up from Bass F (the line between the bass clef's two dots): F → G → A."],
  ['name:bass:D3', "This note is on the 3rd line.", "Lines, bottom to top: Good Boys Do Fine Always. Number 3 is D.", "Count down from Bass F (the line between the bass clef's two dots): F → E → D."],
  ['name:bass:C3', "This note is on the 2nd space.", "Spaces, bottom to top: All Cows Eat Grass. Number 2 is C.", "This is a guide note: Bass C, the 2nd space."],
  ['name:bass:B2', "This note is on the 2nd line.", "Lines, bottom to top: Good Boys Do Fine Always. Number 2 is B.", "Count down from Bass C (the 2nd space): C → B."],
  ['name:bass:G2', "This note is on the 1st line.", "Lines, bottom to top: Good Boys Do Fine Always. Number 1 is G.", "Count down from Bass C (the 2nd space): C → B → A → G."],
  ['name:bass:A2', "This note is on the 1st space.", "Spaces, bottom to top: All Cows Eat Grass. Number 1 is A.", "Count down from Bass C (the 2nd space): C → B → A."],
  ['name:bass:C4', "This note is on a ledger line above the staff.", null, "This is a guide note: Middle C, on its own little line above the bass staff."],
  ['name:bass:B3', "This note is on the space just above the staff.", null, "Count down from Middle C (on its own little line above the bass staff): C → B."],
  ['name:bass:F2', "This note is on the space just below the staff.", null, "Count down from Bass C (the 2nd space): C → B → A → G → F."],
  ['name:bass:E2', "This note is on a ledger line below the staff.", null, "Count down from Bass C (the 2nd space): C → B → A → G → F → E."],
  ['name:treble:B5', "This note is on over ledger line 1 above the staff.", null, "Count down from High C (two ledger lines above the treble staff): C → B."],
  ['name:treble:C6', "This note is on ledger line 2 above the staff.", null, "This is a guide note: High C, two ledger lines above the treble staff."],
  ['name:treble:B3', "This note is on under ledger line 1 below the staff.", null, "Count down from Middle C (on its own little line below the treble staff): C → B."],
  ['name:treble:A3', "This note is on ledger line 2 below the staff.", null, "Count down from Middle C (on its own little line below the treble staff): C → B → A."],
  ['name:bass:D4', "This note is on over ledger line 1 above the staff.", null, "Count up from Middle C (on its own little line above the bass staff): C → D."],
  ['name:bass:E4', "This note is on ledger line 2 above the staff.", null, "Count up from Middle C (on its own little line above the bass staff): C → D → E."],
  ['name:bass:D2', "This note is on under ledger line 1 below the staff.", null, "Count up from Low C (two ledger lines below the bass staff): C → D."],
  ['name:bass:C2', "This note is on ledger line 2 below the staff.", null, "This is a guide note: Low C, two ledger lines below the bass staff."],
];

describe('hint text for every Name It item', () => {
  it('has a row for every item, in canonical order', () => {
    expect(HINTS.map((r) => r[0])).toEqual(ITEMS.map((i) => i.id));
  });

  it.each(HINTS)('%s', (id, position, mnemonic, landmark) => {
    const item = itemById(id);
    const h = hintFor(item.note, item.clef);
    expect([h.position, h.mnemonic ?? null, h.landmark]).toEqual([position, mnemonic, landmark]);
  });

  it('never counts from a guide note taught after the note', () => {
    for (const item of ITEMS) {
      const order = TEACHING_ORDER[item.clef];
      const { landmark } = anchorFor(item.note, item.clef);
      expect(order.indexOf(noteId(landmark.note)), item.id).toBeLessThanOrEqual(order.indexOf(noteId(item.note)));
      expect(LANDMARKS[item.clef]).toContain(landmark);
    }
  });
});
