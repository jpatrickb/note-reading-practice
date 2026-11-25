import { describe, expect, it } from 'vitest';
import {
  answerName,
  describePosition,
  diatonic,
  displayName,
  frequency,
  fromDiatonic,
  isEnharmonic,
  ledgerLines,
  letterWalk,
  midi,
  noteAtPosition,
  noteId,
  notesInRange,
  parseAnswerName,
  parseNote,
  pitchClass,
  shiftLetter,
  spellings,
  spokenName,
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

describe('accidentals', () => {
  const n = parseNote;

  it('round-trips ids for naturals and every accidental', () => {
    for (const id of ['C4', 'F#4', 'Bb3', 'F##4', 'Bbb3', 'B#3', 'Cb5', 'E#4', 'G-1', 'Ab-1']) {
      expect(noteId(n(id))).toBe(id);
    }
    expect(n('F#4')).toEqual({ letter: 'F', octave: 4, acc: 1 });
    expect(n('Bbb3')).toEqual({ letter: 'B', octave: 3, acc: -2 });
    expect(n('C4')).toEqual({ letter: 'C', octave: 4 }); // naturals have no acc key
    expect(noteId({ letter: 'D', octave: 4, acc: 0 })).toBe('D4');
    for (const bad of ['F#', 'F###4', 'Fb#4', 'f#4', 'F♯4', 'Bbbb3']) expect(() => n(bad)).toThrow();
  });

  it('includes the accidental in MIDI and frequency', () => {
    expect(midi(n('C#4'))).toBe(61);
    expect(midi(n('Db4'))).toBe(61);
    expect(midi(n('E#4'))).toBe(65);
    expect(midi(n('F4'))).toBe(65);
    expect(midi(n('F##4'))).toBe(67);
    expect(midi(n('Bbb3'))).toBe(57);
    expect(midi(n('Cb4'))).toBe(59);
    expect(midi(n('B#3'))).toBe(60);
    expect(frequency(n('C#4'))).toBe(frequency(n('Db4')));
    expect(frequency(n('E#4'))).toBe(frequency(n('F4')));
    expect(frequency(n('Bb4'))).toBeCloseTo(440 * 2 ** (1 / 12));
  });

  it('ignores the accidental for staff position', () => {
    expect(staffPosition(n('F#4'), 'treble')).toBe(staffPosition(n('F4'), 'treble'));
    expect(staffPosition(n('Bb3'), 'bass')).toBe(staffPosition(n('B3'), 'bass'));
    expect(staffPosition(n('Cbb4'), 'treble')).toBe(-2);
    expect(diatonic(n('G##4'))).toBe(diatonic(n('G4')));
  });

  it('computes pitch classes and enharmonic equivalence', () => {
    expect(pitchClass(n('C4'))).toBe(0);
    expect(pitchClass(n('Cb4'))).toBe(11);
    expect(pitchClass(n('B#3'))).toBe(0);
    expect(pitchClass(n('Bb-1'))).toBe(10);
    expect(isEnharmonic(n('C#4'), n('Db4'))).toBe(true);
    expect(isEnharmonic(n('E#4'), n('F4'))).toBe(true);
    expect(isEnharmonic(n('B#3'), n('C4'))).toBe(true);
    expect(isEnharmonic(n('F#4'), n('Gb4'))).toBe(true);
    expect(isEnharmonic(n('C#4'), n('C#5'))).toBe(false);
  });

  it('lists spellings for a MIDI pitch', () => {
    expect(spellings(61).map(noteId)).toEqual(['C#4', 'Db4']);
    expect(spellings(60).map(noteId)).toEqual(['C4', 'B#3']);
    expect(spellings(65).map(noteId)).toEqual(['F4', 'E#4']);
    expect(spellings(59).map(noteId)).toEqual(['B3', 'Cb4']);
    expect(spellings(62).map(noteId)).toEqual(['D4']);
    expect(spellings(62, { doubles: true }).map(noteId)).toEqual(['D4', 'C##4', 'Ebb4']);
    expect(spellings(68, { doubles: true }).map(noteId)).toEqual(['G#4', 'Ab4']);
    for (let m = 21; m <= 108; m++) {
      for (const s of spellings(m, { doubles: true })) expect(midi(s)).toBe(m);
    }
  });

  it('names notes for kids and for screen readers', () => {
    expect(displayName(n('F#4'))).toBe('F♯');
    expect(displayName(n('Bb3'))).toBe('B♭');
    expect(displayName(n('F##4'))).toBe('F𝄪');
    expect(displayName(n('Bbb3'))).toBe('B𝄫');
    expect(displayName(n('C4'))).toBe('C');
    expect(spokenName(n('F#4'))).toBe('F sharp');
    expect(spokenName(n('Bb3'))).toBe('B flat');
    expect(spokenName(n('F##4'))).toBe('F double sharp');
    expect(spokenName(n('Bbb3'))).toBe('B double flat');
    expect(spokenName(n('C4'))).toBe('C');
  });

  it('builds and parses answer names', () => {
    expect(answerName(n('F#4'))).toBe('F#');
    expect(answerName(n('Bb3'))).toBe('Bb');
    expect(answerName(n('C4'))).toBe('C');
    expect(answerName(n('Ebb4'))).toBe('Ebb');
    expect(parseAnswerName('F#')).toEqual({ letter: 'F', acc: 1 });
    expect(parseAnswerName('Bb')).toEqual({ letter: 'B', acc: -1 });
    expect(parseAnswerName('bb')).toEqual({ letter: 'B', acc: -1 });
    expect(parseAnswerName(' c ')).toEqual({ letter: 'C', acc: 0 });
    expect(parseAnswerName('F♯')).toEqual({ letter: 'F', acc: 1 });
    expect(parseAnswerName('B♭')).toEqual({ letter: 'B', acc: -1 });
    expect(parseAnswerName('F𝄪')).toEqual({ letter: 'F', acc: 2 });
    expect(parseAnswerName('Bbb')).toEqual({ letter: 'B', acc: -2 });
    expect(parseAnswerName('E♮')).toEqual({ letter: 'E', acc: 0 });
    for (const bad of ['', 'H', 'F#4', 'F###', '#F', 'Fbb#']) expect(parseAnswerName(bad)).toBeNull();
    for (const id of ['C4', 'F#4', 'Bb3', 'F##4', 'Bbb3']) {
      const p = parseAnswerName(answerName(n(id)))!;
      expect(p.letter).toBe(n(id).letter);
      expect(p.acc).toBe(n(id).acc ?? 0);
    }
  });
});
