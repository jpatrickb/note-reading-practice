import { describe, expect, it } from 'vitest';
import {
  describePosition,
  diatonic,
  frequency,
  fromDiatonic,
  ledgerLines,
  letterWalk,
  midi,
  noteAtPosition,
  noteId,
  notesInRange,
  parseNote,
  shiftLetter,
  staffPosition,
} from '../src/core/music';

describe('music primitives', () => {
  it('round-trips note ids and diatonic indexes', () => {
    for (const id of ['C4', 'B3', 'E2', 'A5']) {
      expect(noteId(parseNote(id))).toBe(id);
      expect(noteId(fromDiatonic(diatonic(parseNote(id))))).toBe(id);
    }
    expect(() => parseNote('H4')).toThrow();
  });

  it('computes MIDI numbers and frequencies', () => {
    expect(midi(parseNote('C4'))).toBe(60);
    expect(midi(parseNote('A4'))).toBe(69);
    expect(frequency(parseNote('A4'))).toBeCloseTo(440);
    expect(frequency(parseNote('A5'))).toBeCloseTo(880);
  });

  it('shifts letters through the musical alphabet in both directions', () => {
    expect(shiftLetter('G', 1)).toBe('A');
    expect(shiftLetter('C', -1)).toBe('B');
    expect(shiftLetter('D', 4)).toBe('A');
    expect(shiftLetter('E', -9)).toBe('C');
  });

  it('walks letters between notes', () => {
    expect(letterWalk(parseNote('G4'), parseNote('B4'))).toEqual(['G', 'A', 'B']);
    expect(letterWalk(parseNote('C4'), parseNote('A3'))).toEqual(['C', 'B', 'A']);
    expect(letterWalk(parseNote('F3'), parseNote('F3'))).toEqual(['F']);
  });

  it('places notes on the treble staff', () => {
    expect(staffPosition(parseNote('E4'), 'treble')).toBe(0);
    expect(staffPosition(parseNote('G4'), 'treble')).toBe(2);
    expect(staffPosition(parseNote('F5'), 'treble')).toBe(8);
    expect(staffPosition(parseNote('C4'), 'treble')).toBe(-2);
  });

  it('places notes on the bass staff', () => {
    expect(staffPosition(parseNote('G2'), 'bass')).toBe(0);
    expect(staffPosition(parseNote('F3'), 'bass')).toBe(6);
    expect(staffPosition(parseNote('A3'), 'bass')).toBe(8);
    expect(staffPosition(parseNote('C4'), 'bass')).toBe(10);
    expect(noteId(noteAtPosition(6, 'bass'))).toBe('F3');
  });

  it('lists ledger lines', () => {
    expect(ledgerLines(4)).toEqual([]);
    expect(ledgerLines(-1)).toEqual([]);
    expect(ledgerLines(-2)).toEqual([-2]);
    expect(ledgerLines(-5)).toEqual([-2, -4]);
    expect(ledgerLines(10)).toEqual([10]);
    expect(ledgerLines(13)).toEqual([10, 12]);
  });

  it('describes positions in kid-friendly words', () => {
    expect(describePosition(0)).toBe('the 1st line');
    expect(describePosition(2)).toBe('the 2nd line');
    expect(describePosition(5)).toBe('the 3rd space');
    expect(describePosition(-1)).toBe('the space just below the staff');
    expect(describePosition(9)).toBe('the space just above the staff');
    expect(describePosition(-2)).toBe('a ledger line below the staff');
    expect(describePosition(10)).toBe('a ledger line above the staff');
    expect(describePosition(-4)).toBe('ledger line 2 below the staff');
    expect(describePosition(-3)).toBe('under ledger line 1 below the staff');
    expect(describePosition(11)).toBe('over ledger line 1 above the staff');
  });

  it('defines the v0 ranges', () => {
    expect(notesInRange('treble').map(noteId)).toEqual(
      ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5'],
    );
    expect(notesInRange('bass').map(noteId).at(0)).toBe('E2');
    expect(notesInRange('bass').map(noteId).at(-1)).toBe('C4');
  });
});
