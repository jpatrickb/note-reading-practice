// Spot systematic misconceptions from the pattern of wrong answers, and suggest a mini-lesson.

import type { StudentState } from './engine';
import { itemById } from './items';
import { type Clef, noteAtPosition, shiftLetter, staffPosition } from './music';

export type LessonId = 'clefSwap:bass' | 'clefSwap:treble' | 'neighbor' | 'octave';

export const WINDOW = 8;
export const COOLDOWN_MS = 30 * 60_000;

const other = (c: Clef): Clef => (c === 'treble' ? 'bass' : 'treble');

/** Returns a lesson to show now (and marks it seen), or null. */
export function diagnose(state: StudentState, now: number): LessonId | null {
  const errors = state.recentErrors.slice(-WINDOW).map((e) => ({ ...e, item: itemById(e.itemId) }));
  const candidates: LessonId[] = [];

  for (const clef of ['bass', 'treble'] as Clef[]) {
    const inClef = errors.filter((e) => e.item.clef === clef);
    const swaps = inClef.filter(
      (e) => e.answer === noteAtPosition(staffPosition(e.item.note, clef), other(clef)).letter,
    );
    if (swaps.length >= 3 && swaps.length / inClef.length >= 0.5) candidates.push(`clefSwap:${clef}`);
  }

  const neighbors = errors.filter(
    (e) => e.answer === shiftLetter(e.item.note.letter, 1) || e.answer === shiftLetter(e.item.note.letter, -1),
  );
  if (neighbors.length >= 4 && neighbors.length / errors.length >= 0.6) candidates.push('neighbor');

  for (const id of candidates) {
    const seen = state.lessonsSeen[id] ?? 0;
    if (now - seen >= COOLDOWN_MS) {
      state.lessonsSeen[id] = now;
      return id;
    }
  }
  return null;
}

export const LESSONS: Record<LessonId, { title: string; body: string[] }> = {
  'clefSwap:bass': {
    title: 'Bass clef reads differently!',
    body: [
      'It looks like you might be reading bass clef notes as if they were treble clef.',
      "In bass clef, the line between the clef's two dots is F (Bass F).",
      'Treble clef names are two letters off here. Bottom line: treble is E, bass is G.',
    ],
  },
  'clefSwap:treble': {
    title: 'Treble clef reads differently!',
    body: [
      'It looks like you might be reading treble clef notes as if they were bass clef.',
      'In treble clef, the line the clef curls around is G (Treble G).',
      'Bass clef names are two letters off here. Bottom line: treble is E, bass is G.',
    ],
  },
  octave: {
    title: 'Right letter, different key!',
    body: [
      'You found the right letter, but in a different octave. The piano repeats the same letters again and again.',
      'Find middle C first: it sits just left of the two black keys in the middle of the piano, and on its own little line on the staff.',
      'Then count up or down from middle C, one white key at a time, until you reach your note.',
    ],
  },
  neighbor: {
    title: 'Line or space?',
    body: [
      'Your answers are often just one letter away. That usually means mixing up lines and spaces.',
      'Look closely: does a line go through the middle of the note, or does it sit between two lines?',
      'Find a guide note you know, then count up or down one letter at a time.',
    ],
  },
};
