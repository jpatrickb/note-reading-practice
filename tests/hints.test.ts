import { describe, expect, it } from 'vitest';
import { hintFor, isLandmark, nearestLandmark } from '../src/core/hints';
import { ITEMS, ITEMS_BY_CLEF, TEACHING_ORDER, itemById } from '../src/core/items';
import { LETTERS, noteId, notesInRange, parseNote } from '../src/core/music';
import { PARAMS } from '../src/core/engine';

describe('hints', () => {
  it('gives line mnemonics for notes on lines', () => {
    const h = hintFor(parseNote('B4'), 'treble');
    expect(h.position).toBe('This note is on the 3rd line.');
    expect(h.mnemonic).toContain('Every Good Boy Does Fine');
    expect(h.mnemonic).toContain('Number 3 is B');
  });

  it('gives space mnemonics for notes in spaces', () => {
    const h = hintFor(parseNote('E3'), 'bass');
    expect(h.mnemonic).toContain('All Cows Eat Grass');
    expect(h.mnemonic).toContain('Number 3 is E');
  });

  it('has no mnemonic for notes outside the staff', () => {
    expect(hintFor(parseNote('C4'), 'treble').mnemonic).toBeUndefined();
  });

  it('counts from the nearest guide note', () => {
    expect(hintFor(parseNote('A4'), 'treble').landmark).toContain('Count up from Treble G');
    // Treble C (C5) is taught after B4, so B4 counts from the guide the kid already knows.
    expect(hintFor(parseNote('B4'), 'treble').landmark).toContain('Count up from Treble G');
    expect(hintFor(parseNote('D5'), 'treble').landmark).toContain('Count up from Treble C');
    expect(hintFor(parseNote('E4'), 'treble').landmark).toContain('C → D → E');
    expect(hintFor(parseNote('E3'), 'bass').landmark).toContain('Count down from Bass F');
    expect(hintFor(parseNote('G4'), 'treble').landmark).toContain('This is a guide note: Treble G');
  });

  it('identifies landmarks', () => {
    expect(isLandmark(parseNote('F3'), 'bass')).toBe(true);
    expect(isLandmark(parseNote('F3'), 'treble')).toBe(false);
    expect(nearestLandmark(parseNote('E5'), 'treble').distance).toBe(2);
  });
});

describe('items', () => {
  it('has unique ids and both clefs', () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    expect(ITEMS_BY_CLEF.treble[0]!.id).toBe('name:treble:G4');
    expect(itemById('name:bass:F3').clef).toBe('bass');
    expect(() => itemById('nope')).toThrow();
  });

  for (const clef of ['treble', 'bass'] as const) {
    it(`${clef}: teaching order covers the range exactly once, starting at a guide note`, () => {
      expect([...TEACHING_ORDER[clef]].sort()).toEqual(notesInRange(clef).map(noteId).sort());
      expect(isLandmark(parseNote(TEACHING_ORDER[clef][0]!), clef)).toBe(true);
    });

    it(`${clef}: the first 7 notes cover all 7 letters, so one button can't carry early play`, () => {
      const letters = ITEMS_BY_CLEF[clef].slice(0, 7).map((i) => i.note.letter);
      expect(new Set(letters)).toEqual(new Set(LETTERS));
      const starters = ITEMS_BY_CLEF[clef].slice(0, PARAMS.initialUnlock).map((i) => i.note.letter);
      expect(new Set(starters).size).toBe(starters.length);
    });
  }
});
