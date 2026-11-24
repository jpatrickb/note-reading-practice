import { describe, expect, it } from 'vitest';
import { hintFor, introductionOrder, isLandmark, nearestLandmark } from '../src/core/hints';
import { ITEMS, ITEMS_BY_CLEF, itemById } from '../src/core/items';
import { noteId, notesInRange, parseNote } from '../src/core/music';

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
    expect(hintFor(parseNote('B4'), 'treble').landmark).toContain('Count down from Treble C');
    expect(hintFor(parseNote('E4'), 'treble').landmark).toContain('C → D → E');
    expect(hintFor(parseNote('E3'), 'bass').landmark).toContain('Count down from Bass F');
    expect(hintFor(parseNote('G4'), 'treble').landmark).toContain('This is a guide note: Treble G');
  });

  it('identifies landmarks', () => {
    expect(isLandmark(parseNote('F3'), 'bass')).toBe(true);
    expect(isLandmark(parseNote('F3'), 'treble')).toBe(false);
    expect(nearestLandmark(parseNote('E5'), 'treble').distance).toBe(2);
  });

  it('teaches guide notes first, then expands outward', () => {
    const order = introductionOrder(notesInRange('treble'), 'treble').map(noteId);
    expect(order.slice(0, 3)).toEqual(['C4', 'G4', 'C5']);
    expect(order).toHaveLength(13);
    const bass = introductionOrder(notesInRange('bass'), 'bass').map(noteId);
    expect(bass.slice(0, 3)).toEqual(['C4', 'F3', 'C3']);
  });
});

describe('items', () => {
  it('has unique ids and both clefs', () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    expect(ITEMS_BY_CLEF.treble[0]!.id).toBe('name:treble:C4');
    expect(itemById('name:bass:F3').clef).toBe('bass');
    expect(() => itemById('nope')).toThrow();
  });
});
